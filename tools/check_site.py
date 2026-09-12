"""Static-site checker.

Validates, without a browser:

  1. every internal href / src resolves to a file that exists on disk
  2. every in-page #anchor target exists in that page
  3. every data-fill="path|format" resolves to a real key in the page's
     metrics.json, so no figure can silently render an em-dash
  4. every <canvas id> referenced by the page's script is present in the HTML
     (and vice versa), catching renamed charts

Run from the repository root:
    uv run python tools/check_site.py
"""

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urldefrag

ROOT = Path(__file__).resolve().parents[1]

PAGES = [
    "index.html",
    "404.html",
    "briefings.html",
    "Supervised/briefing.html",
    "Supervised/index.html",
    "Supervised/report.html",
    "Tree/briefing.html",
    "Tree/index.html",
    "Tree/report.html",
    "Tree/onnx_model.html",
    "Supervised/ecommerce_dashboard.html",
]

# data-fill paths on these pages are checked against this metrics file
METRICS_FOR = {
    "Supervised/index.html": "Supervised/assets/metrics.json",
    "Supervised/report.html": "Supervised/assets/metrics.json",
    "Tree/index.html": "Tree/assets/metrics.json",
    "Tree/report.html": "Tree/assets/metrics.json",
}

# canvas ids are matched against the script that drives each page
SCRIPTS_FOR = {
    "Supervised/index.html": ["Supervised/assets/case-study.js"],
    "Supervised/report.html": ["Supervised/assets/report.js"],
    "Tree/index.html": ["Tree/assets/case-study.js"],
    "Tree/report.html": ["Tree/assets/report.js"],
    "Supervised/ecommerce_dashboard.html": ["Supervised/assets/dashboard.js"],
}

# GitHub Pages serves the repo at /mlProjects/; 404.html must use absolute paths
SITE_PREFIX = "/mlProjects/"

problems = []
checked = {"links": 0, "anchors": 0, "fills": 0, "canvases": 0}


def note(page, message):
    problems.append(f"{page}: {message}")


def resolve(page_path: Path, href: str) -> Path | None:
    """Map an href to a path on disk, or None if it is external/non-file."""
    if href.startswith(SITE_PREFIX):
        return ROOT / href[len(SITE_PREFIX):]
    if href.startswith("/"):
        return None  # absolute but not site-prefixed — flagged by the caller
    return (page_path.parent / href).resolve()


def check_page(rel: str):
    path = ROOT / rel
    html = path.read_text(encoding="utf-8")

    ids = set(re.findall(r'\bid="([^"]+)"', html))

    # ---- 1 & 2: links and anchors ------------------------------------------
    for attr, value in re.findall(r'\b(href|src)="([^"]+)"', html):
        if value.startswith(("http://", "https://", "mailto:", "data:", "#")):
            if value.startswith("#"):
                checked["anchors"] += 1
                if value[1:] and value[1:] not in ids:
                    note(rel, f'anchor {value} has no matching id')
            continue

        target, frag = urldefrag(unquote(value))
        if not target:
            continue

        checked["links"] += 1
        if value.startswith("/") and not value.startswith(SITE_PREFIX):
            note(rel, f"absolute path {value} will break on GitHub Pages")
            continue

        resolved = resolve(path, target)
        if resolved is None or not resolved.exists():
            note(rel, f"{attr}={value} → missing file")

    # ---- 3: data-fill paths -------------------------------------------------
    metrics_rel = METRICS_FOR.get(rel)
    if metrics_rel:
        data = json.loads((ROOT / metrics_rel).read_text(encoding="utf-8"))
        for spec in re.findall(r'data-fill="([^"]+)"', html):
            checked["fills"] += 1
            keypath = spec.split("|")[0].strip()
            node = data
            for key in keypath.split("."):
                if isinstance(node, dict) and key in node:
                    node = node[key]
                else:
                    note(rel, f'data-fill "{keypath}" not found in {metrics_rel}')
                    break

    # ---- 4: canvases vs the script that draws them ---------------------------
    canvases = set(re.findall(r'<canvas[^>]*\bid="([^"]+)"', html))
    scripts = SCRIPTS_FOR.get(rel, [])
    if scripts:
        js = "\n".join((ROOT / s).read_text(encoding="utf-8") for s in scripts)
        drawn = set(re.findall(r'Viz\.chart\(\s*"([^"]+)"', js))
        drawn |= set(re.findall(r'curve\(\s*"([^"]+)"', js))
        for cid in canvases:
            checked["canvases"] += 1
            if cid not in drawn:
                note(rel, f"<canvas id={cid}> is never drawn by {', '.join(scripts)}")
        for cid in drawn:
            if cid not in canvases:
                note(rel, f"script draws #{cid} but the page has no such canvas")

    # ---- 5: table-view hosts exist ------------------------------------------
    if scripts:
        js = "\n".join((ROOT / s).read_text(encoding="utf-8") for s in scripts)
        for tid in set(re.findall(r'getElementById\("([A-Za-z]+Table)"\)', js)):
            if tid not in ids:
                note(rel, f"script targets #{tid} but the page has no such element")


def main():
    for rel in PAGES:
        if not (ROOT / rel).exists():
            note(rel, "page missing")
            continue
        check_page(rel)

    print(
        f"checked {checked['links']} links, {checked['anchors']} anchors, "
        f"{checked['fills']} data-fill paths, {checked['canvases']} canvases "
        f"across {len(PAGES)} pages"
    )

    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print("  ✖ " + p)
        return 1

    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
