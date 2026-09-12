# Customer Satisfaction Prediction — Olist Brazilian E-Commerce

Supervised binary classification over **117,314 order rows** assembled from the Olist
relational dataset. The model flags orders likely to receive a poor review using only
information available before the customer writes one.

> **Case study:** <https://mayank170906.github.io/mlProjects/Supervised/>
> **Technical report:** <https://mayank170906.github.io/mlProjects/Supervised/report.html>

---

## Results

Measured once on a stratified 23,463-row holdout.

| Metric | Value |
|---|---:|
| ROC-AUC | **0.7936** |
| Average precision | 0.8984 |
| Accuracy @ 0.685 | 83.3% |
| Recall — satisfied | 0.922 |
| Recall — dissatisfied | 0.557 |
| Log loss | 0.4138 |
| Brier score | 0.1251 |

### On the 0.8057 you will see in the notebook

`nl.ipynb` prints `Best Trial ROC-AUC: 0.8057`. That is the **maximum over 30 Optuna trials
scored on the same holdout used to rank them** — a selection statistic, biased upward by
construction. Refitting the winning configuration and measuring once gives **0.7936**, and that
is the number published everywhere on the site.
[The report works through the gap.](https://mayank170906.github.io/mlProjects/Supervised/report.html#tuning)

### The finding that matters more than the AUC

| Delivery | Rated 4–5 stars |
|---|---:|
| On time or early | **80.2%** |
| Late | **26.4%** |

Satisfaction does not degrade gradually with lateness — it falls off a cliff the moment an
order misses its promised date. `delivery_delay_days` and `delay_severity` together carry ~24%
of total model gain.

---

## Pipeline

| Stage | Notebook | What it does |
|---|---|---|
| 1 | [`merge_data.ipynb`](./merge_data.html) | Primary-key validation, null audit, and the seven-table star-schema join |
| 2 | [`data-analysys.ipynb`](./data-analysys.html) | Distributions, delivery behaviour, category patterns |
| 3 | [`nl.ipynb`](./nl.html) | Feature engineering, four model iterations, Optuna search, ONNX export |
| 4 | `tools/gen_dashboard_data.py` | Builds the order-level data cube behind [the interactive dashboard](./ecommerce_dashboard.html) |

### Leakage control

Four features summarise a seller's or category's track record. These are computed **after** the
train/test split, on training rows only, and joined onto validation rows with a train-derived
fallback for unseen keys.

An earlier iteration computed them before splitting and scored 0.8523 ROC-AUC — a six-point jump
from a change that should have helped marginally. That jump was the tell, and chasing it down is
recorded as iteration 3 in
[§6 of the report](https://mayank170906.github.io/mlProjects/Supervised/report.html#modelling).

---

## Data

Nine CSVs ship with the dataset; **seven** are joined into the modelling frame.
`geolocation` is excluded (its composite key is non-unique and would fan the join out) and
`product_category_name_translation` is unused because the model consumes the Portuguese key
directly.

| Join step | Rows after | Why it changed |
|---|---:|---|
| customers ⋈ orders | 99,441 | 1:1 |
| ⋈ order_items | 112,650 | Fan-out: multiple items per order |
| ⋈ products | 112,650 | Every item resolves |
| ⋈ sellers | 112,650 | Every item resolves |
| ⋈ order_payments | 117,601 | Fan-out: split payments |
| ⋈ order_reviews | 117,329 | Inner join drops unreviewed orders |
| drop null `order_approved_at` | **117,314** | Unapprovable orders cannot be scored |

Raw CSVs are **not** tracked in this repository. `merge_data.ipynb` downloads them via
`kagglehub`, or place them manually in `Supervised/data/`.

---

## Model

LightGBM GBDT, Optuna-tuned over 30 trials:

```python
n_estimators=694, learning_rate=0.0626, num_leaves=127, max_depth=10,
min_child_samples=23, subsample=0.665, colsample_bytree=0.502,
reg_alpha=1.55e-05, reg_lambda=2.15e-07
```

Five categorical features (`customer_state`, `order_status`, `product_category_name`,
`seller_state`, `payment_type`) are handled natively rather than one-hot encoded.

### ONNX export

`lgbm_model.onnx` is exported with the `ZipMap` node removed, so the output is a plain
`float32[N, 2]` tensor rather than a sequence of dictionaries.

| | |
|---|---|
| Input | `float_input`, `[N, 34]` float32 |
| Output | `[N, 2]` float32 — column 1 is P(satisfied) |
| Threshold | 0.6849 |

**Caveat:** the graph carries no category encoder. Callers must reproduce the training-time
category codes for the five categorical columns, or those features are silently meaningless.
This is the pipeline's main deployment debt.

---

## Reproduction

```bash
uv sync
# place the Olist CSVs in Supervised/data/
uv run python tools/gen_supervised_metrics.py
```

The script rebuilds the join, re-engineers all 34 features, re-splits with `random_state=42`,
refits the tuned model and writes `Supervised/assets/metrics.json` — the single source every
number and chart on the published pages reads at load time.

---

## Known limitations

- The split is random rather than temporal, though order volume grew ~20× across the window.
- The unit of analysis is an order-item-payment row, so multi-item orders are over-weighted and
  rows from one order can straddle the split.
- No feature observes the product itself, which caps achievable recall on dissatisfaction.
- Seller aggregates fall back to global means for cold-start sellers.
- The million-row `geolocation` table is unused; customer–seller distance is the highest-value
  feature not yet built.

---

## Citation

```bibtex
@dataset{olist_brazilian_ecommerce,
  title     = {Brazilian E-Commerce Public Dataset by Olist},
  author    = {Olist and Sionek, Andr\'e},
  year      = {2018},
  publisher = {Kaggle},
  doi       = {10.34740/kaggle/dsv/195341},
  howpublished = {\url{https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce}}
}
```

Licensed CC BY-NC-SA 4.0. Contributors: Olist, André Sionek, Francisco Magioli, Leo Dabague.
