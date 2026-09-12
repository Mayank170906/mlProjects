"""Regenerate real evaluation artifacts for the Spaceship Titanic (Tree) project.

Reads the persisted tuned LightGBM model and reproduces the exact validation
split used during training, then writes every number the static report renders
to Tree/assets/metrics.json. Nothing in the report is hand-typed or synthetic.

Run from the repository root:
    uv run python tools/gen_tree_metrics.py
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "Tree"
OUT = PROJECT / "assets" / "metrics.json"

# Curves are downsampled to this many points so the JSON stays small enough to
# ship on GitHub Pages while remaining visually indistinguishable from the full
# curve.
CURVE_POINTS = 120


def thin(x, y, n=CURVE_POINTS):
    """Evenly subsample a monotone curve, always keeping both endpoints."""
    if len(x) <= n:
        idx = np.arange(len(x))
    else:
        idx = np.unique(np.linspace(0, len(x) - 1, n).astype(int))
    return [
        {"x": round(float(x[i]), 5), "y": round(float(y[i]), 5)} for i in idx
    ]


def main():
    bundle = joblib.load(PROJECT / "models" / "final_model.pkl")
    model, threshold = bundle["model"], float(bundle["threshold"])

    df_train = pd.read_csv(PROJECT / "cdata" / "c_train.csv")
    df_test = pd.read_csv(PROJECT / "cdata" / "c_test.csv")

    X = df_train.drop(columns=["Transported"])
    y = df_train["Transported"].astype(int)

    # Same split as train_ensemble.ipynb — verified to reproduce 0.7818 exactly.
    X_tr, X_val, y_tr, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    proba = model.predict_proba(X_val)[:, 1]

    # ---- headline metrics at the tuned threshold -------------------------
    pred = (proba >= threshold).astype(int)
    pred_default = (proba >= 0.5).astype(int)

    fpr, tpr, _ = roc_curve(y_val, proba)
    prec, rec, pr_thr = precision_recall_curve(y_val, proba)

    cm = confusion_matrix(y_val, pred).tolist()

    # ---- threshold sweep -------------------------------------------------
    sweep = []
    for t in np.round(np.arange(0.05, 0.96, 0.01), 2):
        p = (proba >= t).astype(int)
        sweep.append(
            {
                "threshold": float(t),
                "accuracy": round(float(accuracy_score(y_val, p)), 5),
                "precision": round(
                    float(precision_score(y_val, p, zero_division=0)), 5
                ),
                "recall": round(float(recall_score(y_val, p, zero_division=0)), 5),
                "f1": round(float(f1_score(y_val, p, zero_division=0)), 5),
            }
        )

    # ---- calibration (reliability) --------------------------------------
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
                "observed": round(float(y_val.to_numpy()[mask].mean()), 4),
                "count": int(mask.sum()),
            }
        )

    # ---- feature importance ---------------------------------------------
    importance = (
        pd.DataFrame(
            {
                "feature": list(X.columns),
                "gain": model.booster_.feature_importance(importance_type="gain"),
                "split": model.booster_.feature_importance(importance_type="split"),
            }
        )
        .sort_values("gain", ascending=False)
        .reset_index(drop=True)
    )
    total_gain = float(importance["gain"].sum()) or 1.0
    importance["share"] = (importance["gain"] / total_gain).round(5)

    # ---- test-set prediction distribution --------------------------------
    test_proba = model.predict_proba(df_test.drop(columns=["PassengerId"]))[:, 1]
    test_pred = test_proba >= threshold
    hist, edges = np.histogram(test_proba, bins=20, range=(0, 1))

    payload = {
        "generated_by": "tools/gen_tree_metrics.py",
        "model": type(model).__name__,
        "params": {
            k: v
            for k, v in model.get_params().items()
            if k
            in {
                "num_leaves",
                "max_depth",
                "learning_rate",
                "n_estimators",
                "subsample",
                "colsample_bytree",
                "min_child_samples",
                "reg_alpha",
                "reg_lambda",
            }
        },
        "threshold": threshold,
        "split": {
            "train_rows": int(len(X_tr)),
            "val_rows": int(len(X_val)),
            "test_rows": int(len(df_test)),
            "n_features": int(X.shape[1]),
            "positive_rate_train": round(float(y_tr.mean()), 5),
            "positive_rate_val": round(float(y_val.mean()), 5),
        },
        "headline": {
            "roc_auc": round(float(roc_auc_score(y_val, proba)), 5),
            "log_loss": round(float(log_loss(y_val, proba)), 5),
            "accuracy": round(float(accuracy_score(y_val, pred)), 5),
            "accuracy_at_050": round(float(accuracy_score(y_val, pred_default)), 5),
            "precision": round(float(precision_score(y_val, pred)), 5),
            "recall": round(float(recall_score(y_val, pred)), 5),
            "f1": round(float(f1_score(y_val, pred)), 5),
        },
        "confusion_matrix": {"tn": cm[0][0], "fp": cm[0][1], "fn": cm[1][0], "tp": cm[1][1]},
        "roc_curve": thin(fpr, tpr),
        "pr_curve": thin(rec, prec),
        "pr_baseline": round(float(y_val.mean()), 5),
        "threshold_sweep": sweep,
        "calibration": calibration,
        "feature_importance": importance.head(16).to_dict(orient="records"),
        "test_prediction_distribution": {
            "counts": hist.tolist(),
            "edges": [round(float(e), 3) for e in edges],
            "transported": int(test_pred.sum()),
            "not_transported": int((~test_pred).sum()),
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
    print(json.dumps(payload["headline"], indent=2))


if __name__ == "__main__":
    main()
