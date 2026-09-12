# Spaceship Titanic — Tree-Based Classification

A controlled benchmark of five tree learners and four voting ensembles on Kaggle's
Spaceship Titanic, followed by randomised hyperparameter search, threshold optimisation and
ONNX export.

> **Case study:** <https://mayank170906.github.io/mlProjects/Tree/>
> **Technical report:** <https://mayank170906.github.io/mlProjects/Tree/report.html>
> **Live predictor:** <https://mayank170906.github.io/mlProjects/Tree/onnx_model.html>

---

## Results

Measured on a stratified 1,453-row validation split, reproduced exactly from the persisted
model.

| Metric | Value |
|---|---:|
| ROC-AUC | **0.8687** |
| Accuracy @ 0.42 | 78.18% |
| Accuracy @ 0.50 | 77.84% |
| Precision | 0.7476 |
| Recall | 0.8550 |
| F1 | 0.7977 |
| Log loss | 0.4485 |

**AUC 0.869 against 78% accuracy** is the most interesting number here: the model ranks
passengers considerably better than it labels them, so errors are concentrated near the
decision boundary rather than spread across confident predictions.

---

## The benchmark

Nine models, one stratified split, library defaults.

| Model | Type | Validation accuracy |
|---|---|---:|
| Gradient boosting | Single | **78.05%** |
| Weighted hard voting | Ensemble | 77.77% |
| LightGBM | Single | 77.70% |
| Weighted soft voting | Ensemble | 77.70% |
| Soft voting | Ensemble | 77.49% |
| Random forest | Single | 77.29% |
| Hard voting | Ensemble | 77.29% |
| XGBoost | Single | 76.81% |
| Decision tree | Single | 73.37% |

Two conclusions:

1. **No ensemble beat its best member.** The four voted tree models (DT, RF, GB, XGBoost) on identical features make correlated
   mistakes on the same rows, so voting preserves the errors instead of cancelling them.
2. **The top six sit within 0.8 points** — narrower than the ~1.1-point standard error of a
   1,453-row split. Which of them is "best" is not a question this split can answer. LightGBM
   was carried forward on tuning headroom and export support, not on a claimed win.

### The cross-validation gap

| Model | Search | Best CV | Holdout | Gap |
|---|---|---:|---:|---:|
| Gradient boosting | GridSearchCV, 162 combos | 80.23% | 77.15% | −3.08 |
| LightGBM | RandomizedSearchCV, 30 draws | 80.49% | 77.84% | −2.65 |

The search reports the CV score *of the configuration it chose because that score was highest*.
Across many noisy estimates the maximum is biased upward. The holdout number was never used for
selection, so it is the one quoted throughout.

---

## Preprocessing decisions

| Decision | Choice | Why |
|---|---|---|
| Missing categoricals | Fill with `"Unknown"` | Model-based imputation was tried and reached only **72.3%** accuracy — filling 2% of cells at 28% error injects noise. An explicit `Unknown` level lets the tree use missingness itself. |
| Missing numerics | Test: median · Train: rows dropped | Every test row needs a prediction, so the test set is median-filled; training rows with gaps were dropped instead. |
| `Cabin` | Dropped | Shared between passengers, so it leaks group membership across a random split. Safe, but see limitations. |
| `Name` | Dropped | Near-unique; any split on it memorises individuals. |
| Categoricals | One-hot, first level dropped | Yields the 16-column matrix the model consumes. |
| Residual missing rows | **Dropped** | The questionable one: `dropna()` ran before `Cabin`/`Name` were removed, costing **1,428 of 8,693** passengers (16.4%), some for gaps in columns never used. |

---

## Model

Tuned LightGBM, selected by `RandomizedSearchCV` (30 draws from 26,244 combinations, 5-fold CV):

```python
n_estimators=100, learning_rate=0.05, num_leaves=31, max_depth=-1,
min_child_samples=20, subsample=1.0, colsample_bytree=1.0,
reg_alpha=0.0, reg_lambda=0.1
```

The search converged on a small, plain model. On 5,812 training rows with 16 features, extra
capacity buys overfitting rather than accuracy — and the search found that on its own.

### ONNX export

| | |
|---|---|
| Input | `float_input`, `[N, 16]` float32 |
| Output 1 | `label`, int64 |
| Output 2 | `probabilities`, `[N, 2]` float32 |
| Threshold | 0.42 |

**Column order is load-bearing.** The graph takes a bare tensor and knows nothing of column
names; the wrong order produces confident nonsense rather than an error. The exact contract is
pinned in [`onnx.md`](./onnx.md).

One conversion detail: `onnxmltools` rejects `numpy.bool_` class labels, so the class metadata
is rewritten to `int64` on a deep copy before export, leaving the original estimator untouched.

---

## Reproduction

```bash
uv sync

# competition data is not redistributed
kaggle competitions download -c spaceship-titanic -p Tree/data/
unzip Tree/data/spaceship-titanic.zip -d Tree/data/

uv run python tools/gen_tree_metrics.py
```

The script loads `models/final_model.pkl`, reproduces the split with `random_state=42` and
writes `Tree/assets/metrics.json`. The reproduction is verified — it recovers the notebook's
78.1831% accuracy exactly, which is how we know the published figures describe the same model
the notebook trained.

Notebook order: [`data_cleaner.ipynb`](./data_cleaner.html) →
[`train_ensemble.ipynb`](./train_ensemble.html) → `model_test.ipynb`.

---

## Known limitations

- **`Cabin` was dropped, not decomposed.** Splitting it into deck / number / side is the single
  highest-value unexploited feature on this dataset.
- **No group features.** `PassengerId` is formatted `gggg_pp`; group size and companion outcomes
  are derivable and unused.
- **One split decides everything.** Repeated stratified CV would make sub-point model
  comparisons meaningful.
- **The ensembles were never tuned,** so their failure is evidence about *untuned* ensembles
  only. Stacking on out-of-fold predictions remains untested.
- **The threshold was chosen on the same set that reports accuracy,** so 78.18% carries a small
  upward bias of its own.
- **16.4% of labelled rows were discarded** in cleaning — on a dataset this small, recovering
  them is likely worth more than any further tuning.

---

## Citation

Addison Howard, Ashley Chow and Ryan Holbrook. *Spaceship Titanic.* Kaggle, 2022.
Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
