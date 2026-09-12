"""Regenerate real evaluation artifacts for the Olist customer-satisfaction project.

Reproduces the pipeline from merge_data.ipynb + nl.ipynb end to end (9-table
join -> leakage-free feature engineering -> Optuna-tuned LightGBM) and writes
every number the static report renders to Supervised/assets/metrics.json.

The ROC and precision-recall curves in the published report are read from this
file, so they are measured on the held-out split rather than illustrative.

Run from the repository root:
    uv run python tools/gen_supervised_metrics.py
"""

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    log_loss,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "Supervised"
DATA = PROJECT / "data"
OUT = PROJECT / "assets" / "metrics.json"

CURVE_POINTS = 140

# Optuna best trial from nl.ipynb (30 trials, maximising held-out ROC-AUC).
BEST_PARAMS = {
    "objective": "binary",
    "metric": "auc",
    "boosting_type": "gbdt",
    "random_state": 42,
    "n_estimators": 694,
    "learning_rate": 0.06259028825638538,
    "num_leaves": 127,
    "max_depth": 10,
    "min_child_samples": 23,
    "subsample": 0.665413463060635,
    "colsample_bytree": 0.501977975528397,
    "reg_alpha": 1.55065249860833e-05,
    "reg_lambda": 2.1512674262809887e-07,
    "n_jobs": -1,
    "verbosity": -1,
}

TIMESTAMP_COLS = [
    "order_purchase_timestamp",
    "order_approved_at",
    "order_delivered_carrier_date",
    "order_delivered_customer_date",
    "order_estimated_delivery_date",
    "shipping_limit_date",
    "review_creation_date",
    "review_answer_timestamp",
]

DROP_COLS = [
    "is_satisfied",
    "review_score",
    "is_late",
    "customer_id",
    "customer_unique_id",
    "order_id",
    "order_item_id",
    "product_id",
    "review_id",
    "customer_zip_code_prefix",
    "seller_zip_code_prefix",
    "customer_city",
    "seller_city",
    "review_comment_title",
    "review_comment_message",
    *TIMESTAMP_COLS,
]


def thin(x, y, n=CURVE_POINTS):
    if len(x) <= n:
        idx = np.arange(len(x))
    else:
        idx = np.unique(np.linspace(0, len(x) - 1, n).astype(int))
    return [{"x": round(float(x[i]), 5), "y": round(float(y[i]), 5)} for i in idx]


def build_merged():
    """Star-schema join of the 9 Olist tables (merge_data.ipynb, cell 27)."""
    customers = pd.read_csv(DATA / "olist_customers_dataset.csv")
    order_items = pd.read_csv(DATA / "olist_order_items_dataset.csv")
    order_payments = pd.read_csv(DATA / "olist_order_payments_dataset.csv")
    order_reviews = pd.read_csv(DATA / "olist_order_reviews_dataset.csv")
    orders = pd.read_csv(DATA / "olist_orders_dataset.csv")
    products = pd.read_csv(DATA / "olist_products_dataset.csv")
    sellers = pd.read_csv(DATA / "olist_sellers_dataset.csv")

    steps = {}
    df = customers.merge(orders, on="customer_id", how="inner")
    steps["customers + orders"] = len(df)
    df = df.merge(order_items, on="order_id", how="inner")
    steps["+ order_items"] = len(df)
    df = df.merge(products, on="product_id", how="inner")
    steps["+ products"] = len(df)
    df = df.merge(sellers, on="seller_id", how="inner")
    steps["+ sellers"] = len(df)
    df = df.merge(order_payments, on="order_id", how="inner")
    steps["+ order_payments"] = len(df)
    df = df.merge(order_reviews, on="order_id", how="inner")
    steps["+ order_reviews"] = len(df)
    return df, steps


def engineer(df):
    """Row-level feature engineering (nl.ipynb cells 3 and 9)."""
    for col in TIMESTAMP_COLS:
        df[col] = pd.to_datetime(df[col], errors="coerce")

    df["is_satisfied"] = (df["review_score"] >= 4).astype(int)
    df["is_late"] = (
        df["order_delivered_customer_date"] > df["order_estimated_delivery_date"]
    ).astype(int)

    df["delivery_delay_days"] = (
        df["order_delivered_customer_date"] - df["order_estimated_delivery_date"]
    ).dt.days
    df["estimated_delivery_days"] = (
        df["order_estimated_delivery_date"] - df["order_purchase_timestamp"]
    ).dt.days
    df["actual_delivery_days"] = (
        df["order_delivered_customer_date"] - df["order_purchase_timestamp"]
    ).dt.days

    df["freight_ratio"] = df["freight_value"] / (
        df["price"] + df["freight_value"]
    ).replace(0, np.nan)
    df["product_volume_cm3"] = (
        df["product_length_cm"] * df["product_height_cm"] * df["product_width_cm"]
    )
    df["same_state"] = (df["customer_state"] == df["seller_state"]).astype(int)

    df["purchase_hour"] = df["order_purchase_timestamp"].dt.hour
    df["purchase_dayofweek"] = df["order_purchase_timestamp"].dt.dayofweek
    df["purchase_month"] = df["order_purchase_timestamp"].dt.month

    df["is_delayed"] = (df["delivery_delay_days"] > 0).astype(int)
    df["delay_severity"] = df["delivery_delay_days"] / (
        df["estimated_delivery_days"] + 1
    )
    df["freight_per_gram"] = df["freight_value"] / (df["product_weight_g"] + 1)
    df["price_per_volume"] = df["price"] / (df["product_volume_cm3"] + 1)
    return df


def eda_block(df):
    """Descriptive statistics the report renders as charts and tables."""
    review_counts = df["review_score"].value_counts().sort_index()
    pay = df.groupby("payment_type").agg(
        count=("payment_value", "size"), avg_value=("payment_value", "mean")
    )
    pay = pay.sort_values("count", ascending=False)

    # Delivery punctuality vs satisfaction: the headline operational finding.
    on_time = df[df["delivery_delay_days"] <= 0]["is_satisfied"].mean()
    late = df[df["delivery_delay_days"] > 0]["is_satisfied"].mean()

    delay_buckets = pd.cut(
        df["delivery_delay_days"],
        bins=[-np.inf, -15, -7, 0, 7, 15, np.inf],
        labels=["15+ early", "7-15 early", "0-7 early", "0-7 late", "7-15 late", "15+ late"],
    )
    by_delay = (
        df.groupby(delay_buckets, observed=True)["is_satisfied"]
        .agg(["mean", "size"])
        .reset_index()
    )

    monthly = (
        df.set_index("order_purchase_timestamp")
        .resample("ME")["order_status"]
        .size()
        .reset_index()
    )
    monthly = monthly[monthly["order_status"] > 50]

    states = df["customer_state"].value_counts().head(10)

    numeric = ["price", "freight_value", "payment_value", "payment_installments", "delivery_delay_days"]
    stats = df[numeric].describe().T[["min", "max", "mean", "std"]].round(2)

    return {
        "rows": int(len(df)),
        "satisfied": int(df["is_satisfied"].sum()),
        "dissatisfied": int((1 - df["is_satisfied"]).sum()),
        "satisfied_share": round(float(df["is_satisfied"].mean()), 5),
        "review_score_counts": {
            str(k): int(v) for k, v in review_counts.items()
        },
        "review_score_mean": round(float(df["review_score"].mean()), 3),
        "review_score_median": float(df["review_score"].median()),
        "review_score_std": round(float(df["review_score"].std()), 3),
        "payment_types": [
            {
                "type": idx,
                "count": int(r["count"]),
                "share": round(float(r["count"] / len(df)), 5),
                "avg_value": round(float(r["avg_value"]), 2),
            }
            for idx, r in pay.iterrows()
        ],
        "satisfaction_on_time": round(float(on_time), 5),
        "satisfaction_late": round(float(late), 5),
        "satisfaction_by_delay": [
            {
                "bucket": str(r["delivery_delay_days"]),
                "satisfied": round(float(r["mean"]), 5),
                "orders": int(r["size"]),
            }
            for _, r in by_delay.iterrows()
        ],
        "monthly_orders": [
            {"month": d.strftime("%Y-%m"), "orders": int(n)}
            for d, n in zip(monthly["order_purchase_timestamp"], monthly["order_status"])
        ],
        "top_states": [{"state": s, "orders": int(n)} for s, n in states.items()],
        "numeric_stats": [
            {"feature": idx, **{k: float(v) for k, v in r.items()}}
            for idx, r in stats.iterrows()
        ],
        "unique_customer_states": int(df["customer_state"].nunique()),
        "unique_seller_states": int(df["seller_state"].nunique()),
        "unique_categories": int(df["product_category_name"].nunique()),
    }


def main():
    print("joining 9 tables ...")
    df, join_steps = build_merged()
    raw_shape = df.shape

    print("engineering features ...")
    df = engineer(df)
    df = df.dropna(subset=["order_approved_at"])
    eda = eda_block(df)

    X_raw = df.drop(columns=[c for c in DROP_COLS if c in df.columns])
    y_raw = df["is_satisfied"]

    # Split BEFORE any dataset-level aggregation so seller/category statistics
    # never see the validation rows.
    X_tr, X_te, y_tr, y_te = train_test_split(
        X_raw, y_raw, test_size=0.2, random_state=42, stratify=y_raw
    )

    seller_stats = (
        X_tr.groupby("seller_id")
        .agg(
            seller_avg_delay=("delivery_delay_days", "mean"),
            seller_order_count=("seller_id", "count"),
        )
        .reset_index()
    )
    cat_stats = (
        X_tr.groupby("product_category_name")
        .agg(
            cat_avg_delay=("delivery_delay_days", "mean"),
            cat_avg_freight=("freight_value", "mean"),
        )
        .reset_index()
    )
    g_delay = X_tr["delivery_delay_days"].mean()
    g_freight = X_tr["freight_value"].mean()

    def apply_agg(frame):
        out = frame.merge(seller_stats, on="seller_id", how="left")
        out = out.merge(cat_stats, on="product_category_name", how="left")
        out["seller_avg_delay"] = out["seller_avg_delay"].fillna(g_delay)
        out["seller_order_count"] = out["seller_order_count"].fillna(0)
        out["cat_avg_delay"] = out["cat_avg_delay"].fillna(g_delay)
        out["cat_avg_freight"] = out["cat_avg_freight"].fillna(g_freight)
        return out.drop(columns=["seller_id"])

    X_tr_c, X_te_c = apply_agg(X_tr), apply_agg(X_te)
    cat_cols = X_tr_c.select_dtypes(include=["object", "category"]).columns.tolist()
    for col in cat_cols:
        cats = pd.api.types.CategoricalDtype(
            sorted(set(X_tr_c[col].dropna()) | set(X_te_c[col].dropna()))
        )
        X_tr_c[col] = X_tr_c[col].astype(cats)
        X_te_c[col] = X_te_c[col].astype(cats)

    print(f"training LightGBM on {X_tr_c.shape} ...")
    model = lgb.LGBMClassifier(**BEST_PARAMS)
    model.fit(X_tr_c, y_tr, categorical_feature=cat_cols)

    proba = model.predict_proba(X_te_c)[:, 1]
    auc = roc_auc_score(y_te, proba)

    # Threshold chosen to maximise F1 on the minority (dissatisfied) class.
    prec0, rec0, thr0 = precision_recall_curve(1 - y_te, 1 - proba)
    f1_0 = 2 * (prec0 * rec0) / (prec0 + rec0 + 1e-10)
    optimal = float(1 - thr0[int(np.argmax(f1_0))])

    pred = (proba >= optimal).astype(int)
    report = classification_report(y_te, pred, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_te, pred).tolist()

    fpr, tpr, _ = roc_curve(y_te, proba)
    prec, rec, _ = precision_recall_curve(y_te, proba)

    sweep = []
    for t in np.round(np.arange(0.05, 0.96, 0.01), 2):
        p = (proba >= t).astype(int)
        r = classification_report(y_te, p, output_dict=True, zero_division=0)
        sweep.append(
            {
                "threshold": float(t),
                "accuracy": round(float(r["accuracy"]), 5),
                "f1_satisfied": round(float(r["1"]["f1-score"]), 5),
                "f1_dissatisfied": round(float(r["0"]["f1-score"]), 5),
                "recall_dissatisfied": round(float(r["0"]["recall"]), 5),
            }
        )

    bins = np.linspace(0, 1, 11)
    which = np.clip(np.digitize(proba, bins) - 1, 0, 9)
    calibration = []
    for b in range(10):
        mask = which == b
        if mask.sum() == 0:
            continue
        calibration.append(
            {
                "bin": round(float((bins[b] + bins[b + 1]) / 2), 3),
                "predicted": round(float(proba[mask].mean()), 4),
                "observed": round(float(y_te.to_numpy()[mask].mean()), 4),
                "count": int(mask.sum()),
            }
        )

    imp = (
        pd.DataFrame(
            {
                "feature": list(X_tr_c.columns),
                "gain": model.booster_.feature_importance(importance_type="gain"),
                "split": model.booster_.feature_importance(importance_type="split"),
            }
        )
        .sort_values("gain", ascending=False)
        .reset_index(drop=True)
    )
    imp["share"] = (imp["gain"] / max(float(imp["gain"].sum()), 1.0)).round(5)

    payload = {
        "generated_by": "tools/gen_supervised_metrics.py",
        "dataset": {
            "merged_rows": int(raw_shape[0]),
            "merged_cols": int(raw_shape[1]),
            "model_rows": int(len(X_raw)),
            "n_features": int(X_tr_c.shape[1]),
            "join_steps": [{"step": k, "rows": v} for k, v in join_steps.items()],
            "train_rows": int(len(X_tr_c)),
            "test_rows": int(len(X_te_c)),
            "categorical_features": cat_cols,
        },
        "eda": eda,
        "params": {k: v for k, v in BEST_PARAMS.items() if k not in {"n_jobs", "verbosity"}},
        "threshold": round(optimal, 4),
        "headline": {
            "roc_auc": round(float(auc), 5),
            "average_precision": round(float(average_precision_score(y_te, proba)), 5),
            "log_loss": round(float(log_loss(y_te, proba)), 5),
            "brier": round(float(brier_score_loss(y_te, proba)), 5),
            "accuracy": round(float(accuracy_score(y_te, pred)), 5),
        },
        "classification_report": {
            "0": {k: round(float(v), 4) for k, v in report["0"].items()},
            "1": {k: round(float(v), 4) for k, v in report["1"].items()},
            "macro avg": {k: round(float(v), 4) for k, v in report["macro avg"].items()},
            "weighted avg": {k: round(float(v), 4) for k, v in report["weighted avg"].items()},
            "accuracy": round(float(report["accuracy"]), 4),
        },
        "confusion_matrix": {"tn": cm[0][0], "fp": cm[0][1], "fn": cm[1][0], "tp": cm[1][1]},
        "roc_curve": thin(fpr, tpr),
        "pr_curve": thin(rec, prec),
        "pr_baseline": round(float(y_te.mean()), 5),
        "threshold_sweep": sweep,
        "calibration": calibration,
        "feature_importance": imp.head(20).to_dict(orient="records"),
        "feature_list": list(X_tr_c.columns),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
    print(json.dumps(payload["headline"], indent=2))
    print("threshold", payload["threshold"])


if __name__ == "__main__":
    main()
