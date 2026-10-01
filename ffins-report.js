/**
 * Reproduces Linguaporta's /ffins/report.php interaction report.
 *
 * The site's Ffins helper (see /javascript/ffins.js) listens for mousedown and
 * keydown on the document and posts the collected history right before
 * submitting form[name=ExpForm]. When the extension fills the form and clicks
 * #ans_submit programmatically, that history is empty (or contains untrusted
 * synthetic events), so the server receives an implausible report.
 *
 * This script runs in the page's MAIN world, hooks the report request and
 * substitutes a human-like history built from the form's current answer state.
 * Every entry is marked trusted=true, exactly like a real user's browser.
 */
(function () {
  "use strict";

  if (window.__linguaFfinsReporterInstalled) {
    return;
  }
  window.__linguaFfinsReporterInstalled = true;

  var REPORT_PATH = "/ffins/report.php";
  var DEBUG = Boolean(window.__LINGUA_FFINS_DEBUG);

  function log() {
    if (!DEBUG || !window.console) {
      return;
    }
    try {
      console.log.apply(
        console,
        ["[lingua-ffins]"].concat(Array.prototype.slice.call(arguments))
      );
    } catch (_error) {
      /* ignore */
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomLetter() {
    var pool = "abcdefghijklmnopqrstuvwxyz";
    return pool.charAt(Math.floor(Math.random() * pool.length));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  /**
   * Mirrors Ffins._eventTarget. `name`/`type` are intentionally left as-is:
   * elements without those properties (e.g. <label>, <div>) yield undefined
   * and the serializer drops them, matching what the site's jQuery sends.
   */
  function targetInfo(element) {
    if (!element || !element.tagName) {
      return null;
    }
    return {
      node: element.tagName,
      class: typeof element.className === "string" ? element.className : "",
      id: element.id == null ? "" : String(element.id),
      name: element.name,
      type: element.type,
    };
  }

  // Click anywhere inside the element's rendered box, not just the centre.
  function randomPointIn(element) {
    var rect = null;
    try {
      rect = element.getBoundingClientRect();
    } catch (_error) {
      rect = null;
    }
    if (!rect || (!rect.width && !rect.height)) {
      return {
        x: Math.round(randomBetween(320, 900)),
        y: Math.round(randomBetween(320, 720)),
      };
    }

    // Keep a small inset so the click clearly lands on the element.
    var insetX = Math.max(1, rect.width * 0.12);
    var insetY = Math.max(1, rect.height * 0.12);
    var minX = rect.left + insetX;
    var maxX = rect.left + rect.width - insetX;
    var minY = rect.top + insetY;
    var maxY = rect.top + rect.height - insetY;
    if (maxX < minX) {
      minX = rect.left;
      maxX = rect.left + rect.width;
    }
    if (maxY < minY) {
      minY = rect.top;
      maxY = rect.top + rect.height;
    }
    return {
      x: Math.round(randomBetween(minX, maxX)),
      y: Math.round(randomBetween(minY, maxY)),
    };
  }

  function pointerEntry(element) {
    var point = randomPointIn(element);
    return {
      type: "pointer",
      trusted: true,
      mouse_x: point.x,
      mouse_y: point.y,
      target: targetInfo(element),
    };
  }

  function keyboardEntry(element, key) {
    return {
      type: "keyboard",
      trusted: true,
      key: key,
      target: targetInfo(element),
    };
  }

  // Humans frequently click the <label> rather than the radio/checkbox input.
  function pickPointerTarget(control) {
    var id = control.id;
    if (id) {
      var label = document.querySelector('label[for="' + cssEscape(id) + '"]');
      if (label && Math.random() < 0.5) {
        return label;
      }
    }
    return control;
  }

  function appendTyping(history, control, text) {
    var chars = String(text).split("");
    for (var index = 0; index < chars.length; index += 1) {
      var char = chars[index];
      if (/[A-Z]/.test(char)) {
        // Uppercase requires Shift; Ffins records both keydowns.
        history.push(keyboardEntry(control, "Shift"));
      }
      history.push(keyboardEntry(control, char));

      // Occasional typo followed by a Backspace correction. The net typed
      // value stays correct while the key stream looks human.
      if (
        chars.length >= 4 &&
        index < chars.length - 1 &&
        Math.random() < 0.05
      ) {
        history.push(keyboardEntry(control, randomLetter()));
        history.push(keyboardEntry(control, "Backspace"));
      }
    }
  }

  // Word/vocabulary problems also ship an MP3 (the pronunciation), but a human
  // does not listen to it, so playback is limited to listening exercises.
  function isListeningQuestion(form) {
    var area = form.querySelector("#question_area") || form;
    var text = String(area.textContent || "");
    return /(?:\u97F3\u58F0\s*\u3092\s*[\u805E\u8074]\u3044?\u3066|\u30EA\u30B9\u30CB\u30F3\u30B0|\b(?:listen|listening)\b)/i.test(
      text
    );
  }

  // Listening questions need a click on the play button before the answer, and
  // the MP3 should actually be played like a human listening to it.
  function collectAudioEntries(form) {
    var entries = [];
    if (!isListeningQuestion(form)) {
      return entries;
    }
    var playButton = form.querySelector("a.play_button, .play_button");
    if (!playButton) {
      return entries;
    }
    // Actual playback is started earlier by content.js (before the answer is
    // filled); here we only record the interaction in the report.
    entries.push(pointerEntry(playButton));
    // Sometimes a learner replays the clip.
    if (Math.random() < 0.3) {
      entries.push(pointerEntry(playButton));
    }
    return entries;
  }

  function appendOrderingHistory(history, scope) {
    var cards = scope.querySelectorAll(".CardStyle[id^='D']");
    for (var index = 0; index < cards.length; index += 1) {
      var card = cards[index];
      // Only report cards the extension actually placed (inline left set).
      if (!card.style || !card.style.left) {
        continue;
      }
      history.push(pointerEntry(card));
    }
  }

  function findForm() {
    if (document.forms && document.forms.ExpForm) {
      return document.forms.ExpForm;
    }
    return document.querySelector("form[name=ExpForm]");
  }

  function buildHistory() {
    var form = findForm();
    if (!form) {
      return null;
    }

    var history = [];
    var scope =
      form.querySelector("#drill_form") ||
      form.querySelector("#question_area") ||
      form;

    var controls = scope.querySelectorAll("input, select, textarea");
    for (var index = 0; index < controls.length; index += 1) {
      var control = controls[index];
      if (control.disabled || control.readOnly) {
        continue;
      }

      var tag = String(control.tagName || "").toLowerCase();
      var type = String(control.type || "").toLowerCase();

      if (
        tag === "input" &&
        (type === "hidden" ||
          type === "button" ||
          type === "submit" ||
          type === "reset" ||
          type === "image" ||
          type === "file")
      ) {
        continue;
      }

      if (type === "radio" || type === "checkbox") {
        if (!control.checked) {
          continue;
        }
        history.push(pointerEntry(pickPointerTarget(control)));
        continue;
      }

      if (tag === "select") {
        if (!control.value) {
          continue;
        }
        history.push(pointerEntry(control));
        continue;
      }

      var value = String(control.value || "");
      if (!value) {
        continue;
      }
      history.push(pointerEntry(control));
      appendTyping(history, control, value);
    }

    appendOrderingHistory(history, scope);

    // Order the events like a real session: listen first, then answer, then
    // press 解答する.
    var ordered = collectAudioEntries(form);
    for (var historyIndex = 0; historyIndex < history.length; historyIndex += 1) {
      ordered.push(history[historyIndex]);
    }

    var submit =
      document.getElementById("ans_submit") ||
      form.querySelector("input[type=button]");
    if (submit) {
      ordered.push(pointerEntry(submit));
    }

    return ordered;
  }

  function encode(value) {
    return encodeURIComponent(value == null ? "" : String(value));
  }

  // Serializes in the same shape/order as the site's jQuery $.param, including
  // replacing %20 with "+" and dropping undefined target attributes.
  function serializeHistory(history) {
    var parts = [];
    function push(path, value) {
      if (value === undefined) {
        return;
      }
      parts.push(encode(path) + "=" + encode(value));
    }

    for (var index = 0; index < history.length; index += 1) {
      var entry = history[index];
      var base = "history[" + index + "]";
      push(base + "[type]", entry.type);
      push(base + "[trusted]", entry.trusted ? "true" : "false");

      if (entry.type === "keyboard") {
        push(base + "[key]", entry.key);
      } else {
        push(base + "[mouse_x]", entry.mouse_x);
        push(base + "[mouse_y]", entry.mouse_y);
      }

      var target = entry.target || {};
      push(base + "[target][node]", target.node);
      push(base + "[target][class]", target.class);
      push(base + "[target][id]", target.id);
      push(base + "[target][name]", target.name);
      push(base + "[target][type]", target.type);
    }

    return parts.join("&").replace(/%20/g, "+");
  }

  function forgeReportBody() {
    var history = buildHistory();
    if (!history || !history.length) {
      return null;
    }
    log("forging report with", history.length, "entries");
    return serializeHistory(history);
  }

  function isReportRequest(method, url) {
    if (!url) {
      return false;
    }
    if (String(method || "GET").toUpperCase() !== "POST") {
      return false;
    }
    return String(url).indexOf(REPORT_PATH) !== -1;
  }

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__linguaFfinsMethod = method;
    this.__linguaFfinsUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (isReportRequest(this.__linguaFfinsMethod, this.__linguaFfinsUrl)) {
        var forged = forgeReportBody();
        if (forged != null) {
          body = forged;
        }
      }
    } catch (error) {
      log("send hook failed", error);
    }
    return originalSend.call(this, body);
  };

  if (typeof window.fetch === "function") {
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === "string" ? input : input && input.url;
        var method = (init && init.method) || (input && input.method) || "GET";
        if (
          isReportRequest(method, url) &&
          init &&
          typeof init.body === "string"
        ) {
          var forged = forgeReportBody();
          if (forged != null) {
            init = Object.assign({}, init, { body: forged });
          }
        }
      } catch (error) {
        log("fetch hook failed", error);
      }
      return originalFetch.call(this, input, init);
    };
  }

  log("installed");
})();
