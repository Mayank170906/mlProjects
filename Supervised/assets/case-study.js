/* =============================================================================
   Case-study page — reads metrics.json and renders every figure from it.
   Nothing on the page is hard-coded, so the page cannot drift from the model.
   ============================================================================= */

(function () {
  "use strict";

  var fmt = window.Site.fmt;

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
          "<span><strong>Metrics could not be loaded.</strong> " +
          "Figures on this page read <code>assets/metrics.json</code>; open this page over " +
          "HTTP rather than from the filesystem. (" +
          err.message +
          ")</span></div></div>"
      );
    });

  function render(data) {
    fmt.bind(data);
    delayChart(data);
    importanceList(data);
    joinChart(data);
    rocChart(data);
    prChart(data);
  }

  /* --- satisfaction by delivery punctuality ------------------------------ */

  function delayChart(data) {
    var rows = data.eda.satisfaction_by_delay;
    if (!rows || !rows.length) return;

    var isLate = rows.map(function (r) {
      return r.bucket.indexOf("late") !== -1;
    });

    Viz.chart("delayChart", function (p) {
      // Polarity, not identity: early vs late are opposite states, so the
      // diverging pair carries the meaning and the legend names both poles.
      var colors = isLate.map(function (late) {
        return late ? p.divPos : p.divNeg;
      });
      return {
        type: "bar",
        data: {
          labels: rows.map(function (r) {
            return r.bucket.replace(" early", "d early").replace(" late", "d late");
          }),
          datasets: [
            Viz.bars(
              p,
              rows.map(function (r) {
                return r.satisfied;
              }),
              { extra: { backgroundColor: colors, hoverBackgroundColor: colors } }
            ),
          ],
        },
        options: {
          scales: {
            y: {
              min: 0,
              max: 1,
              ticks: {
                callback: function (v) {
                  return Math.round(v * 100) + "%";
                },
              },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var row = rows[ctx.dataIndex];
                  return (
                    fmt.pct(row.satisfied) +
                    " satisfied · " +
                    fmt.int(row.orders) +
                    " orders"
                  );
                },
              },
            },
          },
        },
      };
    });

    Site.tableView(
      document.getElementById("delayTable"),
      [
        { label: "Delivery vs promise" },
        { label: "Satisfied", numeric: true },
        { label: "Orders", numeric: true },
      ],
      rows.map(function (r) {
        return [r.bucket, fmt.pct(r.satisfied), fmt.int(r.orders)];
      })
    );
  }

  /* --- feature importance bar list --------------------------------------- */

  function importanceList(data) {
    var host = document.getElementById("importanceList");
    if (!host) return;
    var rows = data.feature_importance.slice(0, 10);
    var max = rows[0].share;

    host.innerHTML = rows
      .map(function (r) {
        var width = Math.max(2, (r.share / max) * 100);
        return (
          '<div class="barlist__row">' +
          '<div class="barlist__head">' +
          '<span class="barlist__name" title="' +
          r.feature +
          '">' +
          r.feature +
          "</span>" +
          '<span class="barlist__value">' +
          fmt.pct(r.share) +
          "</span>" +
          "</div>" +
          '<div class="barlist__track"><div class="barlist__fill" style="width:' +
          width.toFixed(1) +
          '%"></div></div>' +
          "</div>"
        );
      })
      .join("");
  }

  /* --- join row-count progression ---------------------------------------- */

  function joinChart(data) {
    var steps = data.dataset.join_steps;
    if (!steps || !steps.length) return;

    Viz.chart("joinChart", function (p) {
      return {
        type: "bar",
        data: {
          labels: steps.map(function (s) {
            return s.step.replace("customers + orders", "customers+orders");
          }),
          datasets: [
            Viz.bars(
              p,
              steps.map(function (s) {
                return s.rows;
              }),
              { color: p.series[0] }
            ),
          ],
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function (v) {
                  return v >= 1000 ? v / 1000 + "k" : v;
                },
              },
            },
            x: { ticks: { maxRotation: 34, minRotation: 34, font: { size: 9.5 } } },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var i = ctx.dataIndex;
                  var delta = i === 0 ? 0 : steps[i].rows - steps[i - 1].rows;
                  return (
                    fmt.int(steps[i].rows) +
                    " rows" +
                    (i === 0
                      ? ""
                      : "  (" + (delta >= 0 ? "+" : "−") + fmt.int(Math.abs(delta)) + ")")
                  );
                },
              },
            },
          },
        },
      };
    });

    Site.tableView(
      document.getElementById("joinTable"),
      [
        { label: "Join step" },
        { label: "Rows after", numeric: true },
        { label: "Change", numeric: true },
      ],
      steps.map(function (s, i) {
        var delta = i === 0 ? null : s.rows - steps[i - 1].rows;
        return [
          s.step,
          fmt.int(s.rows),
          delta === null
            ? "—"
            : (delta >= 0 ? "+" : "−") + fmt.int(Math.abs(delta)),
        ];
      })
    );
  }

  /* --- ROC ---------------------------------------------------------------- */

  function rocChart(data) {
    Viz.chart("rocChart", function (p) {
      return {
        type: "line",
        data: {
          datasets: [
            Viz.line(
              p,
              data.roc_curve.map(function (pt) {
                return { x: pt.x, y: pt.y };
              }),
              { color: p.series[0], fill: true }
            ),
            Viz.reference(
              p,
              [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
              "Chance"
            ),
          ],
        },
        options: {
          parsing: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          scales: {
            x: {
              type: "linear",
              min: 0,
              max: 1,
              title: { display: true, text: "False positive rate", color: p.ink3, font: { size: 11 } },
            },
            y: {
              type: "linear",
              min: 0,
              max: 1,
              title: { display: true, text: "True positive rate", color: p.ink3, font: { size: 11 } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (items) {
                  return "FPR " + fmt.dec(items[0].parsed.x, 3);
                },
                label: function (ctx) {
                  return ctx.datasetIndex === 0
                    ? "TPR " + fmt.dec(ctx.parsed.y, 3)
                    : "chance";
                },
              },
            },
          },
        },
      };
    });
  }

  /* --- Precision–recall ---------------------------------------------------- */

  function prChart(data) {
    Viz.chart("prChart", function (p) {
      return {
        type: "line",
        data: {
          datasets: [
            Viz.line(
              p,
              data.pr_curve.map(function (pt) {
                return { x: pt.x, y: pt.y };
              }),
              { color: p.series[0], fill: true }
            ),
            Viz.reference(
              p,
              [
                { x: 0, y: data.pr_baseline },
                { x: 1, y: data.pr_baseline },
              ],
              "No skill"
            ),
          ],
        },
        options: {
          parsing: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          scales: {
            x: {
              type: "linear",
              min: 0,
              max: 1,
              title: { display: true, text: "Recall", color: p.ink3, font: { size: 11 } },
            },
            y: {
              type: "linear",
              min: 0,
              max: 1,
              title: { display: true, text: "Precision", color: p.ink3, font: { size: 11 } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (items) {
                  return "Recall " + fmt.dec(items[0].parsed.x, 3);
                },
                label: function (ctx) {
                  return ctx.datasetIndex === 0
                    ? "Precision " + fmt.dec(ctx.parsed.y, 3)
                    : "no-skill baseline";
                },
              },
            },
          },
        },
      };
    });
  }
})();
