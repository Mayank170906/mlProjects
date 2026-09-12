/* =============================================================================
   Chart.js layer that encodes the project's visualisation rules once, so no
   individual chart has to re-decide them:

     · categorical hues come from fixed CSS slots, assigned in order, never cycled
     · bars cap at 24px with a 4px rounded data-end at the baseline
     · lines are 2px, points >= 8px with a 2px surface ring
     · area fills are a ~10% wash, never a saturated block
     · gridlines and axes are solid hairlines one step off the surface
     · hover/tooltip is on by default with a generous hit area
     · every chart re-themes in place when the viewer flips light/dark

   Requires Chart.js UMD to be loaded first. Depends on nothing else.
   ============================================================================= */

(function () {
  "use strict";

  var registry = [];

  function token(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  /** Current theme-resolved palette. Re-read on every (re)build. */
  function palette() {
    return {
      series: [1, 2, 3, 4, 5, 6].map(function (i) {
        return token("--series-" + i);
      }),
      seq: [1, 2, 3, 4, 5, 6].map(function (i) {
        return token("--seq-" + i);
      }),
      divNeg: token("--div-neg"),
      divMid: token("--div-mid"),
      divPos: token("--div-pos"),
      good: token("--good"),
      bad: token("--bad"),
      grid: token("--grid"),
      axis: token("--axis"),
      ink: token("--ink"),
      ink2: token("--ink-2"),
      ink3: token("--ink-3"),
      ink4: token("--ink-4"),
      surface: token("--surface-1"),
      line: token("--line"),
      mono: token("--mono"),
      sans: token("--sans"),
    };
  }

  function alpha(hex, a) {
    var h = (hex || "").replace("#", "");
    if (h.length === 3)
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return hex;
    var n = parseInt(h, 16);
    return (
      "rgba(" +
      ((n >> 16) & 255) +
      "," +
      ((n >> 8) & 255) +
      "," +
      (n & 255) +
      "," +
      a +
      ")"
    );
  }

  /** Shared scale/plugin defaults. `p` is the resolved palette. */
  function baseOptions(p) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 260 },
      layout: { padding: { top: 4, right: 6, bottom: 0, left: 0 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: p.ink,
          titleColor: p.surface,
          bodyColor: p.surface,
          borderColor: "transparent",
          padding: 10,
          cornerRadius: 6,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
          usePointStyle: true,
          titleFont: { family: p.sans, size: 12, weight: "600" },
          bodyFont: { family: p.mono, size: 11.5 },
        },
      },
      scales: {
        x: {
          border: { color: p.axis, width: 1 },
          grid: { display: false, drawTicks: false },
          ticks: {
            color: p.ink3,
            font: { family: p.mono, size: 10.5 },
            padding: 6,
            maxRotation: 0,
            autoSkipPadding: 12,
          },
        },
        y: {
          border: { display: false },
          grid: {
            color: p.grid,
            lineWidth: 1,
            drawTicks: false,
            /* solid hairlines only — dashing reads as "threshold" */
          },
          ticks: {
            color: p.ink3,
            font: { family: p.mono, size: 10.5 },
            padding: 8,
            maxTicksLimit: 6,
          },
        },
      },
    };
  }

  /** Deep-merge helper (objects only; arrays replace). */
  function merge(target, source) {
    Object.keys(source || {}).forEach(function (key) {
      var v = source[key];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        target[key] = merge(
          target[key] && typeof target[key] === "object" ? target[key] : {},
          v
        );
      } else {
        target[key] = v;
      }
    });
    return target;
  }

  /**
   * Register a chart.
   * @param {string} canvasId
   * @param {(p: object) => object} build  returns a Chart.js config given the palette
   */
  function chart(canvasId, build) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    var instance = null;

    function render() {
      var p = palette();
      var cfg = build(p);
      cfg.options = merge(baseOptions(p), cfg.options || {});
      if (instance) instance.destroy();
      instance = new Chart(canvas.getContext("2d"), cfg);
    }

    render();
    registry.push(render);

    var getter = function () {
      return instance;
    };

    /* Rebuild data and options from `build` without destroying the chart, so
       filter-driven updates animate between states instead of redrawing from zero. */
    getter.refresh = function () {
      if (!instance) return;
      var p = palette();
      var cfg = build(p);
      instance.data = cfg.data;
      instance.options = merge(baseOptions(p), cfg.options || {});
      instance.update();
    };

    return getter;
  }

  /* ---- mark presets ------------------------------------------------------ */

  /** Column/bar dataset honouring the mark spec. */
  function bars(p, data, opts) {
    opts = opts || {};
    var color = opts.color || p.series[0];
    return merge(
      {
        data: data,
        backgroundColor: color,
        hoverBackgroundColor: color,
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: "bottom",
        maxBarThickness: 24,
        /* 2px surface gap between touching bars */
        borderWidth: { top: 0, right: 1, bottom: 0, left: 1 },
        borderColor: p.surface,
        categoryPercentage: 0.82,
        barPercentage: 0.92,
      },
      opts.extra || {}
    );
  }

  /** Horizontal bar variant: rounded end away from the baseline. */
  function barsH(p, data, opts) {
    opts = opts || {};
    var color = opts.color || p.series[0];
    return merge(
      {
        data: data,
        backgroundColor: color,
        hoverBackgroundColor: color,
        borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
        borderSkipped: "left",
        maxBarThickness: 18,
        borderWidth: { top: 1, bottom: 1, left: 0, right: 0 },
        borderColor: p.surface,
        categoryPercentage: 0.86,
        barPercentage: 0.9,
      },
      opts.extra || {}
    );
  }

  /** Line dataset: 2px stroke, optional 10% wash, 8px hover marker with ring. */
  function line(p, data, opts) {
    opts = opts || {};
    var color = opts.color || p.series[0];
    return merge(
      {
        data: data,
        borderColor: color,
        borderWidth: 2,
        borderCapStyle: "round",
        borderJoinStyle: "round",
        fill: opts.fill ? { target: "origin", above: alpha(color, 0.1) } : false,
        backgroundColor: alpha(color, 0.1),
        tension: opts.tension === undefined ? 0 : opts.tension,
        pointRadius: 0,
        pointHoverRadius: 4.5,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: p.surface,
        pointHoverBorderWidth: 2,
        pointHitRadius: 14,
      },
      opts.extra || {}
    );
  }

  /** A recessive reference line (chance diagonal, baseline rate). */
  function reference(p, data, label) {
    return {
      label: label || "Reference",
      data: data,
      borderColor: p.ink4,
      borderWidth: 1,
      borderDash: [4, 4], // the one legitimate dash: a stated reference, not a grid
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      tension: 0,
    };
  }

  /* ---- re-theme in place on toggle --------------------------------------- */

  window.addEventListener("themechange", function () {
    registry.forEach(function (render) {
      render();
    });
  });

  window.Viz = {
    chart: chart,
    palette: palette,
    alpha: alpha,
    bars: bars,
    barsH: barsH,
    line: line,
    reference: reference,
  };
})();
