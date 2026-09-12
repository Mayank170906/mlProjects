"""Inject a consistent portfolio nav bar into generated HTML.

Notebook exports and the Plotly dashboard are machine-generated, so they are not
hand-edited: this script strips any previously injected bar and inserts the
current one after <body>. Running it is idempotent, so it can be re-run after
every `jupyter nbconvert`.

Run from the repository root:
    uv run python tools/inject_nav.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# path -> (label shown as the current page, link back to its project index)
TARGETS = {
    "Supervised/merge_data.html": ("Relational ETL notebook", "Customer satisfaction"),
    "Supervised/data-analysys.html": ("Exploratory analysis notebook", "Customer satisfaction"),
    "Supervised/nl.html": ("Modelling &amp; tuning notebook", "Customer satisfaction"),
    "Tree/data_cleaner.html": ("Data cleaning notebook", "Spaceship Titanic"),
    "Tree/train_ensemble.html": ("Benchmark &amp; tuning notebook", "Spaceship Titanic"),
}

# Everything between these markers is regenerated on each run.
START = "<!-- portfolio-nav:start -->"
END = "<!-- portfolio-nav:end -->"

STYLE = """<style>
.pf-bar{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:14px;flex-wrap:wrap;
 margin:0 0 18px;padding:10px 18px;border:1px solid #e2ded7;border-radius:9px;background:#faf9f7;
 box-shadow:0 1px 3px rgba(22,25,28,.06);
 font:500 13px/1.4 "Inter",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#3d454b}
.pf-bar a{color:#3d454b;text-decoration:none}
.pf-bar a:hover{color:#b4512f}
.pf-bar__brand{display:inline-flex;align-items:center;gap:8px;font-weight:600;color:#16191c}
.pf-bar__mark{display:grid;place-items:center;width:22px;height:22px;border-radius:5px;
 background:#b4512f;color:#fff;font:700 10px/1 ui-monospace,Consolas,monospace}
.pf-bar__sep{color:#a9a49b}
.pf-bar__here{color:#626c74}
.pf-bar__spacer{margin-left:auto}
.pf-bar__btn{padding:5px 11px;border:1px solid #cdc7bd;border-radius:6px;background:#fff;
 color:#16191c;font:600 12px "Inter",Arial,sans-serif;text-decoration:none;cursor:pointer}
.pf-bar__btn:hover{border-color:#b4512f;color:#b4512f}
@media (max-width:640px){.pf-bar{padding:9px 14px;font-size:12px}.pf-bar__hide{display:none}}
@media print{.pf-bar{display:none}}
</style>"""

BAR = """<nav class="pf-bar" aria-label="Portfolio navigation">
 <a class="pf-bar__brand" href="{root}index.html"><span class="pf-bar__mark" aria-hidden="true">M</span>Mayank Choudhary</a>
 <span class="pf-bar__sep" aria-hidden="true">/</span>
 <a class="pf-bar__hide" href="./index.html">{project}</a>
 <span class="pf-bar__sep pf-bar__hide" aria-hidden="true">/</span>
 <span class="pf-bar__here">{page}</span>
 <span class="pf-bar__spacer"></span>
 <a class="pf-bar__btn" href="./index.html">Back to project</a>
 <a class="pf-bar__btn pf-bar__hide" href="{root}index.html">Portfolio</a>
</nav>"""


def build(page: str, project: str, depth: int) -> str:
    root = "../" * depth
    return (
        START
        + "\n"
        + STYLE
        + "\n"
        + BAR.format(root=root, project=project, page=page)
        + "\n"
        + END
    )


def clean(html: str) -> str:
    """Remove any previously injected bar, in either the old or current form."""
    html = re.sub(re.escape(START) + r".*?" + re.escape(END), "", html, flags=re.S)
    # The first-generation bar was a bare <nav> plus one or two loose <style>
    # blocks; both variants are matched by their distinctive contents.
    html = re.sub(r'<nav class="portfolio-nav".*?</nav>\s*', "", html, flags=re.S)
    html = re.sub(
        r"<style>(?:(?!</style>).)*?--portfolio-ink.*?</style>\s*", "", html, flags=re.S
    )
    html = re.sub(
        r"<style>(?:(?!</style>).)*?Machine Learning Portfolio'.*?</style>\s*",
        "",
        html,
        flags=re.S,
    )
    return html


def main():
    for rel, (page, project) in TARGETS.items():
        path = ROOT / rel
        if not path.exists():
            print(f"skip (missing) {rel}")
            continue

        html = path.read_text(encoding="utf-8")
        original = html
        html = clean(html)

        depth = len(Path(rel).parts) - 1
        block = build(page, project, depth)

        match = re.search(r"<body[^>]*>", html, flags=re.I)
        if not match:
            print(f"skip (no <body>) {rel}")
            continue
        # Consume any whitespace the previous block left behind, so re-running
        # the script is a no-op rather than accumulating blank lines.
        rest = html[match.end():].lstrip("\n")
        html = html[: match.end()] + "\n" + block + "\n" + rest

        if html != original:
            path.write_text(html, encoding="utf-8")
            print(f"updated {rel}")
        else:
            print(f"unchanged {rel}")


if __name__ == "__main__":
    main()
