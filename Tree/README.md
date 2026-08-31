# 🚀 Spaceship Titanic: Tree Ensembles & Stacking

Tree-based classification pipeline and stacking ensemble for Kaggle's **Spaceship Titanic** dataset, managed with `uv`.

## ⚙️ Workflow

1. **Clean Data:** Extracts features such as `Deck`, `Side`, `GroupSize`, and `TotalSpending`, while handling missing values. Raw data is read from `data/` and processed data is saved to `cdata/`.
2. **Train Models:** Benchmarks Decision Tree, Random Forest, and LightGBM using **5-Fold Stratified Cross-Validation**.
3. **Ensemble:** Combines out-of-fold probability predictions using a **Logistic Regression meta-learner**.

## 📦 Data Setup & Reproduction Note

The datasets (`train.csv`, `test.csv`, and `sample_submission.csv`) are **not tracked in this repository** because the data belongs to Kaggle.

To run the notebooks or pipelines locally:

1. Download the dataset directly from the [Kaggle Spaceship Titanic Competition](https://www.kaggle.com/competitions/spaceship-titanic/data).
2. Create a `data/` folder in the project root.
3. Place `train.csv`, `test.csv`, and `sample_submission.csv` inside the `data/` folder.
4. Run the data cleaning script. It will process the raw data and save the cleaned datasets to `cdata/`.

### Optional: Download via Kaggle CLI

```bash
kaggle competitions download -c spaceship-titanic -p data/
unzip data/spaceship-titanic.zip -d data/
```

## 🚀 Usage

### 1. Install Dependencies

```bash
uv sync
```

### 2. Clean the Data

Processes data from `data/` and saves the cleaned datasets to `cdata/`.

```bash
uv run python src/data_cleaner.py
```

### 3. Train Models & Export Submission

```bash
uv run python src/train_ensemble.py
```

## 📜 Data & License

* **Dataset:** [Spaceship Titanic — Kaggle](https://www.kaggle.com/competitions/spaceship-titanic)
* **License:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
* **Citation:** Addison Howard, Ashley Chow, and Ryan Holbrook. *Spaceship Titanic*. Kaggle, 2022.

## 👤 Author

* **GitHub:** [@Mayank170906](https://github.com/Mayank170906)
