/* =============================================================================
   Technical report — every table, figure and inline number is rendered from
   assets/metrics.json, which tools/gen_supervised_metrics.py writes from the
   model's own held-out predictions.
   ============================================================================= */

(function () {
  "use strict";

  var fmt = window.Site.fmt;

  /* Human-readable descriptions keyed by feature name. The *list* of features
     comes from the metrics file, so a feature added upstream shows up here
     automatically (with a blank description) rather than silently going missing. */
  var FEATURE_DOCS = {
    customer_state: ["Categorical", "Source", "Customer's Brazilian state (UF), 27 levels"],
    order_status: ["Categorical", "Source", "Order lifecycle status at extraction"],
    price: ["Numeric", "Source", "Item price in BRL"],
    freight_value: ["Numeric", "Source", "Shipping cost charged for the item"],
    product_category_name: ["Categorical", "Source", "Product category in Portuguese, 71 levels"],
    product_name_lenght: ["Numeric", "Source", "Character length of the listing title"],
    product_description_lenght: ["Numeric", "Source", "Character length of the listing description"],
    product_photos_qty: ["Numeric", "Source", "Number of photos on the listing"],
    product_weight_g: ["Numeric", "Source", "Product weight in grams"],
    product_length_cm: ["Numeric", "Source", "Package length"],
    product_height_cm: ["Numeric", "Source", "Package height"],
    product_width_cm: ["Numeric", "Source", "Package width"],
    seller_state: ["Categorical", "Source", "Seller's state (UF)"],
    payment_sequential: ["Numeric", "Source", "Index of this payment within the order"],
    payment_type: ["Categorical", "Source", "Credit card, boleto, voucher or debit"],
    payment_installments: ["Numeric", "Source", "Number of instalments chosen"],
    payment_value: ["Numeric", "Source", "Amount settled on this payment"],
    delivery_delay_days: ["Numeric", "Engineered", "Actual minus promised delivery date; negative is early"],
    estimated_delivery_days: ["Numeric", "Engineered", "Promised window, purchase to estimated delivery"],
    actual_delivery_days: ["Numeric", "Engineered", "Realised window, purchase to delivery"],
    freight_ratio: ["Numeric", "Engineered", "Freight as a share of price plus freight"],
    product_volume_cm3: ["Numeric", "Engineered", "Length × height × width"],
    same_state: ["Binary", "Engineered", "1 when customer and seller share a state"],
    purchase_hour: ["Numeric", "Engineered", "Hour of day the order was placed (0–23)"],
    purchase_dayofweek: ["Numeric", "Engineered", "Day of week, Monday = 0"],
    purchase_month: ["Numeric", "Engineered", "Calendar month of purchase"],
    is_delayed: ["Binary", "Engineered", "1 when the order missed its promised date"],
    delay_severity: ["Numeric", "Engineered", "Delay normalised by the promised window"],
    freight_per_gram: ["Numeric", "Engineered", "Freight divided by weight"],
    price_per_volume: ["Numeric", "Engineered", "Price divided by package volume"],
    seller_avg_delay: ["Numeric", "Aggregate †", "Seller's mean delivery delay"],
    seller_order_count: ["Numeric", "Aggregate †", "Seller's order volume"],
    cat_avg_delay: ["Numeric", "Aggregate †", "Category's mean delivery delay"],
    cat_avg_freight: ["Numeric", "Aggregate †", "Category's mean freight cost"],
  };

  fetch("./assets/metrics.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(render)
    .catch(function (err) {
      var body = document.querySelector(".report__body");
      if (!body) return;
      body.insertAdjacentHTML(
        "afterbegin",
        '<div class="callout callout--warn metrics-error">' +
          '<span class="callout__icon" aria-hidden="true">▲</span>' +
          "<span><strong>Metrics could not be loaded.</strong> This report reads " +
          "<code>assets/metrics.json</code> at load time; serve the page over HTTP rather " +
          "than opening it from the filesystem. (" +
          err.message +
          ")</span></div>"
      );
    });

  function render(d) {
    fmt.bind(d);
    featureTable(d);
    paymentTable(d);
    numericTable(d);
    paramList(d);
    joinChart(d);
    reviewChart(d);
    delayChart(d);
    monthlyChart(d);
    stateChart(d);
    rocChart(d);
    prChart(d);
    importance(d);
    sweepChart(d);
    calibrationChart(d);
  }

  function setRows(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  /* ---- tables ------------------------------------------------------------ */

  function featureTable(d) {
    setRows(
      "featureTable",
      d.feature_list
        .map(function (f) {
          var doc = FEATURE_DOCS[f] || ["—", "—", ""];
          return (
            "<tr><th scope='row'><code>" +
            f +
            "</code></th><td>" +
            doc[0] +
            "</td><td>" +
            doc[1] +
            "</td><td>" +
            doc[2] +
            "</td></tr>"
          );
        })
        .join("") +
        "<tr class='is-total'><td colspan='4' class='muted xsmall'>† Aggregate " +
        "features are fitted on training rows only and joined onto validation rows " +
        "with a train-derived fallback — see §4.</td></tr>"
    );
  }

  function paymentTable(d) {
    setRows(
      "paymentTable",
      d.eda.payment_types
        .map(function (p) {
          return (
            "<tr><th scope='row'>" +
            p.type.replace(/_/g, " ") +
            "</th><td class='num'>" +
            fmt.int(p.count) +
            "</td><td class='num'>" +
            fmt.pct(p.share) +
            "</td><td class='num'>" +
            p.avg_value.toFixed(2) +
            "</td></tr>"
          );
        })
        .join("")
    );
  }

  function numericTable(d) {
    setRows(
      "numericTable",
      d.eda.numeric_stats
        .map(function (s) {
          return (
            "<tr><th scope='row'><code>" +
            s.feature +
            "</code></th><td class='num'>" +
            s.min.toFixed(2) +
            "</td><td class='num'>" +
            fmt.int(s.max.toFixed(2)) +
            "</td><td class='num'>" +
            s.mean.toFixed(2) +
            "</td><td class='num'>" +
            s.std.toFixed(2) +
            "</td></tr>"
          );
        })
        .join("")
    );
  }

  function paramList(d) {
    var el = document.getElementById("paramList");
    if (!el) return;
    var show = [
      "boosting_type",
      "n_estimators",
      "learning_rate",
      "num_leaves",
      "max_depth",
      "min_child_samples",
      "subsample",
      "colsample_bytree",
      "reg_alpha",
      "reg_lambda",
    ];
    el.innerHTML = show
      .filter(function (k) {
        return d.params[k] !== undefined;
      })
      .map(function (k) {
        var v = d.params[k];
        if (typeof v === "number" && !Number.isInteger(v)) {
          v = Math.abs(v) < 0.001 ? v.toExponential(2) : v.toFixed(4);
        }
        return "<dt>" + k + "</dt><dd>" + v + "</dd>";
      })
      .join("");
  }

  /* ---- charts ------------------------------------------------------------ */

  function joinChart(d) {
    var steps = d.dataset.join_steps;
    if (!steps) return;
    Viz.chart("joinChart", function (p) {
      return {
        type: "bar",
        data: {
          labels: steps.map(function (s) {
            return s.step.replace("customers + orders", "base");
          }),
          datasets: [Viz.bars(p, steps.map(function (s) { return s.rows; }))],
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: function (v) { return v / 1000 + "k"; } },
            },
            x: { ticks: { maxRotation: 30, minRotation: 30, font: { size: 9.5 } } },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (c) { return fmt.int(steps[c.dataIndex].rows) + " rows"; },
              },
            },
          },
        },
      };
    });
    Site.tableView(
      document.getElementById("joinTable"),
      [{ label: "Step" }, { label: "Rows", numeric: true }],
      steps.map(function (s) { return [s.step, fmt.int(s.rows)]; })
    );
  }

  function reviewChart(d) {
    var counts = d.eda.review_score_counts;
    var labels = Object.keys(counts).sort();
    Viz.chart("reviewChart", function (p) {
      return {
        type: "bar",
        data: {
          labels: labels.map(function (l) { return l + "★"; }),
          datasets: [Viz.bars(p, labels.map(function (l) { return counts[l]; }))],
        },
        options: {
          scales: {
            y: { beginAtZero: true, ticks: { callback: function (v) { return v / 1000 + "k"; } } },
          },
          plugins: {
            tooltip: {
              callbacks: { label: function (c) { return fmt.int(c.parsed.y) + " reviews"; } },
            },
          },
        },
      };
    });
    Site.tableView(
      document.getElementById("reviewTable"),
      [{ label: "Score" }, { label: "Reviews", numeric: true }],
      labels.map(function (l) { return [l + " star", fmt.int(counts[l])]; })
    );
  }

  function delayChart(d) {
    var rows = d.eda.satisfaction_by_delay;
    if (!rows) return;
    Viz.chart("delayChart", function (p) {
      // Early vs late is a polarity, so the diverging pair carries it.
      var colors = rows.map(function (r) {
        return r.bucket.indexOf("late") !== -1 ? p.divPos : p.divNeg;
      });
      return {
        type: "bar",
        data: {
          labels: rows.map(function (r) { return r.bucket; }),
          datasets: [
            Viz.bars(p, rows.map(function (r) { return r.satisfied; }), {
              extra: { backgroundColor: colors, hoverBackgroundColor: colors },
            }),
          ],
        },
        options: {
          scales: {
            y: { min: 0, max: 1, ticks: { callback: function (v) { return Math.round(v * 100) + "%"; } } },
            x: { ticks: { maxRotation: 30, minRotation: 30, font: { size: 9.5 } } },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (c) {
                  var r = rows[c.dataIndex];
                  return fmt.pct(r.satisfied) + " of " + fmt.int(r.orders) + " orders";
                },
              },
            },
          },
        },
      };
    });
    Site.tableView(
      document.getElementById("delayTable"),
      [{ label: "Bucket" }, { label: "Satisfied", numeric: true }, { label: "Orders", numeric: true }],
      rows.map(function (r) { return [r.bucket, fmt.pct(r.satisfied), fmt.int(r.orders)]; })
    );
  }

  function monthlyChart(d) {
    var rows = d.eda.monthly_orders;
    if (!rows) return;
    Viz.chart("monthlyChart", function (p) {
      return {
        type: "line",
        data: {
          labels: rows.map(function (r) { return r.month; }),
          datasets: [Viz.line(p, rows.map(function (r) { return r.orders; }), { fill: true })],
        },
        options: {
          scales: {
            y: { beginAtZero: true, ticks: { callback: function (v) { return v / 1000 + "k"; } } },
            x: { ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } } },
          },
          plugins: {
            tooltip: {
              callbacks: { label: function (c) { return fmt.int(c.parsed.y) + " rows"; } },
            },
          },
        },
      };
    });
    Site.tableView(
      document.getElementById("monthlyTable"),
      [{ label: "Month" }, { label: "Rows", numeric: true }],
      rows.map(function (r) { return [r.month, fmt.int(r.orders)]; })
    );
  }

  function stateChart(d) {
    var rows = d.eda.top_states;
    if (!rows) return;
    Viz.chart("stateChart", function (p) {
      return {
        type: "bar",
        data: {
          labels: rows.map(function (r) { return r.state; }),
          datasets: [Viz.barsH(p, rows.map(function (r) { return r.orders; }))],
        },
        options: {
          indexAxis: "y",
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: Viz.palette().grid, lineWidth: 1, drawTicks: false },
              ticks: { callback: function (v) { return v / 1000 + "k"; } },
            },
            y: { grid: { display: false } },
          },
          plugins: {
            tooltip: {
              callbacks: { label: function (c) { return fmt.int(c.parsed.x) + " rows"; } },
            },
          },
        },
      };
    });
    Site.tableView(
      document.getElementById("stateTable"),
      [{ label: "State" }, { label: "Rows", numeric: true }],
      rows.map(function (r) { return [r.state, fmt.int(r.orders)]; })
    );
  }

  function curve(canvasId, points, refPoints, xLabel, yLabel, refLabel) {
    Viz.chart(canvasId, function (p) {
      return {
        type: "line",
        data: {
          datasets: [
            Viz.line(p, points, { color: p.series[0], fill: true }),
            Viz.reference(p, refPoints, refLabel),
          ],
        },
        options: {
          parsing: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          scales: {
            x: {
              type: "linear", min: 0, max: 1,
              title: { display: true, text: xLabel, color: p.ink3, font: { size: 11 } },
            },
            y: {
              type: "linear", min: 0, max: 1,
              title: { display: true, text: yLabel, color: p.ink3, font: { size: 11 } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (i) { return xLabel + " " + fmt.dec(i[0].parsed.x, 3); },
                label: function (c) {
                  return c.datasetIndex === 0
                    ? yLabel + " " + fmt.dec(c.parsed.y, 3)
                    : refLabel;
                },
              },
            },
          },
        },
      };
    });
  }

  function rocChart(d) {
    curve(
      "rocChart",
      d.roc_curve.map(function (pt) { return { x: pt.x, y: pt.y }; }),
      [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      "False positive rate",
      "True positive rate",
      "Chance"
    );
  }

  function prChart(d) {
    curve(
      "prChart",
      d.pr_curve.map(function (pt) { return { x: pt.x, y: pt.y }; }),
      [{ x: 0, y: d.pr_baseline }, { x: 1, y: d.pr_baseline }],
      "Recall",
      "Precision",
      "No skill"
    );
  }

  function importance(d) {
    var host = document.getElementById("importanceList");
    if (host) {
      var rows = d.feature_importance.slice(0, 12);
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
    Site.tableView(
      document.getElementById("importanceTable"),
      [
        { label: "Feature" },
        { label: "Gain share", numeric: true },
        { label: "Splits", numeric: true },
      ],
      d.feature_importance.map(function (r) {
        return ["<code>" + r.feature + "</code>", fmt.pct(r.share, 2), fmt.int(r.split)];
      })
    );
  }

  function sweepChart(d) {
    var sweep = d.threshold_sweep;
    if (!sweep) return;
    var chosen = d.threshold;

    Viz.chart("sweepChart", function (p) {
      // A vertical rule at the selected threshold, drawn behind the series.
      var marker = {
        id: "thresholdMarker",
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
          ctx.textAlign = x > area.right - 70 ? "right" : "left";
          ctx.fillText(
            "chosen " + chosen.toFixed(3),
            x + (x > area.right - 70 ? -6 : 6),
            area.top + 12
          );
          ctx.restore();
        },
      };

      return {
        type: "line",
        plugins: [marker],
        data: {
          datasets: [
            Viz.line(p, sweep.map(function (s) { return { x: s.threshold, y: s.f1_dissatisfied }; }), { color: p.series[0] }),
            Viz.line(p, sweep.map(function (s) { return { x: s.threshold, y: s.accuracy }; }), { color: p.series[1] }),
            Viz.line(p, sweep.map(function (s) { return { x: s.threshold, y: s.recall_dissatisfied }; }), { color: p.series[2] }),
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
              min: 0, max: 1,
              ticks: { callback: function (v) { return Math.round(v * 100) + "%"; } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (i) { return "Threshold " + fmt.dec(i[0].parsed.x, 2); },
                label: function (c) {
                  var names = ["F1 dissatisfied", "Accuracy", "Recall dissatisfied"];
                  return names[c.datasetIndex] + "  " + fmt.dec(c.parsed.y, 3);
                },
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
        { label: "F1 dissat.", numeric: true },
        { label: "Recall dissat.", numeric: true },
      ],
      sweep
        .filter(function (s, i) { return i % 5 === 0; })
        .map(function (s) {
          return [
            fmt.dec(s.threshold, 2),
            fmt.dec(s.accuracy, 3),
            fmt.dec(s.f1_dissatisfied, 3),
            fmt.dec(s.recall_dissatisfied, 3),
          ];
        })
    );
  }

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
        { label: "Bin midpoint", numeric: true },
        { label: "Mean predicted", numeric: true },
        { label: "Observed", numeric: true },
        { label: "Rows", numeric: true },
      ],
      cal.map(function (c) {
        return [
          fmt.dec(c.bin, 2),
          fmt.dec(c.predicted, 3),
          fmt.dec(c.observed, 3),
          fmt.int(c.count),
        ];
      })
    );
  }
})();
