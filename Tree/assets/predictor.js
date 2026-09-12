/* =============================================================================
   Live ONNX predictor.

   Loads Tree/models/final_model.onnx into ONNX Runtime Web and scores a single
   passenger entirely client-side. The feature vector is assembled in the exact
   order the model was trained on — that order is the model's contract and is
   documented in onnx.md.
   ============================================================================= */

(function () {
  "use strict";

  var MODEL_PATH = "./models/final_model.onnx";
  var DEFAULT_THRESHOLD = 0.42;

  var session = null;
  var ready = false;

  var el = {};
  [
    "status", "debug", "predictButton", "resetButton", "threshold",
    "thresholdValue", "thresholdCaption", "result", "resultEmpty", "resultCard",
    "prediction", "predictionSub", "probLabel", "probFill", "probMarker",
    "probTrack", "falseProbability", "trueProbability", "modelLabel",
    "usedThreshold", "latency",
  ].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var FIELDS = ["age", "room", "food", "mall", "spa", "vr", "planet", "cryo", "destination", "vip"];

  var SCENARIOS = {
    typical: { age: 26, room: 0, food: 500, mall: 100, spa: 0, vr: 50,
               planet: "europa", cryo: "false", destination: "trappist", vip: "false" },
    cryo:    { age: 41, room: 0, food: 0, mall: 0, spa: 0, vr: 0,
               planet: "earth", cryo: "true", destination: "trappist", vip: "false" },
    premium: { age: 34, room: 1200, food: 2600, mall: 900, spa: 1800, vr: 2100,
               planet: "europa", cryo: "false", destination: "cancri", vip: "true" },
  };

  /* --- logging ------------------------------------------------------------ */

  function log(message) {
    if (!el.debug) return;
    var time = new Date().toLocaleTimeString();
    el.debug.textContent += "[" + time + "] " + message + "\n";
    el.debug.scrollTop = el.debug.scrollHeight;
  }

  function logError(error) {
    console.error(error);
    log("ERROR: " + ((error && (error.stack || error.message)) || String(error)));
  }

  window.addEventListener("unhandledrejection", function (e) { logError(e.reason); });

  /* --- input helpers ------------------------------------------------------- */

  function num(id) {
    var v = Number(document.getElementById(id).value);
    return isFinite(v) ? v : 0;
  }

  function is(id, value) {
    return document.getElementById(id).value === value ? 1 : 0;
  }

  /**
   * The 16 features, in training order. "Earth" and "55 Cancri e" are the
   * dropped reference levels, so they are represented by all-zero indicators.
   */
  function featureVector() {
    return new Float32Array([
      num("age"),
      num("room"),
      num("food"),
      num("mall"),
      num("spa"),
      num("vr"),
      is("planet", "europa"),
      is("planet", "mars"),
      is("planet", "unknown"),
      is("cryo", "true"),
      is("cryo", "unknown"),
      is("destination", "pso"),
      is("destination", "trappist"),
      is("destination", "unknown"),
      is("vip", "true"),
      is("vip", "unknown"),
    ]);
  }

  /* --- status -------------------------------------------------------------- */

  function setStatus(text, kind) {
    if (!el.status) return;
    el.status.textContent = text;
    el.status.className = "pill" + (kind ? " is-" + kind : "");
  }

  /* --- model load ---------------------------------------------------------- */

  function loadModel() {
    if (typeof ort === "undefined") {
      setStatus("Runtime unavailable", "error");
      log("ONNX Runtime Web failed to load from the CDN.");
      return;
    }
    setStatus("Loading model…");
    log("Loading " + MODEL_PATH);

    ort.InferenceSession.create(MODEL_PATH)
      .then(function (s) {
        session = s;
        ready = true;
        setStatus("Model ready", "ready");
        el.predictButton.disabled = false;
        log("Loaded. inputs: " + s.inputNames.join(", "));
        log("outputs: " + s.outputNames.join(", "));
        predict();
      })
      .catch(function (err) {
        setStatus("Load failed — retry", "error");
        el.predictButton.disabled = true;
        el.status.setAttribute("role", "alert");
        logError(err);
        el.status.style.cursor = "pointer";
        el.status.onclick = loadModel;
      });
  }

  /* --- inference ------------------------------------------------------------ */

  function predict() {
    if (!ready || !session) return;

    var threshold = Number(el.threshold.value);
    var data = featureVector();

    var started = performance.now();
    session
      .run({ float_input: new ort.Tensor("float32", data, [1, 16]) })
      .then(function (out) {
        var elapsed = performance.now() - started;
        var probs = out.probabilities.data;
        var pFalse = probs[0];
        var pTrue = probs[1];
        var transported = pTrue >= threshold;

        el.resultEmpty.hidden = true;
        el.result.hidden = false;

        el.prediction.textContent = transported ? "Transported" : "Not transported";
        el.prediction.className = transported ? "hero-figure__value is-positive" : "hero-figure__value is-negative";
        el.resultCard.className = "card " + (transported ? "is-positive" : "is-negative");
        el.predictionSub.textContent =
          (pTrue * 100).toFixed(1) + "% probability, threshold " + threshold.toFixed(2);

        el.probLabel.textContent = pTrue.toFixed(4);
        el.probFill.style.width = (pTrue * 100).toFixed(1) + "%";
        el.probFill.className = "prob__fill" + (transported ? " is-positive" : "");
        el.probTrack.setAttribute("aria-label",
          "Predicted probability of being transported: " + (pTrue * 100).toFixed(1) + " percent");

        el.falseProbability.textContent = (pFalse * 100).toFixed(2) + "%";
        el.trueProbability.textContent = (pTrue * 100).toFixed(2) + "%";
        el.modelLabel.textContent = out.label.data[0] === 1n || out.label.data[0] === 1
          ? "1 (true)" : "0 (false)";
        el.usedThreshold.textContent = threshold.toFixed(2);
        el.latency.textContent = elapsed.toFixed(1) + " ms";

        log("P(true)=" + pTrue.toFixed(6) + " threshold=" + threshold.toFixed(2) +
            " → " + (transported ? "Transported" : "Not transported") +
            " (" + elapsed.toFixed(1) + " ms)");
      })
      .catch(logError);
  }

  /* --- threshold ------------------------------------------------------------- */

  function syncThreshold() {
    var t = Number(el.threshold.value);
    el.thresholdValue.textContent = t.toFixed(2);
    el.probMarker.style.left = (t * 100).toFixed(1) + "%";
    if (el.thresholdCaption) el.thresholdCaption.textContent = "threshold " + t.toFixed(2);
  }

  /* --- wiring ----------------------------------------------------------------- */

  function applyScenario(name) {
    var s = SCENARIOS[name];
    if (!s) return;
    Object.keys(s).forEach(function (k) {
      document.getElementById(k).value = s[k];
    });
    log("Preset applied: " + name);
    predict();
  }

  document.querySelectorAll("[data-scenario]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyScenario(btn.getAttribute("data-scenario"));
    });
  });

  FIELDS.forEach(function (id) {
    var node = document.getElementById(id);
    if (node) node.addEventListener("change", predict);
  });

  el.threshold.addEventListener("input", function () {
    syncThreshold();
    predict();
  });

  el.predictButton.addEventListener("click", predict);

  el.resetButton.addEventListener("click", function () {
    el.threshold.value = DEFAULT_THRESHOLD;
    syncThreshold();
    applyScenario("typical");
  });

  syncThreshold();
  loadModel();
})();
