# generate_dashboard.py
"""
Generate a self-contained HTML dashboard for the Olist E-Commerce dataset.
Run with: python generate_dashboard.py
Output: ecommerce_dashboard.html
"""

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
import json
from pathlib import Path

# ----------------------------------------------------------------------
# 1. Load and prepare data
# ----------------------------------------------------------------------
DATA_PATH = Path("./cdata/final_ecommerce_dataset.csv")   # adjust if needed
df = pd.read_csv(DATA_PATH)

# Convert date columns
date_cols = [
    "order_purchase_timestamp", "order_approved_at",
    "order_delivered_carrier_date", "order_delivered_customer_date",
    "order_estimated_delivery_date", "shipping_limit_date",
    "review_creation_date", "review_answer_timestamp"
]
for col in date_cols:
    if col in df.columns:
        df[col] = pd.to_datetime(df[col], errors="coerce")

# Derived columns
df["purchase_date"] = pd.to_datetime(df["order_purchase_timestamp"]).dt.date
df["purchase_month"] = pd.to_datetime(df["order_purchase_timestamp"]).dt.to_period("M").astype(str)
df["delivery_days"] = (pd.to_datetime(df["order_delivered_customer_date"]) -
                       pd.to_datetime(df["order_purchase_timestamp"])).dt.days
df["on_time"] = (pd.to_datetime(df["order_delivered_customer_date"]) <=
                 pd.to_datetime(df["order_estimated_delivery_date"])).astype(int)

# Category translation (optional)
translation_path = Path("./cdata/product_category_name_translation.csv")
if translation_path.exists() and "product_category_name" in df.columns:
    translation = pd.read_csv(translation_path)
    df = df.merge(translation, on="product_category_name", how="left")
    df["category_english"] = df["product_category_name_english"].fillna(df["product_category_name"])
else:
    df["category_english"] = df.get("product_category_name", "Unknown")

# ----------------------------------------------------------------------
# 2. Validation metrics (hard-coded from your output)
# ----------------------------------------------------------------------
validation = {
    "primary_keys": {
        "customers (customer_id)": True,
        "orders (order_id)": True,
        "order_items (order_id+order_item_id)": True,
        "order_payments (order_id+payment_sequential)": True,
        "order_reviews (review_id+order_id)": True,
        "products (product_id)": True,
        "sellers (seller_id)": True,
        "product_category (product_category_name)": True,
        "geolocation (zip+lat+lng+city+state)": False,
    },
    "null_checks": {
        "customers.customer_id": 0,
        "orders.customer_id": 0,
        "orders.order_id": 0,
        "order_items.order_id": 0,
        "order_items.product_id": 0,
        "order_items.seller_id": 0,
        "order_payments.order_id": 0,
        "order_reviews.order_id": 0,
        "products.product_id": 0,
        "products.product_category_name": 610,
        "sellers.seller_id": 0,
        "product_category.product_category_name": 0,
    },
    "relationships": [
        "customers.customer_id = orders.customer_id",
        "orders.order_id = order_items.order_id",
        "orders.order_id = order_payments.order_id",
        "orders.order_id = order_reviews.order_id",
        "order_items.product_id = products.product_id",
        "order_items.seller_id = sellers.seller_id",
        "products.product_category_name = product_category.product_category_name",
        "customers.customer_zip_code_prefix = geolocation.geolocation_zip_code_prefix",
        "sellers.seller_zip_code_prefix = geolocation.geolocation_zip_code_prefix",
    ],
    "join_row_counts": [
        {"step": "customers + orders", "rows": 99441},
        {"step": "+ order_items", "rows": 112650},
        {"step": "+ products", "rows": 112650},
        {"step": "+ sellers", "rows": 112650},
        {"step": "+ order_payments", "rows": 117601},
        {"step": "+ order_reviews", "rows": 117329},
    ],
}

# ----------------------------------------------------------------------
# 3. Generate Plotly figures
# ----------------------------------------------------------------------
figures = {}

# KPIs
total_orders = df['order_id'].nunique()
total_revenue = df['payment_value'].sum()
avg_order_value = df['payment_value'].mean()
total_customers = df['customer_unique_id'].nunique()

# Overview
monthly_rev = df.groupby('purchase_month')['payment_value'].sum().reset_index()
fig_rev = px.line(monthly_rev, x='purchase_month', y='payment_value',
                  title="Monthly Revenue (R$)", markers=True)
figures['fig_rev'] = json.loads(pio.to_json(fig_rev))

monthly_orders = df.groupby('purchase_month')['order_id'].nunique().reset_index()
fig_orders = px.bar(monthly_orders, x='purchase_month', y='order_id',
                    title="Monthly Number of Orders")
figures['fig_orders'] = json.loads(pio.to_json(fig_orders))

status_counts = df['order_status'].value_counts().reset_index()
status_counts.columns = ['status', 'count']
fig_status = px.pie(status_counts, names='status', values='count',
                    title="Order Status Distribution", hole=0.4)
figures['fig_status'] = json.loads(pio.to_json(fig_status))

# Categories
cat_rev = df.groupby('category_english')['payment_value'].sum().nlargest(10).reset_index()
fig_cat_rev = px.bar(cat_rev, x='payment_value', y='category_english', orientation='h',
                     title="Top 10 Categories by Revenue")
figures['fig_cat_rev'] = json.loads(pio.to_json(fig_cat_rev))

cat_orders = df.groupby('category_english')['order_id'].nunique().nlargest(10).reset_index()
fig_cat_orders = px.bar(cat_orders, x='order_id', y='category_english', orientation='h',
                        title="Top 10 Categories by Number of Orders")
figures['fig_cat_orders'] = json.loads(pio.to_json(fig_cat_orders))

# Payments
pay_counts = df['payment_type'].value_counts().reset_index()
pay_counts.columns = ['type', 'count']
fig_pay_pie = px.pie(pay_counts, names='type', values='count',
                     title="Payment Type Distribution", hole=0.4)
figures['fig_pay_pie'] = json.loads(pio.to_json(fig_pay_pie))

avg_pay = df.groupby('payment_type')['payment_value'].mean().reset_index()
fig_pay_avg = px.bar(avg_pay, x='payment_type', y='payment_value',
                     title="Average Payment Value by Type")
figures['fig_pay_avg'] = json.loads(pio.to_json(fig_pay_avg))

inst_counts = df['payment_installments'].value_counts().sort_index().reset_index()
inst_counts.columns = ['installments', 'count']
fig_inst = px.bar(inst_counts, x='installments', y='count',
                  title="Installment Count Distribution")
figures['fig_inst'] = json.loads(pio.to_json(fig_inst))

# Geography
state_orders = df.groupby('customer_state')['order_id'].nunique().reset_index()
state_orders.columns = ['state', 'orders']
fig_state = px.bar(state_orders, x='state', y='orders',
                   title="Orders by Customer State")
figures['fig_state'] = json.loads(pio.to_json(fig_state))

# Delivery
fig_del_days = px.histogram(df, x='delivery_days', nbins=50,
                            title="Delivery Time (Days from Purchase to Delivery)")
figures['fig_del_days'] = json.loads(pio.to_json(fig_del_days))

on_time_rate = df['on_time'].mean() * 100
fig_gauge = go.Figure(go.Indicator(
    mode="gauge+number",
    value=on_time_rate,
    title={'text': "On-Time Delivery Rate (%)"},
    gauge={
        'axis': {'range': [0, 100]},
        'bar': {'color': "green"},
        'steps': [
            {'range': [0, 80], 'color': "lightgray"},
            {'range': [80, 90], 'color': "yellow"},
            {'range': [90, 100], 'color': "lightgreen"},
        ],
    }
))
figures['fig_gauge'] = json.loads(pio.to_json(fig_gauge))

review_counts = df['review_score'].value_counts().sort_index().reset_index()
review_counts.columns = ['score', 'count']
fig_review = px.bar(review_counts, x='score', y='count',
                    title="Review Score Distribution")
figures['fig_review'] = json.loads(pio.to_json(fig_review))

# ----------------------------------------------------------------------
# 4. Build HTML (without .format to avoid brace conflicts)
# ----------------------------------------------------------------------
figures_json = json.dumps(figures)
validation_json = json.dumps(validation)

html_parts = []
html_parts.append("""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Olist E-Commerce Dashboard</title>
    <!-- Bootstrap CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Plotly JS -->
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body { background-color: #f8f9fa; }
        .card { border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .kpi-value { font-size: 2rem; font-weight: bold; }
        .tab-content { padding-top: 20px; }
        pre { background: #f1f1f1; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
<div class="container-fluid py-4">
    <h1 class="display-4">🇧🇷 Olist E-Commerce Dashboard</h1>
    <p class="lead text-muted">Comprehensive analysis of orders, customers, products, and logistics</p>

    <!-- KPI Cards -->
    <div class="row mb-4">
        <div class="col-md-3">
            <div class="card p-3">
                <h5 class="text-muted">Total Orders</h5>
                <div class="kpi-value">""")
html_parts.append(f"{total_orders:,}")
html_parts.append("""</div>
                <small class="text-secondary">Unique orders placed</small>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card p-3">
                <h5 class="text-muted">Total Revenue</h5>
                <div class="kpi-value">R$ """)
html_parts.append(f"{total_revenue:,.0f}")
html_parts.append("""</div>
                <small class="text-secondary">Sum of payment values</small>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card p-3">
                <h5 class="text-muted">Avg Order Value</h5>
                <div class="kpi-value">R$ """)
html_parts.append(f"{avg_order_value:,.2f}")
html_parts.append("""</div>
                <small class="text-secondary">Mean payment per order</small>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card p-3">
                <h5 class="text-muted">Customers</h5>
                <div class="kpi-value">""")
html_parts.append(f"{total_customers:,}")
html_parts.append("""</div>
                <small class="text-secondary">Unique customers</small>
            </div>
        </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs" id="dashboardTabs" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link active" id="overview-tab" data-bs-toggle="tab" data-bs-target="#overview" type="button" role="tab">📈 Overview</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="validation-tab" data-bs-toggle="tab" data-bs-target="#validation" type="button" role="tab">🔍 Data Validation</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="categories-tab" data-bs-toggle="tab" data-bs-target="#categories" type="button" role="tab">🗂️ Categories</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="payments-tab" data-bs-toggle="tab" data-bs-target="#payments" type="button" role="tab">💳 Payments</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="geography-tab" data-bs-toggle="tab" data-bs-target="#geography" type="button" role="tab">🗺️ Geography</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link" id="delivery-tab" data-bs-toggle="tab" data-bs-target="#delivery" type="button" role="tab">🚚 Delivery & Reviews</button>
        </li>
    </ul>

    <div class="tab-content" id="dashboardTabsContent">
        <!-- Overview Tab -->
        <div class="tab-pane fade show active" id="overview" role="tabpanel">
            <div class="row">
                <div class="col-md-6" id="fig_rev"></div>
                <div class="col-md-6" id="fig_orders"></div>
                <div class="col-md-12" id="fig_status"></div>
            </div>
        </div>

        <!-- Validation Tab -->
        <div class="tab-pane fade" id="validation" role="tabpanel">
            <div class="row">
                <div class="col-md-6">
                    <h4>Primary Key Validation</h4>
                    <table class="table table-bordered">
                        <thead><tr><th>Table</th><th>Unique</th></tr></thead>
                        <tbody id="pk_table"></tbody>
                    </table>
                </div>
                <div class="col-md-6">
                    <h4>Null Check</h4>
                    <table class="table table-bordered">
                        <thead><tr><th>Column</th><th>Null Count</th></tr></thead>
                        <tbody id="null_table"></tbody>
                    </table>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-md-12">
                    <h4>Relationships</h4>
                    <ul id="relationships_list"></ul>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-md-12">
                    <h4>Join Row Counts</h4>
                    <table class="table table-bordered">
                        <thead><tr><th>Step</th><th>Rows</th></tr></thead>
                        <tbody id="join_table"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Categories Tab -->
        <div class="tab-pane fade" id="categories" role="tabpanel">
            <div class="row">
                <div class="col-md-6" id="fig_cat_rev"></div>
                <div class="col-md-6" id="fig_cat_orders"></div>
            </div>
        </div>

        <!-- Payments Tab -->
        <div class="tab-pane fade" id="payments" role="tabpanel">
            <div class="row">
                <div class="col-md-4" id="fig_pay_pie"></div>
                <div class="col-md-4" id="fig_pay_avg"></div>
                <div class="col-md-4" id="fig_inst"></div>
            </div>
        </div>

        <!-- Geography Tab -->
        <div class="tab-pane fade" id="geography" role="tabpanel">
            <div class="row">
                <div class="col-md-12" id="fig_state"></div>
            </div>
        </div>

        <!-- Delivery Tab -->
        <div class="tab-pane fade" id="delivery" role="tabpanel">
            <div class="row">
                <div class="col-md-6" id="fig_del_days"></div>
                <div class="col-md-6" id="fig_review"></div>
                <div class="col-md-12" id="fig_gauge"></div>
            </div>
        </div>
    </div>
</div>

<!-- Bootstrap JS -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

<script>
    // Embed figures and validation data
    const figures = """)
html_parts.append(figures_json)
html_parts.append(""";
    const validation = """)
html_parts.append(validation_json)
html_parts.append(""";

    // Render all Plotly figures
    Object.keys(figures).forEach(id => {
        Plotly.newPlot(id, figures[id].data, figures[id].layout, {responsive: true});
    });

    // Populate validation tables
    const pkTable = document.getElementById('pk_table');
    for (const [key, value] of Object.entries(validation.primary_keys)) {
        const row = pkTable.insertRow();
        row.innerHTML = `<td>${key}</td><td>${value ? '✅' : '❌'}</td>`;
    }

    const nullTable = document.getElementById('null_table');
    for (const [key, value] of Object.entries(validation.null_checks)) {
        const row = nullTable.insertRow();
        row.innerHTML = `<td>${key}</td><td>${value}</td>`;
    }

    const relList = document.getElementById('relationships_list');
    validation.relationships.forEach(rel => {
        const li = document.createElement('li');
        li.textContent = rel;
        relList.appendChild(li);
    });

    const joinTable = document.getElementById('join_table');
    validation.join_row_counts.forEach(item => {
        const row = joinTable.insertRow();
        row.innerHTML = `<td>${item.step}</td><td>${item.rows}</td>`;
    });
</script>
</body>
</html>""")

# Combine all parts and save
html_output = ''.join(html_parts)
output_path = Path("ecommerce_dashboard.html")
output_path.write_text(html_output, encoding="utf-8")
print(f"✅ Dashboard saved to {output_path.resolve()}")