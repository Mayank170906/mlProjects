/* =============================================================================
   Shared site behaviour: theme, scroll-spy TOC, small formatting helpers.
   No build step, no dependencies — loaded with `defer` from every page.
   ============================================================================= */

(function () {
  "use strict";

  var STORE_KEY = "mlp-theme";

  /* --- theme ------------------------------------------------------------- */

  function systemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function storedTheme() {
    try {
      return localStorage.getItem(STORE_KEY);
    } catch (e) {
      return null;
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || systemTheme();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORE_KEY, theme);
    } catch (e) {
      /* private mode — the page still renders correctly */
    }
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      );
    });
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }

  // Apply the stored preference as early as possible to avoid a flash.
  var saved = storedTheme();
  if (saved === "dark" || saved === "light") {
    document.documentElement.setAttribute("data-theme", saved);
  }

  function initThemeToggles() {
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path class="t-sun" d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m11.32 0 1.41 1.41M4.93 4.93l1.41 1.41"/>' +
        '<circle class="t-sun" cx="12" cy="12" r="4"/>' +
        '<path class="t-moon" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>' +
        "</svg>";
      var svg = btn.querySelector("svg");
      function sync() {
        var dark = currentTheme() === "dark";
        svg.querySelectorAll(".t-sun").forEach(function (n) {
          n.style.display = dark ? "none" : "";
        });
        svg.querySelectorAll(".t-moon").forEach(function (n) {
          n.style.display = dark ? "" : "none";
        });
      }
      sync();
      window.addEventListener("themechange", sync);
      btn.addEventListener("click", function () {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    });
    applyTheme(currentTheme());
  }

  /* --- table of contents scroll-spy -------------------------------------- */

  function initToc() {
    var links = Array.prototype.slice.call(
      document.querySelectorAll(".toc__list a[href^='#']")
    );
    if (!links.length) return;

    var targets = links
      .map(function (a) {
        var el = document.getElementById(a.getAttribute("href").slice(1));
        return el ? { link: a, el: el } : null;
      })
      .filter(Boolean);
    if (!targets.length) return;

    function mark(active) {
      targets.forEach(function (t) {
        t.link.classList.toggle("is-active", t === active);
      });
    }

    if (!("IntersectionObserver" in window)) {
      mark(targets[0]);
      return;
    }

    var visible = new Set();
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        var first = targets.filter(function (t) {
          return visible.has(t.el);
        })[0];
        if (first) mark(first);
      },
      { rootMargin: "-84px 0px -65% 0px", threshold: 0 }
    );
    targets.forEach(function (t) {
      io.observe(t.el);
    });
  }

  /* --- formatting helpers shared by the report pages --------------------- */

  var fmt = {
    int: function (n) {
      return Number(n).toLocaleString("en-US");
    },
    dec: function (n, d) {
      return Number(n).toFixed(d === undefined ? 3 : d);
    },
    pct: function (n, d) {
      return (Number(n) * 100).toFixed(d === undefined ? 1 : d) + "%";
    },
    /* Fill every [data-fill="path.to.value"] from a data object. */
    bind: function (data, root) {
      (root || document)
        .querySelectorAll("[data-fill]")
        .forEach(function (node) {
          var spec = node.getAttribute("data-fill").split("|");
          var value = spec[0]
            .trim()
            .split(".")
            .reduce(function (acc, key) {
              return acc == null ? acc : acc[key];
            }, data);
          if (value === undefined || value === null) return;
          var how = (spec[1] || "raw").trim();
          var digits = parseInt(how.slice(3), 10);
          if (how === "int") value = fmt.int(value);
          else if (how.indexOf("pct") === 0)
            value = fmt.pct(value, isNaN(digits) ? 1 : digits);
          else if (how.indexOf("dec") === 0)
            value = fmt.dec(value, isNaN(digits) ? 3 : digits);
          node.textContent = value;
        });
    },
  };

  /* --- build a table-view twin for a chart ------------------------------- */

  function tableView(container, columns, rows) {
    if (!container) return;
    var html =
      '<div class="table-scroll"><table class="data"><thead><tr>' +
      columns
        .map(function (c) {
          return (
            '<th scope="col"' +
            (c.numeric ? ' class="num"' : "") +
            ">" +
            c.label +
            "</th>"
          );
        })
        .join("") +
      "</tr></thead><tbody>" +
      rows
        .map(function (r) {
          return (
            "<tr>" +
            r
              .map(function (cell, i) {
                return (
                  "<td" +
                  (columns[i].numeric ? ' class="num"' : "") +
                  ">" +
                  cell +
                  "</td>"
                );
              })
              .join("") +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";
    container.insertAdjacentHTML("beforeend", html);
  }

  /* --- boot -------------------------------------------------------------- */

  function boot() {
    initThemeToggles();
    initToc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.Site = {
    fmt: fmt,
    tableView: tableView,
    currentTheme: currentTheme,
    applyTheme: applyTheme,
  };
})();
