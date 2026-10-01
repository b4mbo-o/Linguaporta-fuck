const HINT_STYLE_ID = "linguaporta-hint-style";
const HINT_PANEL_CLASS = "linguaporta-hint-panel";
const STATUS_WIDGET_ID = "linguaporta-hint-status-widget";
const PRIMARY_QUESTION_SELECTOR = ".que";
const FALLBACK_QUESTION_SELECTOR = "[id^='question-']";
const SUBQUESTION_SELECTOR = ".subquestion";
const ORDERING_ITEM_SELECTOR = ".answer.ordering [data-itemcontent]";
const MATCHING_ROW_SELECTOR = ".answer.table-reboot tr";
const DDWTOS_DROP_SELECTOR = ".qtext .drop[class*='group']";
const LINGUAPORTA_QUESTION_SELECTOR = "#problem-area";
const LINGUAPORTA_ANSWER_SELECTOR = "#drill_form";
// Listening exercises ("音声を聞いて…") ship an audio clip the learner is meant
// to play; word/vocabulary problems ship a pronunciation MP3 that must not be
// played. Matches background.js LISTENING_QUESTION_PATTERN.
const LINGUAPORTA_LISTENING_PATTERN =
  /(?:\u97F3\u58F0\s*\u3092\s*[\u805E\u8074]\u3044?\u3066|\u30EA\u30B9\u30CB\u30F3\u30B0|\b(?:listen|listening)\b)/i;
const EDITABLE_TEXT_CONTROL_SELECTOR =
  "input:not([type]), input[type='text'], input[type='number'], textarea";
const MAX_CONCURRENT_REQUESTS = 2;
const MAX_IMAGES_PER_QUESTION = 4;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_FILES_PER_QUESTION = 1;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const RETRY_SUBMIT_GUARD_STORAGE_KEY = "linguaportaRetrySubmitGuardsV2";
const RETRY_SUBMIT_GUARD_TTL_MS = 30 * 60 * 1000;
// V4 starts a fresh answer window now that every site-confirmed answer is
// learned; stale V3 counts must not block a later round of the same problem.
const AI_ANSWER_ATTEMPTS_STORAGE_KEY = "linguaportaAiAnswerAttemptsV4";
const AI_ANSWER_ATTEMPT_TTL_MS = 30 * 60 * 1000;
const MAX_AI_ANSWERS_PER_QUESTION = 2;
const MAX_ORDERING_AI_RETRIES = 3;
const ORDERING_AUDIO_HINT_AFTER_FAILURES = 3;
const AI_ANSWER_LIMIT_ERROR_CODE = "AI_ANSWER_LIMIT_REACHED";
const LEARNED_ANSWERS_STORAGE_KEY = "linguaportaLearnedAnswersV1";
const MAX_LEARNED_ANSWERS = 2000;
const PENDING_CORRECT_ANSWER_SESSION_KEY = "linguaportaPendingCorrectAnswerV1";
const PENDING_CORRECT_ANSWER_TTL_MS = 30 * 60 * 1000;
const PENDING_CORRECT_ANSWER_CONFIRMATION_MS = 2 * 60 * 1000;

const answerCache = new Map();
const imageDataUrlCache = new Map();
const audioDataUrlCache = new Map();
const pendingAnswers = new Map();
const taskQueue = [];

let activeRequests = 0;
let scanScheduled = false;
let deferredScanRequested = false;
let autoAdvanceScheduledKey = "";
let autoSubmittedButtons = new WeakSet();
let autoRevealedButtons = new WeakSet();
let runtimeActionEpoch = 0;
const retrySubmitReservations = new Set();
const aiAttemptReservationChains = new Map();
const playedListeningAudioKeys = new Set();

const runtimeState = {
  phase: "booting",
  message: "Starting...",
  questionCount: 0,
  readyCount: 0,
  errorCount: 0,
  queueCount: 0,
  lastProvider: "",
  lastModel: "",
  lastAudioMode: "",
};

const DEFAULT_SETTINGS = {
  enabled: true,
  pausedUntil: 0,
  detailedMode: false,
  showStatusWidget: true,
  materialMode: false,
  freeApiMode: false,
  materialRevision: 0,
  providerRevision: 0,
};

let currentSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

function normalizeText(value) {
  return (value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSettings(raw = {}) {
  return {
    enabled: raw.enabled !== false,
    pausedUntil: Number(raw.pausedUntil) || 0,
    detailedMode: Boolean(raw.detailedMode),
    showStatusWidget: raw.showStatusWidget !== false,
    materialMode: Boolean(raw.materialMode),
    freeApiMode: Boolean(raw.freeApiMode),
    materialRevision: Number(raw.materialRevision) || 0,
    providerRevision: Number(raw.providerRevision) || 0,
  };
}

function getRequestCacheKey(question, settings = currentSettings) {
  return JSON.stringify({
    questionKey: question.key,
    incorrectRetry: isLinguaportaIncorrectResult(question.questionRoot),
    detailedMode: Boolean(settings.detailedMode),
    materialMode: Boolean(settings.materialMode),
    freeApiMode: Boolean(settings.freeApiMode),
    materialRevision: Number(settings.materialRevision) || 0,
    providerRevision: Number(settings.providerRevision) || 0,
  });
}

function isPaused(settings = currentSettings) {
  return !settings.enabled || settings.pausedUntil > Date.now();
}

function formatPausedUntil(timestamp) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getPausedMessage(settings = currentSettings) {
  if (!settings.enabled) {
    return "Stopped. Press 再開 to continue.";
  }

  if (settings.pausedUntil > Date.now()) {
    return `Paused until ${formatPausedUntil(settings.pausedUntil)}.`;
  }

  return "";
}

function syncStatusWidgetVisibility() {
  const widget = document.getElementById(STATUS_WIDGET_ID);
  if (!widget) {
    return;
  }

  widget.style.display = currentSettings.showStatusWidget ? "" : "none";
}

function loadSettings(force = false) {
  if (settingsLoaded && !force) {
    return Promise.resolve(currentSettings);
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
      currentSettings = normalizeSettings(items);
      settingsLoaded = true;
      syncStatusWidgetVisibility();
      resolve(currentSettings);
    });
  });
}

function renderNodeText(node, options = {}) {
  const {
    blankToken = " [blank] ",
    targetSelect = null,
    otherSelectToken = " ___ ",
  } = options;

  if (!node) {
    return "";
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node;

  if (
    element.matches(".accesshide, .sr-only, script, style, label.subq") ||
    element.matches(".linguaporta-hint-anchor") ||
    element.matches(`#${STATUS_WIDGET_ID}`)
  ) {
    return "";
  }

  // Inline dropdowns (gapselect). When a target is set, mark it as [blank] and
  // the others as neutral placeholders. When a counter is set, number them
  // [1], [2], ... so all blanks can be answered jointly in one request.
  if (element.matches("select")) {
    if (targetSelect) {
      return element === targetSelect ? blankToken : otherSelectToken;
    }
    if (options.selectCounter) {
      options.selectCounter.value += 1;
      return ` [${options.selectCounter.value}] `;
    }
    return blankToken;
  }

  // Linguaporta ordering questions draw the missing sentence portion as an
  // empty underlined span rather than a form control.
  if (element.matches(".qu03_line")) {
    return blankToken;
  }

  // Drag-and-drop word questions render blanks as spans
  // instead of form controls. Treat them exactly like the select-based
  // missing-word blanks so the model sees their positions.
  if (element.matches(".drop[class*='group']")) {
    if (options.blankCounter) {
      options.blankCounter.value += 1;
      return ` [${options.blankCounter.value}] `;
    }
    return blankToken;
  }

  if (
    element.matches(SUBQUESTION_SELECTOR) ||
    element.matches("input, textarea")
  ) {
    // Multi-blank subquestion groups (e.g. several related answers in one
    // problem). Number every blank [1], [2], ... in document order so the
    // whole passage can be solved jointly in one request.
    if (options.blankCounter) {
      options.blankCounter.value += 1;
      return ` [${options.blankCounter.value}] `;
    }
    return blankToken;
  }

  if (element.tagName === "SUP") {
    return `^${renderChildrenText(element, options)}`;
  }

  if (element.tagName === "BR") {
    return "\n";
  }

  const text = renderChildrenText(element, options);
  if (/^(P|DIV|LI|TR|TD|TH)$/.test(element.tagName)) {
    return `${text}\n`;
  }

  return text;
}

function renderChildrenText(element, options = {}) {
  return Array.from(element.childNodes)
    .map((childNode) => renderNodeText(childNode, options))
    .join("");
}

let obsoleteUiCleaned = false;

function cleanupObsoleteExtensionUi() {
  if (obsoleteUiCleaned) {
    return;
  }
  obsoleteUiCleaned = true;

  for (const element of Array.from(
    document.querySelectorAll(
      "style[id$='-hint-style'], div[id$='-hint-status-widget'], div[class$='-hint-anchor']"
    )
  )) {
    const isCurrentUi =
      element.id === HINT_STYLE_ID ||
      element.id === STATUS_WIDGET_ID ||
      element.classList?.contains("linguaporta-hint-anchor");
    if (!isCurrentUi) {
      element.remove();
    }
  }
}

function ensureStyles() {
  cleanupObsoleteExtensionUi();
  if (document.getElementById(HINT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = HINT_STYLE_ID;
  style.textContent = `
    .linguaporta-hint-anchor {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }

    .${HINT_PANEL_CLASS} {
      width: min(360px, 100%);
      box-sizing: border-box;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 14px;
      background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%);
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
      color: #1f2937;
      padding: 14px 16px;
      font-family: "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
      line-height: 1.55;
    }

    .${HINT_PANEL_CLASS}[data-state="loading"] {
      background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
    }

    .${HINT_PANEL_CLASS}[data-state="error"] {
      background: linear-gradient(180deg, #fff1f2 0%, #ffffff 100%);
      border-color: rgba(190, 24, 93, 0.16);
    }

    .${HINT_PANEL_CLASS}[data-state="manual"] {
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
      border-color: rgba(15, 23, 42, 0.1);
    }

    .${HINT_PANEL_CLASS}[data-state="manual"] .linguaporta-hint-answer {
      color: #64748b;
      font-weight: 600;
    }

    .linguaporta-hint-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }

    .linguaporta-hint-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: #9a3412;
    }

    .linguaporta-hint-status {
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
    }

    .linguaporta-hint-answer {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .linguaporta-hint-reason {
      margin-top: 8px;
      font-size: 13px;
      color: #475569;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .linguaporta-hint-meta {
      margin-top: 10px;
      font-size: 12px;
      color: #64748b;
    }

    .linguaporta-hint-actions {
      margin-top: 10px;
      display: none;
      justify-content: flex-end;
    }

    .${HINT_PANEL_CLASS}[data-state="error"] .linguaporta-hint-actions,
    .${HINT_PANEL_CLASS}[data-state="manual"] .linguaporta-hint-actions {
      display: flex;
    }

    .linguaporta-hint-retry {
      appearance: none;
      border: 1px solid rgba(15, 23, 42, 0.18);
      border-radius: 8px;
      background: #ffffff;
      color: #0f172a;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      cursor: pointer;
    }

    .linguaporta-hint-retry:hover {
      border-color: rgba(15, 23, 42, 0.34);
    }

    .linguaporta-hint-reason:empty,
    .linguaporta-hint-meta:empty {
      display: none;
    }

    #${STATUS_WIDGET_ID} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      width: min(320px, calc(100vw - 32px));
      box-sizing: border-box;
      border: 1px solid rgba(15, 23, 42, 0.14);
      border-radius: 16px;
      background: rgba(15, 23, 42, 0.92);
      color: #f8fafc;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28);
      padding: 14px 16px;
      font-family: "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
      backdrop-filter: blur(8px);
    }

    #${STATUS_WIDGET_ID}[data-phase="running"] {
      background: rgba(3, 105, 161, 0.94);
    }

    #${STATUS_WIDGET_ID}[data-phase="ready"] {
      background: rgba(15, 118, 110, 0.94);
    }

    #${STATUS_WIDGET_ID}[data-phase="idle"] {
      background: rgba(51, 65, 85, 0.94);
    }

    #${STATUS_WIDGET_ID}[data-phase="error"] {
      background: rgba(159, 18, 57, 0.95);
    }

    .linguaporta-status-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .linguaporta-status-controls {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .linguaporta-status-toggle {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-radius: 8px;
      background: rgba(127, 29, 29, 0.9);
      color: #ffffff;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      padding: 7px 10px;
      cursor: pointer;
      text-transform: none;
    }

    .linguaporta-status-toggle:hover {
      background: rgba(153, 27, 27, 0.98);
    }

    .linguaporta-status-toggle[data-paused="true"] {
      background: rgba(4, 120, 87, 0.95);
    }

    .linguaporta-status-toggle[data-paused="true"]:hover {
      background: rgba(5, 150, 105, 0.98);
    }

    .linguaporta-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: rgba(248, 250, 252, 0.92);
    }

    .linguaporta-status-pill::before {
      content: "";
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #f59e0b;
      box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.12);
      flex: none;
    }

    #${STATUS_WIDGET_ID}[data-phase="running"] .linguaporta-status-pill::before {
      background: #38bdf8;
    }

    #${STATUS_WIDGET_ID}[data-phase="ready"] .linguaporta-status-pill::before {
      background: #34d399;
    }

    #${STATUS_WIDGET_ID}[data-phase="idle"] .linguaporta-status-pill::before {
      background: #94a3b8;
    }

    #${STATUS_WIDGET_ID}[data-phase="error"] .linguaporta-status-pill::before {
      background: #fb7185;
    }

    .linguaporta-status-message {
      margin-top: 10px;
      font-size: 14px;
      line-height: 1.5;
      color: #f8fafc;
    }

    .linguaporta-status-meta {
      margin-top: 10px;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(226, 232, 240, 0.9);
      white-space: pre-wrap;
    }

    @media (max-width: 900px) {
      .linguaporta-hint-anchor {
        justify-content: stretch;
      }

      .${HINT_PANEL_CLASS} {
        width: 100%;
      }

      #${STATUS_WIDGET_ID} {
        right: 12px;
        left: 12px;
        bottom: 12px;
        width: auto;
      }
    }
  `;

  (document.head || document.documentElement).appendChild(style);
}

function buildQuestionKey(
  questionText,
  options,
  uniqueId = "",
  imageUrls = [],
  audioUrls = []
) {
  return JSON.stringify({
    questionText,
    options,
    uniqueId,
    imageUrls,
    audioUrls,
  });
}

function ensureStatusWidget() {
  let widget = document.getElementById(STATUS_WIDGET_ID);
  if (widget) {
    // The DOM can survive an extension reload even though its old content
    // script context (and event listeners) no longer works. Reattach the
    // current listener when the popup restores the script.
    widget
      .querySelector(".linguaporta-status-toggle")
      ?.addEventListener("click", toggleRuntimeFromStatusWidget);
    syncStatusWidgetVisibility();
    return widget;
  }

  widget = document.createElement("aside");
  widget.id = STATUS_WIDGET_ID;
  widget.dataset.phase = "booting";
  widget.innerHTML = `
    <div class="linguaporta-status-title">
      <span>LinguaportaFuck</span>
      <span class="linguaporta-status-controls">
        <span class="linguaporta-status-pill">Booting</span>
        <button class="linguaporta-status-toggle" type="button">停止</button>
      </span>
    </div>
    <div class="linguaporta-status-message">Content script started.</div>
    <div class="linguaporta-status-meta">Waiting for page scan...</div>
  `;

  widget
    .querySelector(".linguaporta-status-toggle")
    .addEventListener("click", toggleRuntimeFromStatusWidget);

  (document.body || document.documentElement).appendChild(widget);
  syncStatusWidgetVisibility();
  return widget;
}

function updateStatusToggle(widget) {
  const button = widget?.querySelector(".linguaporta-status-toggle");
  if (!button) {
    return;
  }

  const paused = isPaused(currentSettings);
  button.textContent = paused ? "再開" : "停止";
  button.dataset.paused = String(paused);
  button.setAttribute("aria-label", paused ? "自動回答を再開" : "自動回答を停止");
}

function toggleRuntimeFromStatusWidget() {
  if (isPaused(currentSettings)) {
    currentSettings = {
      ...currentSettings,
      enabled: true,
      pausedUntil: 0,
    };
    settingsLoaded = true;
    setStatus("scanning", "Resuming...", { queueCount: 0 });
    chrome.storage.local.set({ enabled: true, pausedUntil: 0 }, () => {
      scheduleScan();
    });
    return;
  }

  currentSettings = {
    ...currentSettings,
    enabled: false,
    pausedUntil: 0,
  };
  settingsLoaded = true;
  runtimeActionEpoch += 1;
  autoAdvanceScheduledKey = "";
  autoSubmittedButtons = new WeakSet();
  deferredScanRequested = false;
  clearQueuedTasks();
  resetPanelLoadState();
  markLoadingPanelsPaused(getPausedMessage(currentSettings));
  setStatus("idle", getPausedMessage(currentSettings), {
    queueCount: activeRequests,
  });
  chrome.storage.local.set({ enabled: false, pausedUntil: 0 });
}

function setStatus(phase, message, extra = {}) {
  runtimeState.phase = phase;
  runtimeState.message = message;
  runtimeState.questionCount = extra.questionCount ?? runtimeState.questionCount;
  runtimeState.readyCount = extra.readyCount ?? runtimeState.readyCount;
  runtimeState.errorCount = extra.errorCount ?? runtimeState.errorCount;
  runtimeState.queueCount = extra.queueCount ?? runtimeState.queueCount;
  runtimeState.lastProvider = extra.provider ?? runtimeState.lastProvider;
  runtimeState.lastModel = extra.model ?? runtimeState.lastModel;
  runtimeState.lastAudioMode = extra.audioMode ?? runtimeState.lastAudioMode;

  const widget = ensureStatusWidget();
  widget.dataset.phase = phase;

  const labelMap = {
    booting: "Booting",
    scanning: "Scanning",
    running: "Working",
    ready: "Ready",
    idle: "Idle",
    error: "Error",
  };

  const meta = [
    `Questions: ${runtimeState.questionCount}`,
    `Ready: ${runtimeState.readyCount}`,
    `Errors: ${runtimeState.errorCount}`,
    `Queue: ${runtimeState.queueCount}`,
    runtimeState.lastProvider ? `Provider: ${runtimeState.lastProvider}` : "",
    runtimeState.lastModel ? `Model: ${runtimeState.lastModel}` : "",
    runtimeState.lastAudioMode ? `Audio: ${runtimeState.lastAudioMode}` : "",
  ].filter(Boolean).join(" | ");

  widget.querySelector(".linguaporta-status-pill").textContent =
    labelMap[phase] || phase;
  widget.querySelector(".linguaporta-status-message").textContent = message;
  widget.querySelector(".linguaporta-status-meta").textContent = meta;
  updateStatusToggle(widget);
}

function getFallbackRootFromQuestionText(questionNode) {
  let current = questionNode.parentElement;

  while (current && current !== document.body && current !== document.documentElement) {
    if (current.querySelector(".answer") || current.querySelector(SUBQUESTION_SELECTOR)) {
      return current;
    }

    current = current.parentElement;
  }

  return questionNode.parentElement;
}

function isLinguaportaQuestionRoot(questionRoot) {
  return Boolean(
    questionRoot?.matches?.(LINGUAPORTA_QUESTION_SELECTOR) &&
      questionRoot.querySelector("form[name='ExpForm']") &&
      questionRoot.querySelector("#question_area")
  );
}

function getAnswerRoot(questionRoot) {
  if (isLinguaportaQuestionRoot(questionRoot)) {
    return questionRoot.querySelector(LINGUAPORTA_ANSWER_SELECTOR);
  }

  return questionRoot.querySelector(".answer");
}

function getLinguaportaQuestionId(questionRoot) {
  return normalizeText(
    questionRoot.querySelector("input[name='xlast_problem_num']")?.value ||
      questionRoot.querySelector("input[name='click_verify']")?.value ||
      ""
  );
}

function getLinguaportaControlText(answerRoot, control) {
  if (!answerRoot || !control) {
    return "";
  }

  const label = Array.from(answerRoot.querySelectorAll("label")).find(
    (candidate) => candidate.htmlFor && candidate.htmlFor === control.id
  );
  return normalizeText(
    label?.innerText || label?.textContent || control.value || ""
  );
}

function normalizeChoiceMatchText(value) {
  return normalizeText(value)
    .normalize("NFKC")
    .replace(/[~\u301C\uFF5E]/g, "~")
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
}

function getAnsweredOptionKeys(question, answerText) {
  const rawParts =
    question.targetType === "multiple_choice"
      ? String(answerText || "").split(/\s*\|\|\s*/u)
      : [String(answerText || "")];
  const answerKeys = new Set(
    rawParts.map(normalizeChoiceMatchText).filter(Boolean)
  );

  return new Set(
    (question.options || [])
      .filter((option) => answerKeys.has(normalizeChoiceMatchText(option)))
      .map(normalizeChoiceMatchText)
  );
}

function getLinguaportaControlLine(answerRoot, control) {
  if (!answerRoot || !control || !answerRoot.contains(control)) {
    return "";
  }

  let topLevelNode = control;
  while (topLevelNode.parentNode && topLevelNode.parentNode !== answerRoot) {
    topLevelNode = topLevelNode.parentNode;
  }

  const childNodes = Array.from(answerRoot.childNodes);
  const controlIndex = childNodes.indexOf(topLevelNode);
  if (controlIndex < 0) {
    return normalizeText(renderNodeText(topLevelNode));
  }

  let startIndex = controlIndex;
  while (
    startIndex > 0 &&
    !(childNodes[startIndex - 1] instanceof Element &&
      childNodes[startIndex - 1].tagName === "BR")
  ) {
    startIndex -= 1;
  }

  let endIndex = controlIndex;
  while (
    endIndex + 1 < childNodes.length &&
    !(childNodes[endIndex + 1] instanceof Element &&
      childNodes[endIndex + 1].tagName === "BR")
  ) {
    endIndex += 1;
  }

  return normalizeText(
    childNodes
      .slice(startIndex, endIndex + 1)
      .map((node) => renderNodeText(node))
      .join("")
  );
}

function extractLinguaportaAnswerPrompt(answerRoot) {
  if (!answerRoot) {
    return "";
  }

  const inlineAnswerControls = Array.from(
    answerRoot.querySelectorAll(`${EDITABLE_TEXT_CONTROL_SELECTOR}, select`)
  );
  const lines = inlineAnswerControls
    .map((control) => getLinguaportaControlLine(answerRoot, control))
    .filter(Boolean);

  return Array.from(new Set(lines)).join("\n");
}

function extractLinguaportaOrderingOptions(questionRoot) {
  if (!isLinguaportaQuestionRoot(questionRoot)) {
    return [];
  }

  return Array.from(
    questionRoot.querySelectorAll("#question_area .CardStyle[id^='D']")
  )
    .map((card) => normalizeText(renderNodeText(card)))
    .filter(Boolean);
}

function hasLinguaportaOrderingLayout(questionRoot) {
  return Boolean(
    isLinguaportaQuestionRoot(questionRoot) &&
      questionRoot.querySelector("#question_area .qu03_line") &&
      questionRoot.querySelector("#question_area .DropLine") &&
      questionRoot.querySelector("#question_area .CardStyle[id^='D']")
  );
}

function parseLinguaportaOrderingAnswer(question, answerText) {
  const options = question.options || [];
  const optionBuckets = new Map();
  for (const option of options) {
    const key = normalizeChoiceMatchText(option);
    const bucket = optionBuckets.get(key) || [];
    bucket.push(option);
    optionBuckets.set(key, bucket);
  }

  const ordered = String(answerText || "")
    .split(/\s*\u2192\s*/u)
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .map((part) => {
      const bucket = optionBuckets.get(normalizeChoiceMatchText(part));
      return bucket?.shift() || "";
    });

  if (
    ordered.length !== options.length ||
    ordered.some((option) => !option) ||
    Array.from(optionBuckets.values()).some((bucket) => bucket.length)
  ) {
    return [];
  }

  return ordered;
}

function applyLinguaportaOrderingAnswer(question, answerText) {
  const orderedOptions = parseLinguaportaOrderingAnswer(question, answerText);
  const questionRoot = question.questionRoot;
  const dropLines = Array.from(
    questionRoot.querySelectorAll("#question_area .DropLine")
  );
  const cards = Array.from(
    questionRoot.querySelectorAll("#question_area .CardStyle[id^='D']")
  );
  if (
    !orderedOptions.length ||
    !dropLines.length ||
    cards.length !== orderedOptions.length
  ) {
    return 0;
  }

  const cardBuckets = new Map();
  for (const card of cards) {
    const key = normalizeChoiceMatchText(renderNodeText(card));
    const bucket = cardBuckets.get(key) || [];
    bucket.push(card);
    cardBuckets.set(key, bucket);
  }

  const orderedCards = orderedOptions.map((option) =>
    cardBuckets.get(normalizeChoiceMatchText(option))?.shift()
  );
  if (orderedCards.some((card) => !card)) {
    return 0;
  }

  let lineIndex = 0;
  let usedWidth = 0;
  for (const card of orderedCards) {
    const width =
      card.offsetWidth || Math.round(card.getBoundingClientRect().width) || 36;
    let dropLine = dropLines[lineIndex];
    const availableWidth = Math.max(
      dropLine.offsetWidth,
      dropLine.getBoundingClientRect().width
    );

    if (
      usedWidth > 0 &&
      usedWidth + width > availableWidth &&
      lineIndex < dropLines.length - 1
    ) {
      lineIndex += 1;
      usedWidth = 0;
      dropLine = dropLines[lineIndex];
    }

    // Linguaporta's GetGuessSequence() only counts a card when its exact top
    // equals: DropLine bottom - (card height + 2). Set that same coordinate
    // directly; synthetic drag events were unreliable in Chromium.
    const height =
      card.offsetHeight || Math.round(card.getBoundingClientRect().height) || 20;
    const cardLeft = dropLine.offsetLeft + usedWidth;
    const cardTop = dropLine.offsetTop + dropLine.offsetHeight - (height + 2);
    card.style.left = `${Math.round(cardLeft)}px`;
    card.style.top = `${Math.round(cardTop)}px`;
    usedWidth += width + 5;
  }

  return orderedCards.length;
}

function dispatchAnswerControlEvents(control) {
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyLinguaportaAnswer(question, answerText) {
  if (
    !isLinguaportaQuestionRoot(question.questionRoot) ||
    question.hasExistingAnswer ||
    isLinguaportaCorrectResult(question.questionRoot)
  ) {
    return 0;
  }

  if (question.targetType === "ordering") {
    return applyLinguaportaOrderingAnswer(question, answerText);
  }

  const answerRoot = getAnswerRoot(question.questionRoot);
  if (!answerRoot) {
    return 0;
  }

  const textControls = Array.from(
    answerRoot.querySelectorAll(EDITABLE_TEXT_CONTROL_SELECTOR)
  ).filter((control) => !control.disabled && !control.readOnly);
  if (!question.options?.length && textControls.length === 1) {
    const value = String(answerText || "").trim();
    if (!value) {
      return 0;
    }

    const control = textControls[0];
    if (control.value !== value) {
      control.value = value;
      dispatchAnswerControlEvents(control);
    }
    return 1;
  }

  const answeredOptionKeys = getAnsweredOptionKeys(question, answerText);
  if (!answeredOptionKeys.size) {
    return 0;
  }

  let selectedCount = 0;
  const choiceControls = Array.from(
    answerRoot.querySelectorAll("input[type='radio'], input[type='checkbox']")
  );

  for (const control of choiceControls) {
    const labelKey = normalizeChoiceMatchText(
      getLinguaportaControlText(answerRoot, control)
    );
    const valueKey = normalizeChoiceMatchText(control.value);
    const shouldSelect =
      answeredOptionKeys.has(labelKey) || answeredOptionKeys.has(valueKey);

    if (control.checked !== shouldSelect) {
      control.checked = shouldSelect;
      dispatchAnswerControlEvents(control);
    }
    if (shouldSelect) {
      selectedCount += 1;
    }
  }

  for (const select of Array.from(answerRoot.querySelectorAll("select"))) {
    const matchingOption = Array.from(select.options).find((option) => {
      const textKey = normalizeChoiceMatchText(
        option.textContent || option.innerText || ""
      );
      const valueKey = normalizeChoiceMatchText(option.value);
      return answeredOptionKeys.has(textKey) || answeredOptionKeys.has(valueKey);
    });
    if (!matchingOption) {
      continue;
    }

    if (select.value !== matchingOption.value) {
      select.value = matchingOption.value;
      dispatchAnswerControlEvents(select);
    }
    selectedCount += 1;
  }

  return selectedCount;
}

function extractLinguaportaQuestionText(questionRoot) {
  const questionArea = questionRoot.querySelector("#question_area");
  if (!questionArea) {
    return "";
  }

  // Linguaporta renders prompts as qu01, qu02, ... and keeps the answer
  // controls under #drill_form. Reading all of #question_area would mix every
  // answer label into the prompt, so prefer the numbered prompt nodes.
  const numberedPromptNodes = Array.from(questionArea.querySelectorAll("[id]")).filter(
    (element) => /^qu\d+$/i.test(element.id)
  );
  const promptParts = numberedPromptNodes
    .map((element) => normalizeText(renderNodeText(element)))
    .filter(Boolean);
  const answerPrompt = extractLinguaportaAnswerPrompt(
    questionRoot.querySelector(LINGUAPORTA_ANSWER_SELECTOR)
  );
  const orderingPrompt = normalizeText(
    renderNodeText(questionArea.querySelector(".qu03"))
  );

  if (promptParts.length) {
    return [...promptParts, orderingPrompt, answerPrompt]
      .filter(Boolean)
      .join("\n");
  }

  // Fallback for other exercise templates: render the question area while
  // excluding any branch that contains #drill_form.
  return normalizeText(
    Array.from(questionArea.childNodes)
      .filter((node) => {
        if (!(node instanceof Element)) {
          return true;
        }
        return !(
          node.matches(LINGUAPORTA_ANSWER_SELECTOR) ||
          node.querySelector(LINGUAPORTA_ANSWER_SELECTOR)
        );
      })
      .map((node) => renderNodeText(node))
      .join("\n")
  );
}

function getLinguaportaPromptIdentity(questionRoot) {
  if (!isLinguaportaQuestionRoot(questionRoot)) {
    return "";
  }

  return Array.from(questionRoot.querySelectorAll("#question_area [id]"))
    .filter((element) => /^qu\d+$/i.test(element.id))
    .map((element) => normalizeText(renderNodeText(element)))
    .filter(Boolean)
    .join("\n");
}

function isLinguaportaCorrectResult(questionRoot) {
  if (!isLinguaportaQuestionRoot(questionRoot)) {
    return false;
  }

  // Linguaporta uses this marker for the result screen across exercise types.
  // Keep a class/text fallback for templates that omit the legacy id.
  if (questionRoot.querySelector("#true_msg")) {
    return true;
  }

  return Array.from(questionRoot.querySelectorAll(".problem-mark-ok")).some(
    (marker) => /(?:正解|correct)/i.test(normalizeText(marker.textContent))
  );
}

function isLinguaportaIncorrectResult(questionRoot) {
  if (!isLinguaportaQuestionRoot(questionRoot)) {
    return false;
  }

  if (questionRoot.querySelector("#false_msg")) {
    return true;
  }

  return Array.from(questionRoot.querySelectorAll(".problem-mark-ng")).some(
    (marker) => /(?:不正解|incorrect|wrong)/i.test(normalizeText(marker.textContent))
  );
}

function extractLinguaportaRejectedAnswers(questionRoot) {
  if (!isLinguaportaIncorrectResult(questionRoot)) {
    return [];
  }

  const answerInfo = questionRoot.querySelector("#answer_info");
  if (!answerInfo) {
    return [];
  }

  const rejected = Array.from(
    answerInfo.querySelectorAll(
      "s, del, strike, [style*='line-through' i]"
    )
  )
    .filter(
      (element) =>
        !element.querySelector("s, del, strike, [style*='line-through' i]")
    )
    .map((element) => normalizeText(element.textContent))
    .filter(Boolean);

  return Array.from(new Set(rejected));
}

function extractLinguaportaRevealedCorrectAnswer(questionRoot) {
  if (!isLinguaportaQuestionRoot(questionRoot)) {
    return null;
  }

  // "正解を見る" replaces the editable answer row with a .qu03 sentence
  // whose answer controls are readonly. The problem id changes on this page,
  // so the normalized prompt—not xlast_problem_num—is used for persistence.
  const solutionControls = Array.from(
    questionRoot.querySelectorAll(
      "#question_area .qu03 input[readonly], #question_area .qu03 textarea[readonly]"
    )
  ).filter((control) => {
    if (control.tagName === "TEXTAREA") {
      return true;
    }

    // A few choice-result templates also render readonly radio/checkbox
    // controls inside .qu03. They are not the free-text solution produced by
    // "正解を見る" and must not replace the staged, confirmed AI choice.
    const type = normalizeText(control.type || control.getAttribute("type"));
    return !type || ["text", "number", "search", "email", "url", "tel"].includes(type);
  });
  if (solutionControls.length !== 1) {
    return null;
  }

  const answer = normalizeText(solutionControls[0].value);
  const questionText = extractLinguaportaQuestionText(questionRoot);
  if (!answer || !questionText) {
    return null;
  }

  return {
    answer,
    question: {
      questionText,
      options: [],
      targetType: "standard",
    },
  };
}

function findLinguaportaNextProblemButton() {
  return Array.from(
    document.querySelectorAll(
      ".problem-next-group input, .problem-next-group button, input.button-next-problem, button.button-next-problem, input[type='submit'], input[type='button'], button"
    )
  ).find((button) => {
    const label = normalizeText(button.value || button.textContent);
    return !button.disabled && label === "次の問題";
  });
}

function scheduleLinguaportaAutoAdvance(
  questionRoot,
  { allowRevealedAnswer = false } = {}
) {
  const isCorrectResult = isLinguaportaCorrectResult(questionRoot);
  const isRevealedAnswer =
    allowRevealedAnswer &&
    Boolean(extractLinguaportaRevealedCorrectAnswer(questionRoot));
  if (!isCorrectResult && !isRevealedAnswer) {
    return false;
  }

  const nextButton = findLinguaportaNextProblemButton();
  if (!nextButton) {
    return false;
  }

  const questionKey =
    getLinguaportaQuestionId(questionRoot) ||
    normalizeText(questionRoot.querySelector("#true_msg")?.textContent) ||
    "correct-result";
  if (autoAdvanceScheduledKey === questionKey) {
    return true;
  }
  autoAdvanceScheduledKey = questionKey;
  const actionEpoch = runtimeActionEpoch;

  window.setTimeout(() => {
    const currentRoot = document.querySelector(LINGUAPORTA_QUESTION_SELECTOR);
    const currentResultCanAdvance =
      isLinguaportaCorrectResult(currentRoot) ||
      (allowRevealedAnswer &&
        Boolean(extractLinguaportaRevealedCorrectAnswer(currentRoot)));
    if (
      actionEpoch !== runtimeActionEpoch ||
      isPaused(currentSettings) ||
      !currentResultCanAdvance ||
      getLinguaportaQuestionId(currentRoot) !== getLinguaportaQuestionId(questionRoot)
    ) {
      return;
    }

    const currentNextButton = findLinguaportaNextProblemButton();
    if (currentNextButton) {
      currentNextButton.click();
    }
  }, Math.round(randomBetween(450, 950)));

  return true;
}

function findLinguaportaAnswerButton(questionRoot, allowRetry = false) {
  if (!isLinguaportaQuestionRoot(questionRoot)) {
    return null;
  }

  const button = questionRoot.querySelector("#ans_submit");
  if (!button || button.disabled) {
    return null;
  }

  const label = normalizeText(button.value || button.textContent);
  if (label === "解答する") {
    return button;
  }

  return allowRetry && label === "もう一度解答する" ? button : null;
}

function findLinguaportaViewAnswerButton(questionRoot) {
  if (!isLinguaportaIncorrectResult(questionRoot)) {
    return null;
  }

  return Array.from(
    questionRoot.querySelectorAll("input.problem-view-answer, button.problem-view-answer")
  ).find((button) => {
    const label = normalizeText(button.value || button.textContent);
    return !button.disabled && label === "正解を見る";
  }) || null;
}

function scheduleLinguaportaViewAnswer(questionRoot) {
  const viewAnswerButton = findLinguaportaViewAnswerButton(questionRoot);
  if (!viewAnswerButton || autoRevealedButtons.has(viewAnswerButton)) {
    return false;
  }

  autoRevealedButtons.add(viewAnswerButton);
  const actionEpoch = runtimeActionEpoch;
  window.setTimeout(() => {
    if (
      actionEpoch !== runtimeActionEpoch ||
      isPaused(currentSettings) ||
      !questionRoot.isConnected ||
      findLinguaportaViewAnswerButton(questionRoot) !== viewAnswerButton
    ) {
      return;
    }
    viewAnswerButton.click();
  }, Math.round(randomBetween(450, 950)));
  return true;
}

function hashStableQuestion(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createAiAnswerFingerprint(question, { stableOptionOrder = true } = {}) {
  const normalizeOptions = (options) => {
    const normalized = Array.isArray(options)
      ? options.map((option) => normalizeText(option))
      : [];
    return stableOptionOrder ? normalized.sort() : normalized;
  };
  const stableQuestion = JSON.stringify({
    questionText: normalizeText(
      question?.groupMarkedText ||
        question?.markedText ||
        question?.questionText ||
        ""
    ),
    // Choice and ordering cards can be shuffled between rounds. Their DOM
    // order is not part of the question identity, so use the option multiset.
    options: normalizeOptions(question?.options),
    blanks: Array.isArray(question?.blanks)
      ? question.blanks.map((blank) => ({
          label: normalizeText(blank?.label || ""),
          options: normalizeOptions(blank?.options),
        }))
      : Array.isArray(question?.groupBlanks)
        ? question.groupBlanks.map((blank) => ({
            label: normalizeText(blank?.label || ""),
            fieldType: normalizeText(blank?.fieldType || ""),
          }))
        : [],
    targetType: normalizeText(question?.targetType || "standard"),
  });
  return hashStableQuestion(stableQuestion);
}

function getAiAnswerFingerprint(question) {
  return createAiAnswerFingerprint(question);
}

function getLegacyAiAnswerFingerprint(question) {
  return createAiAnswerFingerprint(question, { stableOptionOrder: false });
}

function getStoredObject(storageKey) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [storageKey]: {} }, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const stored = items?.[storageKey];
      resolve(
        stored && typeof stored === "object" && !Array.isArray(stored)
          ? { ...stored }
          : {}
      );
    });
  });
}

function setStoredObject(storageKey, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [storageKey]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function saveLearnedCorrectAnswer(revealedAnswer) {
  const answer = normalizeText(revealedAnswer?.answer);
  const question = revealedAnswer?.question;
  if (!answer || !question?.questionText) {
    return null;
  }

  const fingerprint = getAiAnswerFingerprint(question);
  const legacyFingerprint = getLegacyAiAnswerFingerprint(question);
  const learnedAnswers = await getStoredObject(LEARNED_ANSWERS_STORAGE_KEY);
  const existingRecord =
    learnedAnswers[fingerprint] || learnedAnswers[legacyFingerprint];
  const existingAnswer = normalizeText(existingRecord?.answer);
  if (existingAnswer === answer && learnedAnswers[fingerprint]) {
    return { answer, fingerprint, saved: false };
  }

  learnedAnswers[fingerprint] = {
    answer,
    questionText: normalizeText(question.questionText),
    targetType: normalizeText(question.targetType || "standard"),
    updatedAt: Date.now(),
  };
  if (legacyFingerprint !== fingerprint) {
    delete learnedAnswers[legacyFingerprint];
  }

  const trimmedAnswers = Object.fromEntries(
    Object.entries(learnedAnswers)
      .sort(
        (left, right) =>
          Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0)
      )
      .slice(0, MAX_LEARNED_ANSWERS)
  );
  await setStoredObject(LEARNED_ANSWERS_STORAGE_KEY, trimmedAnswers);
  return { answer, fingerprint, saved: existingAnswer !== answer };
}

function createLearnableQuestionSnapshot(question) {
  return {
    questionText: normalizeText(question?.questionText || ""),
    markedText: normalizeText(question?.markedText || ""),
    groupMarkedText: normalizeText(question?.groupMarkedText || ""),
    options: Array.isArray(question?.options)
      ? question.options.map((option) => normalizeText(option)).filter(Boolean)
      : [],
    blanks: Array.isArray(question?.blanks)
      ? question.blanks.map((blank) => ({
          label: normalizeText(blank?.label || ""),
          options: Array.isArray(blank?.options)
            ? blank.options.map((option) => normalizeText(option)).filter(Boolean)
            : [],
        }))
      : [],
    groupBlanks: Array.isArray(question?.groupBlanks)
      ? question.groupBlanks.map((blank) => ({
          label: normalizeText(blank?.label || ""),
          fieldType: normalizeText(blank?.fieldType || ""),
        }))
      : [],
    targetType: normalizeText(question?.targetType || "standard"),
  };
}

function rememberPendingCorrectAnswer(question, answerText) {
  if (!isLinguaportaQuestionRoot(question?.questionRoot)) {
    return false;
  }

  const answer = normalizeText(answerText);
  const questionSnapshot = createLearnableQuestionSnapshot(question);
  if (!answer || !questionSnapshot.questionText) {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      PENDING_CORRECT_ANSWER_SESSION_KEY,
      JSON.stringify({
        answer,
        question: questionSnapshot,
        fingerprint: getAiAnswerFingerprint(questionSnapshot),
        promptIdentity: getLinguaportaPromptIdentity(question.questionRoot),
        questionId: getLinguaportaQuestionId(question.questionRoot),
        pagePath: window.location.pathname,
        updatedAt: Date.now(),
      })
    );
    return true;
  } catch (error) {
    console.warn("Failed to stage a Linguaporta answer for learning:", error);
    return false;
  }
}

function readPendingCorrectAnswer() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CORRECT_ANSWER_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const record = JSON.parse(raw);
    if (
      !record ||
      typeof record !== "object" ||
      !normalizeText(record.answer) ||
      !record.question?.questionText ||
      Date.now() - Number(record.updatedAt || 0) > PENDING_CORRECT_ANSWER_TTL_MS
    ) {
      window.sessionStorage.removeItem(PENDING_CORRECT_ANSWER_SESSION_KEY);
      return null;
    }
    return record;
  } catch (error) {
    console.warn("Failed to read the staged Linguaporta answer:", error);
    return null;
  }
}

function clearPendingCorrectAnswer() {
  try {
    window.sessionStorage.removeItem(PENDING_CORRECT_ANSWER_SESSION_KEY);
  } catch (_error) {
    // Session storage may be unavailable under restrictive browser settings.
  }
}

async function clearConfirmedAnswerAttemptState(fingerprint) {
  if (!fingerprint) {
    return;
  }

  const [attempts, retryGuards] = await Promise.all([
    getStoredObject(AI_ANSWER_ATTEMPTS_STORAGE_KEY),
    getStoredObject(RETRY_SUBMIT_GUARD_STORAGE_KEY),
  ]);
  let attemptsChanged = false;
  let guardsChanged = false;
  if (fingerprint in attempts) {
    delete attempts[fingerprint];
    attemptsChanged = true;
  }
  if (fingerprint in retryGuards) {
    delete retryGuards[fingerprint];
    guardsChanged = true;
  }

  await Promise.all([
    attemptsChanged
      ? setStoredObject(AI_ANSWER_ATTEMPTS_STORAGE_KEY, attempts)
      : Promise.resolve(),
    guardsChanged
      ? setStoredObject(RETRY_SUBMIT_GUARD_STORAGE_KEY, retryGuards)
      : Promise.resolve(),
  ]);
  aiAttemptReservationChains.delete(fingerprint);
  retrySubmitReservations.delete(fingerprint);
}

async function promoteConfirmedCorrectAnswer(questionRoot) {
  if (!isLinguaportaCorrectResult(questionRoot)) {
    return null;
  }

  const pending = readPendingCorrectAnswer();
  if (!pending) {
    return null;
  }

  const currentPromptIdentity = getLinguaportaPromptIdentity(questionRoot);
  const currentQuestionId = getLinguaportaQuestionId(questionRoot);
  const promptMatches =
    Boolean(pending.promptIdentity) &&
    pending.promptIdentity === currentPromptIdentity;
  const idMatches =
    Boolean(pending.questionId) && pending.questionId === currentQuestionId;
  const recentlySubmitted =
    Date.now() - Number(pending.updatedAt || 0) <=
    PENDING_CORRECT_ANSWER_CONFIRMATION_MS;
  const pageMatches =
    Boolean(pending.pagePath) && pending.pagePath === window.location.pathname;
  if (!promptMatches && !idMatches && !(recentlySubmitted && pageMatches)) {
    clearPendingCorrectAnswer();
    return null;
  }

  const learned = await saveLearnedCorrectAnswer({
    answer: pending.answer,
    question: pending.question,
  });
  await clearConfirmedAnswerAttemptState(
    normalizeText(pending.fingerprint) || getAiAnswerFingerprint(pending.question)
  );
  clearPendingCorrectAnswer();
  return learned;
}

async function deleteLearnedCorrectAnswer(question) {
  const fingerprint = getAiAnswerFingerprint(question);
  const legacyFingerprint = getLegacyAiAnswerFingerprint(question);
  const learnedAnswers = await getStoredObject(LEARNED_ANSWERS_STORAGE_KEY);
  if (!(fingerprint in learnedAnswers) && !(legacyFingerprint in learnedAnswers)) {
    return;
  }
  delete learnedAnswers[fingerprint];
  delete learnedAnswers[legacyFingerprint];
  await setStoredObject(LEARNED_ANSWERS_STORAGE_KEY, learnedAnswers);
}

async function loadLearnedCorrectAnswer(question) {
  if (!isLinguaportaQuestionRoot(question?.questionRoot)) {
    return "";
  }

  try {
    const fingerprint = getAiAnswerFingerprint(question);
    const legacyFingerprint = getLegacyAiAnswerFingerprint(question);
    const learnedAnswers = await getStoredObject(LEARNED_ANSWERS_STORAGE_KEY);
    const learnedRecord =
      learnedAnswers[fingerprint] || learnedAnswers[legacyFingerprint];
    const answer = normalizeText(learnedRecord?.answer);
    if (!answer) {
      return "";
    }

    if (!learnedAnswers[fingerprint] && learnedRecord) {
      learnedAnswers[fingerprint] = learnedRecord;
      delete learnedAnswers[legacyFingerprint];
      await setStoredObject(LEARNED_ANSWERS_STORAGE_KEY, learnedAnswers);
    }

    // If the site ever marks a stored answer wrong (for example after course
    // content changes), discard it immediately and let the normal AI fallback
    // find a new answer instead of creating an endless retry loop.
    const answerKey = normalizeChoiceMatchText(answer);
    const wasRejected = extractLinguaportaRejectedAnswers(question.questionRoot)
      .map(normalizeChoiceMatchText)
      .some((rejectedKey) => rejectedKey === answerKey);
    if (wasRejected) {
      await deleteLearnedCorrectAnswer(question);
      return "";
    }

    return answer;
  } catch (error) {
    console.warn("Failed to load a learned Linguaporta answer:", error);
    return "";
  }
}

function getRetrySubmitFingerprint(question) {
  return getAiAnswerFingerprint(question);
}

function getMaxAiAnswersForQuestion(question) {
  return question?.targetType === "ordering"
    ? 1 + MAX_ORDERING_AI_RETRIES
    : MAX_AI_ANSWERS_PER_QUESTION;
}

function getMaxRetrySubmitsForQuestion(question) {
  return question?.targetType === "ordering" ? MAX_ORDERING_AI_RETRIES : 1;
}

function createAiAnswerLimitError(question) {
  const maxAnswers = getMaxAiAnswersForQuestion(question);
  const error = new Error(
    `AI回答は同じ問題につき${maxAnswers}回までです。`
  );
  error.code = AI_ANSWER_LIMIT_ERROR_CODE;
  error.maxAnswers = maxAnswers;
  return error;
}

function reserveAiAnswerAttempt(question) {
  const fingerprint = getAiAnswerFingerprint(question);
  const previous = aiAttemptReservationChains.get(fingerprint) || Promise.resolve();
  const reservation = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise((resolve, reject) => {
          chrome.storage.local.get(
            { [AI_ANSWER_ATTEMPTS_STORAGE_KEY]: {} },
            (items) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              const now = Date.now();
              const storedAttempts = items?.[AI_ANSWER_ATTEMPTS_STORAGE_KEY];
              const attempts =
                storedAttempts &&
                typeof storedAttempts === "object" &&
                !Array.isArray(storedAttempts)
                  ? { ...storedAttempts }
                  : {};

              for (const [key, entry] of Object.entries(attempts)) {
                const updatedAt = Number(entry?.updatedAt || 0);
                if (!updatedAt || now - updatedAt > AI_ANSWER_ATTEMPT_TTL_MS) {
                  delete attempts[key];
                }
              }

              const currentCount = Math.max(
                0,
                Number(attempts[fingerprint]?.count || 0)
              );
              if (currentCount >= getMaxAiAnswersForQuestion(question)) {
                reject(createAiAnswerLimitError(question));
                return;
              }

              // Persist the reservation before contacting the model. A form
              // submission can navigate immediately, so a reload must already
              // know that this generation consumed one of its allowed attempts.
              attempts[fingerprint] = {
                count: currentCount + 1,
                updatedAt: now,
              };
              chrome.storage.local.set(
                { [AI_ANSWER_ATTEMPTS_STORAGE_KEY]: attempts },
                () => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                  }
                  resolve(currentCount + 1);
                }
              );
            }
          );
        })
    );

  aiAttemptReservationChains.set(fingerprint, reservation);
  return reservation.finally(() => {
    if (aiAttemptReservationChains.get(fingerprint) === reservation) {
      aiAttemptReservationChains.delete(fingerprint);
    }
  });
}

function releaseAiAnswerAttempt(question) {
  const fingerprint = getAiAnswerFingerprint(question);
  const previous = aiAttemptReservationChains.get(fingerprint) || Promise.resolve();
  const release = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise((resolve, reject) => {
          chrome.storage.local.get(
            { [AI_ANSWER_ATTEMPTS_STORAGE_KEY]: {} },
            (items) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              const storedAttempts = items?.[AI_ANSWER_ATTEMPTS_STORAGE_KEY];
              const attempts =
                storedAttempts &&
                typeof storedAttempts === "object" &&
                !Array.isArray(storedAttempts)
                  ? { ...storedAttempts }
                  : {};
              const currentCount = Math.max(
                0,
                Number(attempts[fingerprint]?.count || 0)
              );
              if (currentCount <= 1) {
                delete attempts[fingerprint];
              } else {
                attempts[fingerprint] = {
                  count: currentCount - 1,
                  updatedAt: Date.now(),
                };
              }

              chrome.storage.local.set(
                { [AI_ANSWER_ATTEMPTS_STORAGE_KEY]: attempts },
                () => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                  }
                  resolve();
                }
              );
            }
          );
        })
    );

  aiAttemptReservationChains.set(fingerprint, release);
  return release.finally(() => {
    if (aiAttemptReservationChains.get(fingerprint) === release) {
      aiAttemptReservationChains.delete(fingerprint);
    }
  });
}

function reserveRetryAutoSubmit(question) {
  const fingerprint = getRetrySubmitFingerprint(question);
  if (retrySubmitReservations.has(fingerprint)) {
    return Promise.resolve(false);
  }
  retrySubmitReservations.add(fingerprint);

  return new Promise((resolve) => {
    chrome.storage.local.get(
      { [RETRY_SUBMIT_GUARD_STORAGE_KEY]: {} },
      (items) => {
        if (chrome.runtime.lastError) {
          retrySubmitReservations.delete(fingerprint);
          resolve(false);
          return;
        }

        const now = Date.now();
        const storedGuards = items?.[RETRY_SUBMIT_GUARD_STORAGE_KEY];
        const guards =
          storedGuards && typeof storedGuards === "object" && !Array.isArray(storedGuards)
            ? { ...storedGuards }
            : {};
        for (const [key, entry] of Object.entries(guards)) {
          const updatedAt = Number(entry?.updatedAt || 0);
          if (!updatedAt || now - updatedAt > RETRY_SUBMIT_GUARD_TTL_MS) {
            delete guards[key];
          }
        }

        const currentCount = Math.max(
          0,
          Number(guards[fingerprint]?.count || 0)
        );
        if (currentCount >= getMaxRetrySubmitsForQuestion(question)) {
          retrySubmitReservations.delete(fingerprint);
          resolve(false);
          return;
        }

        // Reserve before clicking. The form can navigate immediately, so the
        // next page must already know how many retries have been submitted.
        guards[fingerprint] = {
          count: currentCount + 1,
          updatedAt: now,
        };
        chrome.storage.local.set(
          { [RETRY_SUBMIT_GUARD_STORAGE_KEY]: guards },
          () => {
            if (chrome.runtime.lastError) {
              retrySubmitReservations.delete(fingerprint);
              resolve(false);
              return;
            }
            resolve(true);
          }
        );
      }
    );
  });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Estimates how long a human would take to read the prompt, work out the
// answer and type/drag it before pressing 解答する. Harder-looking questions
// (long prompts, more blanks, ordering, audio) get a longer, and never
// constant, think time.
function estimateHumanSubmitDelayMs(question, answerText) {
  const questionText = normalizeText(
    question?.groupMarkedText ||
      question?.markedText ||
      question?.questionText ||
      ""
  );
  const answer = String(answerText || "");
  const blanks = Array.isArray(question?.blanks)
    ? question.blanks.length
    : Array.isArray(question?.groupBlanks)
      ? question.groupBlanks.length
      : 0;
  const optionCount = Array.isArray(question?.options)
    ? question.options.length
    : 0;
  const isOrdering = question?.targetType === "ordering";
  const hasAudio = Boolean(
    (Array.isArray(question?.audios) && question.audios.length) ||
      (Array.isArray(question?.audioSourceUrls) &&
        question.audioSourceUrls.length)
  );

  let delay = 900;
  delay += Math.min(questionText.length, 400) * 12;
  delay += Math.min(answer.length, 400) * 45;
  delay += blanks * 350;
  if (isOrdering) {
    delay += optionCount * 350 + 800;
  }
  if (hasAudio) {
    delay += 2500;
  }
  if (question?.hasExistingAnswer) {
    delay += 400;
  }

  // Jitter so the gap before submission is never identical.
  delay *= 1 + randomBetween(-0.22, 0.38);
  return Math.round(Math.min(Math.max(delay, 700), 25000));
}

async function scheduleLinguaportaAutoSubmit(question, result = {}) {
  const questionRoot = question?.questionRoot;
  if (
    !isLinguaportaQuestionRoot(questionRoot) ||
    isLinguaportaCorrectResult(questionRoot)
  ) {
    return false;
  }

  const isIncorrect = isLinguaportaIncorrectResult(questionRoot);
  const isAiRetry =
    isIncorrect &&
    Boolean(normalizeText(result.provider)) &&
    Boolean(normalizeText(result.model));
  if (isIncorrect && !isAiRetry) {
    return false;
  }
  if (isAiRetry && !(await reserveRetryAutoSubmit(question))) {
    return false;
  }

  const answerButton = findLinguaportaAnswerButton(questionRoot, isAiRetry);
  if (!answerButton || autoSubmittedButtons.has(answerButton)) {
    return false;
  }
  autoSubmittedButtons.add(answerButton);
  const actionEpoch = runtimeActionEpoch;

  window.setTimeout(() => {
    if (
      actionEpoch !== runtimeActionEpoch ||
      isPaused(currentSettings) ||
      !questionRoot.isConnected ||
      isLinguaportaCorrectResult(questionRoot) ||
      findLinguaportaAnswerButton(questionRoot, isAiRetry) !== answerButton
    ) {
      return;
    }
    answerButton.click();
  }, estimateHumanSubmitDelayMs(question, result.answer));

  return true;
}

function getQuestionRoots() {
  const linguaportaRoot = document.querySelector(LINGUAPORTA_QUESTION_SELECTOR);
  if (linguaportaRoot && isLinguaportaQuestionRoot(linguaportaRoot)) {
    if (isLinguaportaCorrectResult(linguaportaRoot)) {
      return [];
    }
    return [linguaportaRoot];
  }

  const primaryRoots = Array.from(
    document.querySelectorAll(PRIMARY_QUESTION_SELECTOR)
  ).filter((root) => !root.matches(".ordering.dragproxy"));
  if (primaryRoots.length) {
    return primaryRoots;
  }

  const fallbackRoots = Array.from(
    document.querySelectorAll(FALLBACK_QUESTION_SELECTOR)
  );
  if (fallbackRoots.length) {
    return fallbackRoots;
  }

  const derivedRoots = Array.from(document.querySelectorAll(".qtext"))
    .map((questionNode) => getFallbackRootFromQuestionText(questionNode))
    .filter(Boolean);

  return Array.from(new Set(derivedRoots));
}

function getOwningQuestionRoot(element) {
  return (
    element.closest(LINGUAPORTA_QUESTION_SELECTOR) ||
    element.closest(".que") ||
    element.closest("[id^='question-']") ||
    element.closest(".content") ||
    element.closest(".formulation") ||
    element.parentElement
  );
}

function getQuestionLabel(questionRoot) {
  if (isLinguaportaQuestionRoot(questionRoot)) {
    return "Linguaporta Question";
  }

  const qno = normalizeText(questionRoot.querySelector(".qno")?.textContent);
  if (qno) {
    return `Question ${qno}`;
  }

  const heading = normalizeText(questionRoot.querySelector(".no")?.textContent);
  return heading || "Question";
}

function extractQuestionText(questionRoot) {
  if (isLinguaportaQuestionRoot(questionRoot)) {
    return extractLinguaportaQuestionText(questionRoot);
  }

  const questionNode = questionRoot.querySelector(".qtext");
  if (questionNode) {
    return normalizeText(renderNodeText(questionNode));
  }

  const formulation =
    questionRoot.matches(".formulation")
      ? questionRoot
      : questionRoot.querySelector(".formulation");

  if (!formulation) {
    return "";
  }

  return normalizeText(renderNodeText(formulation));
}

function isFormControlFilled(element) {
  if (!element) {
    return false;
  }

  if (element.tagName === "SELECT") {
    const value = normalizeText(element.value);
    // Some matching templates use value="0" for the unselected
    // "Choose..." entry. Treating it as filled suppresses every hint.
    return Boolean(value && value !== "0");
  }

  if (element.type === "checkbox" || element.type === "radio") {
    return Boolean(element.checked);
  }

  return Boolean(normalizeText(element.value));
}

function anyFormControlFilled(elements) {
  return (elements || []).some((element) => isFormControlFilled(element));
}

function answerRootHasExistingAnswer(questionRoot) {
  const answerRoot = getAnswerRoot(questionRoot);
  if (!answerRoot) {
    return false;
  }

  // Linguaporta may preserve the submitted value on a retry page.  A visible
  // #false_msg means that value is an incorrect prior attempt, not a completed
  // answer that should suppress regeneration or automatic correction.
  if (
    isLinguaportaQuestionRoot(questionRoot) &&
    questionRoot.querySelector("#false_msg")
  ) {
    return false;
  }

  // Some checkbox groups pair each visible checkbox with a hidden input
  // carrying the "unchecked" fallback value (e.g. value="0"). That hidden
  // input always has a non-empty value, so it must be excluded here or
  // every checkbox question would look "already answered".
  return anyFormControlFilled(
    Array.from(
      answerRoot.querySelectorAll("input:not([type='hidden']), textarea, select")
    )
  );
}

function extractOptions(questionRoot) {
  const answerRoot = getAnswerRoot(questionRoot);
  if (!answerRoot) {
    return [];
  }

  if (isLinguaportaQuestionRoot(questionRoot)) {
    const results = [];
    const seen = new Set();
    const controls = Array.from(
      answerRoot.querySelectorAll(
        "input[type='radio'], input[type='checkbox'], select"
      )
    );

    for (const control of controls) {
      if (control.tagName === "SELECT") {
        for (const optionText of extractSelectOptions(control)) {
          if (!seen.has(optionText)) {
            seen.add(optionText);
            results.push(optionText);
          }
        }
        continue;
      }

      const text = getLinguaportaControlText(answerRoot, control);
      if (text && !seen.has(text)) {
        seen.add(text);
        results.push(text);
      }
    }

    return results;
  }

  const candidateGroups = [
    answerRoot.querySelectorAll("[data-region='answer-label']"),
    answerRoot.querySelectorAll("label"),
    answerRoot.querySelectorAll("option"),
    answerRoot.querySelectorAll(":scope > div"),
  ];

  const results = [];
  const seen = new Set();

  for (const candidates of candidateGroups) {
    for (const element of candidates) {
      if (
        element.closest(".qtype_multichoice_clearchoice") ||
        (element.matches("option") && !normalizeText(element.value))
      ) {
        continue;
      }

      const text = normalizeText(element.innerText || element.textContent || "");
      if (!text) {
        continue;
      }

      if (
        /^(clear my choice|reset answer)$/i.test(text) ||
        text.includes("\u30af\u30ea\u30a2") ||
        seen.has(text)
      ) {
        continue;
      }

      seen.add(text);
      results.push(text);
    }

    if (results.length) {
      return results;
    }
  }

  return results;
}

function getChoiceTargetType(questionRoot) {
  const answerRoot = getAnswerRoot(questionRoot);
  if (!answerRoot) {
    return "";
  }

  if (isLinguaportaQuestionRoot(questionRoot)) {
    // Some Linguaporta templates place auxiliary radio/select controls in the
    // same form as a real free-text blank (notably listening exercises). The
    // free-text field is the answer target in that layout; treating the whole
    // form as multiple choice makes valid words such as "national" fail the
    // option-membership validator and unnecessarily fall through providers.
    const hasEditableTextAnswer = Array.from(
      answerRoot.querySelectorAll(EDITABLE_TEXT_CONTROL_SELECTOR)
    ).some((control) => !control.disabled && !control.readOnly);
    if (hasEditableTextAnswer) {
      return "";
    }

    const checkboxes = answerRoot.querySelectorAll("input[type='checkbox']");
    if (checkboxes.length) {
      return "multiple_choice";
    }

    if (
      answerRoot.querySelector("input[type='radio']") ||
      answerRoot.querySelector("select")
    ) {
      return "single_choice";
    }

    return "";
  }

  const choiceControls = Array.from(
    answerRoot.querySelectorAll("input[type='radio'], input[type='checkbox']")
  ).filter((input) => !input.closest(".qtype_multichoice_clearchoice"));
  if (!choiceControls.length) {
    return "";
  }

  // Numerical questions may render their unit selector as radios alongside a
  // text input. Those radios are not the answer choices for the question.
  const hasNonChoiceControl = Boolean(
    answerRoot.querySelector(
      "input:not([type='hidden']):not([type='radio']):not([type='checkbox']), textarea, select"
    )
  );
  const isKnownChoiceType = questionRoot.matches(
    ".multichoice, .truefalse, .calculatedmulti"
  );
  if (hasNonChoiceControl && !isKnownChoiceType) {
    return "";
  }

  return choiceControls.some((input) => input.type === "checkbox")
    ? "multiple_choice"
    : "single_choice";
}

function getPromptContainer(subquestion) {
  return (
    subquestion.closest("p, li, td, th") ||
    subquestion.parentElement ||
    subquestion
  );
}

// Walks `root`'s children in document order, collecting rendered text for
// every node that comes strictly BEFORE `targetNode`. When a child contains
// the target (e.g. a <ul> wrapping several <li> blanks), it recurses into
// that child instead of skipping it wholesale, so earlier siblings inside
// the same wrapper (e.g. an earlier <li> in the same list) are still
// captured — then stops, since nothing after that ancestor at this level
// can precede the target. Returns true once the target has been reached.
function collectTextBeforeNode(root, targetNode, collector) {
  for (const child of Array.from(root.children)) {
    if (child === targetNode) {
      return true;
    }

    if (
      child.matches?.(".linguaporta-hint-anchor") ||
      child.matches?.(`#${STATUS_WIDGET_ID}`)
    ) {
      continue;
    }

    if (child.contains(targetNode)) {
      collectTextBeforeNode(child, targetNode, collector);
      return true;
    }

    // Other blanks (e.g. a sibling <li> in the same list) render as a
    // neutral placeholder, not the [blank] marker reserved for the target.
    const text = normalizeText(
      renderNodeText(child, { blankToken: " ___ " })
    );
    if (text) {
      collector.push(text);
    }
  }

  return false;
}

function extractPromptContext(questionRoot, promptContainer) {
  const formulation =
    questionRoot.matches(".formulation")
      ? questionRoot
      : questionRoot.querySelector(".formulation");

  if (!formulation || !promptContainer) {
    return "";
  }

  const contextParts = [];
  collectTextBeforeNode(formulation, promptContainer, contextParts);
  return contextParts.join("\n");
}

function extractSubquestionOptions(subquestion) {
  const select = subquestion.querySelector("select");
  if (!select) {
    return [];
  }

  return Array.from(select.options)
    .filter((option) => {
      const value = normalizeText(option.value);
      return value && value !== "0";
    })
    .map((option) => normalizeText(option.textContent || option.innerText || ""))
    .filter((optionText) => optionText && optionText !== "-");
}

function extractTextAroundSubquestion(promptContainer, subquestion) {
  let before = "";
  let after = "";
  let foundTarget = false;

  for (const childNode of Array.from(promptContainer.childNodes)) {
    const isTargetNode =
      childNode === subquestion ||
      (childNode instanceof Element && childNode.contains(subquestion));

    if (isTargetNode) {
      foundTarget = true;
      continue;
    }

    const text = renderNodeText(childNode);
    if (!text) {
      continue;
    }

    if (foundTarget) {
      after += ` ${text}`;
    } else {
      before += ` ${text}`;
    }
  }

  return {
    before: normalizeText(before),
    after: normalizeText(after),
  };
}

function guessBlankVariableName(before) {
  const normalized = normalizeText(before);

  // Physics/formula style: "I1 = [blank] A" — pull out the "I1".
  const equalsMatch = normalized.match(/([A-Za-z][A-Za-z0-9_]{0,6})\s*=\s*$/);
  if (equalsMatch) {
    return equalsMatch[1];
  }

  // Label style: "元素名1 : [blank]" / "...を表す単位の記号 : [blank]" — use
  // the label text itself so the model gets a real anchor instead of a
  // generic "Blank N"/"Symbol" name that can't distinguish repeated blanks.
  // The label may span multiple sibling nodes (e.g. <strong>...</strong>
  // followed by a plain text node), so allow internal spaces — just not
  // another colon, which would pull in an unrelated earlier clause.
  const colonMatch = normalized.match(/([^:：]{1,40})\s*[:：]\s*$/);
  if (colonMatch) {
    return normalizeText(colonMatch[1]);
  }

  return "";
}

function inferSubquestionFieldInfo(questionRoot, promptContainer, subquestion, index) {
  const { before, after } = extractTextAroundSubquestion(promptContainer, subquestion);
  // The instruction that determines symbol/katakana requirements (e.g.
  // "カタカナで...答えよ") often sits in an earlier paragraph outside this
  // blank's own <li>, not in its immediate before/after text — pull in the
  // broader (correctly document-ordered) preceding context too.
  const broaderContext = extractPromptContext(questionRoot, promptContainer);
  const beforeCompact = `${broaderContext} ${before}`.toLowerCase().replace(/\s+/g, "");
  const afterCompact = after.toLowerCase().replace(/\s+/g, "");
  const variableName = guessBlankVariableName(before);

  const symbolKeywords = [
    /symbol/i,
    /unit/i,
    /\u8A18\u53F7/,
    /\u5358\u4F4D/,
  ];
  const nameKeywords = [
    /name/i,
    /\u540D\u524D/,
    /\u540D\u79F0/,
    /\u30AB\u30BF\u30AB\u30CA/,
  ];

  const beforeHasSymbol = symbolKeywords.some((pattern) => pattern.test(beforeCompact));
  const beforeHasName = nameKeywords.some((pattern) => pattern.test(beforeCompact));
  const afterHasSymbol = symbolKeywords.some((pattern) => pattern.test(afterCompact));
  const afterHasName = nameKeywords.some((pattern) => pattern.test(afterCompact));

  if (beforeHasSymbol || afterHasSymbol) {
    return { type: "symbol", label: "Symbol", variableName };
  }

  if (beforeHasName || afterHasName) {
    return { type: "name", label: "Name", variableName };
  }

  return {
    type: "blank",
    label: `Blank ${index}`,
    variableName,
  };
}

function buildSubquestionText(questionRoot, promptContainer) {
  const contextText = extractPromptContext(questionRoot, promptContainer);
  const promptText = normalizeText(renderNodeText(promptContainer));

  return [contextText, promptText].filter(Boolean).join("\n");
}

function getSubquestionLabel(questionRoot, promptText, index, fieldInfo) {
  const matchedPromptLabel = promptText.match(/question\s*([0-9]+)/i);
  const suffix = fieldInfo?.label ? ` ${fieldInfo.label}` : "";

  if (matchedPromptLabel) {
    return `Question ${matchedPromptLabel[1]}${suffix}`;
  }

  const baseLabel = getQuestionLabel(questionRoot);
  return fieldInfo?.label
    ? `${baseLabel} ${fieldInfo.label}`
    : `${baseLabel} Blank ${index}`;
}

function extractSubquestions() {
  const countsByRoot = new Map();
  const blanksByRoot = new Map();

  const blanks = Array.from(document.querySelectorAll(SUBQUESTION_SELECTOR))
    .map((subquestion) => {
      const questionRoot = getOwningQuestionRoot(subquestion);
      if (!questionRoot) {
        return null;
      }

      const nextIndex = (countsByRoot.get(questionRoot) || 0) + 1;
      countsByRoot.set(questionRoot, nextIndex);

      const promptContainer = getPromptContainer(subquestion);
      const fieldInfo = inferSubquestionFieldInfo(
        questionRoot,
        promptContainer,
        subquestion,
        nextIndex
      );
      const questionText = buildSubquestionText(questionRoot, promptContainer);
      if (!questionText) {
        return null;
      }

      const inputElement = subquestion.querySelector(
        "input:not([type='hidden']), textarea, select"
      );
      const uniqueId =
        inputElement?.id ||
        inputElement?.name ||
        `${getQuestionLabel(questionRoot)}-${nextIndex}`;
      const options = extractSubquestionOptions(subquestion);

      const blank = {
        key: buildQuestionKey(questionText, options, uniqueId),
        label: getSubquestionLabel(
          questionRoot,
          questionText,
          nextIndex,
          fieldInfo
        ),
        questionRoot,
        questionText,
        options,
        anchorElement: promptContainer,
        targetType: fieldInfo.type,
        fieldLabel: fieldInfo.label,
        requestKey: uniqueId,
        uniqueId,
        inputElement,
        variableName: fieldInfo.variableName || "",
        hasExistingAnswer: isFormControlFilled(inputElement),
      };

      const siblingList = blanksByRoot.get(questionRoot) || [];
      siblingList.push(blank);
      blanksByRoot.set(questionRoot, siblingList);

      return blank;
    })
    .filter(Boolean);

  // When a question root has several related free-text blanks (e.g. a
  // multi-part physics problem with I, I1, I2, V3...), solve them jointly in
  // one request instead of one isolated request per blank. Isolated requests
  // can't stay consistent with each other (e.g. re-deriving a different
  // circuit topology for each current, or forgetting a later part builds on
  // an earlier one).
  for (const [questionRoot, group] of blanksByRoot) {
    if (group.length < 2 || group.some((blank) => blank.options.length)) {
      // Groups with dropdown options (e.g. matching-type subquestions) keep
      // using the existing independent per-blank flow.
      continue;
    }

    const formulation = questionRoot.matches(".formulation")
      ? questionRoot
      : questionRoot.querySelector(".formulation");
    if (!formulation) {
      continue;
    }

    const markedText = buildMultiBlankMarkedText(formulation);
    if (!markedText) {
      continue;
    }

    // Prefer a real anchor like "I1" over a generic "Blank 2" so the model
    // has an explicit index-to-quantity mapping, not just the passage text.
    const nameCounts = new Map();
    for (const blank of group) {
      const name = blank.variableName || blank.label;
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    }
    const nameOccurrence = new Map();
    const groupBlanks = group.map((blank) => {
      const baseName = blank.variableName || blank.label;
      let label = baseName;
      if (nameCounts.get(baseName) > 1) {
        // Disambiguate repeated names (e.g. "I" asked again in a later part).
        const occurrence = (nameOccurrence.get(baseName) || 0) + 1;
        nameOccurrence.set(baseName, occurrence);
        label = `${baseName} (occurrence ${occurrence} of ${nameCounts.get(baseName)})`;
      }
      return { label, fieldType: blank.targetType };
    });
    const groupRequestKey = `${group[0].uniqueId}-group`;
    // These are solved together in one request, so if any sibling already
    // has an answer, treat the whole group as already attempted.
    const groupHasExistingAnswer = group.some((blank) => blank.hasExistingAnswer);

    group.forEach((blank, index) => {
      blank.groupMarkedText = markedText;
      blank.groupIndex = index;
      blank.groupBlanks = groupBlanks;
      blank.groupRequestKey = groupRequestKey;
      blank.hasExistingAnswer = groupHasExistingAnswer;
    });
  }

  return blanks;
}

function getImageContainer(questionRoot) {
  if (isLinguaportaQuestionRoot(questionRoot)) {
    return questionRoot.querySelector("#question_area") || questionRoot;
  }

  return (
    questionRoot.querySelector(".qtext") ||
    (questionRoot.matches(".formulation")
      ? questionRoot
      : questionRoot.querySelector(".formulation")) ||
    questionRoot
  );
}

function collectQuestionImageElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll("img")).filter((img) => {
    if (
      img.closest(`.${HINT_PANEL_CLASS}`) ||
      img.closest(".linguaporta-hint-anchor") ||
      img.closest(`#${STATUS_WIDGET_ID}`)
    ) {
      return false;
    }

    // Skip tiny decorations (icons, emoticons) once dimensions are known.
    if (
      img.complete &&
      img.naturalWidth > 0 &&
      (img.naturalWidth < 32 || img.naturalHeight < 32)
    ) {
      return false;
    }

    return Boolean(img.currentSrc || img.src);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read media blob."));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`);
  }

  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large to send: ${url}`);
  }

  return blobToDataUrl(blob);
}

function getImageDataUrl(url) {
  // Cache promises so concurrent scans share one fetch; drop failures so the
  // next scan can retry.
  let promise = imageDataUrlCache.get(url);
  if (!promise) {
    promise = fetchImageAsDataUrl(url).catch((error) => {
      imageDataUrlCache.delete(url);
      throw error;
    });
    imageDataUrlCache.set(url, promise);
  }

  return promise;
}

async function extractQuestionImages(container) {
  const imgElements = collectQuestionImageElements(container).slice(
    0,
    MAX_IMAGES_PER_QUESTION
  );

  const images = [];
  for (const img of imgElements) {
    const url = img.currentSrc || img.src;
    if (!url) {
      continue;
    }

    try {
      const dataUrl = await getImageDataUrl(url);
      images.push({ url, dataUrl });
    } catch (error) {
      console.warn("Failed to load question image:", url, error);
    }
  }

  return images;
}

function collectQuestionAudioUrls(questionRoot) {
  if (!questionRoot) {
    return [];
  }

  const selector = isLinguaportaQuestionRoot(questionRoot)
    ? "audio#sound[src], audio#sound source[src]"
    : "audio[src], audio source[src]";
  const urls = Array.from(
    questionRoot.querySelectorAll(selector)
  )
    .filter((mediaElement) => {
      const hintPanel = mediaElement.closest?.("#hint2");
      if (!hintPanel) {
        return true;
      }

      const inlineHidden =
        hintPanel.hidden || hintPanel.style?.display === "none";
      const computedHidden =
        typeof window.getComputedStyle === "function" &&
        window.getComputedStyle(hintPanel).display === "none";
      return !inlineHidden && !computedHidden;
    })
    .map((mediaElement) => {
      const rawUrl =
        mediaElement.currentSrc ||
        mediaElement.src ||
        mediaElement.getAttribute("src") ||
        "";
      if (!rawUrl) {
        return "";
      }
      try {
        return new URL(rawUrl, window.location.href).href;
      } catch (_error) {
        return "";
      }
    })
    .filter(Boolean);

  return Array.from(new Set(urls)).slice(0, MAX_AUDIO_FILES_PER_QUESTION);
}

function findLinguaportaHintButton(questionRoot) {
  if (!isLinguaportaQuestionRoot(questionRoot)) {
    return null;
  }

  return Array.from(
    questionRoot.querySelectorAll("#hint1 input[type='button'], #hint1 button")
  ).find((button) => {
    const label = normalizeText(button.value || button.textContent);
    return !button.disabled && label === "ヒントを見る";
  }) || null;
}

async function getAiAnswerAttemptCount(question) {
  const fingerprint = getAiAnswerFingerprint(question);
  try {
    const attempts = await getStoredObject(AI_ANSWER_ATTEMPTS_STORAGE_KEY);
    return Math.max(0, Number(attempts[fingerprint]?.count || 0));
  } catch (error) {
    console.warn("Failed to read the Linguaporta answer count:", error);
    return 0;
  }
}

async function prepareOrderingAudioHint(question) {
  if (
    question?.targetType !== "ordering" ||
    !isLinguaportaIncorrectResult(question.questionRoot)
  ) {
    return false;
  }

  const attemptCount = await getAiAnswerAttemptCount(question);
  if (attemptCount !== ORDERING_AUDIO_HINT_AFTER_FAILURES) {
    return false;
  }

  const hintButton = findLinguaportaHintButton(question.questionRoot);
  if (!hintButton) {
    return false;
  }

  hintButton.click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const audioUrls = collectQuestionAudioUrls(question.questionRoot);
  if (!audioUrls.length) {
    return false;
  }

  question.audioSourceUrls = audioUrls;
  question.audios = await extractQuestionAudios(audioUrls);
  return Boolean(question.audios.length || audioUrls.length);
}

async function fetchAudioAsDataUrl(url) {
  // Match Linguaporta's native audio transport closely: same-origin cookies,
  // an explicit byte-range request, and the browser's normal HTTP cache. The
  // site answers these requests with 206 Partial Content (or 200 on servers
  // that ignore Range), both of which contain the complete clip for bytes=0-.
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "default",
    redirect: "follow",
    headers: {
      Accept: "*/*",
      Range: "bytes=0-",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch audio (${response.status}): ${url}`);
  }

  let blob = await response.blob();
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error(`Audio too large to send: ${url}`);
  }

  if (!blob.type.startsWith("audio/")) {
    const extension = new URL(url, window.location.href).pathname
      .split(".")
      .pop()
      ?.toLowerCase();
    const mimeType =
      extension === "wav"
        ? "audio/wav"
        : extension === "ogg"
          ? "audio/ogg"
          : extension === "m4a"
            ? "audio/m4a"
            : "audio/mpeg";
    blob = new Blob([blob], { type: mimeType });
  }

  return blobToDataUrl(blob);
}

function getAudioDataUrl(url) {
  let promise = audioDataUrlCache.get(url);
  if (!promise) {
    promise = fetchAudioAsDataUrl(url).catch((error) => {
      audioDataUrlCache.delete(url);
      throw error;
    });
    audioDataUrlCache.set(url, promise);
  }

  return promise;
}

async function extractQuestionAudios(audioUrls) {
  const audios = [];

  for (const url of audioUrls) {
    try {
      const dataUrl = await getAudioDataUrl(url);
      audios.push({ url, dataUrl });
    } catch (error) {
      console.warn("Failed to load question audio:", url, error);
    }
  }

  return audios;
}

function isLinguaportaListeningQuestion(question) {
  const text = normalizeText(
    question?.groupMarkedText ||
      question?.markedText ||
      question?.questionText ||
      ""
  );
  return LINGUAPORTA_LISTENING_PATTERN.test(text);
}

function findLinguaportaPlayButton(questionRoot) {
  const scope =
    (questionRoot && questionRoot.closest && questionRoot.closest("form")) ||
    document.querySelector("form[name=ExpForm]") ||
    document;
  return scope.querySelector("a.play_button, .play_button") || null;
}

// Start the clip as soon as a listening question is recognized so playback
// happens before the answer is filled in, like a learner listening first.
function playLinguaportaListeningAudio(question) {
  if (!isLinguaportaListeningQuestion(question)) {
    return false;
  }
  const key =
    question?.key ||
    question?.uniqueId ||
    normalizeText(question?.questionText) ||
    "listening";
  if (playedListeningAudioKeys.has(key)) {
    return false;
  }
  const playButton = findLinguaportaPlayButton(question?.questionRoot);
  if (!playButton) {
    return false;
  }
  playedListeningAudioKeys.add(key);
  try {
    playButton.click();
  } catch (_error) {
    // ignore autoplay/policy failures
  }
  return true;
}

async function attachQuestionImages(questions) {
  await Promise.all(
    questions.map(async (question) => {
      const container = getImageContainer(question.questionRoot);
      question.audioSourceUrls = collectQuestionAudioUrls(question.questionRoot);
      if (question.audioSourceUrls.length) {
        playLinguaportaListeningAudio(question);
      }
      [question.images, question.audios] = await Promise.all([
        extractQuestionImages(container),
        extractQuestionAudios(question.audioSourceUrls),
      ]);
      const imageUrls = question.images.map((image) => image.url);
      const audioUrls = question.audioSourceUrls;

      if (question.targetType === "gapfill") {
        question.key =
          buildQuestionKey(
            question.questionText,
            [],
            question.uniqueId || "",
            imageUrls,
            audioUrls
          ) + "#gapfill";
        return;
      }

      question.key = buildQuestionKey(
        question.questionText,
        question.options,
        question.uniqueId || "",
        imageUrls,
        audioUrls
      );
    })
  );

  return questions;
}

// Inline dropdowns can live directly inside .qtext, not inside
// a .subquestion wrapper. Each <select> is one blank sharing the same sentence.
function getInlineSelects(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll("select")).filter(
    (select) =>
      Boolean(select.closest(".qtext")) &&
      !select.closest(SUBQUESTION_SELECTOR)
  );
}

function extractSelectOptions(select) {
  return Array.from(select.options)
    .filter((option) => {
      const value = normalizeText(option.value);
      return value && value !== "0";
    })
    .map((option) => normalizeText(option.textContent || option.innerText || ""))
    .filter((optionText) => optionText && optionText !== "-");
}

function extractOrderingOptions(questionRoot) {
  const linguaportaOptions = extractLinguaportaOrderingOptions(questionRoot);
  if (linguaportaOptions.length) {
    return linguaportaOptions;
  }

  return Array.from(questionRoot.querySelectorAll(ORDERING_ITEM_SELECTOR))
    .map((item) => normalizeText(renderNodeText(item)))
    .filter(Boolean);
}

function getMatchingRows(questionRoot) {
  if (!questionRoot.matches(".match, .randomsamatch")) {
    return [];
  }

  return Array.from(questionRoot.querySelectorAll(MATCHING_ROW_SELECTOR))
    .map((row) => ({
      row,
      stem: normalizeText(renderNodeText(row.querySelector("td.text"))),
      select: row.querySelector("select"),
    }))
    .filter((item) => item.stem && item.select);
}

function buildMatchingMarkedText(questionRoot, rows) {
  const questionText = extractQuestionText(questionRoot);
  const stems = rows.map((item, index) => `[${index + 1}] ${item.stem}`);
  return normalizeText([questionText, ...stems].filter(Boolean).join("\n"));
}

function getClassNumber(element, prefix) {
  const className = Array.from(element?.classList || []).find((name) =>
    new RegExp(`^${prefix}\\d+$`).test(name)
  );
  return className ? Number(className.slice(prefix.length)) : 0;
}

function getDdwtosDrops(questionRoot) {
  if (!questionRoot.matches(".ddwtos")) {
    return [];
  }

  return Array.from(questionRoot.querySelectorAll(DDWTOS_DROP_SELECTOR));
}

function getDdwtosOptions(questionRoot, drop) {
  const group = getClassNumber(drop, "group");
  if (!group) {
    return [];
  }

  return Array.from(
    questionRoot.querySelectorAll(`.answercontainer .draghome.group${group}`)
  )
    .map((choice) => normalizeText(renderNodeText(choice)))
    .filter(Boolean);
}

function ddwtosHasExistingAnswer(questionRoot) {
  return Array.from(questionRoot.querySelectorAll("input.placeinput")).some(
    (input) => {
      const value = normalizeText(input.value);
      return Boolean(value && value !== "0");
    }
  );
}

// The whole sentence with every blank numbered [1], [2], ... so the model can
// reason about all blanks together in a single request.
function buildGapfillMarkedText(container) {
  return normalizeText(
    renderNodeText(container, { selectCounter: { value: 0 } })
  );
}

// The whole passage with every free-text blank numbered [1], [2], ... in
// document order, so a multi-part problem (e.g. several related physics
// answers) can be solved jointly with shared, consistent reasoning instead
// of re-deriving each value from scratch in an isolated request.
function buildMultiBlankMarkedText(formulation) {
  return normalizeText(
    renderNodeText(formulation, { blankCounter: { value: 0 } })
  );
}

function buildGapfillBlanks(selects) {
  return selects.map((select, index) => ({
    label: `空白${index + 1}`,
    options: extractSelectOptions(select),
  }));
}

async function extractQuestions() {
  const gapfillQuestions = [];
  const standardQuestions = [];

  for (const questionRoot of getQuestionRoots()) {
    // Description blocks contain information only, with no
    // response control. Sending it to an API produces a meaningless hint.
    if (questionRoot.matches(".description")) {
      continue;
    }

    if (questionRoot.querySelector(SUBQUESTION_SELECTOR)) {
      continue;
    }

    const uniqueId = isLinguaportaQuestionRoot(questionRoot)
      ? getLinguaportaQuestionId(questionRoot)
      : questionRoot.id || "";
    const container = getImageContainer(questionRoot);
    const inlineSelects = getInlineSelects(container);

    const matchingRows = getMatchingRows(questionRoot);
    if (matchingRows.length) {
      const baseText = extractQuestionText(questionRoot);
      const matchingSelects = matchingRows.map((item) => item.select);
      gapfillQuestions.push({
        key: buildQuestionKey(baseText, [], uniqueId) + "#matching",
        label: getQuestionLabel(questionRoot),
        questionRoot,
        questionText: baseText,
        markedText: buildMatchingMarkedText(questionRoot, matchingRows),
        options: [],
        targetType: "gapfill",
        requestKey: `${uniqueId || baseText}-matching`,
        uniqueId,
        blanks: matchingRows.map((item) => ({
          label: item.stem,
          options: extractSelectOptions(item.select),
        })),
        hasExistingAnswer: anyFormControlFilled(matchingSelects),
        anchorElement:
          questionRoot.querySelector(".formulation") ||
          questionRoot.querySelector(".content") ||
          questionRoot,
      });
      continue;
    }

    const ddwtosDrops = getDdwtosDrops(questionRoot);
    if (ddwtosDrops.length) {
      const baseText = extractQuestionText(questionRoot);
      gapfillQuestions.push({
        key: buildQuestionKey(baseText, [], uniqueId) + "#ddwtos",
        label: getQuestionLabel(questionRoot),
        questionRoot,
        questionText: baseText,
        markedText: buildMultiBlankMarkedText(container),
        options: [],
        targetType: "gapfill",
        requestKey: `${uniqueId || baseText}-ddwtos`,
        uniqueId,
        blanks: ddwtosDrops.map((drop, index) => ({
          label: `空白${index + 1}`,
          options: getDdwtosOptions(questionRoot, drop),
        })),
        hasExistingAnswer: ddwtosHasExistingAnswer(questionRoot),
        anchorElement:
          questionRoot.querySelector(".formulation") ||
          questionRoot.querySelector(".content") ||
          questionRoot,
      });
      continue;
    }

    if (inlineSelects.length) {
      const baseText = extractQuestionText(questionRoot);
      gapfillQuestions.push({
        key: buildQuestionKey(baseText, [], uniqueId) + "#gapfill",
        label: getQuestionLabel(questionRoot),
        questionRoot,
        questionText: baseText,
        markedText: buildGapfillMarkedText(container),
        options: [],
        targetType: "gapfill",
        requestKey: uniqueId || baseText,
        uniqueId,
        blanks: buildGapfillBlanks(inlineSelects),
        hasExistingAnswer: anyFormControlFilled(inlineSelects),
        anchorElement:
          questionRoot.querySelector(".formulation") ||
          questionRoot.querySelector(".content") ||
          questionRoot,
      });
      continue;
    }

    const questionText = extractQuestionText(questionRoot);
    if (!questionText) {
      continue;
    }

    const hasOrderingLayout = hasLinguaportaOrderingLayout(questionRoot);
    const orderingOptions = extractOrderingOptions(questionRoot);
    // select.js initializes CardStyle text about 300 ms after page load. Do
    // not misclassify the question as a normal blank while those cards are
    // still empty; their mutations schedule another scan below.
    if (hasOrderingLayout && !orderingOptions.length) {
      continue;
    }
    const choiceTargetType = getChoiceTargetType(questionRoot);
    const options = orderingOptions.length
      ? orderingOptions
      : choiceTargetType
        ? extractOptions(questionRoot)
        : [];
    const targetType = hasOrderingLayout || orderingOptions.length
      ? "ordering"
      : choiceTargetType === "multiple_choice"
        ? "multiple_choice"
        : questionRoot.matches(".numerical, .calculated, .calculatedsimple")
          ? "number"
          : "standard";
    standardQuestions.push({
      key: buildQuestionKey(questionText, options, uniqueId),
      label: getQuestionLabel(questionRoot),
      questionRoot,
      questionText,
      options,
      targetType,
      requestKey: uniqueId || questionText,
      uniqueId,
      hasExistingAnswer: answerRootHasExistingAnswer(questionRoot),
      anchorElement:
        (isLinguaportaQuestionRoot(questionRoot)
          ? questionRoot.querySelector("#question_area")
          : null) ||
        questionRoot.querySelector(".formulation") ||
        questionRoot.querySelector(".content") ||
        questionRoot,
    });
  }

  const subquestions = extractSubquestions();
  const questions = [
    ...standardQuestions,
    ...gapfillQuestions,
    ...subquestions,
  ];
  await attachQuestionImages(questions);
  return questions;
}

function ensurePanel(question) {
  const existing = Array.from(
    document.querySelectorAll(`.${HINT_PANEL_CLASS}`)
  ).find((panel) => panel.dataset.questionKey === question.key);
  if (existing) {
    placeHintAnchor(question, existing.closest(".linguaporta-hint-anchor"));
    return existing;
  }

  const anchor = document.createElement("div");
  anchor.className = "linguaporta-hint-anchor";
  anchor.dataset.layout = question.targetType === "ordering" ? "ordering" : "standard";

  const isAlreadyAnswered = Boolean(question.hasExistingAnswer);

  const panel = document.createElement("aside");
  panel.className = HINT_PANEL_CLASS;
  panel.dataset.state = isAlreadyAnswered ? "manual" : "idle";
  panel.dataset.questionKey = question.key;
  panel.innerHTML = isAlreadyAnswered
    ? `
    <div class="linguaporta-hint-header">
      <div class="linguaporta-hint-title">${question.label} Hint</div>
      <div class="linguaporta-hint-status">Skipped</div>
    </div>
    <div class="linguaporta-hint-answer">Already answered — hint not generated.</div>
    <div class="linguaporta-hint-reason"></div>
    <div class="linguaporta-hint-meta"></div>
    <div class="linguaporta-hint-actions">
      <button class="linguaporta-hint-retry" type="button">Generate hint</button>
    </div>
  `
    : `
    <div class="linguaporta-hint-header">
      <div class="linguaporta-hint-title">${question.label} Hint</div>
      <div class="linguaporta-hint-status">Queued</div>
    </div>
    <div class="linguaporta-hint-answer">Waiting for turn...</div>
    <div class="linguaporta-hint-reason"></div>
    <div class="linguaporta-hint-meta"></div>
    <div class="linguaporta-hint-actions">
      <button class="linguaporta-hint-retry" type="button">Retry</button>
    </div>
  `;

  anchor.appendChild(panel);

  placeHintAnchor(question, anchor);

  const retryButton = panel.querySelector(".linguaporta-hint-retry");
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      retryHint(question, panel);
    });
  }

  return panel;
}

function placeHintAnchor(question, anchor) {
  if (!anchor || !question?.questionRoot) {
    return;
  }

  const isOrdering = question.targetType === "ordering";
  anchor.dataset.layout = isOrdering ? "ordering" : "standard";

  // CardStyle and DropLine use absolute coordinates and extend below the
  // normal #question_area flow. Inserting the panel directly after that area
  // makes the black line and cards paint across the panel. Put ordering hints
  // after the complete answer form so they cannot affect or cover drag geometry.
  if (isOrdering) {
    const answerForm = question.questionRoot.querySelector("form[name='ExpForm']");
    if (answerForm?.parentNode) {
      answerForm.insertAdjacentElement("afterend", anchor);
      return;
    }
  }

  const anchorTarget =
    question.anchorElement ||
    question.questionRoot.querySelector(".formulation") ||
    question.questionRoot.querySelector(".content") ||
    question.questionRoot;

  if (anchorTarget?.parentNode) {
    anchorTarget.insertAdjacentElement("afterend", anchor);
  } else {
    question.questionRoot.appendChild(anchor);
  }
}

function removePanel(panel) {
  const anchor = panel.closest(".linguaporta-hint-anchor");
  if (anchor) {
    anchor.remove();
    return;
  }

  panel.remove();
}

function cleanupPanels(questions) {
  const validKeys = new Set(questions.map((question) => question.key));
  const seenKeys = new Set();

  for (const panel of Array.from(document.querySelectorAll(`.${HINT_PANEL_CLASS}`))) {
    const key = panel.dataset.questionKey || "";
    if (!validKeys.has(key) || seenKeys.has(key)) {
      removePanel(panel);
      continue;
    }

    seenKeys.add(key);
  }
}

function updatePanel(panel, payload) {
  panel.dataset.state = payload.state;
  panel.querySelector(".linguaporta-hint-status").textContent = payload.status;
  panel.querySelector(".linguaporta-hint-answer").textContent = payload.answer;
  panel.querySelector(".linguaporta-hint-reason").textContent = payload.reason || "";
  panel.querySelector(".linguaporta-hint-meta").textContent = payload.meta || "";

  const retryButton = panel.querySelector(".linguaporta-hint-retry");
  if (retryButton) {
    retryButton.textContent = payload.state === "manual" ? "Generate hint" : "Retry";
  }
}

function retryHint(question, panel) {
  if (isLinguaportaCorrectResult(question.questionRoot)) {
    removePanel(panel);
    return;
  }

  const isFirstGeneration = panel.dataset.state === "manual";

  loadSettings().then((settings) => {
    if (isPaused(settings)) {
      updatePanel(panel, {
        state: "idle",
        status: "Paused",
        answer: getPausedMessage(settings) || "Paused.",
        reason: "",
        meta: "",
      });
      return;
    }

    delete panel.dataset.loadedKey;
    delete panel.dataset.loadingKey;

    const cacheKey = getRequestCacheKey(question, settings);
    answerCache.delete(cacheKey);
    pendingAnswers.delete(cacheKey);

    updatePanel(panel, {
      state: "loading",
      status: isFirstGeneration ? "Loading..." : "Retrying...",
      answer: isFirstGeneration ? "Generating hint..." : "Retrying hint...",
      reason: "",
      meta: "",
    });

    enqueue(() => hydratePanel(question, panel, { force: true }));
  });
}

function clearQueuedTasks() {
  taskQueue.length = 0;
  runtimeState.queueCount = activeRequests;
}

function resetPanelLoadState({ clearLoaded = false } = {}) {
  for (const panel of Array.from(document.querySelectorAll(`.${HINT_PANEL_CLASS}`))) {
    delete panel.dataset.loadingKey;

    if (clearLoaded) {
      delete panel.dataset.loadedKey;
    }
  }
}

function markLoadingPanelsPaused(message) {
  const pausedMessage = message || "Paused.";

  for (const panel of Array.from(document.querySelectorAll(`.${HINT_PANEL_CLASS}`))) {
    if (panel.dataset.state !== "loading") {
      continue;
    }

    updatePanel(panel, {
      state: "idle",
      status: "Paused",
      answer: pausedMessage,
      reason: "",
      meta: "",
    });
  }
}

function getPanelStats() {
  const panels = Array.from(document.querySelectorAll(`.${HINT_PANEL_CLASS}`));

  return panels.reduce(
    (stats, panel) => {
      const state = panel.dataset.state;

      if (state === "ready") {
        stats.readyCount += 1;
      } else if (state === "error") {
        stats.errorCount += 1;
      } else if (state === "loading") {
        stats.loadingCount += 1;
      }

      return stats;
    },
    { readyCount: 0, errorCount: 0, loadingCount: 0 }
  );
}

function parseAnswerText(answerPayload) {
  const answerText =
    typeof answerPayload === "string"
      ? answerPayload
      : answerPayload?.answer || "";
  const modelName = normalizeText(
    typeof answerPayload === "object" ? answerPayload?.model || "" : ""
  );
  const providerName = normalizeText(
    typeof answerPayload === "object" ? answerPayload?.provider || "" : ""
  );
  const audioMode = normalizeText(
    typeof answerPayload === "object" ? answerPayload?.audioMode || "" : ""
  );
  const expression = normalizeText(
    typeof answerPayload === "object" ? answerPayload?.expression || "" : ""
  );

  const answer = String(answerText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!answer) {
    return {
      answer: "No hint available.",
      reason: "",
      meta: "",
    };
  }

  // Fallback events (a provider failing over to the next) are logged in the
  // popup's Logs panel instead of cluttering every hint with them.
  return {
    answer,
    reason: expression ? `式: ${expression}` : "",
    model: modelName,
    provider: providerName,
    audioMode,
    meta: [
      providerName ? `Provider: ${providerName}` : "",
      modelName ? `Model: ${modelName}` : "",
      audioMode ? `Audio: ${audioMode}` : "",
    ].filter(Boolean).join(" | "),
  };
}

function requestAnswer(question) {
  const cacheKey = getRequestCacheKey(question);

  if (answerCache.has(cacheKey)) {
    return Promise.resolve(answerCache.get(cacheKey));
  }

  if (pendingAnswers.has(cacheKey)) {
    return pendingAnswers.get(cacheKey);
  }

  const promise = (async () => {
    await reserveAiAnswerAttempt(question);
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
      {
        action: "getAnswer",
        question: question.questionText,
        options: question.options,
        images: (question.images || []).map((image) => image.dataUrl),
        audios: (question.audios || []).map((audioFile) => audioFile.dataUrl),
        audioUrls: question.audioSourceUrls || [],
        requestKey: question.requestKey || question.key,
        targetType: question.targetType || "standard",
        fieldLabel: question.fieldLabel || "",
        preferOpenAiSol: isLinguaportaIncorrectResult(question.questionRoot),
        rejectedAnswers: extractLinguaportaRejectedAnswers(question.questionRoot),
        detailedMode: Boolean(currentSettings.detailedMode),
        materialMode: Boolean(currentSettings.materialMode),
        materialRevision: Number(currentSettings.materialRevision) || 0,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        const responseError = normalizeText(response?.error || "");
        if (responseError) {
          reject(new Error(responseError));
          return;
        }

        const answer = normalizeText(response?.answer || "");
        if (!answer || /^error fetching answer\.?$/i.test(answer)) {
          reject(new Error("No answer found."));
          return;
        }

        const result = {
          answer,
          model: normalizeText(response?.model || ""),
          provider: normalizeText(response?.provider || ""),
          audioMode: normalizeText(response?.audioMode || ""),
          expression: normalizeText(response?.expression || ""),
          fallbackNote: normalizeText(response?.fallbackNote || ""),
        };

        answerCache.set(cacheKey, result);
        resolve(result);
      }
        );
      });
    } catch (error) {
      await releaseAiAnswerAttempt(question).catch((releaseError) => {
        console.warn("Failed to release unsuccessful AI attempt:", releaseError);
      });
      throw error;
    }
  })().finally(() => {
    pendingAnswers.delete(cacheKey);
  });

  pendingAnswers.set(cacheKey, promise);
  return promise;
}

function enqueue(task) {
  taskQueue.push(task);
  setStatus("running", "Preparing hints...", {
    queueCount: taskQueue.length + activeRequests,
  });
  runQueue();
}

function runQueue() {
  if (isPaused(currentSettings)) {
    return;
  }

  while (activeRequests < MAX_CONCURRENT_REQUESTS && taskQueue.length) {
    const task = taskQueue.shift();
    activeRequests += 1;

    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error("Hint task failed:", error);
      })
      .finally(() => {
        activeRequests -= 1;
        if (taskQueue.length + activeRequests > 0) {
          if (isPaused(currentSettings)) {
            setStatus("idle", getPausedMessage(currentSettings), {
              queueCount: activeRequests,
            });
          } else {
            setStatus("running", "Preparing hints...", {
              queueCount: taskQueue.length + activeRequests,
            });
          }
        }

        if (
          activeRequests === 0 &&
          taskQueue.length === 0 &&
          deferredScanRequested &&
          !isPaused(currentSettings)
        ) {
          deferredScanRequested = false;
          scheduleScan();
        }

        runQueue();
      });
  }
}

function requestGapfillAnswer(question) {
  const cacheKey = getRequestCacheKey(question);

  if (answerCache.has(cacheKey)) {
    return Promise.resolve(answerCache.get(cacheKey));
  }

  if (pendingAnswers.has(cacheKey)) {
    return pendingAnswers.get(cacheKey);
  }

  const promise = (async () => {
    await reserveAiAnswerAttempt(question);
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
      {
        action: "getAnswer",
        question: question.markedText,
        blanks: question.blanks.map((blank) => ({
          label: blank.label,
          options: blank.options,
        })),
        images: (question.images || []).map((image) => image.dataUrl),
        audios: (question.audios || []).map((audioFile) => audioFile.dataUrl),
        audioUrls: question.audioSourceUrls || [],
        requestKey: question.requestKey || question.key,
        targetType: "gapfill",
        preferOpenAiSol: isLinguaportaIncorrectResult(question.questionRoot),
        detailedMode: Boolean(currentSettings.detailedMode),
        materialMode: Boolean(currentSettings.materialMode),
        materialRevision: Number(currentSettings.materialRevision) || 0,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        const responseError = normalizeText(response?.error || "");
        if (responseError) {
          reject(new Error(responseError));
          return;
        }

        const answers = Array.isArray(response?.answers) ? response.answers : [];
        if (!answers.length) {
          reject(new Error("No answer found."));
          return;
        }

        const result = {
          answers,
          model: normalizeText(response?.model || ""),
          provider: normalizeText(response?.provider || ""),
          audioMode: normalizeText(response?.audioMode || ""),
          fallbackNote: normalizeText(response?.fallbackNote || ""),
        };

        answerCache.set(cacheKey, result);
        resolve(result);
      }
        );
      });
    } catch (error) {
      await releaseAiAnswerAttempt(question).catch((releaseError) => {
        console.warn("Failed to release unsuccessful AI attempt:", releaseError);
      });
      throw error;
    }
  })().finally(() => {
    pendingAnswers.delete(cacheKey);
  });

  pendingAnswers.set(cacheKey, promise);
  return promise;
}

async function resolveGapfillAnswers(question) {
  const result = await requestGapfillAnswer(question);
  const lines = result.answers.map(
    (item, index) =>
      `${normalizeText(item?.label) || `空白${index + 1}`}: ${
        normalizeText(item?.answer) || "(不明)"
      }`
  );

  const model = normalizeText(result.model || "");
  const provider = normalizeText(result.provider || "");
  const audioMode = normalizeText(result.audioMode || "");
  const meta = [
    provider ? `Provider: ${provider}` : "",
    model ? `Model: ${model}` : "",
    audioMode ? `Audio: ${audioMode}` : "",
  ].filter(Boolean).join(" | ");

  return {
    answer: lines.join("\n"),
    reason: "",
    model,
    provider,
    audioMode,
    meta,
  };
}

function getGroupRequestCacheKey(question, settings = currentSettings) {
  return JSON.stringify({
    groupKey: question.groupRequestKey || question.groupMarkedText,
    markedText: question.groupMarkedText,
    detailedMode: Boolean(settings.detailedMode),
    materialMode: Boolean(settings.materialMode),
    freeApiMode: Boolean(settings.freeApiMode),
    materialRevision: Number(settings.materialRevision) || 0,
    imageUrls: (question.images || []).map((image) => image.url),
  });
}

function requestGroupBlankAnswers(question) {
  const cacheKey = getGroupRequestCacheKey(question);

  if (answerCache.has(cacheKey)) {
    return Promise.resolve(answerCache.get(cacheKey));
  }

  if (pendingAnswers.has(cacheKey)) {
    return pendingAnswers.get(cacheKey);
  }

  const promise = (async () => {
    await reserveAiAnswerAttempt(question);
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
      {
        action: "getAnswer",
        question: question.groupMarkedText,
        blanks: question.groupBlanks,
        images: (question.images || []).map((image) => image.dataUrl),
        audios: (question.audios || []).map((audioFile) => audioFile.dataUrl),
        audioUrls: question.audioSourceUrls || [],
        requestKey: question.groupRequestKey || question.requestKey || question.key,
        targetType: "multiblank",
        preferOpenAiSol: isLinguaportaIncorrectResult(question.questionRoot),
        detailedMode: Boolean(currentSettings.detailedMode),
        materialMode: Boolean(currentSettings.materialMode),
        materialRevision: Number(currentSettings.materialRevision) || 0,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        const responseError = normalizeText(response?.error || "");
        if (responseError) {
          reject(new Error(responseError));
          return;
        }

        const answers = Array.isArray(response?.answers) ? response.answers : [];
        if (!answers.length) {
          reject(new Error("No answer found."));
          return;
        }

        const result = {
          answers,
          model: normalizeText(response?.model || ""),
          provider: normalizeText(response?.provider || ""),
          audioMode: normalizeText(response?.audioMode || ""),
          fallbackNote: normalizeText(response?.fallbackNote || ""),
        };

        answerCache.set(cacheKey, result);
        resolve(result);
      }
        );
      });
    } catch (error) {
      await releaseAiAnswerAttempt(question).catch((releaseError) => {
        console.warn("Failed to release unsuccessful AI attempt:", releaseError);
      });
      throw error;
    }
  })().finally(() => {
    pendingAnswers.delete(cacheKey);
  });

  pendingAnswers.set(cacheKey, promise);
  return promise;
}

async function resolveGroupBlankAnswer(question) {
  const result = await requestGroupBlankAnswers(question);
  const item = result.answers[question.groupIndex];
  const answer = normalizeText(item?.answer || "");
  if (!answer) {
    throw new Error("No answer found for this blank.");
  }

  const expression = normalizeText(item?.expression || "");
  const model = normalizeText(result.model || "");
  const provider = normalizeText(result.provider || "");
  const audioMode = normalizeText(result.audioMode || "");

  return {
    answer,
    reason: expression ? `式: ${expression}` : "",
    model,
    provider,
    audioMode,
    meta: [
      provider ? `Provider: ${provider}` : "",
      model ? `Model: ${model}` : "",
      audioMode ? `Audio: ${audioMode}` : "",
    ].filter(Boolean).join(" | "),
  };
}

async function hydratePanel(question, panel, options = {}) {
  const force = Boolean(options.force);
  const settings = await loadSettings();

  if (isLinguaportaCorrectResult(question.questionRoot)) {
    removePanel(panel);
    return;
  }

  if (isPaused(settings)) {
    return;
  }

  try {
    await prepareOrderingAudioHint(question);
  } catch (error) {
    console.warn("Failed to prepare the ordering audio hint:", error);
  }

  const loadKey = getRequestCacheKey(question, settings);
  if (
    !force &&
    (panel.dataset.loadedKey === loadKey || panel.dataset.loadingKey === loadKey)
  ) {
    return;
  }

  try {
    panel.dataset.loadingKey = loadKey;
    setStatus("running", `${question.label}: generating hint...`, {
      queueCount: taskQueue.length + activeRequests,
    });
    updatePanel(panel, {
      state: "loading",
      status: "Loading...",
      answer: "Generating hint...",
      reason: "",
      meta: "",
    });

    let parsed;
    const learnedAnswer = await loadLearnedCorrectAnswer(question);
    if (learnedAnswer) {
      parsed = {
        answer: learnedAnswer,
        reason: "以前に正解した保存済み回答を使用しました。",
        provider: "saved",
        model: "correct-answer",
        audioMode: "",
        meta: "Source: saved correct answer",
      };
    } else if (question.blanks && question.blanks.length) {
      parsed = await resolveGapfillAnswers(question);
    } else if (question.groupMarkedText) {
      parsed = await resolveGroupBlankAnswer(question);
    } else {
      parsed = parseAnswerText(await requestAnswer(question));
    }

    // A stop request can happen while the provider call is in flight. Ignore
    // that late result so it cannot fill fields or press page buttons.
    if (isPaused(currentSettings)) {
      updatePanel(panel, {
        state: "idle",
        status: "Stopped",
        answer: getPausedMessage(currentSettings),
        reason: "",
        meta: "",
      });
      return;
    }

    // A result page can replace the answer form while an API request is in
    // flight. Never display or apply that late response after a correct mark.
    if (isLinguaportaCorrectResult(question.questionRoot)) {
      removePanel(panel);
      return;
    }

    const appliedCount = applyLinguaportaAnswer(question, parsed.answer);
    const autoSubmitScheduled =
      appliedCount > 0 &&
      (await scheduleLinguaportaAutoSubmit(question, {
        provider: parsed.provider,
        model: parsed.model,
        answer: parsed.answer,
      }));
    if (autoSubmitScheduled) {
      rememberPendingCorrectAnswer(question, parsed.answer);
    }
    const selectionMeta = [
      appliedCount
        ? `Applied to ${appliedCount} answer field${appliedCount === 1 ? "" : "s"}.`
        : "",
      autoSubmitScheduled ? "Submit: automatic" : "",
    ].filter(Boolean).join(" | ");

    panel.dataset.loadedKey = loadKey;
    runtimeState.readyCount += 1;
    updatePanel(panel, {
      state: "ready",
      status: "Ready",
      answer: parsed.answer,
      reason: parsed.reason,
      meta: [selectionMeta, parsed.meta].filter(Boolean).join(" | "),
    });
    if (!isPaused(currentSettings)) {
      setStatus(
        "running",
        autoSubmitScheduled
          ? `${question.label}: answer ready; submitting...`
          : `${question.label}: hint ready`,
        {
          readyCount: runtimeState.readyCount,
          queueCount: taskQueue.length + activeRequests,
          provider: parsed.provider || "",
          model: parsed.model || "",
          audioMode: parsed.audioMode || "",
        }
      );
    }
  } catch (error) {
    console.error("Failed to fetch answer:", error);
    const answerLimitReached = error?.code === AI_ANSWER_LIMIT_ERROR_CODE;
    if (answerLimitReached) {
      const maxAnswers = Math.max(
        1,
        Number(error?.maxAnswers || getMaxAiAnswersForQuestion(question))
      );
      const revealScheduled = scheduleLinguaportaViewAnswer(question.questionRoot);
      panel.dataset.loadedKey = loadKey;
      updatePanel(panel, {
        state: "limit",
        status: "Stopped",
        answer: `この問題はAIで${maxAnswers}回答済みです。`,
        reason: revealScheduled
          ? "正解を表示して次回用に保存します。"
          : question.targetType === "ordering"
            ? `並び替えのRetry上限（${MAX_ORDERING_AI_RETRIES}回）に達したため、自動再回答を停止しました。`
            : "3回目以降のAPI送信と自動再回答を停止しました。",
        meta: "",
      });
      if (!isPaused(currentSettings)) {
        setStatus(
          "idle",
          revealScheduled
            ? `${question.label}: opening the correct answer...`
            : `${question.label}: AI answer limit reached`,
          {
            queueCount: taskQueue.length + activeRequests,
          }
        );
      }
      return;
    }
    runtimeState.errorCount += 1;
    updatePanel(panel, {
      state: "error",
      status: "Error",
      answer: "Could not fetch hint.",
      reason: normalizeText(error?.message || ""),
      meta: "",
    });
    if (!isPaused(currentSettings)) {
      setStatus("error", `${question.label}: failed to fetch hint`, {
        errorCount: runtimeState.errorCount,
        queueCount: taskQueue.length + activeRequests,
      });
    }
  } finally {
    delete panel.dataset.loadingKey;

    if (activeRequests === 1 && taskQueue.length === 0) {
      if (isPaused(currentSettings)) {
        setStatus("idle", getPausedMessage(currentSettings), {
          queueCount: 0,
        });
        return;
      }

      const nextPhase = runtimeState.readyCount > 0 ? "ready" : "idle";
      const nextMessage =
        runtimeState.readyCount > 0
          ? `Finished. ${runtimeState.readyCount} hint(s) ready.`
          : "No hints prepared yet.";

      setStatus(nextPhase, nextMessage, {
        queueCount: 0,
      });
    }
  }
}

async function processQuestions() {
  ensureStyles();
  ensureStatusWidget();
  const settings = await loadSettings();

  const linguaportaRoot = document.querySelector(LINGUAPORTA_QUESTION_SELECTOR);
  const revealedAnswer = extractLinguaportaRevealedCorrectAnswer(linguaportaRoot);
  if (revealedAnswer) {
    try {
      const learned = await saveLearnedCorrectAnswer(revealedAnswer);
      await clearConfirmedAnswerAttemptState(learned?.fingerprint);
      clearPendingCorrectAnswer();
      deferredScanRequested = false;
      clearQueuedTasks();
      cleanupPanels([]);
      runtimeState.questionCount = 0;
      runtimeState.readyCount = 0;
      runtimeState.errorCount = 0;
      const isAdvancing = scheduleLinguaportaAutoAdvance(linguaportaRoot, {
        allowRevealedAnswer: true,
      });
      setStatus(
        "ready",
        [
          learned?.saved
            ? `Saved correct answer: ${learned.answer}`
            : `Correct answer already saved: ${learned?.answer || revealedAnswer.answer}`,
          isAdvancing
            ? "Moving to the next problem..."
            : "No next problem button found.",
        ].join(" "),
        {
          questionCount: 0,
          readyCount: 1,
          errorCount: 0,
          queueCount: activeRequests,
          provider: "saved",
          model: "correct-answer",
        }
      );
      return;
    } catch (error) {
      console.warn("Failed to save the revealed Linguaporta answer:", error);
    }
  }

  let confirmedLearnedAnswer = null;
  if (isLinguaportaCorrectResult(linguaportaRoot)) {
    try {
      confirmedLearnedAnswer = await promoteConfirmedCorrectAnswer(linguaportaRoot);
    } catch (error) {
      console.warn("Failed to save the confirmed Linguaporta answer:", error);
    }
  }

  setStatus("scanning", "Scanning Linguaporta problem...", {
    provider: "",
    model: "",
    audioMode: "",
  });

  if (isPaused(settings)) {
    setStatus("idle", getPausedMessage(settings), {
      queueCount: activeRequests,
    });
    return;
  }

  if (isLinguaportaCorrectResult(linguaportaRoot)) {
    deferredScanRequested = false;
    clearQueuedTasks();
    cleanupPanels([]);
    runtimeState.questionCount = 0;
    runtimeState.readyCount = 0;
    runtimeState.errorCount = 0;
    const isAdvancing = scheduleLinguaportaAutoAdvance(linguaportaRoot);
    setStatus(
      "idle",
      isAdvancing
        ? confirmedLearnedAnswer?.answer
          ? `Correct answer saved: ${confirmedLearnedAnswer.answer} — moving to the next problem...`
          : "Correct answer — moving to the next problem..."
        : confirmedLearnedAnswer?.answer
          ? `Correct answer saved: ${confirmedLearnedAnswer.answer} — no next problem button found.`
          : "Correct answer — no next problem button found.",
      {
      questionCount: 0,
      readyCount: 0,
      errorCount: 0,
      queueCount: activeRequests,
      }
    );
    return;
  }

  const questions = await extractQuestions();
  cleanupPanels(questions);
  runtimeState.questionCount = questions.length;

  if (!questions.length) {
    setStatus("idle", "No Linguaporta problem found on this page.", {
      questionCount: 0,
      readyCount: 0,
      errorCount: 0,
      queueCount: 0,
    });
    return;
  }

  const panelStats = getPanelStats();
  runtimeState.readyCount = panelStats.readyCount;
  runtimeState.errorCount = panelStats.errorCount;

  setStatus("running", `Found ${questions.length} question(s). Starting...`, {
    questionCount: questions.length,
    readyCount: runtimeState.readyCount,
    errorCount: runtimeState.errorCount,
    queueCount: taskQueue.length + activeRequests,
  });

  let enqueuedCount = 0;

  for (const question of questions) {
    const panel = ensurePanel(question);

    // Left as "manual" on creation because the field already had an answer;
    // never auto-fetch it, only via its own "Generate hint" button.
    if (panel.dataset.state === "manual") {
      continue;
    }

    const loadKey = getRequestCacheKey(question, settings);

    if (
      panel.dataset.loadedKey === loadKey ||
      panel.dataset.loadingKey === loadKey
    ) {
      continue;
    }

    enqueuedCount += 1;
    enqueue(() => hydratePanel(question, panel));
  }

  if (!enqueuedCount && taskQueue.length + activeRequests === 0) {
    const nextPhase =
      runtimeState.errorCount > 0 && runtimeState.readyCount === 0
        ? "error"
        : runtimeState.readyCount > 0
          ? "ready"
          : "idle";

    const nextMessage =
      runtimeState.readyCount > 0
        ? `Finished. ${runtimeState.readyCount} hint(s) ready.`
        : runtimeState.errorCount > 0
          ? "Hints failed to load."
          : "Questions found, but no new work was needed.";

    setStatus(nextPhase, nextMessage, {
      queueCount: 0,
    });
  }
}

function scheduleScan() {
  if (scanScheduled) {
    return;
  }

  if (isPaused(currentSettings)) {
    setStatus("idle", getPausedMessage(currentSettings), {
      queueCount: activeRequests,
    });
    return;
  }

  if (activeRequests > 0 || taskQueue.length > 0) {
    deferredScanRequested = true;
    return;
  }

  scanScheduled = true;
  window.setTimeout(() => {
    scanScheduled = false;
    processQuestions().catch((error) => {
      console.error("Failed to process Linguaporta hints:", error);
      setStatus("error", "Failed to process Linguaporta hints.", {
        queueCount: taskQueue.length + activeRequests,
      });
    });
  }, 250);
}

window.addEventListener("load", scheduleScan);
document.addEventListener("readystatechange", scheduleScan);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  const nextRawSettings = { ...currentSettings };
  let hasRelevantChange = false;

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in changes)) {
      continue;
    }

    nextRawSettings[key] = changes[key].newValue;
    hasRelevantChange = true;
  }

  if (!hasRelevantChange) {
    return;
  }

  const wasPaused = isPaused(currentSettings);
  const nextSettings = normalizeSettings(nextRawSettings);
  const detailedModeChanged =
    nextSettings.detailedMode !== currentSettings.detailedMode;
  const materialChanged =
    nextSettings.materialMode !== currentSettings.materialMode ||
    nextSettings.materialRevision !== currentSettings.materialRevision;
  const apiModeChanged =
    nextSettings.freeApiMode !== currentSettings.freeApiMode ||
    nextSettings.providerRevision !== currentSettings.providerRevision;
  const availabilityChanged =
    nextSettings.enabled !== currentSettings.enabled ||
    nextSettings.pausedUntil !== currentSettings.pausedUntil;

  currentSettings = nextSettings;
  settingsLoaded = true;
  syncStatusWidgetVisibility();

  if (detailedModeChanged || materialChanged || apiModeChanged) {
    answerCache.clear();
    pendingAnswers.clear();
    resetPanelLoadState({ clearLoaded: true });
  }

  if (isPaused(nextSettings)) {
    if (!wasPaused) {
      runtimeActionEpoch += 1;
      autoAdvanceScheduledKey = "";
      autoSubmittedButtons = new WeakSet();
      autoRevealedButtons = new WeakSet();
    }
    deferredScanRequested = false;
    clearQueuedTasks();
    resetPanelLoadState();
    markLoadingPanelsPaused(getPausedMessage(nextSettings));
    setStatus("idle", getPausedMessage(nextSettings), {
      queueCount: activeRequests,
    });
    return;
  }

  if (availabilityChanged || detailedModeChanged || materialChanged || apiModeChanged) {
    scheduleScan();
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action !== "linguaportaContentPing") {
    return false;
  }

  ensureStyles();
  ensureStatusWidget();
  loadSettings(true)
    .then(() => {
      syncStatusWidgetVisibility();
      scheduleScan();
      sendResponse({ ok: true });
    })
    .catch((error) => {
      console.error("Failed to restore the content script UI:", error);
      sendResponse({ ok: false });
    });
  return true;
});

const QUESTION_CONTENT_SELECTOR =
  ".que, .qtext, .formulation, .subquestion, .answer, #problem-area, #question_area, #drill_form, #true_msg, #false_msg, .problem-next-group, .button-next-problem, .qu03, .qu03_line, .DropLine, .CardStyle, audio, source, select, textarea";

// Only a node that adds/removes real question content should trigger a rescan.
// This ignores timers, autosave markers, tooltips, and our own panels,
// which otherwise mutate constantly and cause the same question to be re-solved.
function isQuestionRelevantNode(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  if (
    node.closest(".linguaporta-hint-anchor") ||
    node.closest(`#${STATUS_WIDGET_ID}`)
  ) {
    return false;
  }

  return (
    node.matches(QUESTION_CONTENT_SELECTOR) ||
    Boolean(node.querySelector?.(QUESTION_CONTENT_SELECTOR))
  );
}

const observer = new MutationObserver((mutations) => {
  const shouldScan = mutations.some((mutation) => {
    const mutationTarget =
      mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement;

    if (
      mutationTarget &&
      (mutationTarget.closest(".linguaporta-hint-anchor") ||
        mutationTarget.closest(`#${STATUS_WIDGET_ID}`))
    ) {
      return false;
    }

    if (
      mutationTarget?.closest(
        "#true_msg, #false_msg, .CardStyle, .DropLine, audio"
      )
    ) {
      return true;
    }

    return (
      Array.from(mutation.addedNodes).some(isQuestionRelevantNode) ||
      Array.from(mutation.removedNodes).some(isQuestionRelevantNode)
    );
  });

  if (shouldScan) {
    scheduleScan();
  }
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
} else {
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      scheduleScan();
    },
    { once: true }
  );
}

scheduleScan();
