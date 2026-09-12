/* =============================================================================
   Spaceship Titanic case study — figures render from assets/metrics.json,
   written by tools/gen_tree_metrics.py from the persisted model.

   The one exception is the nine-model benchmark: those runs were not persisted,
   so the accuracies are transcribed from train_ensemble.ipynb and are marked as
   such in the table view.
   ============================================================================= */

(function () {
  "use strict";

  var fmt = window.Site.fmt;

  var BENCHMARK = [
    { model: "Gradient boosting", accuracy: 0.7805, kind: "single" },
    { model: "Weighted hard voting", accuracy: 0.7777, kind: "ensemble" },
    { model: "LightGBM", accuracy: 0.777, kind: "single" },
    { model: "Weighted soft voting", accuracy: 0.777, kind: "ensemble" },
    { model: "Soft voting", accuracy: 0.7749, kind: "ensemble" },
    { model: "Random forest", accuracy: 0.7729, kind: "single" },
    { model: "Hard voting", accuracy: 0.7729, kind: "ensemble" },
    { model: "XGBoost", accuracy: 0.7681, kind: "single" },
    { model: "Decision tree", accuracy: 0.7337, kind: "single" },
  ];

  fetch("./assets/metrics.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(render)
    .catch(function (err) {
      var main = document.getElementById("main");
      if (!main) return;
      main.insertAdjacentHTML(
        "afterbegin",
        '<div class="wrap"><div class="callout callout--warn metrics-error">' +
          '<span class="callout__icon" aria-hidden="true">▲</span>' +
          "<span><strong>Metrics could not be loaded.</strong> Figures read " +
          "<code>assets/metrics.json</code>; serve this page over HTTP rather than opening " +
          "it from the filesystem. (" + err.message + ")</span></div></div>"
      );
      benchChart(); // static data — still worth showing
    });

  function render(d) {
    fmt.bind(d);
    benchChart();
    sweepChart(d);
    importance(d);
    rocChart(d);
    calibrationChart(d);
  }

  /* --- nine-model benchmark ---------------------------------------------- */

  function benchChart() {
    Viz.chart("benchChart", function (p) {
      // Two identities (single vs ensemble), so two fixed slots plus a legend.
      var colors = BENCHMARK.map(function (b) {
        return b.kind === "ensemble" ? p.series[1] : p.series[0];
      });
      return {
        type: "bar",
        data: {
          labels: BENCHMARK.map(function (b) { return b.model; }),
          datasets: [
            Viz.barsH(p, BENCHMARK.map(function (b) { return b.accuracy; }), {
              extra: { backgroundColor: colors, hoverBackgroundColor: colors },
            }),
          ],
        },
        options: {
          indexAxis: "y",
          scales: {
            x: {
              min: 0.7,
              max: 0.8,
              grid: { color: Viz.palette().grid, lineWidth: 1, drawTicks: false },
              ticks: { callback: function (v) { return (v * 100).toFixed(0) + "%"; } },
            },
            y: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (c) {
                  return (
                    fmt.pct(BENCHMARK[c.dataIndex].accuracy, 2) +
                    " · " +
                    BENCHMARK[c.dataIndex].kind
                  );
                },
              },
            },
          },
        },
      };
    });

    Site.tableView(
      document.getElementById("benchTable"),
      [
        { label: "Model" },
        { label: "Type" },
        { label: "Validation accuracy", numeric: true },
      ],
      BENCHMARK.map(function (b) {
        return [b.model, b.kind === "ensemble" ? "Ensemble" : "Single", fmt.pct(b.accuracy, 2)];
      })
    );
  }

  /* --- threshold sweep ---------------------------------------------------- */

  function sweepChart(d) {
    var sweep = d.threshold_sweep;
    if (!sweep) return;
    var chosen = d.threshold;

    Viz.chart("sweepChart", function (p) {
      var marker = {
        id: "chosenThreshold",
        beforeDatasetsDraw: function (chart) {
          var x = chart.scales.x.getPixelForValue(chosen);
          if (isNaN(x)) return;
          var ctx = chart.ctx;
          var area = chart.chartArea;
          ctx.save();
          ctx.strokeStyle = p.ink4;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, area.top);
          ctx.lineTo(x, area.bottom);
          ctx.stroke();
          ctx.fillStyle = p.ink3;
          ctx.font = "500 10px " + (p.mono || "monospace");
          ctx.textAlign = "left";
          ctx.fillText("chosen " + chosen.toFixed(2), x + 6, area.top + 12);
          ctx.restore();
        },
      };

      return {
        type: "line",
        plugins: [marker],
        data: {
          datasets: [
            Viz.line(
              p,
              sweep.map(function (s) { return { x: s.threshold, y: s.accuracy }; }),
              { color: p.series[0], fill: true }
            ),
          ],
        },
        options: {
          parsing: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          scales: {
            x: {
              type: "linear", min: 0.05, max: 0.95,
              title: { display: true, text: "Decision threshold", color: p.ink3, font: { size: 11 } },
            },
            y: {
              min: 0.5, max: 0.82,
              ticks: { callback: function (v) { return (v * 100).toFixed(0) + "%"; } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (i) { return "Threshold " + fmt.dec(i[0].parsed.x, 2); },
                label: function (c) { return "Accuracy " + fmt.pct(c.parsed.y, 2); },
              },
            },
          },
        },
      };
    });

    Site.tableView(
      document.getElementById("sweepTable"),
      [
        { label: "Threshold", numeric: true },
        { label: "Accuracy", numeric: true },
        { label: "Precision", numeric: true },
        { label: "Recall", numeric: true },
        { label: "F1", numeric: true },
      ],
      sweep
        .filter(function (s, i) { return i % 5 === 0; })
        .map(function (s) {
          return [
            fmt.dec(s.threshold, 2),
            fmt.dec(s.accuracy, 4),
            fmt.dec(s.precision, 3),
            fmt.dec(s.recall, 3),
            fmt.dec(s.f1, 3),
          ];
        })
    );
  }

  /* --- feature importance -------------------------------------------------- */

  function importance(d) {
    var host = document.getElementById("importanceList");
    if (!host) return;
    var rows = d.feature_importance.slice(0, 10);
    var max = rows[0].share;
    host.innerHTML = rows
      .map(function (r) {
        return (
          '<div class="barlist__row"><div class="barlist__head">' +
          '<span class="barlist__name" title="' + r.feature + '">' + r.feature + "</span>" +
          '<span class="barlist__value">' + fmt.pct(r.share) + "</span></div>" +
          '<div class="barlist__track"><div class="barlist__fill" style="width:' +
          Math.max(2, (r.share / max) * 100).toFixed(1) + '%"></div></div></div>'
        );
      })
      .join("");
  }

  /* --- ROC ---------------------------------------------------------------- */

  function rocChart(d) {
    Viz.chart("rocChart", function (p) {
      return {
        type: "line",
        data: {
          datasets: [
            Viz.line(
              p,
              d.roc_curve.map(function (pt) { return { x: pt.x, y: pt.y }; }),
              { color: p.series[0], fill: true }
            ),
            Viz.reference(p, [{ x: 0, y: 0 }, { x: 1, y: 1 }], "Chance"),
          ],
        },
        options: {
          parsing: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          scales: {
            x: {
              type: "linear", min: 0, max: 1,
              title: { display: true, text: "False positive rate", color: p.ink3, font: { size: 11 } },
            },
            y: {
              type: "linear", min: 0, max: 1,
              title: { display: true, text: "True positive rate", color: p.ink3, font: { size: 11 } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (i) { return "FPR " + fmt.dec(i[0].parsed.x, 3); },
                label: function (c) {
                  return c.datasetIndex === 0 ? "TPR " + fmt.dec(c.parsed.y, 3) : "chance";
                },
              },
            },
          },
        },
      };
    });
  }

  /* --- calibration --------------------------------------------------------- */

  function calibrationChart(d) {
    var cal = d.calibration;
    if (!cal) return;
    Viz.chart("calChart", function (p) {
      return {
        type: "line",
        data: {
          datasets: [
            Viz.line(
              p,
              cal.map(function (c) { return { x: c.predicted, y: c.observed }; }),
              {
                color: p.series[0],
                extra: {
                  pointRadius: 4,
                  pointBackgroundColor: p.series[0],
                  pointBorderColor: p.surface,
                  pointBorderWidth: 2,
                },
              }
            ),
            Viz.reference(p, [{ x: 0, y: 0 }, { x: 1, y: 1 }], "Perfect calibration"),
          ],
        },
        options: {
          parsing: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          scales: {
            x: {
              type: "linear", min: 0, max: 1,
              title: { display: true, text: "Mean predicted probability", color: p.ink3, font: { size: 11 } },
            },
            y: {
              type: "linear", min: 0, max: 1,
              title: { display: true, text: "Observed frequency", color: p.ink3, font: { size: 11 } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (i) { return "Predicted " + fmt.dec(i[0].parsed.x, 3); },
                label: function (c) {
                  if (c.datasetIndex !== 0) return "perfect calibration";
                  var row = cal[c.dataIndex];
                  return "Observed " + fmt.dec(row.observed, 3) + " · n=" + fmt.int(row.count);
                },
              },
            },
          },
        },
      };
    });

    Site.tableView(
      document.getElementById("calTable"),
      [
        { label: "Bin", numeric: true },
        { label: "Mean predicted", numeric: true },
        { label: "Observed", numeric: true },
        { label: "Rows", numeric: true },
      ],
      cal.map(function (c) {
        return [fmt.dec(c.bin, 2), fmt.dec(c.predicted, 3), fmt.dec(c.observed, 3), fmt.int(c.count)];
      })
    );
  }
})();
