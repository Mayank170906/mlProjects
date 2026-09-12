/* =============================================================================
   Project Briefings — Q&A explorer, concept filter and the threshold lab.
   Each feature activates only if its markup is present on the page.
   ============================================================================= */

(function () {
  "use strict";

  var CHEVRON =
    '<svg class="qa__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  /* --- shared: category chips + search over a list of items ------------------ */

  function explorer(opts) {
    var root = document.querySelector(opts.root);
    if (!root) return;
    var items = Array.prototype.slice.call(root.querySelectorAll(opts.item));
    var search = document.querySelector(opts.search);
    var chips = document.querySelector(opts.chips);
    var count = document.querySelector(opts.count);
    var empty = document.querySelector(opts.empty);
    var cat = "all";

    function apply() {
      var q = search ? search.value.trim().toLowerCase() : "";
      var shown = 0;
      items.forEach(function (el) {
        var okCat = cat === "all" || el.getAttribute("data-cat") === cat;
        var okText = !q || el.textContent.toLowerCase().indexOf(q) !== -1;
        var show = okCat && okText;
        el.classList.toggle("is-hidden", !show);
        if (show) shown++;
        if (opts.onFilter) opts.onFilter(el, q, show);
      });
      if (count) count.textContent = shown + " of " + items.length;
      if (empty) empty.hidden = shown !== 0;
    }

    if (chips) {
      chips.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-cat]");
        if (!b) return;
        cat = b.getAttribute("data-cat");
        chips.querySelectorAll("button").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        apply();
      });
    }
    if (search) search.addEventListener("input", apply);
    apply();
    return { apply: apply, items: items };
  }

  /* --- Q&A ------------------------------------------------------------------ */

  function initQA() {
    var list = document.querySelector(".qa-list");
    if (!list) return;

    list.querySelectorAll(".qa > summary").forEach(function (s) {
      if (!s.querySelector(".qa__chev")) s.insertAdjacentHTML("beforeend", CHEVRON);
    });

    var ex = explorer({
      root: ".qa-list",
      item: ".qa",
      search: "#qaSearch",
      chips: "#qaChips",
      count: "#qaCount",
      empty: "#qaEmpty",
      onFilter: function (el, q, show) {
        // While searching, open matches so the answer text is visible.
        if (q && show) el.open = true;
      },
    });

    var toggle = document.getElementById("qaToggle");
    if (toggle && ex) {
      toggle.addEventListener("click", function () {
        var visible = ex.items.filter(function (el) { return !el.classList.contains("is-hidden"); });
        var anyClosed = visible.some(function (el) { return !el.open; });
        visible.forEach(function (el) { el.open = anyClosed; });
        toggle.textContent = anyClosed ? "Collapse all" : "Expand all";
      });
    }

    // Deep links like #q-threshold open and scroll to the question.
    function openFromHash() {
      var id = location.hash.slice(1);
      if (!id) return;
      var el = document.getElementById(id);
      if (el && el.classList.contains("qa")) {
        el.open = true;
        el.scrollIntoView({ block: "center" });
      }
    }
    window.addEventListener("hashchange", openFromHash);
    openFromHash();
  }

  /* --- concept guide -------------------------------------------------------------- */

  function initConcepts() {
    explorer({
      root: ".concepts",
      item: ".concept",
      search: "#conceptSearch",
      chips: "#conceptChips",
      count: "#conceptCount",
      empty: "#conceptEmpty",
    });
  }

  /* --- threshold lab ------------------------------------------------------------------ */

  function initLab() {
    var lab = document.getElementById("thresholdLab");
    if (!lab || !window.fetch) return;
    var src = lab.getAttribute("data-src");
    var fmt = window.Site && window.Site.fmt;

    fetch(src)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        var cm = d.confusion_matrix;
        var pos = cm.tp + cm.fn;
        var neg = cm.tn + cm.fp;
        var sweep = d.threshold_sweep;
        var slider = document.getElementById("labSlider");
        var byT = {};
        sweep.forEach(function (s) { byT[s.threshold.toFixed(2)] = s; });

        function counts(s) {
          var tp = Math.round(s.recall * pos);
          var fp = s.precision > 0 ? Math.round(tp / s.precision - tp) : 0;
          return { tp: tp, fn: pos - tp, fp: fp, tn: neg - fp };
        }

        var chart = null;
        if (window.Viz) {
          chart = Viz.chart("labRoc", function (p) {
            var s = byT[Number(slider.value).toFixed(2)] || sweep[0];
            var c = counts(s);
            return {
              type: "line",
              data: {
                datasets: [
                  Viz.line(p, d.roc_curve.map(function (pt) { return { x: pt.x, y: pt.y }; }), { color: p.series[0], fill: true }),
                  Viz.reference(p, [{ x: 0, y: 0 }, { x: 1, y: 1 }], "Chance"),
                  {
                    label: "Current threshold",
                    data: [{ x: c.fp / neg, y: c.tp / pos }],
                    showLine: false,
                    pointRadius: 7,
                    pointHoverRadius: 8,
                    pointBackgroundColor: p.series[1],
                    pointBorderColor: p.surface,
                    pointBorderWidth: 2,
                  },
                ],
              },
              options: {
                parsing: false,
                animation: { duration: 120 },
                interaction: { mode: "nearest", intersect: false },
                scales: {
                  x: { type: "linear", min: 0, max: 1, title: { display: true, text: "False positive rate", color: p.ink3, font: { size: 11 } } },
                  y: { type: "linear", min: 0, max: 1, title: { display: true, text: "True positive rate", color: p.ink3, font: { size: 11 } } },
                },
                plugins: {
                  tooltip: {
                    callbacks: {
                      label: function (ctx) {
                        return ctx.datasetIndex === 2
                          ? "threshold " + Number(slider.value).toFixed(2)
                          : "FPR " + ctx.parsed.x.toFixed(2) + " · TPR " + ctx.parsed.y.toFixed(2);
                      },
                    },
                  },
                },
              },
            };
          });
        }

        function set(id, v) {
          var el = document.getElementById(id);
          if (el) el.textContent = v;
        }

        function render() {
          var t = Number(slider.value).toFixed(2);
          var s = byT[t];
          if (!s) return;
          var c = counts(s);
          set("labT", t);
          set("labTP", c.tp); set("labFP", c.fp); set("labFN", c.fn); set("labTN", c.tn);
          set("labAcc", (s.accuracy * 100).toFixed(1) + "%");
          set("labPrec", s.precision.toFixed(3));
          set("labRec", s.recall.toFixed(3));
          set("labF1", s.f1.toFixed(3));
          var note;
          if (Number(t) < 0.3) note = "Very low threshold: nearly everyone is predicted positive. Recall is high, but false positives pile up.";
          else if (Number(t) > 0.7) note = "Very high threshold: the model only says yes when it is sure. Precision rises, but many true positives are missed.";
          else if (t === d.threshold.toFixed(2)) note = "This is the threshold the project chose — it gave the highest validation accuracy.";
          else note = "Move the slider and watch false positives trade against false negatives. The ROC curve itself never changes — only where you stand on it.";
          set("labNote", note);
          if (chart && chart.refresh) chart.refresh();
        }

        slider.addEventListener("input", render);
        slider.value = d.threshold;
        render();
        lab.classList.remove("is-loading");
      })
      .catch(function () {
        lab.innerHTML =
          '<p class="muted small m-0">The interactive demo needs the page to be served over HTTP (it reads Tree/assets/metrics.json).</p>';
      });
  }

  function boot() {
    initQA();
    initConcepts();
    initLab();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
