# 🛒 Customer Satisfaction Prediction (Supervised Learning)

An end-to-end supervised machine learning pipeline built on **100,000+ Brazilian e-commerce orders (2016–2018)**. This project predicts customer satisfaction (review scores) from multi-table order logistics, freight costs, payment behaviors, and customer review NLP features without target leakage.

---

## 📂 Project Directory Structure

```text
Supervised/
├── cdata/                      # Cleaned and processed intermediate data
├── data/                       # Raw Olist CSV files
├── data-analysys.ipynb         # Exploratory Data Analysis (EDA) & distribution checks
├── data-analysys.html          # Rendered HTML export of EDA
├── merge_data.ipynb            # Relational database ETL & table joining pipeline
├── merge_data.html             # Rendered ETL workflow
├── nl.ipynb                    # NLP pipeline (sentiment & text extraction from reviews)
├── nl.html                     # Rendered NLP notebook
├── model.ipynb                 # Feature engineering, LightGBM training & Optuna tuning
├── lgbm_model.onnx             # Serialized ONNX model for client-side/edge inference
├── ecommerce_dashboard.py      # Local interactive dashboard application
├── ecommerce_dashboard.html    # Interactive dashboard UI export
├── report.html                 # Comprehensive analytical report & metrics summary
├── index.html                  # Project web interface entrypoint
└── README.md                   # Project documentation (you are here)

```

---

## 🔄 End-to-End Pipeline Workflow

1. **ETL & Data Integration (`merge_data.ipynb`)**
* Joins 8 relational tables covering orders, items, payments, reviews, customers, sellers, products, and geolocations.
* Cleans missing records and resolves multiple seller/item splits per single order.


2. **Exploratory Data Analysis (`data-analysys.ipynb`)**
* Analyzes delivery delays vs. customer dissatisfaction.
* Inspects freight ratio penalties, geographic disparities, and seller performance patterns.


3. **NLP & Review Sentiment Extraction (`nl.ipynb`)**
* Processes Portuguese review comments and titles.
* Extracts sentiment signals, keyword frequencies, and review polarity tags.


4. **Modeling, Feature Engineering & Optimization (`model.ipynb`)**
* Implements **34 leakage-free features** derived strictly prior to delivery feedback.
* Trains a **LightGBM Classifier** optimized with **Optuna** Bayesian search.
* Evaluates on stratified holdout test sets with precision-recall and ROC-AUC curves.


5. **Edge Deployment & Dashboards (`lgbm_model.onnx`, `ecommerce_dashboard.py`)**
* Converts the trained model to **ONNX format** for portable inference.
* Provides an interactive dashboard for exploring live predictions and feature importance.



---

## 📊 Dataset Overview (Olist Brazilian E-Commerce)

The pipeline processes real commercial data collected from Brazilian marketplaces between **2016 and 2018**.

### Key Highlights

| Dimension | Details |
| --- | --- |
| **Total Transactions** | 100,000+ orders |
| **Unique Customers** | 99,441 unique customers |
| **Timeframe** | 2016 – 2018 |
| **Geographic Coverage** | Brazil (Top States: SP 42%, RJ 13%) |
| **Data Usability** | 10.0 / 10.0 |
| **Dataset License** | CC BY-NC-SA 4.0 |

### Raw Relational Files (`data/`)

```text
data/
├── olist_customers_dataset.csv          # Customer ID, unique ID, zip code, city, state
├── olist_geolocation_dataset.csv        # Zip code prefix to lat/lng mapping
├── olist_order_items_dataset.csv        # Item pricing, freight, seller mapping per order
├── olist_order_payments_dataset.csv     # Payment type, installments, payment value
├── olist_order_reviews_dataset.csv      # Review score (1-5), comment title, message, timestamps
├── olist_orders_dataset.csv             # Order status, purchase/approval/delivery timestamps
├── olist_products_dataset.csv           # Category name, dimensions, weight, photo counts
├── olist_sellers_dataset.csv            # Seller zip code, city, state
└── product_category_name_translation.csv# Category translation (Portuguese → English)

```

---

## ⚙️ How to Run

### 1. Environment Setup

From the repository root:

```bash
# Sync dependencies
uv sync

# Activate environment
# On Linux/macOS:
source .venv/bin/activate
# On Windows:
.venv\Scripts\activate

```

### 2. Run Notebooks

Navigate into the `Supervised/` folder and run Jupyter:

```bash
cd Supervised
jupyter lab

```

Run the notebooks in the following sequence:

1. `merge_data.ipynb`
2. `data-analysys.ipynb`
3. `nl.ipynb`
4. `model.ipynb`

### 3. Launch Dashboard

```bash
python ecommerce_dashboard.py

```

---

## 📋 Citation & Dataset Acknowledgments

* **Dataset**: [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
* **DOI**: `10.34740/kaggle/dsv/195341`
* **Contributors**: Olist, André Sionek, Francisco Magioli, Leo Dabague

```bibtex
@dataset{olist_brazilian_ecommerce,
  title={Brazilian E-Commerce Public Dataset by Olist},
  author={Olist and Sionek, André},
  year={2018},
  publisher={Kaggle},
  doi={10.34740/kaggle/dsv/195341},
  howpublished={\url{https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce}}
}

```