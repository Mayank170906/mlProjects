/* =============================================================================
   Olist commerce dashboard.

   All data comes from assets/dashboard.json — an additive cube of
   month × state × category × delivery-bucket cells built from the raw tables by
   tools/gen_dashboard_data.py. Every view is a sum over the cells that match
   the current filters, so the page stays fully static.

   Cross-filtering: each breakdown ignores its own dimension's filter and
   highlights the selected member instead, so the other members stay visible.
   ============================================================================= */

(function () {
  "use strict";

  var fmt = window.Site.fmt;

  var BUCKET_EARLY = [0, 1];
  var BUCKET_LATE = [2, 3];
  var BUCKET_NONE = 4;
  var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
  var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var STATE_NAMES = {
    AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará",
    DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais",
    MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
    PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia",
    RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo",
    TO: "Tocantins",
  };

  var D = null; // dataset
  var N = 0; // cell count
  var state = { from: 0, to: 0, s: -1, c: -1, b: -1 };
  var ui = { trend: "gmv", cat: "gmv", timing: "day", sortKey: "orders", sortDir: -1 };
  var charts = {};

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------------------------
     Formatting
     --------------------------------------------------------------------------- */

  function money(v) {
    if (v >= 1e6) return "R$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return "R$" + (v / 1e3).toFixed(1) + "k";
    return "R$" + v.toFixed(0);
  }

  function compact(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e4) return (v / 1e3).toFixed(0) + "k";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
    return String(Math.round(v));
  }

  function monthLabel(m, long) {
    var parts = m.split("-");
    var name = MONTH_NAMES[Number(parts[1]) - 1];
    return long ? name + " " + parts[0] : name + " ’" + parts[0].slice(2);
  }

  function title(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------------------------------------------------------------------------
     Aggregation
     --------------------------------------------------------------------------- */

  function blank() {
    return {
      orders: 0, gmv: 0, freight: 0, items: 0, delivered: 0, delivery_days: 0, reviewed: 0,
      r: [0, 0, 0, 0, 0], pay: [0, 0, 0, 0], hour: [0, 0, 0, 0, 0, 0, 0, 0], day: [0, 0, 0, 0, 0, 0, 0],
      late: 0, early: 0,
    };
  }

  function addCell(t, i) {
    var c = D.cube;
    t.orders += c.orders[i];
    t.gmv += c.gmv[i];
    t.freight += c.freight[i];
    t.items += c.items[i];
    t.delivered += c.delivered[i];
    t.delivery_days += c.delivery_days[i];
    t.reviewed += c.reviewed[i];
    t.r[0] += c.r1[i]; t.r[1] += c.r2[i]; t.r[2] += c.r3[i]; t.r[3] += c.r4[i]; t.r[4] += c.r5[i];
    t.pay[0] += c.pay_credit_card[i]; t.pay[1] += c.pay_boleto[i];
    t.pay[2] += c.pay_voucher[i]; t.pay[3] += c.pay_debit_card[i];
    for (var h = 0; h < 8; h++) t.hour[h] += c["h" + HOURS[h]][i];
    for (var d = 0; d < 7; d++) t.day[d] += c["d" + d][i];
    var b = c.b[i];
    if (b === 2 || b === 3) t.late += c.orders[i];
    else if (b === 0 || b === 1) t.early += c.orders[i];
  }

  /**
   * Sum the cube under the current filters.
   * @param {object} opt  ignore: dimension key to leave unfiltered; from/to: month override;
   *                      groupBy: "m" | "s" | "c" | "b" returns an array of totals
   */
  function aggregate(opt) {
    opt = opt || {};
    var c = D.cube;
    var from = opt.from !== undefined ? opt.from : state.from;
    var to = opt.to !== undefined ? opt.to : state.to;
    var ign = opt.ignore || "";
    var groups = null;
    if (opt.groupBy) {
      var size = { m: D.dims.months.length, s: D.dims.states.length, c: D.dims.categories.length, b: D.dims.buckets.length }[opt.groupBy];
      groups = [];
      for (var g = 0; g < size; g++) groups.push(blank());
    }
    var total = blank();

    for (var i = 0; i < N; i++) {
      var m = c.m[i];
      if (m < from || m > to) continue;
      if (state.s >= 0 && ign !== "s" && c.s[i] !== state.s) continue;
      if (state.c >= 0 && ign !== "c" && c.c[i] !== state.c) continue;
      if (state.b >= 0 && ign !== "b" && c.b[i] !== state.b) continue;
      if (groups) addCell(groups[c[opt.groupBy][i]], i);
      else addCell(total, i);
    }
    return groups || total;
  }

  function derive(t) {
    var sat = t.reviewed ? (t.r[3] + t.r[4]) / t.reviewed : NaN;
    var avgReview = t.reviewed ? (t.r[0] + 2 * t.r[1] + 3 * t.r[2] + 4 * t.r[3] + 5 * t.r[4]) / t.reviewed : NaN;
    var deliveredKnown = t.late + t.early;
    return {
      orders: t.orders,
      reviewed: t.reviewed,
      gmv: t.gmv,
      aov: t.orders ? t.gmv / t.orders : NaN,
      sat: sat,
      avgReview: avgReview,
      onTime: deliveredKnown ? t.early / deliveredKnown : NaN,
      late: deliveredKnown ? t.late / deliveredKnown : NaN,
      days: t.delivered ? t.delivery_days / t.delivered : NaN,
      freightShare: t.gmv ? t.freight / t.gmv : NaN,
    };
  }

  /* ---------------------------------------------------------------------------
     URL state — every view is shareable
     --------------------------------------------------------------------------- */

  function writeHash() {
    var p = new URLSearchParams();
    var months = D.dims.months;
    if (state.from !== 0) p.set("from", months[state.from]);
    if (state.to !== months.length - 1) p.set("to", months[state.to]);
    if (state.s >= 0) p.set("state", D.dims.states[state.s]);
    if (state.c >= 0) p.set("cat", D.dims.categories[state.c]);
    if (state.b >= 0) p.set("delivery", String(state.b));
    if (ui.trend !== "gmv") p.set("trend", ui.trend);
    var hash = p.toString();
    history.replaceState(null, "", hash ? "#" + hash : location.pathname + location.search);
  }

  function readHash() {
    var p = new URLSearchParams(location.hash.slice(1));
    var months = D.dims.months;
    var f = months.indexOf(p.get("from"));
    var t = months.indexOf(p.get("to"));
    state.from = f >= 0 ? f : 0;
    state.to = t >= 0 ? t : months.length - 1;
    if (state.from > state.to) state.from = state.to;
    state.s = D.dims.states.indexOf(p.get("state"));
    state.c = D.dims.categories.indexOf(p.get("cat"));
    var b = Number(p.get("delivery"));
    state.b = p.has("delivery") && b >= 0 && b < D.dims.buckets.length ? b : -1;
    if (["gmv", "orders", "sat", "late"].indexOf(p.get("trend")) >= 0) ui.trend = p.get("trend");
  }

  /* ---------------------------------------------------------------------------
     Filters
     --------------------------------------------------------------------------- */

  function option(value, label) {
    var o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  }

  function buildFilters() {
    D.dims.months.forEach(function (m, i) {
      $("fFrom").appendChild(option(i, monthLabel(m, true)));
      $("fTo").appendChild(option(i, monthLabel(m, true)));
    });
    D.dims.states.forEach(function (s, i) {
      $("fState").appendChild(option(i, s + " · " + (STATE_NAMES[s] || s)));
    });
    D.dims.categories.forEach(function (c, i) {
      $("fCategory").appendChild(option(i, title(c)));
    });
    D.dims.buckets.forEach(function (b, i) {
      $("fBucket").appendChild(option(i, b));
    });

    $("fFrom").addEventListener("change", function () {
      state.from = Number(this.value);
      if (state.from > state.to) state.to = state.from;
      update();
    });
    $("fTo").addEventListener("change", function () {
      state.to = Number(this.value);
      if (state.to < state.from) state.from = state.to;
      update();
    });
    $("fState").addEventListener("change", function () {
      state.s = this.value === "" ? -1 : Number(this.value);
      update();
    });
    $("fCategory").addEventListener("change", function () {
      state.c = this.value === "" ? -1 : Number(this.value);
      update();
    });
    $("fBucket").addEventListener("change", function () {
      state.b = this.value === "" ? -1 : Number(this.value);
      update();
    });

    $("presets").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-preset]");
      if (!btn) return;
      var months = D.dims.months;
      var last = months.length - 1;
      var preset = btn.getAttribute("data-preset");
      if (preset === "all") { state.from = 0; state.to = last; }
      else if (preset === "last6") { state.from = Math.max(0, last - 5); state.to = last; }
      else {
        var idx = months.map(function (m, i) { return m.indexOf(preset) === 0 ? i : -1; })
          .filter(function (i) { return i >= 0; });
        if (idx.length) { state.from = idx[0]; state.to = idx[idx.length - 1]; }
      }
      update();
    });
  }

  function syncFilters() {
    $("fFrom").value = state.from;
    $("fTo").value = state.to;
    $("fState").value = state.s >= 0 ? state.s : "";
    $("fCategory").value = state.c >= 0 ? state.c : "";
    $("fBucket").value = state.b >= 0 ? state.b : "";
    var last = D.dims.months.length - 1;
    $("fFrom").classList.toggle("is-set", state.from !== 0);
    $("fTo").classList.toggle("is-set", state.to !== last);
    $("fState").classList.toggle("is-set", state.s >= 0);
    $("fCategory").classList.toggle("is-set", state.c >= 0);
    $("fBucket").classList.toggle("is-set", state.b >= 0);

    // highlight the matching preset, if any
    var months = D.dims.months;
    var active = null;
    if (state.from === 0 && state.to === last) active = "all";
    else if (state.to === last && state.from === Math.max(0, last - 5)) active = "last6";
    else ["2017", "2018"].forEach(function (y) {
      var idx = months.map(function (m, i) { return m.indexOf(y) === 0 ? i : -1; }).filter(function (i) { return i >= 0; });
      if (idx.length && state.from === idx[0] && state.to === idx[idx.length - 1]) active = y;
    });
    $("presets").querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-preset") === active);
      b.setAttribute("aria-pressed", b.getAttribute("data-preset") === active ? "true" : "false");
    });

    renderChips();
  }

  function renderChips() {
    var chips = [];
    var last = D.dims.months.length - 1;
    if (state.from !== 0 || state.to !== last) {
      chips.push(["period", "Period", monthLabel(D.dims.months[state.from]) + " – " + monthLabel(D.dims.months[state.to])]);
    }
    if (state.s >= 0) chips.push(["s", "State", D.dims.states[state.s]]);
    if (state.c >= 0) chips.push(["c", "Category", title(D.dims.categories[state.c])]);
    if (state.b >= 0) chips.push(["b", "Delivery", D.dims.buckets[state.b]]);

    var host = $("chips");
    host.innerHTML = chips
      .map(function (ch) {
        return (
          '<span class="chip">' + ch[1] + ": <strong>" + ch[2] + "</strong>" +
          '<button type="button" data-clear="' + ch[0] + '" aria-label="Remove ' + ch[1] + ' filter">×</button></span>'
        );
      })
      .join("") +
      (chips.length > 1 ? '<button type="button" class="chip chip--reset" data-clear="all">Reset all</button>' : "");
  }

  function clearFilter(key) {
    var last = D.dims.months.length - 1;
    if (key === "period" || key === "all") { state.from = 0; state.to = last; }
    if (key === "s" || key === "all") state.s = -1;
    if (key === "c" || key === "all") state.c = -1;
    if (key === "b" || key === "all") state.b = -1;
    update();
  }

  /* ---------------------------------------------------------------------------
     KPIs
     --------------------------------------------------------------------------- */

  var KPIS = [
    { key: "gmv", label: "Revenue", fmt: money, spark: "gmv", good: "up" },
    { key: "orders", label: "Orders", fmt: function (v) { return fmt.int(v); }, spark: "orders", good: "up" },
    { key: "aov", label: "Avg order value", fmt: function (v) { return "R$" + v.toFixed(0); }, spark: "aov", good: "up" },
    { key: "avgReview", label: "Avg review", fmt: function (v) { return v.toFixed(2) + "★"; }, spark: "avgReview", good: "up", pts: false },
    { key: "sat", label: "Satisfied (4–5★)", fmt: function (v) { return fmt.pct(v); }, spark: "sat", good: "up", pts: true },
    { key: "onTime", label: "On-time delivery", fmt: function (v) { return fmt.pct(v); }, spark: "onTime", good: "up", pts: true },
    { key: "days", label: "Avg delivery time", fmt: function (v) { return v.toFixed(1) + " days"; }, spark: "days", good: "down" },
  ];

  function sparkPath(values, w, h) {
    var clean = values.filter(function (v) { return isFinite(v); });
    if (clean.length < 2) return { line: "", area: "" };
    var min = Math.min.apply(null, clean);
    var max = Math.max.apply(null, clean);
    var span = max - min || 1;
    var step = w / (values.length - 1);
    var pts = values.map(function (v, i) {
      var y = isFinite(v) ? h - 2 - ((v - min) / span) * (h - 4) : h / 2;
      return [i * step, y];
    });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
    return { line: line, area: line + "L" + w + " " + h + "L0 " + h + "Z" };
  }

  function renderKpis(cur, byMonth) {
    var len = state.to - state.from + 1;
    var prevTo = state.from - 1;
    var prevFrom = state.from - len;
    var prev = prevFrom >= 0 ? derive(aggregate({ from: prevFrom, to: prevTo })) : null;
    var inRange = byMonth.slice(state.from, state.to + 1).map(derive);

    $("kpis").innerHTML = KPIS.map(function (k) {
      var v = cur[k.key];
      var value = isFinite(v) ? k.fmt(v) : "—";
      // With no earlier window of equal length there is nothing honest to compare against.
      var delta = '<span class="delta__vs"></span>';
      if (prev && isFinite(prev[k.key]) && isFinite(v) && prev[k.key] !== 0) {
        var change, text;
        if (k.pts) {
          change = (v - prev[k.key]) * 100;
          text = (change >= 0 ? "+" : "−") + Math.abs(change).toFixed(1) + " pts";
        } else {
          change = (v - prev[k.key]) / Math.abs(prev[k.key]) * 100;
          text = (change >= 0 ? "+" : "−") + Math.abs(change).toFixed(1) + "%";
        }
        var improving = k.good === "up" ? change > 0 : change < 0;
        var cls = Math.abs(change) < 0.05 ? "flat" : improving ? "up" : "down";
        var arrow = change > 0 ? "▲" : change < 0 ? "▼" : "";
        delta = '<span class="delta delta--' + cls + '" title="vs previous ' + len + ' month' + (len > 1 ? "s" : "") + '">' +
          '<span aria-hidden="true">' + arrow + "</span>" + text + "</span>";
      }
      var sp = sparkPath(inRange.map(function (d) { return d[k.spark]; }), 72, 24);
      return (
        '<div class="kpi">' +
        '<span class="kpi__label">' + k.label + "</span>" +
        '<span class="kpi__value">' + value + "</span>" +
        '<div class="kpi__foot">' + delta +
        (sp.line
          ? '<svg class="spark" viewBox="0 0 72 24" preserveAspectRatio="none" aria-hidden="true"><path class="spark__area" d="' + sp.area + '"/><path d="' + sp.line + '"/></svg>'
          : "") +
        "</div></div>"
      );
    }).join("");
  }

  /* ---------------------------------------------------------------------------
     Insights — plain-language readouts of the current selection
     --------------------------------------------------------------------------- */

  function renderInsights(cur, buckets, cats) {
    var items = [];

    var early = blank(), late = blank();
    BUCKET_EARLY.forEach(function (i) { mergeInto(early, buckets[i]); });
    BUCKET_LATE.forEach(function (i) { mergeInto(late, buckets[i]); });
    var e = derive(early), l = derive(late);
    if (isFinite(e.sat) && isFinite(l.sat) && late.reviewed >= 30) {
      items.push(
        "Orders delivered on time were rated 4–5★ <strong>" + fmt.pct(e.sat) + "</strong> of the time; late ones only <strong>" +
        fmt.pct(l.sat) + "</strong> — a <strong>" + ((e.sat - l.sat) * 100).toFixed(0) + "-point</strong> gap."
      );
    }

    if (state.b >= 0 && cur.reviewed >= 10) {
      // A delivery filter makes the late share trivially 0% or 100%, so describe the bucket instead.
      items.push(
        "Within <strong>" + D.dims.buckets[state.b].toLowerCase() + "</strong>, <strong>" + fmt.pct(cur.sat) +
        "</strong> of customers left 4–5★ and the average rating was <strong>" + cur.avgReview.toFixed(2) + "★</strong>."
      );
    } else if (isFinite(cur.late) && cur.orders >= 30) {
      items.push(
        "<strong>" + fmt.pct(cur.late) + "</strong> of delivered orders arrived late, and the average order took <strong>" +
        cur.days.toFixed(1) + " days</strong> to reach the customer."
      );
    }

    if (state.c < 0) {
      var ranked = cats
        .map(function (t, i) { return { i: i, d: derive(t), n: t.reviewed }; })
        .filter(function (x) { return x.n >= 200 && D.dims.categories[x.i] !== "Other"; })
        .sort(function (a, b) { return a.d.sat - b.d.sat; });
      if (ranked.length >= 2) {
        var worst = ranked[0], best = ranked[ranked.length - 1];
        items.push(
          "<strong>" + title(D.dims.categories[best.i]) + "</strong> has the happiest customers (" + fmt.pct(best.d.sat) +
          "); <strong>" + title(D.dims.categories[worst.i]) + "</strong> the least happy (" + fmt.pct(worst.d.sat) + ")."
        );
      }
    } else if (isFinite(cur.freightShare)) {
      items.push(
        "Freight makes up <strong>" + fmt.pct(cur.freightShare) + "</strong> of what customers paid in <strong>" +
        title(D.dims.categories[state.c]) + "</strong>, with an average basket of <strong>R$" + cur.aov.toFixed(0) + "</strong>."
      );
    }

    if (!cur.orders) {
      items = ["No orders match these filters. Remove a filter above to widen the selection."];
    }

    $("insights").innerHTML = items.slice(0, 3).map(function (t) {
      return '<p class="insight m-0"><span class="insight__icon" aria-hidden="true">◆</span><span>' + t + "</span></p>";
    }).join("");
  }

  function mergeInto(a, b) {
    ["orders", "gmv", "freight", "items", "delivered", "delivery_days", "reviewed", "late", "early"].forEach(function (k) { a[k] += b[k]; });
    for (var i = 0; i < 5; i++) a.r[i] += b.r[i];
    for (var j = 0; j < 4; j++) a.pay[j] += b.pay[j];
  }

  /* ---------------------------------------------------------------------------
     Charts
     --------------------------------------------------------------------------- */

  var TREND = {
    gmv: { title: "Revenue by month", sub: "Gross merchandise value — items plus freight", pick: function (d) { return d.gmv; }, tick: compact, tip: money },
    orders: { title: "Orders by month", sub: "Unique orders placed", pick: function (d) { return d.orders; }, tick: compact, tip: function (v) { return fmt.int(v) + " orders"; } },
    sat: { title: "Satisfaction by month", sub: "Share of reviewed orders rated 4–5★", pick: function (d) { return d.sat; }, tick: function (v) { return Math.round(v * 100) + "%"; }, tip: function (v) { return fmt.pct(v) + " satisfied"; }, pct: true },
    late: { title: "Late deliveries by month", sub: "Share of delivered orders that missed the promised date", pick: function (d) { return d.late; }, tick: function (v) { return Math.round(v * 100) + "%"; }, tip: function (v) { return fmt.pct(v) + " late"; }, pct: true },
  };

  var view = {}; // latest aggregates, read by chart builders

  function buildCharts() {
    charts.trend = Viz.chart("trendChart", function (p) {
      var cfg = TREND[ui.trend];
      var labels = view.trendMonths || [];
      var values = view.trendValues || [];
      // Months outside the selected period stay visible for context but recede.
      return {
        type: "line",
        data: {
          labels: labels.map(function (m) { return monthLabel(m); }),
          datasets: [
            Viz.line(p, values, {
              color: p.series[0],
              fill: true,
              tension: 0.25,
              extra: {
                segment: {
                  borderColor: function (ctx) {
                    var i = ctx.p1DataIndex + view.trendOffset;
                    return i > state.from && i <= state.to ? p.series[0] : Viz.alpha(p.series[0], 0.3);
                  },
                },
              },
            }),
          ],
        },
        options: {
          scales: {
            y: {
              beginAtZero: !cfg.pct,
              suggestedMin: cfg.pct ? undefined : 0,
              ticks: { callback: function (v) { return cfg.tick(v); } },
            },
            x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (items) { return monthLabel(labels[items[0].dataIndex], true); },
                label: function (c) { return cfg.tip(c.parsed.y); },
              },
            },
          },
        },
      };
    });

    charts.bucket = Viz.chart("bucketChart", function (p) {
      var rows = view.buckets || [];
      var colors = rows.map(function (r, i) {
        var base = i === BUCKET_NONE ? p.ink4 : i <= 1 ? p.divNeg : p.divPos;
        return state.b >= 0 && state.b !== i ? Viz.alpha(base, 0.28) : base;
      });
      return {
        type: "bar",
        data: {
          labels: [["7+ days", "early"], ["0–6 days", "early"], ["1–7 days", "late"], ["8+ days", "late"], ["Not", "delivered"]],
          datasets: [Viz.bars(p, rows.map(function (r) { return r.sat; }), { extra: { backgroundColor: colors, hoverBackgroundColor: colors } })],
        },
        options: {
          interaction: { mode: "nearest", intersect: false, axis: "x" },
          scales: {
            y: { min: 0, max: 1, ticks: { callback: function (v) { return Math.round(v * 100) + "%"; } } },
            x: { ticks: { maxRotation: 0, autoSkip: false, font: { size: 10 } } },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (items) { return D.dims.buckets[items[0].dataIndex]; },
                label: function (c) {
                  var r = rows[c.dataIndex];
                  return isFinite(r.sat) ? fmt.pct(r.sat) + " satisfied · " + fmt.int(r.orders) + " orders" : "no reviews";
                },
                footer: function () { return "Click to filter"; },
              },
            },
          },
          onClick: function (evt, els, chart) {
            var hit = chart.getElementsAtEventForMode(evt, "nearest", { intersect: false, axis: "x" }, true);
            if (!hit.length) return;
            var i = hit[0].index;
            state.b = state.b === i ? -1 : i;
            update();
          },
          onHover: function (evt, els, chart) {
            chart.canvas.style.cursor = "pointer";
          },
        },
      };
    });

    charts.review = Viz.chart("reviewChart", function (p) {
      var r = view.reviews || [0, 0, 0, 0, 0];
      var total = r.reduce(function (a, b) { return a + b; }, 0) || 1;
      return {
        type: "bar",
        data: {
          labels: ["1★", "2★", "3★", "4★", "5★"],
          datasets: [Viz.bars(p, r, { color: p.series[0] })],
        },
        options: {
          scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return compact(v); } } } },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (c) { return fmt.int(c.parsed.y) + " reviews · " + fmt.pct(c.parsed.y / total); },
              },
            },
          },
        },
      };
    });

    charts.timing = Viz.chart("timingChart", function (p) {
      var isDay = ui.timing === "day";
      var values = (isDay ? view.day : view.hour) || [];
      var total = values.reduce(function (a, b) { return a + b; }, 0) || 1;
      var labels = isDay ? WEEKDAYS : HOURS.map(function (h) { return String(h).padStart(2, "0") + "h"; });
      return {
        type: "bar",
        data: { labels: labels, datasets: [Viz.bars(p, values, { color: p.series[1] })] },
        options: {
          scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return compact(v); } } } },
          plugins: {
            tooltip: {
              callbacks: {
                title: function (items) {
                  if (isDay) return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][items[0].dataIndex];
                  var h = HOURS[items[0].dataIndex];
                  return String(h).padStart(2, "0") + ":00 – " + String(h + 2).padStart(2, "0") + ":59";
                },
                label: function (c) { return fmt.int(c.parsed.y) + " orders · " + fmt.pct(c.parsed.y / total); },
              },
            },
          },
        },
      };
    });
  }

  /* ---------------------------------------------------------------------------
     HTML breakdowns
     --------------------------------------------------------------------------- */

  var CAT_METRIC = {
    gmv: { pick: function (d) { return d.gmv; }, show: money, sub: "Top 11 by revenue · click to filter" },
    orders: { pick: function (d) { return d.orders; }, show: function (v) { return fmt.int(v); }, sub: "Orders per category · click to filter" },
    sat: { pick: function (d) { return d.sat; }, show: function (v) { return fmt.pct(v); }, sub: "Share rated 4–5★ · click to filter" },
  };

  function renderCategories(cats) {
    var m = CAT_METRIC[ui.cat];
    $("catSub").textContent = m.sub;
    var rows = cats.map(function (t, i) { return { i: i, d: derive(t) }; })
      .filter(function (r) { return r.d.orders > 0; });
    rows.sort(function (a, b) {
      var va = m.pick(a.d), vb = m.pick(b.d);
      if (!isFinite(va)) return 1;
      if (!isFinite(vb)) return -1;
      return vb - va;
    });
    // "Other" always sits last so it never masquerades as a top category.
    rows.sort(function (a, b) {
      return (D.dims.categories[a.i] === "Other") - (D.dims.categories[b.i] === "Other");
    });
    // Scale against named categories only: "Other" aggregates dozens and would flatten the rest.
    var named = rows.filter(function (r) { return D.dims.categories[r.i] !== "Other"; });
    var max = Math.max.apply(null, (named.length ? named : rows).map(function (r) { return m.pick(r.d) || 0; })) || 1;
    var floor = ui.cat === "sat" ? Math.max(0, Math.min.apply(null, rows.map(function (r) { return isFinite(r.d.sat) ? r.d.sat : 1; })) - 0.1) : 0;

    $("catList").innerHTML = rows.length
      ? rows.map(function (r) {
          var v = m.pick(r.d);
          var w = isFinite(v) ? Math.min(100, Math.max(1.5, ((v - floor) / (max - floor)) * 100)) : 0;
          var isOther = D.dims.categories[r.i] === "Other";
          var cls = (state.c === r.i ? " is-selected" : state.c >= 0 ? " is-muted" : "") + (isOther ? " is-other" : "");
          return (
            '<button type="button" class="rank__row' + cls + '" data-cat="' + r.i + '" aria-pressed="' + (state.c === r.i) + '">' +
            '<span class="rank__name">' + D.dims.categories[r.i] + "</span>" +
            '<span class="rank__track" aria-hidden="true"><span class="rank__fill" style="display:block;width:' + w.toFixed(1) + '%"></span></span>' +
            '<span class="rank__value">' + (isFinite(v) ? m.show(v) : "—") + "</span></button>"
          );
        }).join("")
      : '<p class="small muted m-0">No orders match these filters.</p>';
  }

  function renderStates(states) {
    var rows = states.map(function (t, i) { return { i: i, name: D.dims.states[i], d: derive(t) }; })
      .filter(function (r) { return r.d.orders > 0; });
    var key = ui.sortKey, dir = ui.sortDir;
    rows.sort(function (a, b) {
      if (key === "name") return dir * a.name.localeCompare(b.name);
      var va = a.d[key], vb = b.d[key];
      if (!isFinite(va)) return 1; // missing values always sink
      if (!isFinite(vb)) return -1;
      return dir * (va - vb);
    });
    var maxOrders = Math.max.apply(null, rows.map(function (r) { return r.d.orders; })) || 1;

    $("stateTable").querySelector("tbody").innerHTML = rows.length
      ? rows.map(function (r) {
          var sel = state.s === r.i;
          return (
            '<tr tabindex="0" data-state="' + r.i + '" class="' + (sel ? "is-selected" : "") + '" aria-selected="' + sel + '">' +
            '<th scope="row" title="' + (STATE_NAMES[r.name] || r.name) + '">' + r.name + ' <span class="muted xsmall state-full">' + (STATE_NAMES[r.name] || "") + "</span></th>" +
            '<td class="num"><span class="cellbar"><span class="cellbar__track" aria-hidden="true"><span class="cellbar__fill" style="display:block;width:' +
            (r.d.orders / maxOrders * 100).toFixed(1) + '%"></span></span>' + fmt.int(r.d.orders) + "</span></td>" +
            '<td class="num">' + money(r.d.gmv) + "</td>" +
            '<td class="num">' + (isFinite(r.d.sat) ? fmt.pct(r.d.sat) : "—") + "</td>" +
            '<td class="num">' + (isFinite(r.d.days) ? r.d.days.toFixed(1) : "—") + "</td></tr>"
          );
        }).join("")
      : '<tr><td colspan="5" class="muted">No orders match these filters.</td></tr>';

    $("stateTable").querySelectorAll("thead button").forEach(function (b) {
      var k = b.getAttribute("data-sort");
      if (k === key) b.setAttribute("aria-sort", dir === -1 ? "descending" : "ascending");
      else b.removeAttribute("aria-sort");
    });
  }

  function renderPayments(cur) {
    var p = Viz.palette();
    var names = ["Credit card", "Boleto", "Voucher", "Debit card"];
    var notes = ["", "Brazilian bank slip", "Store credit", ""];
    var total = cur.pay.reduce(function (a, b) { return a + b; }, 0);
    if (!total) {
      $("payMix").innerHTML = '<p class="small muted m-0">No orders match these filters.</p>';
      return;
    }
    $("payMix").innerHTML =
      '<div class="mix__bar" role="img" aria-label="' +
      names.map(function (n, i) { return n + " " + fmt.pct(cur.pay[i] / total); }).join(", ") + '">' +
      cur.pay.map(function (v, i) {
        return '<span class="mix__seg" style="flex-basis:' + (v / total * 100).toFixed(2) + '%;background:' + p.series[i] + '" title="' + names[i] + '"></span>';
      }).join("") +
      "</div>" +
      '<ul class="mix__list">' +
      cur.pay.map(function (v, i) {
        return (
          '<li class="mix__item"><span class="mix__dot" style="background:' + p.series[i] + '" aria-hidden="true"></span>' +
          '<span class="mix__name">' + names[i] + (notes[i] ? ' <span class="mix__hint">' + notes[i] + "</span>" : "") + "</span>" +
          '<span class="mix__share">' + fmt.pct(v / total) + "</span>" +
          '<span class="mix__aux">' + fmt.int(v) + "</span></li>"
        );
      }).join("") +
      "</ul>" +
      '<p class="mix__note">Credit cards also enable instalments, which is why they dominate higher-value baskets.</p>';
  }

  /* ---------------------------------------------------------------------------
     Table views for canvas charts
     --------------------------------------------------------------------------- */

  function tableInto(id, cols, rows) {
    var host = $(id);
    if (!host) return;
    var open = host.open;
    host.innerHTML = "<summary>Table view</summary>";
    Site.tableView(host, cols, rows);
    host.open = open;
  }

  /* ---------------------------------------------------------------------------
     Update cycle
     --------------------------------------------------------------------------- */

  function update() {
    var t0 = performance.now();

    syncFilters();
    writeHash();

    var cur = aggregate();
    var d = derive(cur);

    // Trend shows the full timeline (ignoring the period filter) so the selected
    // window is visible in context; the other filters still apply.
    var byMonth = aggregate({ from: 0, to: D.dims.months.length - 1, groupBy: "m" });
    var monthly = byMonth.map(derive);
    view.trendOffset = 0;
    view.trendMonths = D.dims.months;
    view.trendValues = monthly.map(TREND[ui.trend].pick);

    var buckets = aggregate({ ignore: "b", groupBy: "b" });
    view.buckets = buckets.map(function (t) { var x = derive(t); x.orders = t.orders; return x; });
    view.reviews = cur.r;
    view.day = cur.day;
    view.hour = cur.hour;

    var cats = aggregate({ ignore: "c", groupBy: "c" });
    var states = aggregate({ ignore: "s", groupBy: "s" });

    renderKpis(d, byMonth);
    renderInsights(d, buckets, cats);
    renderCategories(cats);
    renderStates(states);
    renderPayments(cur);

    $("trendTitle").textContent = TREND[ui.trend].title;
    $("trendSub").textContent = TREND[ui.trend].sub;
    $("reviewSub").textContent = cur.reviewed ? fmt.int(cur.reviewed) + " reviews · average " + d.avgReview.toFixed(2) + "★" : "No reviews in selection";
    $("timingSub").textContent = ui.timing === "day" ? "Orders by weekday of purchase" : "Orders by time of day (3-hour bins)";

    rerenderCharts();

    tableInto("trendTable",
      [{ label: "Month" }, { label: TREND[ui.trend].title.replace(" by month", ""), numeric: true }],
      D.dims.months.map(function (m, i) {
        var v = view.trendValues[i];
        return [monthLabel(m, true), isFinite(v) ? TREND[ui.trend].tip(v) : "—"];
      }));
    tableInto("bucketTable",
      [{ label: "Delivery" }, { label: "Satisfied", numeric: true }, { label: "Orders", numeric: true }],
      view.buckets.map(function (b, i) {
        return [D.dims.buckets[i], isFinite(b.sat) ? fmt.pct(b.sat) : "—", fmt.int(b.orders)];
      }));
    tableInto("reviewTable",
      [{ label: "Score" }, { label: "Reviews", numeric: true }],
      cur.r.map(function (v, i) { return [(i + 1) + "★", fmt.int(v)]; }));
    tableInto("timingTable",
      [{ label: ui.timing === "day" ? "Weekday" : "Hour" }, { label: "Orders", numeric: true }],
      (ui.timing === "day" ? WEEKDAYS : HOURS.map(function (h) { return String(h).padStart(2, "0") + "h"; }))
        .map(function (l, i) { return [l, fmt.int((ui.timing === "day" ? cur.day : cur.hour)[i])]; }));

    $("coverage").textContent =
      fmt.int(cur.orders) + " of " + fmt.int(D.pipeline.orders_in_dashboard) + " orders · " +
      monthLabel(D.dims.months[state.from], true) + " – " + monthLabel(D.dims.months[state.to], true);

    view.lastMs = performance.now() - t0;
  }

  // Charts rebuild from `view` in place; Viz also re-renders them on theme change.
  function rerenderCharts() {
    ["trend", "bucket", "review", "timing"].forEach(function (k) {
      if (charts[k] && charts[k].refresh) charts[k].refresh();
    });
  }

  /* ---------------------------------------------------------------------------
     Wiring
     --------------------------------------------------------------------------- */

  function segmented(id, key, after) {
    $(id).addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-metric]");
      if (!btn) return;
      ui[key] = btn.getAttribute("data-metric");
      $(id).querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      (after || update)();
    });
    $(id).querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-metric") === ui[key] ? "true" : "false");
    });
  }

  function wire() {
    segmented("trendMetric", "trend");
    segmented("catMetric", "cat");
    segmented("timingMetric", "timing");

    $("chips").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-clear]");
      if (btn) clearFilter(btn.getAttribute("data-clear"));
    });

    $("catList").addEventListener("click", function (e) {
      var row = e.target.closest("[data-cat]");
      if (!row) return;
      var i = Number(row.getAttribute("data-cat"));
      state.c = state.c === i ? -1 : i;
      update();
    });

    var tbody = $("stateTable").querySelector("tbody");
    function pickState(e) {
      var row = e.target.closest("tr[data-state]");
      if (!row) return;
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      if (e.type === "keydown") e.preventDefault();
      var i = Number(row.getAttribute("data-state"));
      state.s = state.s === i ? -1 : i;
      update();
    }
    tbody.addEventListener("click", pickState);
    tbody.addEventListener("keydown", pickState);

    $("stateTable").querySelector("thead").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-sort]");
      if (!b) return;
      var k = b.getAttribute("data-sort");
      if (ui.sortKey === k) ui.sortDir *= -1;
      else { ui.sortKey = k; ui.sortDir = k === "name" || k === "days" ? 1 : -1; }
      update();
    });

    $("copyLink").addEventListener("click", function () {
      var url = location.href;
      var done = function () { toast("Link to this view copied"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { toast(url); });
      } else {
        toast(url);
      }
    });

    $("exportCsv").addEventListener("click", exportCsv);

    window.addEventListener("hashchange", function () {
      readHash();
      segmented("trendMetric", "trend");
      update();
    });

    // Re-theme the HTML breakdowns that embed palette colours.
    window.addEventListener("themechange", function () {
      if (D) renderPayments(aggregate());
    });
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  function exportCsv() {
    var byMonth = aggregate({ groupBy: "m" });
    var lines = [["month", "orders", "revenue_brl", "avg_order_value", "satisfied_share", "late_share", "avg_delivery_days"].join(",")];
    for (var i = state.from; i <= state.to; i++) {
      var d = derive(byMonth[i]);
      lines.push([
        D.dims.months[i],
        d.orders,
        d.gmv.toFixed(2),
        isFinite(d.aov) ? d.aov.toFixed(2) : "",
        isFinite(d.sat) ? d.sat.toFixed(4) : "",
        isFinite(d.late) ? d.late.toFixed(4) : "",
        isFinite(d.days) ? d.days.toFixed(2) : "",
      ].join(","));
    }
    var filters = [];
    if (state.s >= 0) filters.push("state=" + D.dims.states[state.s]);
    if (state.c >= 0) filters.push("category=" + D.dims.categories[state.c]);
    if (state.b >= 0) filters.push("delivery=" + D.dims.buckets[state.b]);
    lines.unshift("# Olist orders by month" + (filters.length ? " — " + filters.join("; ") : ""));

    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "olist_" + D.dims.months[state.from] + "_to_" + D.dims.months[state.to] + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast("Exported " + (state.to - state.from + 1) + " months");
  }

  function renderPipeline() {
    var src = D.pipeline.source_tables;
    var unused = { geolocation: 1, product_category: 1 };
    $("sourceTables").innerHTML = Object.keys(src).map(function (k) {
      return (
        '<div class="srctable' + (unused[k] ? " is-unused" : "") + '" title="' + (unused[k] ? "Not part of the modelling join" : "Joined") + '">' +
        '<span class="srctable__name">' + k + "</span>" +
        '<span class="srctable__rows">' + compact(src[k]) + "</span></div>"
      );
    }).join("");

    var steps = D.pipeline.join_steps;
    var max = Math.max.apply(null, steps.map(function (s) { return s.rows; }));
    $("joinFunnel").innerHTML = steps.map(function (s, i) {
      var delta = i ? s.rows - steps[i - 1].rows : 0;
      return (
        "<li><span class=\"funnel__step\">" + s.step + "</span>" +
        '<span class="funnel__track" aria-hidden="true"><span class="funnel__fill" style="display:block;width:' + (s.rows / max * 100).toFixed(1) + '%"></span></span>' +
        '<span class="funnel__rows">' + fmt.int(s.rows) +
        (i ? ' <span class="muted xsmall">' + (delta > 0 ? "+" : delta < 0 ? "−" : "±") + fmt.int(Math.abs(delta)) + "</span>" : "") +
        "</span></li>"
      );
    }).join("");

    $("orderCount").textContent = fmt.int(D.pipeline.orders_in_dashboard);
    var ex = D.pipeline.months_excluded || [];
    $("excluded").textContent = ex.length
      ? "Months with fewer than 500 orders (" + ex.map(function (m) { return monthLabel(m, true); }).join(", ") +
        ") are fragments at the edges of the collection window and are excluded."
      : "";
  }

  /* ---------------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------------- */

  function showSkeleton() {
    var html = "";
    for (var i = 0; i < KPIS.length; i++) html += '<div class="skeleton"></div>';
    $("kpis").innerHTML = html;
  }

  showSkeleton();

  fetch("./assets/dashboard.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      D = data;
      N = D.cube.m.length;
      readHash();
      buildFilters();
      wire();
      renderPipeline();
      buildCharts();
      update();
    })
    .catch(function (err) {
      $("kpis").innerHTML = "";
      $("insights").innerHTML =
        '<div class="callout callout--warn metrics-error"><span class="callout__icon" aria-hidden="true">▲</span>' +
        "<span><strong>Dashboard data could not be loaded.</strong> This page reads <code>assets/dashboard.json</code>; " +
        "serve it over HTTP rather than opening the file directly. (" + err.message + ")</span></div>";
      $("coverage").textContent = "Data unavailable";
    });
})();
