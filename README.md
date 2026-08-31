# Machine Learning Projects Hub

This repository serves as a centralized hub for multiple standalone machine learning projects. Each project is contained within its own dedicated directory with an independent workflow, artifacts, and documentation.

> **🌐 Live Project Hub**: [https://mayank170906.github.io/mlProjects/](https://mayank170906.github.io/mlProjects/) — Access live web dashboards, exported reports, and interactive demos.

---

## 📂 Repository Structure

Each project folder operates independently with its own notebooks, pipelines, web interfaces, and dedicated `README.md` documentation:

```text
mlProjects/
├── .github/                 # GitHub Actions workflows & deployment configs
├── Project1/                # Individual Project (e.g., Supervised learning pipeline)
│   ├── data/                # Project datasets
│   ├── notebooks/           # EDA, feature engineering, modeling notebooks
│   ├── models/              # Exported weights & ONNX runtime artifacts
│   ├── index.html           # Project dashboard / demo page
│   └── README.md            # Detailed project documentation, dataset citations & walkthrough
├── Project2/                # Individual Project (e.g., Unsupervised / Clustering)
│   ├── ...
│   └── README.md
├── Project3/                # Individual Project (e.g., Tree-based benchmarks)
│   ├── ...
│   └── README.md
├── index.html               # Main root landing page for GitHub Pages
├── pyproject.toml           # Root dependency configurations
├── uv.lock                  # Pinned environment lockfile
└── README.md                # Root hub documentation (you are here)

```

> **📖 Project Documentation & Data Sources**: For project-specific details—including dataset origins, licenses, citations, technical methodologies, and reproduction steps—refer directly to the `README.md` inside each respective project folder.

---

## 🔧 Local Setup

1. **Clone the repository**
```bash
git clone https://github.com/Mayank170906/mlProjects.git
cd mlProjects

```


2. **Sync dependencies using `uv**`
```bash
uv sync

```


3. **Activate the virtual environment**
* **Windows (PowerShell)**:
```powershell
.venv\Scripts\Activate.ps1

```


* **Linux / macOS**:
```bash
source .venv/bin/activate

```




4. **Navigate to any project directory**
```bash
cd Supervised  # or any other project directory

```



---

## 📋 Data Governance & Disclaimers

* Datasets used across projects are sourced from public platforms (e.g., Kaggle, UCI ML Repository).
* Each dataset belongs to its respective owners and follows its original licensing terms.
* Refer to the `README.md` inside each individual project folder for exact dataset citations, licenses, and provenance.
* All original code and pipelines in this repository are released under the [MIT License](https://www.google.com/search?q=LICENSE).

---

## 📬 Contact & Profiles

* **Author**: Mayank
* **GitHub**: [@Mayank170906](https://github.com/Mayank170906)
* **Kaggle**: [@Mayank170906](https://www.google.com/search?q=https://www.kaggle.com/mayank170906)