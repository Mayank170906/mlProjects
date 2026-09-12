# Machine Learning Portfolio

End-to-end supervised learning projects, each documented as a case study and a technical
report with results measured on held-out data.

> **Live site:** <https://mayank170906.github.io/mlProjects/>

---

## Projects

| # | Project | Task | Held-out ROC-AUC | Artifacts |
|---|---------|------|-----------------:|-----------|
| 01 | [Customer satisfaction prediction](./Supervised/) | Binary classification over 117,314 Olist e-commerce order rows | **0.7936** | [Case study](https://mayank170906.github.io/mlProjects/Supervised/) · [Report](https://mayank170906.github.io/mlProjects/Supervised/report.html) · [Dashboard](https://mayank170906.github.io/mlProjects/Supervised/ecommerce_dashboard.html) |
| 02 | [Spaceship Titanic](./Tree/) | Nine tree-based classifiers benchmarked, tuned and deployed | **0.8687** | [Case study](https://mayank170906.github.io/mlProjects/Tree/) · [Report](https://mayank170906.github.io/mlProjects/Tree/report.html) · [Live predictor](https://mayank170906.github.io/mlProjects/Tree/onnx_model.html) |

Both models are exported to ONNX and run client-side in the browser via WebAssembly.

---

## Every published figure is generated, not transcribed

Two scripts reload the persisted models, reproduce the exact training splits and write every
metric, curve and table on the site to a JSON file the pages read at load time:

```bash
uv run python tools/gen_supervised_metrics.py   # → Supervised/assets/metrics.json
uv run python tools/gen_tree_metrics.py         # → Tree/assets/metrics.json
```

This means the site cannot drift away from the notebooks. It also means the reported numbers
are the ones a clean refit actually produces — see
[the note on tuning-set selection bias](https://mayank170906.github.io/mlProjects/Supervised/report.html#tuning),
where Optuna's best trial reported 0.8057 and an honest refit gives 0.7936.

Supporting tooling:

```bash
uv run python tools/gen_dashboard_data.py  # → Supervised/assets/dashboard.json (dashboard cube)
uv run python tools/check_site.py    # verify links, anchors, data bindings and charts
uv run python tools/inject_nav.py    # re-apply the shared nav to generated notebook exports
```

---

## Repository layout

```text
mlProjects/
├── .github/workflows/static.yml   # GitHub Pages deployment
├── assets/                        # shared design system for the whole site
│   ├── css/site.css               #   tokens, components, light + dark palettes
│   ├── js/site.js                 #   theme, table-of-contents, formatting helpers
│   └── js/charts.js               #   Chart.js layer enforcing the visualisation rules
├── Supervised/                    # Project 01 — Olist customer satisfaction
│   ├── assets/                    #   metrics.json + page scripts
│   ├── data/  cdata/              #   raw and processed data (git-ignored)
│   ├── *.ipynb  *.html            #   notebooks and their rendered exports
│   ├── lgbm_model.onnx            #   trained model
│   ├── index.html  report.html    #   case study and technical report
│   └── README.md
├── Tree/                          # Project 02 — Spaceship Titanic
│   ├── assets/                    #   metrics.json, page scripts, predictor styles
│   ├── models/                    #   final_model.pkl / .onnx / .txt
│   ├── *.ipynb  *.html
│   ├── index.html  report.html  onnx_model.html
│   └── README.md
├── tools/                         # metrics generation and site checks
├── index.html  404.html           # portfolio landing and error page
├── sitemap.xml  robots.txt  .nojekyll
└── pyproject.toml  uv.lock
```

---

## The site

Static HTML, CSS and vanilla JavaScript — no framework and no build step. A
[GitHub Actions workflow](./.github/workflows/static.yml) publishes the repository to GitHub
Pages on every push to `master`.

A few things worth knowing if you are reading the source:

- **One stylesheet.** [`assets/css/site.css`](./assets/css/site.css) holds every token and
  component. Light is the base palette; dark is a separately chosen palette rather than an
  inversion, and the viewer's choice is remembered in `localStorage`.
- **Charts follow one set of rules.** [`assets/js/charts.js`](./assets/js/charts.js) encodes the
  mark specs once — capped bar thickness, rounded data-ends, 2px lines, solid hairline grids,
  tooltips by default — so no individual chart re-decides them. The categorical palette was
  validated for colour-vision deficiency separation and contrast in both themes.
- **Every chart has a table-view twin,** so no value is reachable only through colour or hover.
- **Notebook exports are not hand-edited.** `tools/inject_nav.py` re-applies the shared
  navigation bar after any `jupyter nbconvert`, idempotently.

---

## Local setup

```bash
git clone https://github.com/Mayank170906/mlProjects.git
cd mlProjects
uv sync

# Windows
.venv\Scripts\Activate.ps1
# Linux / macOS
source .venv/bin/activate
```

To preview the site locally (the pages fetch `metrics.json`, so they need HTTP rather than
`file://`):

```bash
python -m http.server 8000
# → http://localhost:8000
```

---

## Data governance

Datasets come from public platforms (Kaggle, UCI) and remain the property of their owners under
their original licences. Raw data is **not** redistributed in this repository — each project's
`README.md` carries the exact citation, licence and download instructions.

All original code and pipelines here are released under the MIT licence.

---

## Author

**Mayank Choudhary** — Integrated M.Tech, 4th year, VIT.

[GitHub](https://github.com/Mayank170906) ·
[Kaggle](https://www.kaggle.com/mayank170906) ·
[Credly](https://www.credly.com/users/mayank-choudhary.f07b4c1a/badges/credly)
