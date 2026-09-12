"""Build the data cube behind Supervised/ecommerce_dashboard.html.

The dashboard is static, so every interaction (date range, state, category,
delivery status) is answered in the browser from a pre-aggregated cube. The
unit here is the ORDER, not the order-item-payment row used for modelling, so
revenue and order counts are not inflated by item or payment fan-out.

Cube dimensions : month x customer_state x category x delivery bucket
Cube measures   : see MEASURES below (all additive, so any slice can be summed)

Run from the repository root:
    uv run python tools/gen_dashboard_data.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "Supervised" / "data"
OUT = ROOT / "Supervised" / "assets" / "dashboard.json"

TOP_CATEGORIES = 11  # the rest fold into "Other"

DELIVERY_BUCKETS = [
    "7+ days early",
    "0–6 days early",
    "1–7 days late",
    "8+ days late",
    "Not delivered",
]

PAYMENT_TYPES = ["credit_card", "boleto", "voucher", "debit_card"]

MEASURES = (
    ["orders", "gmv", "freight", "items", "delivered", "delivery_days", "reviewed"]
    + [f"r{i}" for i in range(1, 6)]
    + [f"pay_{p}" for p in PAYMENT_TYPES]
    + [f"h{i}" for i in range(0, 24, 3)]  # 3-hour purchase-time bins
    + [f"d{i}" for i in range(7)]  # purchase weekday, Monday = 0
)


def load():
    read = lambda name: pd.read_csv(DATA / name)  # noqa: E731
    return (
        read("olist_orders_dataset.csv"),
        read("olist_customers_dataset.csv"),
        read("olist_order_items_dataset.csv"),
        read("olist_products_dataset.csv"),
        read("product_category_name_translation.csv"),
        read("olist_order_payments_dataset.csv"),
        read("olist_order_reviews_dataset.csv"),
    )


def build_orders():
    orders, customers, items, products, translation, payments, reviews = load()

    for col in [
        "order_purchase_timestamp",
        "order_delivered_customer_date",
        "order_estimated_delivery_date",
    ]:
        orders[col] = pd.to_datetime(orders[col], errors="coerce")

    df = orders.merge(customers[["customer_id", "customer_state"]], on="customer_id", how="left")

    # ---- items → one row per order; category = highest-priced item's category
    items = items.merge(products[["product_id", "product_category_name"]], on="product_id", how="left")
    items = items.merge(translation, on="product_category_name", how="left")
    items["category"] = (
        items["product_category_name_english"]
        .fillna(items["product_category_name"])
        .fillna("unknown")
        .str.replace("_", " ")
    )
    top_item = items.sort_values("price", ascending=False).drop_duplicates("order_id")
    per_order = items.groupby("order_id").agg(
        items=("order_item_id", "count"),
        price=("price", "sum"),
        freight=("freight_value", "sum"),
    )
    per_order = per_order.join(top_item.set_index("order_id")["category"])
    df = df.merge(per_order, left_on="order_id", right_index=True, how="inner")

    # ---- payments → dominant method by value
    main_pay = (
        payments.sort_values("payment_value", ascending=False)
        .drop_duplicates("order_id")
        .set_index("order_id")["payment_type"]
    )
    df["payment_type"] = df["order_id"].map(main_pay)

    # ---- reviews → one per order (latest answer wins)
    reviews = reviews.sort_values("review_answer_timestamp").drop_duplicates("order_id", keep="last")
    df = df.merge(reviews[["order_id", "review_score"]], on="order_id", how="left")

    # ---- derived
    df["gmv"] = df["price"] + df["freight"]
    df["month"] = df["order_purchase_timestamp"].dt.strftime("%Y-%m")
    df["hour_bin"] = (df["order_purchase_timestamp"].dt.hour // 3) * 3
    df["weekday"] = df["order_purchase_timestamp"].dt.dayofweek

    delivered = df["order_delivered_customer_date"].notna()
    delay = (df["order_delivered_customer_date"] - df["order_estimated_delivery_date"]).dt.days
    df["delivery_days"] = (df["order_delivered_customer_date"] - df["order_purchase_timestamp"]).dt.days
    df["bucket"] = np.select(
        [~delivered, delay <= -7, delay <= 0, delay <= 7],
        [4, 0, 1, 2],
        default=3,
    )
    df["is_delivered"] = delivered.astype(int)

    return df


def main():
    df = build_orders()

    # Keep the months with meaningful volume; 2016 and late 2018 are fragments.
    volume = df["month"].value_counts()
    keep_months = sorted(m for m, n in volume.items() if n >= 500)
    df = df[df["month"].isin(keep_months)].copy()

    top = df.groupby("category")["gmv"].sum().sort_values(ascending=False).head(TOP_CATEGORIES).index.tolist()
    df["category"] = np.where(df["category"].isin(top), df["category"], "Other")
    categories = top + ["Other"]
    states = df.groupby("customer_state")["order_id"].count().sort_values(ascending=False).index.tolist()

    # ---- one-hot measure columns
    df["orders"] = 1
    df["delivered"] = df["is_delivered"]
    df["delivery_days"] = df["delivery_days"].where(df["is_delivered"] == 1, 0).fillna(0)
    df["reviewed"] = df["review_score"].notna().astype(int)
    for i in range(1, 6):
        df[f"r{i}"] = (df["review_score"] == i).astype(int)
    for p in PAYMENT_TYPES:
        df[f"pay_{p}"] = (df["payment_type"] == p).astype(int)
    for h in range(0, 24, 3):
        df[f"h{h}"] = (df["hour_bin"] == h).astype(int)
    for d in range(7):
        df[f"d{d}"] = (df["weekday"] == d).astype(int)

    df["m_idx"] = df["month"].map({m: i for i, m in enumerate(keep_months)})
    df["s_idx"] = df["customer_state"].map({s: i for i, s in enumerate(states)})
    df["c_idx"] = df["category"].map({c: i for i, c in enumerate(categories)})

    cube = df.groupby(["m_idx", "s_idx", "c_idx", "bucket"])[MEASURES].sum().reset_index()

    # Columnar layout keeps the file small: one array per dimension/measure.
    columns = {
        "m": cube["m_idx"].astype(int).tolist(),
        "s": cube["s_idx"].astype(int).tolist(),
        "c": cube["c_idx"].astype(int).tolist(),
        "b": cube["bucket"].astype(int).tolist(),
    }
    for name in MEASURES:
        values = cube[name].to_numpy()
        columns[name] = (
            [round(float(v), 2) for v in values]
            if name in ("gmv", "freight")
            else [int(v) for v in values]
        )

    # ---- pipeline facts shown in the data-quality panel (computed, not typed)
    raw = {
        "customers": 99441,
        "orders": 99441,
        "order_items": 112650,
        "order_payments": 103886,
        "order_reviews": 99224,
        "products": 32951,
        "sellers": 3095,
        "geolocation": 1000163,
        "product_category": 71,
    }
    for name, fname in [
        ("customers", "olist_customers_dataset.csv"),
        ("orders", "olist_orders_dataset.csv"),
        ("order_items", "olist_order_items_dataset.csv"),
        ("order_payments", "olist_order_payments_dataset.csv"),
        ("order_reviews", "olist_order_reviews_dataset.csv"),
        ("products", "olist_products_dataset.csv"),
        ("sellers", "olist_sellers_dataset.csv"),
        ("geolocation", "olist_geolocation_dataset.csv"),
        ("product_category", "product_category_name_translation.csv"),
    ]:
        with open(DATA / fname, "rb") as fh:
            raw[name] = sum(1 for _ in fh) - 1

    payload = {
        "generated_by": "tools/gen_dashboard_data.py",
        "unit": "order",
        "dims": {
            "months": keep_months,
            "states": states,
            "categories": categories,
            "buckets": DELIVERY_BUCKETS,
            "payment_types": PAYMENT_TYPES,
        },
        "measures": MEASURES,
        "cube": columns,
        "pipeline": {
            "source_tables": raw,
            "joined_tables": 7,
            "join_steps": [
                {"step": "customers ⋈ orders", "rows": 99441},
                {"step": "⋈ order_items", "rows": 112650},
                {"step": "⋈ products", "rows": 112650},
                {"step": "⋈ sellers", "rows": 112650},
                {"step": "⋈ order_payments", "rows": 117601},
                {"step": "⋈ order_reviews", "rows": 117329},
            ],
            "orders_in_dashboard": int(len(df)),
            "months_excluded": sorted(set(volume.index) - set(keep_months)),
        },
    }

    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB) — {len(cube):,} cells, {len(df):,} orders")
    print("months", keep_months[0], "→", keep_months[-1], f"({len(keep_months)})")
    print("categories", categories)


if __name__ == "__main__":
    main()
