/* =============================================================================
   Embedded notebook viewer.

   Shows the exported Jupyter notebooks inside project pages. The notebook HTML
   files are never modified: the portfolio nav bar they carry for standalone
   viewing is hidden at runtime, only when shown inside this frame.
   ============================================================================= */

(function () {
  "use strict";

  function hideStandaloneChrome(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc || doc.getElementById("nb-embed-style")) return;
      var style = doc.createElement("style");
      style.id = "nb-embed-style";
      style.textContent = ".pf-bar{display:none!important}body{margin-top:0!important}";
      (doc.head || doc.documentElement).appendChild(style);
    } catch (e) {
      /* cross-origin (e.g. opened from file://) — the notebook still displays */
    }
  }

  function init(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var frame = root.querySelector("iframe");
    var panel = root.querySelector('[role="tabpanel"]');
    var open = root.querySelector(".nb__open");
    if (!frame || !tabs.length) return;

    frame.addEventListener("load", function () {
      hideStandaloneChrome(frame);
    });
    hideStandaloneChrome(frame);

    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      var src = tab.getAttribute("data-src");
      if (frame.getAttribute("src") !== src) {
        frame.setAttribute("src", src);
        frame.title = tab.getAttribute("data-name");
      }
      if (open) open.href = src;
      if (panel) panel.setAttribute("aria-labelledby", tab.id);
      if (focus) tab.focus();
    }

    tabs.forEach(function (tab, i) {
      tab.tabIndex = i === 0 ? 0 : -1;
      tab.addEventListener("click", function () {
        select(tab, false);
      });
      tab.addEventListener("keydown", function (e) {
        var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        select(tabs[(i + dir + tabs.length) % tabs.length], true);
      });
    });
  }

  function boot() {
    document.querySelectorAll("[data-notebooks]").forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
