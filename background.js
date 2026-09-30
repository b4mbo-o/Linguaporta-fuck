const PROVIDER_OPENAI = "openai";
const PROVIDER_OPENROUTER = "openrouter";
const PROVIDER_GEMINI = "gemini";
const PROVIDER_CUSTOM_LLM = "custom_llm";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-transcribe";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY_ENDPOINT = "https://openrouter.ai/api/v1/key";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_APP_URL = "https://openrouter.ai";
const OPENROUTER_APP_TITLE = "LinguaportaFuck";

// Start with the fastest cost-sensitive GPT-5.6 model. If the request fails
// or its answer is rejected by validation, the existing plan loop escalates
// to Terra for a stronger second attempt.
const OPENAI_MODEL_IDS = ["gpt-5.6-luna", "gpt-5.6-terra"];
const OPENAI_SOL_MODEL_ID = "gpt-5.6-sol";

const OPENROUTER_GEMINI_STANDARD_MODEL_IDS = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "google/gemini-2.0-flash-lite-001",
];
const OPENROUTER_GEMINI_MATERIAL_ACCURACY_MODEL_IDS = [
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
];
const OPENROUTER_GEMINI_DETAILED_MODEL_IDS = [
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
];
// flash-lite's vision is noticeably weaker than flash's (e.g. misreading
// circuit diagrams). When a question has attached images and we're on a
// paid chain (not the free OpenRouter models), prefer flash first.
const OPENROUTER_GEMINI_IMAGE_MODEL_IDS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.0-flash-001",
  "google/gemini-2.0-flash-lite-001",
];
const OPENROUTER_FREE_STANDARD_MODEL_IDS = [
  "qwen/qwen3-coder:free",
  "deepseek/deepseek-v4-flash:free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free",
];
const OPENROUTER_FREE_MATERIAL_ACCURACY_MODEL_IDS = [
  "qwen/qwen3-coder:free",
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-4-31b-it:free",
];
// Direct Gemini API access. Gemini 2.5 is no longer available to new users;
// 3.8 Flash is the current stable multimodal model and accepts audio input.
const GEMINI_STANDARD_MODEL_IDS = ["gemini-3.8-flash"];
const GEMINI_MATERIAL_ACCURACY_MODEL_IDS = ["gemini-3.8-flash"];
const GEMINI_DETAILED_MODEL_IDS = ["gemini-3.8-flash"];
const GEMINI_IMAGE_MODEL_IDS = ["gemini-3.8-flash"];
// Prefer OpenAI's official API on fresh installs. Providers without a saved
// key are skipped, so Gemini and OpenRouter remain usable fallbacks.
const DEFAULT_PROVIDER_ORDER = [
  PROVIDER_OPENAI,
  PROVIDER_GEMINI,
  PROVIDER_OPENROUTER,
];
const MATERIAL_CONTEXT_MAX_CHARS = 120000;
const MATERIAL_REFERENCE_MAX_CHARS = 9000;
const MATERIAL_CHUNK_MAX_CHARS = 1400;
const MATERIAL_TOP_CHUNKS = 4;
const MATERIAL_MAX_TERMS = 40;
const REQUEST_MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 15000;
const AUDIO_TRANSCRIPTION_TIMEOUT_MS = 30000;
const REQUEST_MAX_BACKOFF_MS = 15000;
const AI_REQUEST_MAX_CONCURRENT = 2;
const AI_REQUEST_MIN_INTERVAL_MS = 350;
const OPENROUTER_FREE_MODEL_MAX_ATTEMPTS = 3;
const OPENROUTER_KEY_STATUS_TTL_MS = 60 * 1000;
const MAX_REQUEST_IMAGES = 4;
const MAX_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024;
const MAX_REQUEST_AUDIO_FILES = 1;
const MAX_AUDIO_DATA_URL_LENGTH = 16 * 1024 * 1024;
const MAX_REMOTE_AUDIO_BYTES = 12 * 1024 * 1024;
const IMAGE_QUESTION_MIN_TOKENS = 96;
// Models that cannot read images; skipped when the question has attachments.
const NON_VISION_MODEL_PATTERN = /gpt-oss|qwen3-coder|deepseek/i;
// Custom models in these families are commonly selected for listening,
// transcription, or speech-oriented work. Only then may an audio question
// promote Gemini ahead of the provider order configured in the popup.
const CUSTOM_LLM_GEMINI_AUDIO_PRIORITY_PATTERN =
  /(?:audio|speech|voice|whisper|transcrib|(?:^|[\/_-])asr(?:$|[\/_-])|(?:^|[\/_-])stt(?:$|[\/_-])|voxtral|ultravox|realtime|omni)/i;
const CUSTOM_LLM_PLAMO_PATTERN = /plamo/i;
const WORD_QUESTION_PATTERN =
  /(?:\u5358\u8A9E|\u8A9E\u53E5|\u610F\u5473|\u65E5\u672C\u6587|\u82F1\u6587|\u82F1\u8A9E|\u548C\u8A33|\u7A7A\u6240|\u7A7A\u6B04|\u8A33|\[blank\]|\bword\b|\bphrase\b|\bmeaning\b|\btranslate\b|\bvocabulary\b)/i;
const MATERIAL_DEFAULTS = {
  materialMode: false,
  materialContext: "",
  materialSources: [],
  materialRevision: 0,
  freeApiMode: false,
  apiProviders: DEFAULT_PROVIDER_ORDER,
  openaiApiKey: "",
  openrouterApiKey: "",
  geminiApiKey: "",
  customLlmEndpoint: "",
  customLlmModel: "",
  customLlmApiKey: "",
  apiKey: "",
};

const SYSTEM_PROMPT =
  "You solve Linguaporta learning exercises. " +
  "Never greet, chat casually, mention being an assistant, or ask follow-up questions. " +
  "Use the language required by the answer field; when an English sentence contains [blank], answer in English even if its instructions are Japanese. " +
  "Otherwise, when the question is in Japanese, answer in Japanese. " +
  "Follow the exact output format described in the question's instructions. " +
  "Return only the final answer on one line, with no extra words, labels, or punctuation around it.";

const INVALID_ANSWER_PATTERNS = [
  /\bhello\b/i,
  /\bhi\b/i,
  /how can i assist/i,
  /how can i help/i,
  /i(?:'| a)m here to help/i,
  /assist you today/i,
  /as an ai/i,
  /please provide/i,
  /^certainly[.!]?$/i,
  /^of course[.!]?$/i,
];

const NUMBER_QUESTION_PATTERN =
  /(?:\u4F55\u500B|\u3044\u304F\u3064|\u4F55\u4EBA|\u4F55\u56DE|\u4F55\u672C|\u4F55\u679A|\u4F55\u6B73|\u4F55\u70B9|\u4F55%|\u4F55\u30D1\u30FC\u30BB\u30F3\u30C8|\u4F55\u4E57|\u6307\u6570|\[blank\]\s*\u4E57|\u4E57\u3067\u3042\u308B|\u6C42\u3081\u3088|\u6C42\u3081\u306A\u3055\u3044|\u8A08\u7B97\u305B\u3088|\u8A08\u7B97\u3057\u306A\u3055\u3044|\u5408\u6210\u62B5\u6297|\u5408\u6210\u96FB\u5727|\u5408\u6210\u96FB\u6D41|\u5408\u6210\u9759\u96FB\u5BB9\u91CF|\u5408\u6210\u5BB9\u91CF|\u306E\u5024(?:\u306F|\u3092)|\u4F55[A-Za-z\u03A9\u03BC\u00B0]|\u4F55(?:\u30DC\u30EB\u30C8|\u30A2\u30F3\u30DA\u30A2|\u30AA\u30FC\u30E0|\u30EF\u30C3\u30C8|\u30D8\u30EB\u30C4|\u30B8\u30E5\u30FC\u30EB|\u30CB\u30E5\u30FC\u30C8\u30F3|\u30D1\u30B9\u30AB\u30EB|\u30B1\u30EB\u30D3\u30F3)|\bhow many\b|\bhow much\b|\bnumber of\b|\bcount\b|\bexponent\b|\bpower\b|\bcalculate\b|\bcalculation\b|\bcompute\b|\bcomputed\b)/i;
const SYMBOL_ANSWER_PATTERN =
  /^(?:[A-Za-z\u00B5\u03BC\u0370-\u03FF]{1,4}|(?:<=|>=|!=|==|->|=>|[<>\u007C\u2264\u2265=\u2260\u2248~+\-\u2212*\u00D7\u00F7\/\u00B1%\u2030\u00B0^\u221A\u221E\u2211\u222B\u2202\u2206\u0394]){1,8})$/u;
const SYMBOL_OPERATOR_PATTERN =
  /(?:<=|>=|!=|==|->|=>|[<>\u007C\u2264\u2265=\u2260\u2248~+\-\u2212*\u00D7\u00F7\/\u00B1%\u2030\u00B0^\u221A\u221E\u2211\u222B\u2202\u2206\u0394])/u;
const SYMBOL_TEXT_PATTERN =
  /\b(?:da|[fpnumcdhkMGTP]|mu|pi|theta|lambda|alpha|beta|gamma|delta|omega)\b|[\u00B5\u03BC\u0370-\u03FF]/u;
const SHORT_CODE_ANSWER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._+:/@-]{0,80}$/;
const SHELL_COMMAND_ANSWER_PATTERN =
  /^[A-Za-z][A-Za-z0-9._+-]*(?:\s+[A-Za-z0-9._+:/@%*?\[\]{}$~=-]+){1,8}$/;

const answerCache = new Map();
const audioTranscriptionCache = new Map();
const aiRequestQueue = [];
const openRouterRuntimeState = {
  keyStatusExpiresAt: 0,
  keyLimitRemaining: null,
};
let activeAiRequests = 0;
let aiRequestRunnerScheduled = false;
let lastAiRequestStartedAt = 0;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeMaterialContext(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s"'`.,!?;:()[\]{}<>/\\|_~-]+/g, "");
}

function containsJapanese(text) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function sanitizeImages(images) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .filter((value) => typeof value === "string" && value.startsWith("data:image/"))
    .filter((value) => value.length <= MAX_IMAGE_DATA_URL_LENGTH)
    .slice(0, MAX_REQUEST_IMAGES);
}

function sanitizeAudios(audios) {
  if (!Array.isArray(audios)) {
    return [];
  }

  return audios
    .filter((value) => typeof value === "string" && value.startsWith("data:audio/"))
    .filter((value) => value.length <= MAX_AUDIO_DATA_URL_LENGTH)
    .slice(0, MAX_REQUEST_AUDIO_FILES);
}

function sanitizeRemoteAudioUrls(audioUrls) {
  if (!Array.isArray(audioUrls)) {
    return [];
  }

  const results = [];
  for (const value of audioUrls) {
    try {
      const url = new URL(String(value || ""));
      const hostname = url.hostname.toLowerCase();
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !(hostname === "linguaporta.jp" || hostname.endsWith(".linguaporta.jp"))
      ) {
        continue;
      }
      results.push(url.href);
    } catch (_error) {
      // Ignore malformed or non-Linguaporta media URLs.
    }
  }
  return Array.from(new Set(results)).slice(0, MAX_REQUEST_AUDIO_FILES);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function inferAudioMimeType(url, responseType = "") {
  const normalizedType = normalizeText(responseType).split(";")[0].toLowerCase();
  if (normalizedType.startsWith("audio/")) {
    return normalizedType;
  }

  let extension = "";
  try {
    extension = new URL(url).pathname.split(".").pop()?.toLowerCase() || "";
  } catch (_error) {
    extension = "";
  }
  if (extension === "wav") return "audio/wav";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "m4a" || extension === "mp4") return "audio/mp4";
  if (extension === "webm") return "audio/webm";
  if (extension === "flac") return "audio/flac";
  return "audio/mpeg";
}

async function fetchRemoteAudioAsDataUrl(url) {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Audio download failed (${response.status}).`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_REMOTE_AUDIO_BYTES) {
      throw new Error("Audio download was empty or too large.");
    }
    const mimeType = inferAudioMimeType(
      url,
      response.headers.get("content-type") || ""
    );
    return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Audio download timed out.");
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function resolveRequestAudios(audios, audioUrls) {
  const cleanedAudios = sanitizeAudios(audios);
  if (cleanedAudios.length) {
    return cleanedAudios;
  }

  for (const url of sanitizeRemoteAudioUrls(audioUrls)) {
    try {
      const dataUrl = await fetchRemoteAudioAsDataUrl(url);
      const resolved = sanitizeAudios([dataUrl]);
      if (resolved.length) {
        return resolved;
      }
    } catch (error) {
      console.warn("Background audio download failed:", url, error);
    }
  }

  return [];
}

function isEnglishBlankQuestion(question) {
  if (!/\[blank\]/i.test(String(question || ""))) {
    return false;
  }

  const englishWords = String(question || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  return englishWords.length >= 3;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!match) {
    return null;
  }

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const data = match[3] || "";
  if (!data) {
    return null;
  }

  return {
    mimeType,
    base64: isBase64 ? data : btoa(unescape(encodeURIComponent(data))),
  };
}

function getAudioFilename(mimeType) {
  const extensionByMimeType = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/flac": "flac",
  };
  return `linguaporta-audio.${extensionByMimeType[mimeType] || "mp3"}`;
}

function decodeBase64Bytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getAudioTranscriptionCacheKey(dataUrl) {
  const value = String(dataUrl || "");
  return `${value.length}:${value.slice(0, 96)}:${value.slice(-96)}`;
}

async function transcribeOpenAiAudio(dataUrl, credentials, question = "") {
  const audio = parseDataUrl(dataUrl);
  if (!audio || !audio.mimeType.startsWith("audio/")) {
    throw new Error("OpenAI transcription received invalid audio data.");
  }

  const rawKey = normalizeText(credentials?.openaiApiKey);
  if (!rawKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const formData = new FormData();
  const audioBlob = new Blob([decodeBase64Bytes(audio.base64)], {
    type: audio.mimeType,
  });
  formData.append("file", audioBlob, getAudioFilename(audio.mimeType));
  formData.append("model", OPENAI_TRANSCRIPTION_MODEL);

  const prompt = normalizeText(question).slice(0, 500);
  if (prompt) {
    formData.append(
      "prompt",
      `Transcribe the spoken English exactly for this language exercise. Visible exercise context: ${prompt}`
    );
  }

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), AUDIO_TRANSCRIPTION_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(OPENAI_TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: /^Bearer\s+/i.test(rawKey) ? rawKey : `Bearer ${rawKey}`,
      },
      body: formData,
      signal: controller?.signal,
    });
    const data = await readJsonResponse(response);
    const transcript = normalizeText(data?.text);
    if (!transcript) {
      throw new Error("OpenAI transcription returned an empty result.");
    }
    return transcript;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `OpenAI transcription timed out after ${Math.round(
          AUDIO_TRANSCRIPTION_TIMEOUT_MS / 1000
        )}s.`
      );
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getOpenAiAudioTranscript(dataUrl, credentials, question = "") {
  const cacheKey = getAudioTranscriptionCacheKey(dataUrl);
  if (audioTranscriptionCache.has(cacheKey)) {
    return audioTranscriptionCache.get(cacheKey);
  }

  const transcription = transcribeOpenAiAudio(dataUrl, credentials, question).catch(
    (error) => {
      audioTranscriptionCache.delete(cacheKey);
      throw error;
    }
  );
  audioTranscriptionCache.set(cacheKey, transcription);
  return transcription;
}

function parseRetryAfterMs(value) {
  const raw = normalizeText(value);
  if (!raw) {
    return 0;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw) * 1000;
  }

  const epochMs = Date.parse(raw);
  if (!Number.isNaN(epochMs)) {
    return Math.max(0, epochMs - Date.now());
  }

  return 0;
}

function createHttpError(message, options = {}) {
  const error = new Error(message);
  error.status = Number(options.status) || 0;
  error.isRateLimit = Boolean(options.isRateLimit);
  error.isAuthError = Boolean(options.isAuthError);
  error.skipRemainingProvider = Boolean(options.skipRemainingProvider);
  error.retryAfterMs = Number(options.retryAfterMs) || 0;
  return error;
}

function isRateLimitText(text) {
  return /rate[\s-]?limit|too many requests/i.test(normalizeText(text));
}

function isInvalidApiKeyText(text) {
  return /invalid\s*api\s*key|invalid\s*apikey|api\s*key\s*not\s*valid|unauthorized|forbidden|no\s*auth\s*credentials/i.test(
    normalizeText(text)
  );
}

function isQuotaOrBalanceText(text) {
  return /quota|resource[_\s-]*exhausted|rate[\s-]?limit|too many requests|billing|balance|credit|insufficient|payment required|exceeded|exhausted/i.test(
    normalizeText(text)
  );
}

function isGeminiQuotaOrBalanceError(error) {
  if (!error) {
    return false;
  }

  const status = Number(error.status) || 0;
  if (status === 429 || status === 402) {
    return true;
  }

  const message = normalizeText(error.message);
  return (status === 403 && isQuotaOrBalanceText(message)) || isQuotaOrBalanceText(message);
}

function isRetryableError(error) {
  if (!error) {
    return false;
  }

  if (error.isRateLimit) {
    return true;
  }

  if (error.status === 429) {
    return true;
  }

  if (error.status >= 500) {
    return true;
  }

  const message = normalizeText(error.message).toLowerCase();
  return /timeout|network|fetch failed|temporar|connection reset|econnreset|eai_again/i.test(
    message
  );
}

function getRetryDelayMs(error, attemptIndex) {
  const retryAfterMs = Number(error?.retryAfterMs) || 0;
  if (retryAfterMs > 0) {
    return Math.min(retryAfterMs, REQUEST_MAX_BACKOFF_MS);
  }

  const baseMs = error?.isRateLimit ? 1200 : 700;
  const exponentialMs = baseMs * Math.pow(2, Math.max(0, attemptIndex));
  const jitterMs = Math.floor(Math.random() * 250);
  return Math.min(exponentialMs + jitterMs, REQUEST_MAX_BACKOFF_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function enqueueAiRequest(task) {
  return new Promise((resolve, reject) => {
    aiRequestQueue.push({ task, resolve, reject });
    runAiRequestQueue();
  });
}

function scheduleAiRequestQueue(delayMs) {
  if (aiRequestRunnerScheduled) {
    return;
  }

  aiRequestRunnerScheduled = true;
  setTimeout(() => {
    aiRequestRunnerScheduled = false;
    runAiRequestQueue();
  }, Math.max(0, delayMs));
}

function runAiRequestQueue() {
  if (activeAiRequests >= AI_REQUEST_MAX_CONCURRENT || !aiRequestQueue.length) {
    return;
  }

  const waitMs = Math.max(
    0,
    lastAiRequestStartedAt + AI_REQUEST_MIN_INTERVAL_MS - Date.now()
  );
  if (waitMs > 0) {
    scheduleAiRequestQueue(waitMs);
    return;
  }

  const job = aiRequestQueue.shift();
  activeAiRequests += 1;
  lastAiRequestStartedAt = Date.now();

  Promise.resolve()
    .then(job.task)
    .then(job.resolve, job.reject)
    .finally(() => {
      activeAiRequests -= 1;
      runAiRequestQueue();
    });
}

function isOpenRouterFreeModel(modelId) {
  const normalized = normalizeText(modelId).toLowerCase();
  return normalized === "openrouter/free" || normalized.endsWith(":free");
}

function isOpenRouterFreeLimitMessage(message) {
  const text = normalizeText(message).toLowerCase();
  if (!text) {
    return false;
  }

  return /free-models-per-min|free-models-per-day|free tier|free-tier|insufficient credits|credit limit reached|quota exceeded|payment required|limit_remaining|limit remaining/.test(
    text
  );
}

function extractOpenRouterLimitRemaining(data) {
  const nestedValue = Number(data?.data?.limit_remaining);
  if (Number.isFinite(nestedValue)) {
    return nestedValue;
  }

  const directValue = Number(data?.limit_remaining);
  if (Number.isFinite(directValue)) {
    return directValue;
  }

  return null;
}

async function getOpenRouterKeyStatus(credentials) {
  const now = Date.now();
  if (openRouterRuntimeState.keyStatusExpiresAt > now) {
    return {
      limitRemaining: openRouterRuntimeState.keyLimitRemaining,
    };
  }

  try {
    const response = await fetch(OPENROUTER_KEY_ENDPOINT, {
      method: "GET",
      headers: buildRequestHeaders(PROVIDER_OPENROUTER, credentials),
    });
    const data = await readJsonResponse(response);
    openRouterRuntimeState.keyLimitRemaining = extractOpenRouterLimitRemaining(
      data
    );
  } catch (error) {
    openRouterRuntimeState.keyLimitRemaining = null;
    console.warn("OpenRouter key status check failed:", error);
  } finally {
    openRouterRuntimeState.keyStatusExpiresAt = now + OPENROUTER_KEY_STATUS_TTL_MS;
  }

  return {
    limitRemaining: openRouterRuntimeState.keyLimitRemaining,
  };
}

async function resolveOpenRouterBudgetMode(credentials) {
  const keyStatus = await getOpenRouterKeyStatus(credentials);
  if (
    typeof keyStatus.limitRemaining === "number" &&
    keyStatus.limitRemaining <= 0
  ) {
    return "free_only";
  }

  if (
    typeof keyStatus.limitRemaining === "number" &&
    keyStatus.limitRemaining > 0
  ) {
    return "free_then_paid";
  }

  return "free_then_paid";
}

function buildRequestHeaders(providerId, credentials) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (providerId === PROVIDER_GEMINI) {
    const geminiApiKey = normalizeText(credentials?.geminiApiKey).replace(
      /^Bearer\s+/i,
      ""
    );
    if (geminiApiKey) {
      headers["x-goog-api-key"] = geminiApiKey;
    }
    return headers;
  }

  const rawKey =
    providerId === PROVIDER_OPENROUTER
      ? normalizeText(credentials?.openrouterApiKey)
      : providerId === PROVIDER_CUSTOM_LLM
        ? normalizeText(credentials?.customLlmApiKey)
        : normalizeText(credentials?.openaiApiKey);

  if (!rawKey) {
    return headers;
  }

  const hasBearerPrefix = /^Bearer\s+/i.test(rawKey);
  headers.Authorization = hasBearerPrefix ? rawKey : `Bearer ${rawKey}`;

  if (providerId === PROVIDER_OPENROUTER) {
    headers["HTTP-Referer"] = OPENROUTER_APP_URL;
    headers["X-OpenRouter-Title"] = OPENROUTER_APP_TITLE;
  }

  return headers;
}

function normalizeMaterialSources(sources) {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .map((source) => ({
      name: normalizeText(source?.name || "").slice(0, 120),
      kind: normalizeText(source?.kind || "").toLowerCase().slice(0, 40),
      chars: Number(source?.chars) || 0,
    }))
    .filter((source) => source.name && source.chars > 0);
}

function normalizeProviderOrder(providers) {
  const rawProviders = Array.isArray(providers) ? providers : [];
  const allowed = new Set([
    PROVIDER_OPENAI,
    PROVIDER_OPENROUTER,
    PROVIDER_GEMINI,
    PROVIDER_CUSTOM_LLM,
  ]);
  const seen = new Set();
  const normalized = [];

  for (const provider of rawProviders) {
    const storedProvider = normalizeText(provider).toLowerCase();
    // Migrate installations that had the removed anonymous provider enabled.
    const cleaned = storedProvider === "capi" ? PROVIDER_OPENAI : storedProvider;
    if (!allowed.has(cleaned) || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    normalized.push(cleaned);
  }

  if (!normalized.length) {
    return [...DEFAULT_PROVIDER_ORDER];
  }

  return normalized;
}

function shouldPreferGeminiForCustomAudio(providerOrder, credentials, hasAudio) {
  if (!hasAudio) {
    return false;
  }

  const normalizedProviders = normalizeProviderOrder(providerOrder);
  if (!normalizedProviders.includes(PROVIDER_CUSTOM_LLM)) {
    return false;
  }

  return CUSTOM_LLM_GEMINI_AUDIO_PRIORITY_PATTERN.test(
    normalizeText(credentials?.customLlmModel)
  );
}

function moveProviderFirst(providerOrder, providerId) {
  const normalizedProviders = normalizeProviderOrder(providerOrder);
  if (!normalizedProviders.includes(providerId)) {
    return normalizedProviders;
  }

  return [
    providerId,
    ...normalizedProviders.filter((candidate) => candidate !== providerId),
  ];
}

function shouldPreferPlaMoForWordQuestion(
  question,
  options,
  targetType,
  providerOrder,
  credentials,
  hasAudio
) {
  if (hasAudio || !WORD_QUESTION_PATTERN.test(normalizeText(question))) {
    return false;
  }

  const answerMode = detectAnswerMode(question, options, targetType);
  if (["number", "ordering", "symbol"].includes(answerMode)) {
    return false;
  }

  return (
    normalizeProviderOrder(providerOrder).includes(PROVIDER_CUSTOM_LLM) &&
    CUSTOM_LLM_PLAMO_PATTERN.test(normalizeText(credentials?.customLlmModel))
  );
}

function getEffectiveProviderOrderForQuestion(
  question,
  options,
  targetType,
  providerOrder,
  credentials,
  hasAudio,
  preferOpenAiSol
) {
  const normalizedProviders = normalizeProviderOrder(providerOrder);

  // A site-marked wrong answer is retried with OpenAI Sol first, regardless
  // of the normal order or the PlaMo word-question preference.
  if (preferOpenAiSol && normalizedProviders.includes(PROVIDER_OPENAI)) {
    return moveProviderFirst(normalizedProviders, PROVIDER_OPENAI);
  }

  if (
    shouldPreferPlaMoForWordQuestion(
      question,
      options,
      targetType,
      normalizedProviders,
      credentials,
      hasAudio
    )
  ) {
    return moveProviderFirst(normalizedProviders, PROVIDER_CUSTOM_LLM);
  }

  if (
    shouldPreferGeminiForCustomAudio(
      normalizedProviders,
      credentials,
      hasAudio
    )
  ) {
    return moveProviderFirst(normalizedProviders, PROVIDER_GEMINI);
  }

  return normalizedProviders;
}

function dedupeModels(modelIds) {
  const seen = new Set();
  const models = [];

  for (const modelId of modelIds) {
    const cleaned = normalizeText(modelId);
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    models.push(cleaned);
  }

  return models;
}

function getModelChain(
  providerId,
  useAccuracyProfile = false,
  modelPolicy = {}
) {
  if (providerId === PROVIDER_OPENROUTER) {
    const useDetailedProfile = Boolean(
      modelPolicy?.detailedMode || modelPolicy?.preferOpenAiSol
    );
    const freeApiMode = Boolean(modelPolicy?.freeApiMode);
    // Only escalate past flash-lite on the paid chain — the free OpenRouter
    // models are unaffected by image content.
    const useImageProfile =
      Boolean(modelPolicy?.hasImages) &&
      !useDetailedProfile &&
      !useAccuracyProfile &&
      !freeApiMode;
    const freeModels = useAccuracyProfile
      ? dedupeModels(OPENROUTER_FREE_MATERIAL_ACCURACY_MODEL_IDS)
      : dedupeModels(OPENROUTER_FREE_STANDARD_MODEL_IDS);
    const geminiModels = useDetailedProfile
      ? dedupeModels(OPENROUTER_GEMINI_DETAILED_MODEL_IDS)
      : useAccuracyProfile
      ? dedupeModels(OPENROUTER_GEMINI_MATERIAL_ACCURACY_MODEL_IDS)
      : useImageProfile
      ? dedupeModels(OPENROUTER_GEMINI_IMAGE_MODEL_IDS)
      : dedupeModels(OPENROUTER_GEMINI_STANDARD_MODEL_IDS);
    const mode =
      normalizeText(modelPolicy?.openRouterBudgetMode).toLowerCase() ||
      "free_then_paid";

    if (freeApiMode && mode === "free_only") {
      return freeModels;
    }

    if (freeApiMode) {
      return dedupeModels([...freeModels, ...geminiModels]);
    }

    return geminiModels;
  }

  if (providerId === PROVIDER_GEMINI) {
    if (modelPolicy?.detailedMode) {
      return dedupeModels(GEMINI_DETAILED_MODEL_IDS);
    }

    if (useAccuracyProfile) {
      return dedupeModels(GEMINI_MATERIAL_ACCURACY_MODEL_IDS);
    }

    if (modelPolicy?.hasImages) {
      return dedupeModels(GEMINI_IMAGE_MODEL_IDS);
    }

    return dedupeModels(GEMINI_STANDARD_MODEL_IDS);
  }

  if (providerId === PROVIDER_CUSTOM_LLM) {
    return dedupeModels([modelPolicy?.customLlmModel]);
  }

  if (providerId === PROVIDER_OPENAI) {
    if (modelPolicy?.preferOpenAiSol) {
      return [OPENAI_SOL_MODEL_ID];
    }
    return dedupeModels(OPENAI_MODEL_IDS);
  }

  return [];
}

function buildProviderModelPlans(
  providerOrder,
  useAccuracyProfile = false,
  modelPolicy = {}
) {
  const plans = [];

  for (const providerId of normalizeProviderOrder(providerOrder)) {
    const models = getModelChain(providerId, useAccuracyProfile, modelPolicy);
    for (const model of models) {
      plans.push({ providerId, model });
    }
  }

  return plans;
}

function filterProvidersByCredentials(providerOrder, credentials) {
  const available = [];
  const normalizedProviders = normalizeProviderOrder(providerOrder);

  for (const providerId of normalizedProviders) {
    if (
      providerId === PROVIDER_OPENAI &&
      normalizeText(credentials?.openaiApiKey)
    ) {
      available.push(providerId);
      continue;
    }

    if (
      providerId === PROVIDER_OPENROUTER &&
      normalizeText(credentials?.openrouterApiKey)
    ) {
      available.push(providerId);
      continue;
    }

    if (
      providerId === PROVIDER_GEMINI &&
      normalizeText(credentials?.geminiApiKey)
    ) {
      available.push(providerId);
      continue;
    }

    if (
      providerId === PROVIDER_CUSTOM_LLM &&
      normalizeText(credentials?.customLlmEndpoint) &&
      normalizeText(credentials?.customLlmModel)
    ) {
      available.push(providerId);
    }
  }

  return available;
}

function uniqueTerms(terms) {
  return Array.from(new Set(terms.filter(Boolean)));
}

function tokenizeMaterialSearchTerms(question, options = []) {
  const combined = [question, ...(Array.isArray(options) ? options : [])]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  const lower = combined.toLowerCase();
  const latinTerms = lower.match(/[a-z0-9][a-z0-9+._%-]{1,}/g) || [];
  const numberTerms = lower.match(/-?\d+(?:\.\d+)?/g) || [];
  const japaneseOnly = lower.replace(/[^\u3040-\u30ff\u3400-\u9fff]/g, "");
  const jpBigrams = [];

  for (let index = 0; index < japaneseOnly.length - 1; index += 1) {
    jpBigrams.push(japaneseOnly.slice(index, index + 2));
    if (jpBigrams.length >= 20) {
      break;
    }
  }

  return uniqueTerms([...latinTerms, ...numberTerms, ...jpBigrams]).slice(
    0,
    MATERIAL_MAX_TERMS
  );
}

function splitMaterialIntoChunks(materialContext) {
  const cleaned = normalizeMaterialContext(materialContext);
  if (!cleaned) {
    return [];
  }

  const sourceBlocks = cleaned
    .split(/\n(?=## Source:\s*)/g)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks = [];

  for (const block of sourceBlocks) {
    const lines = block.split(/\r?\n/);
    const sourceLine = normalizeText(lines[0] || "");
    const sourceName = sourceLine.startsWith("## Source:")
      ? normalizeText(sourceLine.replace(/^## Source:\s*/i, "")) || "Material"
      : "Material";
    const bodyText = normalizeText(
      sourceLine.startsWith("## Source:")
        ? lines.slice(1).join("\n")
        : lines.join("\n")
    );

    if (!bodyText) {
      continue;
    }

    const paragraphs = bodyText
      .split(/\n{2,}/)
      .map((paragraph) => normalizeText(paragraph))
      .filter(Boolean);
    let currentChunk = "";

    const flushChunk = () => {
      const text = normalizeText(currentChunk);
      if (text) {
        chunks.push({
          source: sourceName,
          text,
        });
      }
      currentChunk = "";
    };

    const appendParagraph = (paragraph) => {
      if (!paragraph) {
        return;
      }

      if (!currentChunk) {
        currentChunk = paragraph;
        return;
      }

      if (currentChunk.length + 2 + paragraph.length <= MATERIAL_CHUNK_MAX_CHARS) {
        currentChunk += `\n\n${paragraph}`;
        return;
      }

      flushChunk();
      currentChunk = paragraph;
    };

    for (const paragraph of paragraphs.length ? paragraphs : [bodyText]) {
      if (paragraph.length <= MATERIAL_CHUNK_MAX_CHARS) {
        appendParagraph(paragraph);
        continue;
      }

      let start = 0;
      while (start < paragraph.length) {
        const slice = paragraph.slice(start, start + MATERIAL_CHUNK_MAX_CHARS);
        appendParagraph(slice);
        start += MATERIAL_CHUNK_MAX_CHARS;
      }
    }

    flushChunk();
  }

  return chunks;
}

function scoreMaterialChunk(chunkText, terms) {
  if (!chunkText || !Array.isArray(terms) || !terms.length) {
    return 0;
  }

  const haystack = chunkText.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (!term) {
      continue;
    }

    if (haystack.includes(term)) {
      score += term.length >= 4 ? 3 : 1;
    }
  }

  return score;
}

function buildMaterialReference(question, options, materialContext) {
  const chunks = splitMaterialIntoChunks(materialContext);
  if (!chunks.length) {
    return "";
  }

  const terms = tokenizeMaterialSearchTerms(question, options);
  const rankedChunks = chunks
    .map((chunk, index) => ({
      ...chunk,
      index,
      score: scoreMaterialChunk(chunk.text, terms),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    });

  const selected = [];
  for (const candidate of rankedChunks) {
    if (selected.length >= MATERIAL_TOP_CHUNKS) {
      break;
    }

    if (candidate.score > 0 || selected.length === 0) {
      selected.push(candidate);
    }
  }

  if (!selected.length) {
    return "";
  }

  const lines = [];
  let usedChars = 0;

  for (const chunk of selected) {
    const header = `Source: ${chunk.source}`;
    const body = normalizeText(chunk.text);
    const section = `${header}\n${body}`;
    const remaining = MATERIAL_REFERENCE_MAX_CHARS - usedChars;
    if (remaining <= 0) {
      break;
    }

    const clipped = section.slice(0, remaining);
    lines.push(clipped);
    usedChars += clipped.length + 2;
  }

  return lines.join("\n\n");
}

function detectAnswerMode(question, options, targetType = "standard") {
  const hasOptions = Array.isArray(options) && options.length > 0;

  if (targetType === "ordering") {
    return hasOptions ? "ordering" : "short";
  }

  if (targetType === "multiple_choice") {
    return hasOptions ? "multiple_choice" : "short";
  }

  if (targetType === "number") {
    return "number";
  }

  if (targetType === "symbol") {
    return "symbol";
  }

  if (targetType === "name") {
    return "name";
  }

  if (hasOptions) {
    return "choice";
  }

  if (NUMBER_QUESTION_PATTERN.test(question)) {
    return "number";
  }

  return "short";
}

function buildLinguaportaPrompt(
  question,
  options,
  targetType = "standard",
  compactMode = false,
  detailedMode = false,
  materialContext = "",
  hasImages = false
) {
  const cleanedOptions = Array.isArray(options)
    ? options.map((option) => normalizeText(option)).filter(Boolean)
    : [];
  const answerMode = detectAnswerMode(question, cleanedOptions, targetType);
  const isContextualBlank = question.includes("[blank]");
  const relevantMaterialReference = buildMaterialReference(
    question,
    cleanedOptions,
    materialContext
  );

  const instructions = [
    "Solve this Linguaporta exercise.",
    "Do not greet.",
    "Do not explain your role.",
    "Return only one line.",
    "Do not add explanations or reasons.",
  ];

  if (isContextualBlank) {
    instructions.push("The text contains one [blank] marker.");
    instructions.push(
      "Treat the complete text before and after [blank] as one sentence or passage; never guess from the blank alone."
    );
    instructions.push(
      "Before answering, silently reconstruct the full sentence with each plausible answer and choose the one that is both grammatically correct and most natural in meaning."
    );
    instructions.push(
      "Check tense, subject-verb agreement, singular/plural form, articles, prepositions, word order, collocation, and semantic consistency with the surrounding sentences."
    );
    instructions.push(
      "If a Japanese instruction or translation is present, use it as an additional meaning constraint, but keep the completed English sentence natural."
    );
    instructions.push(
      "This is an exact textbook translation exercise: prefer the word or grammar form that most directly expresses the Japanese cue, not merely any grammatical English paraphrase."
    );
    instructions.push(
      "If several completions are natural English, compare their meanings against the Japanese sentence and choose the most specific lexical match intended by the textbook."
    );
    instructions.push(
      'Example: Japanese "\uFF5E\u3059\u308B\u3064\u3082\u308A" with "I\'m [blank] to visit ..." calls for "planning", not the more generic "going".'
    );
    if (cleanedOptions.length) {
      instructions.push(
        "Test every listed choice inside the full sentence before selecting the best fit; do not choose merely because a word appears related to the topic."
      );
    }
    instructions.push("Return only the exact word(s) that replace [blank], nothing else.");
    instructions.push("Do not rewrite or repeat the whole sentence or expression.");
    instructions.push(
      'Example: for "Tokyo is the capital of [blank]." the correct output is "Japan", not the full sentence.'
    );
  }

  if (hasImages) {
    instructions.push(
      "One or more images are attached with this question (screenshots, diagrams, or code)."
    );
    instructions.push(
      "Read any text, code, or diagrams in the attached images carefully before answering."
    );
  }

  if (detailedMode) {
    instructions.push("Think carefully before answering, but keep the output to the final answer only.");
  }

  if (containsJapanese(question) && !isEnglishBlankQuestion(question)) {
    instructions.push("The answer must be in Japanese.");
  } else if (isEnglishBlankQuestion(question)) {
    instructions.push("The surrounding sentence is English, so fill the blank in English.");
  }

  if (answerMode === "choice") {
    instructions.push(
      "Choose exactly one answer from the Choices list below, copied character-for-character."
    );
    instructions.push(
      "Do not add a number, letter, bullet, or punctuation before or after it, and do not paraphrase or shorten it."
    );
  } else if (answerMode === "multiple_choice") {
    instructions.push(
      "Choose every correct answer from the Choices list below; there may be more than one."
    );
    instructions.push(
      "Copy each selected choice character-for-character and join them on one line with the separator ||. Do not include unselected choices."
    );
  } else if (answerMode === "ordering") {
    instructions.push(
      "Put every item from the Choices list into the correct order."
    );
    instructions.push(
      "Return every item exactly as written, joined on one line with the separator →. Do not omit or duplicate any item."
    );
  } else if (answerMode === "symbol") {
    instructions.push("Return only the single symbol or operator being asked for, nothing else.");
    instructions.push(
      "If it is a metric prefix, answer with just the prefix letters: f, p, n, u, m, c, d, da, h, k, M, G, T, or P."
    );
    instructions.push(
      "If it is a comparison or math operator instead, answer with just the operator: <, >, <=, >=, =, !=, +, -, *, or /."
    );
  } else if (answerMode === "name") {
    instructions.push(
      "Return only the requested name or term, with no extra words, particles, or punctuation around it."
    );
    instructions.push("If the question asks for katakana, use katakana only.");
  } else if (answerMode === "number") {
    instructions.push("The answer should be a number.");
    instructions.push(
      "If arriving at this number requires ANY calculation (multiplication, unit conversion, exponent, etc.), do NOT compute the final value yourself. You are bad at arithmetic and will get it wrong."
    );
    instructions.push(
      'In that case output only: EXPR: <expression> — a plain arithmetic expression using only +, -, *, /, ^, parentheses, and decimal or scientific-notation numbers. No units, no words, no "=", nothing else on the line.'
    );
    instructions.push("Example: EXPR: 3.3e-6 * 2 / (1 - 0.5)");
    instructions.push(
      "Only if the number is a simple lookup or count with no calculation at all, output digits only instead."
    );
  } else {
    instructions.push("Output only the short final answer.");
  }

  if (compactMode) {
    instructions.push("Keep the answer as short as possible.");
  }

  instructions.push(
    "Final check: your entire output must be only the answer itself (or the EXPR line for calculations) — no restated question, no extra words."
  );

  const optionsBlock = cleanedOptions.length
    ? cleanedOptions.join("\n")
    : "No options provided.";

  const sections = [
    ...instructions,
  ];

  if (relevantMaterialReference) {
    sections.push(
      "",
      "Reference material is provided below.",
      "Prioritize this material over general memory when answering.",
      "",
      "Reference Material:",
      relevantMaterialReference
    );
  }

  return [
    ...sections,
    "",
    `Question: ${question}`,
    "Choices:",
    optionsBlock,
  ].join("\n");
}

function buildRequestPlans(
  question,
  options,
  targetType = "standard",
  detailedMode = false,
  materialContext = "",
  useAccuracyProfile = false,
  providerOrder = DEFAULT_PROVIDER_ORDER,
  modelPolicy = {},
  images = []
) {
  const answerMode = detectAnswerMode(question, options, targetType);
  const isContextualBlank = question.includes("[blank]");
  const hasMaterial = Boolean(normalizeMaterialContext(materialContext));
  const effectiveDetailedMode = detailedMode || useAccuracyProfile;
  const hasImages = Boolean(images.length);

  const maxTokens = useAccuracyProfile
    ? answerMode === "short"
      ? 120
      : 64
    : effectiveDetailedMode
      ? answerMode === "short"
        ? hasMaterial
          ? 64
          : 40
        : hasMaterial
          ? 32
          : 20
      : answerMode === "short"
        ? hasMaterial
          ? 48
          : 24
        : hasMaterial
          ? 24
          : 12;
  const numberExpressionBonus = answerMode === "number" ? 48 : 0;
  const orderingTokenBudget =
    answerMode === "ordering"
      ? Math.min(
          320,
          32 + Math.ceil(options.join(" ").length / 2)
        )
      : 0;
  const multipleChoiceTokenBudget =
    answerMode === "multiple_choice"
      ? Math.min(256, 24 + Math.ceil(options.join(" ").length / 2))
      : 0;
  const safeMaxTokens = Math.max(
    16,
    maxTokens + numberExpressionBonus,
    orderingTokenBudget,
    multipleChoiceTokenBudget,
    isContextualBlank ? 128 : 0,
    hasImages ? IMAGE_QUESTION_MIN_TOKENS : 0
  );
  const allowReasoning =
    effectiveDetailedMode ||
    hasImages ||
    answerMode === "number" ||
    isContextualBlank;
  const effectiveModelPolicy = {
    ...modelPolicy,
    detailedMode: effectiveDetailedMode,
    hasImages,
  };

  let providerModelPlans = buildProviderModelPlans(
    providerOrder,
    useAccuracyProfile,
    effectiveModelPolicy
  );
  if (hasImages) {
    const visionPlans = providerModelPlans.filter(
      (plan) => !NON_VISION_MODEL_PATTERN.test(plan.model)
    );
    if (visionPlans.length) {
      providerModelPlans = visionPlans;
    }
  }
  if (!providerModelPlans.length) {
    return [];
  }

  const [primaryPlan, ...fallbackPlans] = providerModelPlans;
  const primaryIsOpenRouterFree =
    primaryPlan.providerId === PROVIDER_OPENROUTER &&
    isOpenRouterFreeModel(primaryPlan.model);
  const primaryPromptModes = primaryIsOpenRouterFree ? [false] : [false, true];

  return [
    ...primaryPromptModes.map((compactMode) => ({
      providerId: primaryPlan.providerId,
      model: primaryPlan.model,
      prompt: buildLinguaportaPrompt(
        question,
        options,
        targetType,
        compactMode,
        effectiveDetailedMode,
        materialContext,
        hasImages
      ),
      maxTokens: safeMaxTokens,
      images,
      allowThinking: allowReasoning,
    })),
    ...fallbackPlans.map((plan) => ({
      providerId: plan.providerId,
      model: plan.model,
      prompt: buildLinguaportaPrompt(
        question,
        options,
        targetType,
        true,
        effectiveDetailedMode,
        materialContext,
        hasImages
      ),
      maxTokens: safeMaxTokens,
      images,
      allowThinking: allowReasoning,
    })),
  ];
}

function loadMaterialState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(MATERIAL_DEFAULTS, (items) => {
      const materialMode = Boolean(items.materialMode);
      const materialRevision = Number(items.materialRevision) || 0;
      const materialSources = normalizeMaterialSources(items.materialSources);
      const freeApiMode = Boolean(items.freeApiMode);
      const legacyApiKey = normalizeText(items.apiKey);
      const openaiApiKey = normalizeText(items.openaiApiKey || legacyApiKey);
      const openrouterApiKey = normalizeText(items.openrouterApiKey);
      const geminiApiKey = normalizeText(items.geminiApiKey);
      const customLlmEndpoint = normalizeText(items.customLlmEndpoint);
      const customLlmModel = normalizeText(items.customLlmModel);
      const customLlmApiKey = normalizeText(items.customLlmApiKey);
      const apiProviders = normalizeProviderOrder(items.apiProviders);
      const materialContext = materialMode
        ? normalizeMaterialContext(items.materialContext).slice(
            0,
            MATERIAL_CONTEXT_MAX_CHARS
          )
        : "";
      const hasPdfSource = materialSources.some(
        (source) => source.kind === "pdf"
      );

      resolve({
        materialMode,
        materialRevision,
        materialContext,
        materialSources,
        hasPdfSource,
        freeApiMode,
        apiProviders,
        openaiApiKey,
        openrouterApiKey,
        geminiApiKey,
        customLlmEndpoint,
        customLlmModel,
        customLlmApiKey,
      });
    });
  });
}

async function readJsonResponse(response) {
  const raw = await response.text();
  const rawTrimmed = raw.trim();
  const contentType = normalizeText(response.headers.get("content-type"));
  let data = {};

  if (rawTrimmed) {
    const looksJson =
      contentType.includes("application/json") ||
      rawTrimmed.startsWith("{") ||
      rawTrimmed.startsWith("[");

    if (looksJson) {
      try {
        data = JSON.parse(rawTrimmed);
      } catch (error) {
        if (!response.ok) {
          const isRateLimited =
            response.status === 429 || isRateLimitText(rawTrimmed);
          const isAuthError =
            response.status === 401 ||
            response.status === 403 ||
            isInvalidApiKeyText(rawTrimmed);
          throw createHttpError(
            isRateLimited
              ? `Rate limit (${response.status || 429})`
              : isAuthError
                ? "Invalid API key. Set a valid API key in the extension popup."
                : `Invalid JSON response: ${rawTrimmed.slice(0, 200)}`,
            {
              status: response.status,
              isRateLimit: isRateLimited,
              isAuthError,
              retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
            }
          );
        }

        throw new Error(`Invalid JSON response: ${rawTrimmed.slice(0, 200)}`);
      }
    }
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      rawTrimmed ||
      `HTTP ${response.status} ${response.statusText}`;
    const isRateLimited =
      response.status === 429 || isRateLimitText(message);
    const isAuthError =
      response.status === 401 ||
      response.status === 403 ||
      isInvalidApiKeyText(message);
    throw createHttpError(
      isRateLimited
        ? `Rate limit (${response.status || 429})`
        : isAuthError
          ? "Invalid API key. Set a valid API key in the extension popup."
          : message,
      {
        status: response.status,
        isRateLimit: isRateLimited,
        isAuthError,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      }
    );
  }

  if (!Object.keys(data).length && rawTrimmed) {
    if (isRateLimitText(rawTrimmed)) {
      throw createHttpError("Rate limit (429)", {
        status: 429,
        isRateLimit: true,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      });
    }

    if (isInvalidApiKeyText(rawTrimmed)) {
      throw createHttpError(
        "Invalid API key. Set a valid API key in the extension popup.",
        {
          status: 401,
          isAuthError: true,
        }
      );
    }

    return {
      text: rawTrimmed,
    };
  }

  return data;
}

function extractAnswer(data) {
  const extractTextParts = (value, collector = []) => {
    if (typeof value === "string") {
      if (value.trim()) {
        collector.push(value);
      }
      return collector;
    }

    if (!value) {
      return collector;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        extractTextParts(item, collector);
      }
      return collector;
    }

    if (typeof value === "object") {
      if (typeof value.text === "string" && value.text.trim()) {
        collector.push(value.text);
      }
      if (typeof value.content === "string" && value.content.trim()) {
        collector.push(value.content);
      }
      if (typeof value.output_text === "string" && value.output_text.trim()) {
        collector.push(value.output_text);
      }
      if (typeof value.value === "string" && value.value.trim()) {
        collector.push(value.value);
      }

      if (Array.isArray(value.content)) {
        extractTextParts(value.content, collector);
      }
      if (Array.isArray(value.output_text)) {
        extractTextParts(value.output_text, collector);
      }
      if (Array.isArray(value.parts)) {
        extractTextParts(value.parts, collector);
      }
    }

    return collector;
  };

  const getText = (value) =>
    extractTextParts(value)
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join("")
      .trim();

  if (data?.candidates?.length) {
    for (const candidate of data.candidates) {
      const candidateText = getText(candidate?.content?.parts || candidate?.content);
      if (candidateText) {
        return candidateText;
      }
    }
  }

  if (data?.choices?.length) {
    const firstChoice = data.choices[0];
    const messageContentText = getText(firstChoice?.message?.content);
    if (messageContentText) {
      return messageContentText;
    }

    const messageText = getText(firstChoice?.message);
    if (messageText) {
      return messageText;
    }

    const deltaText = getText(firstChoice?.delta?.content);
    if (deltaText) {
      return deltaText;
    }

    const plainChoiceText = getText(firstChoice?.text);
    if (plainChoiceText) {
      return plainChoiceText;
    }
  }

  for (const key of ["content", "text", "output", "response", "result", "message"]) {
    const text = getText(data?.[key]);
    if (text) {
      return text;
    }
  }

  return "";
}

function extractFirstLine(answer) {
  return String(answer || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function findMatchingOption(answer, options) {
  if (!Array.isArray(options) || !options.length) {
    return "";
  }

  const haystacks = [
    compactText(answer),
    compactText(extractFirstLine(answer)),
  ].filter(Boolean);

  return (
    options.find((option) => {
      const normalizedOption = compactText(option);
      return haystacks.some(
        (haystack) =>
          haystack === normalizedOption ||
          haystack.includes(normalizedOption) ||
          normalizedOption.includes(haystack)
      );
    }) || ""
  );
}

function questionRequiresKatakana(question) {
  return /\u30AB\u30BF\u30AB\u30CA|katakana/i.test(normalizeText(question));
}

function stripLeadingSymbolNoise(answer) {
  return normalizeText(
    answer.replace(/^(?:(?:>>|<<|&&|\|\||[<>=!|&;:+*\/\\-]+)\s*)+/g, "")
  );
}

function extractNameLikeAnswer(answer, question) {
  const cleaned = stripLeadingSymbolNoise(answer);

  if (questionRequiresKatakana(question)) {
    const katakanaMatch = cleaned.match(/[\u30A0-\u30FF\u30FC]+/);
    return katakanaMatch ? katakanaMatch[0] : cleaned;
  }

  if (SHELL_COMMAND_ANSWER_PATTERN.test(cleaned)) {
    return cleaned;
  }

  const codeToken = cleaned.match(/[A-Za-z0-9][A-Za-z0-9._+:/@-]{0,80}/);
  if (codeToken) {
    return codeToken[0];
  }

  const katakanaMatch = cleaned.match(/[\u30A0-\u30FF\u30FC]+/);
  return katakanaMatch ? katakanaMatch[0] : cleaned;
}

// --- Safe arithmetic expression evaluator ---------------------------------
// LLMs are unreliable at multi-step arithmetic (exponents, unit conversions).
// For calculation-type answers we ask the model for the expression only and
// compute the final value ourselves here, deterministically. No eval()/
// Function() is used (also disallowed under MV3's extension CSP); this is a
// small whitelisted recursive-descent parser instead.
const MATH_FUNCTIONS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
};
const MATH_CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
};
const MATH_EXPRESSION_MAX_LENGTH = 200;

function tokenizeMathExpression(expr) {
  const pattern =
    /([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)|([A-Za-z_][A-Za-z0-9_]*)|([()+\-*/^%,])|(\s+)/g;
  const tokens = [];
  let cursor = 0;
  let match;

  while ((match = pattern.exec(expr)) !== null) {
    if (match.index !== cursor) {
      throw new Error(`Unexpected character near "${expr.slice(cursor, match.index)}"`);
    }
    cursor = pattern.lastIndex;

    if (match[4]) {
      continue;
    }
    if (match[1] !== undefined) {
      tokens.push({ type: "number", value: Number(match[1]) });
    } else if (match[2] !== undefined) {
      tokens.push({ type: "ident", value: match[2].toLowerCase() });
    } else if (match[3] !== undefined) {
      tokens.push({ type: "op", value: match[3] });
    }
  }

  if (cursor !== expr.length) {
    throw new Error("Unexpected trailing characters in expression.");
  }

  return tokens;
}

function parseMathExpressionTokens(tokens) {
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = (type, value) => {
    const token = tokens[pos];
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error("Invalid expression syntax.");
    }
    pos += 1;
    return token;
  };

  function parseExpression() {
    return parseAddSub();
  }

  function parseAddSub() {
    let value = parseMulDiv();
    while (peek()?.type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = consume("op").value;
      const right = parseMulDiv();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseMulDiv() {
    let value = parseUnary();
    while (
      peek()?.type === "op" &&
      (peek().value === "*" || peek().value === "/" || peek().value === "%")
    ) {
      const op = consume("op").value;
      const right = parseUnary();
      if (op === "*") value *= right;
      else if (op === "/") value /= right;
      else value %= right;
    }
    return value;
  }

  function parseUnary() {
    if (peek()?.type === "op" && (peek().value === "-" || peek().value === "+")) {
      const op = consume("op").value;
      const value = parseUnary();
      return op === "-" ? -value : value;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (peek()?.type === "op" && peek().value === "^") {
      consume("op", "^");
      const exponent = parseUnary();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parsePrimary() {
    const token = peek();
    if (!token) {
      throw new Error("Unexpected end of expression.");
    }

    if (token.type === "number") {
      consume("number");
      return token.value;
    }

    if (token.type === "op" && token.value === "(") {
      consume("op", "(");
      const value = parseExpression();
      consume("op", ")");
      return value;
    }

    if (token.type === "ident") {
      consume("ident");
      const name = token.value;

      if (peek()?.type === "op" && peek().value === "(") {
        consume("op", "(");
        const args = [parseExpression()];
        while (peek()?.type === "op" && peek().value === ",") {
          consume("op", ",");
          args.push(parseExpression());
        }
        consume("op", ")");
        const fn = MATH_FUNCTIONS[name];
        if (!fn) {
          throw new Error(`Unknown function: ${name}`);
        }
        return fn(...args);
      }

      if (name in MATH_CONSTANTS) {
        return MATH_CONSTANTS[name];
      }

      throw new Error(`Unknown identifier: ${name}`);
    }

    throw new Error("Invalid expression syntax.");
  }

  const result = parseExpression();
  if (pos !== tokens.length) {
    throw new Error("Unexpected trailing tokens in expression.");
  }
  return result;
}

function evaluateMathExpression(expr) {
  const cleaned = String(expr || "").trim();
  if (!cleaned) {
    throw new Error("Empty expression.");
  }
  if (cleaned.length > MATH_EXPRESSION_MAX_LENGTH) {
    throw new Error("Expression too long.");
  }

  const tokens = tokenizeMathExpression(cleaned);
  if (!tokens.length) {
    throw new Error("Empty expression.");
  }

  const value = parseMathExpressionTokens(tokens);
  if (!Number.isFinite(value)) {
    throw new Error("Expression did not evaluate to a finite number.");
  }

  return value;
}

function extractExpressionLine(rawAnswer) {
  const text = String(rawAnswer || "");
  const tagged = text.match(/(?:EXPR|式)\s*[:：]\s*(.+)$/i);
  if (tagged) {
    // The model sometimes appends "= result" despite instructions; drop it
    // since our grammar has no '=' operator and everything past it is noise.
    return tagged[1].replace(/\s*=\s*[^=]*$/, "").trim();
  }

  // Weaker models (e.g. flash-lite) sometimes drop the "EXPR:" tag entirely.
  // If the whole answer already looks like a bare arithmetic expression
  // (not a plain number, no natural-language characters), treat it as the
  // expression anyway rather than losing the calculation-offload benefit.
  const trimmed = text.trim();
  const hasOperatorBeyondSign = /[+\-*/^%()]/.test(trimmed.replace(/^-/, ""));
  const isPureMathChars = /^[0-9eE+\-*/^%().\s]+$/.test(trimmed);
  return isPureMathChars && hasOperatorBeyondSign ? trimmed : "";
}

function formatNumericAnswer(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const normalized = Object.is(value, -0) ? 0 : value;

  if (Number.isInteger(normalized) && Math.abs(normalized) < 1e15) {
    return String(normalized);
  }

  const abs = Math.abs(normalized);
  let decimals = 6;
  if (abs < 1) {
    decimals = Math.min(12, Math.max(6, Math.ceil(-Math.log10(abs)) + 4));
  }

  const text = normalized.toFixed(decimals);
  return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function extractOrderedOptions(answer, options) {
  const raw = normalizeText(answer);
  const cleanedOptions = Array.isArray(options)
    ? options.map((option) => normalizeText(option)).filter(Boolean)
    : [];
  if (!raw || cleanedOptions.length < 2) {
    return [];
  }

  // The ordering prompt requires an arrow-delimited answer. Parse that form
  // first so short or repeated words (for example "a" or "the") are matched
  // as complete cards rather than as substrings of another card.
  const explicitParts = raw
    .replace(/^(?:answer|\u7B54\u3048|\u56DE\u7B54)\s*[:\uFF1A]\s*/i, "")
    .split(/\s*\u2192\s*/u)
    .map((part) => normalizeText(part))
    .filter(Boolean);
  if (explicitParts.length === cleanedOptions.length) {
    const optionBuckets = new Map();
    for (const option of cleanedOptions) {
      const key = compactText(option);
      const bucket = optionBuckets.get(key) || [];
      bucket.push(option);
      optionBuckets.set(key, bucket);
    }

    const explicitOrder = explicitParts.map((part) => {
      const bucket = optionBuckets.get(compactText(part));
      return bucket?.shift() || "";
    });
    if (
      explicitOrder.every(Boolean) &&
      Array.from(optionBuckets.values()).every((bucket) => bucket.length === 0)
    ) {
      return explicitOrder;
    }
  }

  const positioned = cleanedOptions.map((option) => ({
    option,
    index: raw.indexOf(option),
  }));
  if (positioned.some((item) => item.index < 0)) {
    return [];
  }

  positioned.sort((left, right) => left.index - right.index);
  for (let index = 1; index < positioned.length; index += 1) {
    if (positioned[index - 1].index === positioned[index].index) {
      return [];
    }
  }

  return positioned.map((item) => item.option);
}

function extractMultipleChoiceOptions(answer, options) {
  const firstLine = extractFirstLine(answer).replace(
    /^(?:answer|\u7B54\u3048|\u56DE\u7B54)\s*[:\uFF1A]\s*/i,
    ""
  );
  const cleanedOptions = Array.isArray(options)
    ? options.map((option) => normalizeText(option)).filter(Boolean)
    : [];
  if (!firstLine || !cleanedOptions.length) {
    return [];
  }

  const parts = firstLine
    .split(/\s*(?:\|\||\u2192)\s*/u)
    .map((part) => normalizeText(part))
    .filter(Boolean);
  const selected = [];

  for (const part of parts) {
    const compactPart = compactText(part);
    const match = cleanedOptions.find(
      (option) => compactText(option) === compactPart
    );
    if (!match) {
      return [];
    }
    if (selected.includes(match)) {
      return [];
    }
    selected.push(match);
  }

  return selected;
}

function sanitizeAnswer(answer, question, options, targetType = "standard") {
  const answerMode = detectAnswerMode(question, options, targetType);
  const rawAnswer = normalizeText(answer);
  const firstLine = extractFirstLine(rawAnswer).replace(
    /^(?:answer|\u7B54\u3048|\u56DE\u7B54)\s*[:\uFF1A]\s*/i,
    ""
  );

  if (!firstLine) {
    return "";
  }

  if (answerMode === "choice") {
    const matchedOption = findMatchingOption(rawAnswer, options);
    return matchedOption || firstLine;
  }

  if (answerMode === "multiple_choice") {
    const selectedOptions = extractMultipleChoiceOptions(rawAnswer, options);
    return selectedOptions.length ? selectedOptions.join(" || ") : firstLine;
  }

  if (answerMode === "ordering") {
    const orderedOptions = extractOrderedOptions(rawAnswer, options);
    return orderedOptions.length ? orderedOptions.join(" → ") : firstLine;
  }

  if (answerMode === "symbol") {
    if (SYMBOL_ANSWER_PATTERN.test(firstLine)) {
      return firstLine;
    }

    const operatorMatch =
      firstLine.match(SYMBOL_OPERATOR_PATTERN) ||
      rawAnswer.match(SYMBOL_OPERATOR_PATTERN);
    if (operatorMatch) {
      return operatorMatch[0];
    }

    const textSymbolMatch =
      firstLine.match(SYMBOL_TEXT_PATTERN) ||
      rawAnswer.match(SYMBOL_TEXT_PATTERN);
    return textSymbolMatch ? textSymbolMatch[0] : firstLine;
  }

  if (answerMode === "name") {
    return extractNameLikeAnswer(firstLine, question);
  }

  if (answerMode === "number") {
    const expressionText = extractExpressionLine(rawAnswer);
    if (expressionText) {
      try {
        const computed = evaluateMathExpression(expressionText);
        const formatted = formatNumericAnswer(computed);
        if (formatted) {
          return formatted;
        }
      } catch (error) {
        console.warn(
          "Failed to evaluate EXPR answer, falling back to text parsing:",
          expressionText,
          error
        );
      }
    }

    const normalizedAnswer = rawAnswer.replace(/[\u2212\u2013\u2014]/g, "-");
    const exponentMatch = normalizedAnswer.match(/\^\s*(-?\d+(?:\.\d+)?)/);
    if (
      exponentMatch &&
      /(?:\u4F55\u4E57|\u6307\u6570|\[blank\]\s*\u4E57|\u4E57\u3067\u3042\u308B|exponent|power)/i.test(question)
    ) {
      return exponentMatch[1];
    }

    const numericMatch = normalizedAnswer.match(/-?\d+(?:\.\d+)?/);
    return numericMatch ? numericMatch[0] : "";
  }

  if (/\[blank\]/i.test(question)) {
    return firstLine
      .replace(/^["'`\u201C\u201D\u2018\u2019]+/, "")
      .replace(/["'`\u201C\u201D\u2018\u2019]+$/, "")
      .trim();
  }

  return firstLine;
}

function isLikelyInvalidAnswer(answer, question, options, targetType = "standard") {
  const sanitized = sanitizeAnswer(answer, question, options, targetType);
  const firstLine = extractFirstLine(sanitized);
  if (!firstLine) {
    return true;
  }

  if (INVALID_ANSWER_PATTERNS.some((pattern) => pattern.test(sanitized))) {
    return true;
  }

  if (/^(the question asks|this question asks|the answer is)\b/i.test(firstLine)) {
    return true;
  }

  const answerMode = detectAnswerMode(question, options, targetType);

  if (answerMode === "choice") {
    return !findMatchingOption(firstLine, options);
  }

  if (answerMode === "multiple_choice") {
    return extractMultipleChoiceOptions(firstLine, options).length === 0;
  }

  if (answerMode === "ordering") {
    return extractOrderedOptions(firstLine, options).length !== options.length;
  }

  if (answerMode === "symbol") {
    return !SYMBOL_ANSWER_PATTERN.test(firstLine);
  }

  if (answerMode === "name") {
    if (questionRequiresKatakana(question)) {
      return !/[\u30A0-\u30FF\u30FC]/.test(firstLine);
    }

    return !(
      SHORT_CODE_ANSWER_PATTERN.test(firstLine) ||
      SHELL_COMMAND_ANSWER_PATTERN.test(firstLine) ||
      /[\u30A0-\u30FF\u30FC\u3040-\u30FF\u3400-\u9FFF]/.test(firstLine)
    );
  }

  if (answerMode === "number") {
    return !/^-?\d+(?:\.\d+)?$/.test(firstLine);
  }

  if (
    containsJapanese(question) &&
    !isEnglishBlankQuestion(question) &&
    !containsJapanese(firstLine) &&
    /[A-Za-z]{2,}/.test(firstLine) &&
    !(Array.isArray(options) && options.length) &&
    !SHORT_CODE_ANSWER_PATTERN.test(firstLine) &&
    !SHELL_COMMAND_ANSWER_PATTERN.test(firstLine)
  ) {
    return true;
  }

  return false;
}
function getProviderEndpoints(providerId, model = "", credentials = {}) {
  if (providerId === PROVIDER_OPENROUTER) {
    return [OPENROUTER_ENDPOINT];
  }

  if (providerId === PROVIDER_GEMINI) {
    const modelId = normalizeText(model).replace(/^models\//i, "") || "gemini-3.8-flash";
    return [
      `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(modelId)}:generateContent`,
    ];
  }

  if (providerId === PROVIDER_CUSTOM_LLM) {
    const endpoint = normalizeText(credentials?.customLlmEndpoint);
    if (!endpoint) {
      return [];
    }
    try {
      const parsed = new URL(endpoint);
      if (!/^https?:$/.test(parsed.protocol)) {
        return [];
      }
      const trimmedPath = parsed.pathname.replace(/\/+$/, "");
      if (/\/v1$/i.test(trimmedPath)) {
        parsed.pathname = `${trimmedPath}/chat/completions`;
      }
      return [parsed.toString()];
    } catch (_error) {
      return [];
    }
  }

  return [OPENAI_ENDPOINT];
}

function getProviderLabel(providerId) {
  if (providerId === PROVIDER_OPENROUTER) {
    return "OpenRouter";
  }

  if (providerId === PROVIDER_GEMINI) {
    return "Gemini";
  }

  if (providerId === PROVIDER_CUSTOM_LLM) {
    return "Custom LLM";
  }

  return "OpenAI";
}

function buildProviderChainError(providerOrder, providerErrors, fallbackMessage) {
  const summaries = normalizeProviderOrder(providerOrder)
    .filter((providerId) => providerErrors.has(providerId))
    .map((providerId) => {
      const message = normalizeText(providerErrors.get(providerId) || "unknown error");
      return `${getProviderLabel(providerId)}: ${message.slice(0, 320)}`;
    });

  return new Error(
    summaries.length
      ? `Providers failed in configured order — ${summaries.join(" | ")}`
      : fallbackMessage
  );
}

const MAX_FALLBACK_LOG_ENTRIES = 50;

// Fallback events (a provider failing and the next one taking over) used to
// be shown inline on every hint panel, which got noisy fast. They're now
// tucked away in a rotating log the popup can show on demand instead.
function logFallbackEvent(message) {
  const cleanedMessage = normalizeText(message);
  if (!cleanedMessage) {
    return;
  }

  chrome.storage.local.get({ fallbackLogs: [] }, (items) => {
    const logs = Array.isArray(items.fallbackLogs) ? items.fallbackLogs : [];
    logs.push({ time: Date.now(), message: cleanedMessage });
    chrome.storage.local.set({
      fallbackLogs: logs.slice(-MAX_FALLBACK_LOG_ENTRIES),
    });
  });
}

async function requestChatCompletion(
  providerId,
  model,
  prompt,
  maxTokens,
  credentials,
  requestOptions = {}
) {
  const { images = [], audios = [], allowThinking = true } = requestOptions;
  const imageParts = images
    .map((dataUrl) => parseDataUrl(dataUrl))
    .filter(Boolean);
  const audioParts = audios
    .map((dataUrl) => parseDataUrl(dataUrl))
    .filter((part) => part && part.mimeType.startsWith("audio/"));
  const isOpenRouterFreeRequest =
    providerId === PROVIDER_OPENROUTER && isOpenRouterFreeModel(model);
  const isGemini3 =
    providerId === PROVIDER_GEMINI && /^gemini-3(?:\.|-)/i.test(model);
  const isOpenAiSol =
    providerId === PROVIDER_OPENAI && model === OPENAI_SOL_MODEL_ID;
  const baseMaxTokens =
    providerId === PROVIDER_OPENROUTER
      ? Math.max(48, Number(maxTokens) || 48)
      : providerId === PROVIDER_GEMINI
        ? Math.max(isGemini3 ? 256 : 64, Number(maxTokens) || 64)
        : Math.max(isOpenAiSol ? 512 : 16, Number(maxTokens) || 16);

  let lastError = null;
  const providerLabel = getProviderLabel(providerId);
  const endpointCandidates = getProviderEndpoints(providerId, model, credentials);
  if (!endpointCandidates.length) {
    throw new Error(`${providerLabel} endpoint is not configured or invalid.`);
  }
  const maxAttempts = isOpenRouterFreeRequest
    ? Math.min(REQUEST_MAX_ATTEMPTS, OPENROUTER_FREE_MODEL_MAX_ATTEMPTS)
    : REQUEST_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptMaxTokens =
      providerId === PROVIDER_OPENROUTER
        ? Math.min(320, baseMaxTokens * Math.pow(2, attempt))
        : providerId === PROVIDER_GEMINI
          ? Math.min(512, baseMaxTokens * Math.pow(2, attempt))
          : baseMaxTokens;
    let payload = null;

    if (providerId === PROVIDER_GEMINI) {
      const userParts = [
        { text: prompt },
        ...imageParts.map((image) => ({
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
          },
        })),
        ...audioParts.map((audioFile) => ({
          inlineData: {
            mimeType: audioFile.mimeType,
            data: audioFile.base64,
          },
        })),
      ];
      // Gemini 3 uses thinkingLevel and rejects the old thinkingBudget form;
      // it also no longer accepts the sampling knobs used by older models.
      // Keep Linguaporta calls on low unless detailed/image work explicitly asks for
      // more reasoning. Legacy Gemini models retain their old configuration.
      const disableLegacyThinking =
        !isGemini3 && !allowThinking && /flash/i.test(model);
      payload = {
        systemInstruction: {
          role: "system",
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: userParts,
          },
        ],
        generationConfig: {
          maxOutputTokens: attemptMaxTokens,
          ...(isGemini3
            ? {
                thinkingConfig: {
                  thinkingLevel: allowThinking ? "medium" : "low",
                },
              }
            : { temperature: 0 }),
          ...(disableLegacyThinking
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
        },
      };
    } else {
      const userContent = imageParts.length
        ? [
            { type: "text", text: prompt },
            ...imageParts.map((image) => ({
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
            })),
          ]
        : prompt;
      payload = {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        max_tokens: attemptMaxTokens,
      };
    }

    if (providerId === PROVIDER_OPENROUTER && payload) {
      payload.max_completion_tokens = attemptMaxTokens;
      payload.provider = { allow_fallbacks: true };
    }

    if (providerId === PROVIDER_OPENAI && payload) {
      delete payload.max_tokens;
      delete payload.temperature;
      payload.max_completion_tokens = attemptMaxTokens;
      payload.reasoning_effort = isOpenAiSol
        ? "medium"
        : allowThinking
          ? "low"
          : "none";
    }

    let shouldRetryAttempt = false;

    for (const endpoint of endpointCandidates) {
      const controller =
        typeof AbortController === "function" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: buildRequestHeaders(providerId, credentials),
          body: JSON.stringify(payload),
          signal: controller?.signal,
        });

        let data;
        try {
          data = await readJsonResponse(response);
        } catch (readError) {
          // Bare messages like "HTTP 404" give no clue which provider/model
          // caused it once they surface in the extension's error log — bake
          // that context in so a future failure is self-diagnosing.
          throw createHttpError(
            `${providerLabel} (${model}) ${readError.message} [${endpoint}]`,
            {
              status: readError.status,
              isRateLimit: readError.isRateLimit,
              isAuthError: readError.isAuthError,
              skipRemainingProvider: readError.skipRemainingProvider,
              retryAfterMs: readError.retryAfterMs,
            }
          );
        }
        const bodyErrorMessage = normalizeText(
          data?.error?.message || data?.error || ""
        );
        if (bodyErrorMessage) {
          const skipRemainingProvider =
            providerId === PROVIDER_GEMINI &&
            isGeminiQuotaOrBalanceError({
              status: Number(data?.error?.code) || response.status,
              message: bodyErrorMessage,
            });
          throw createHttpError(bodyErrorMessage, {
            status: Number(data?.error?.code) || response.status,
            isRateLimit: isRateLimitText(bodyErrorMessage),
            isAuthError: isInvalidApiKeyText(bodyErrorMessage),
            skipRemainingProvider,
            retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
          });
        }

        const answer = extractAnswer(data);
        if (answer) {
          const resolvedModel = normalizeText(
            data?.model || data?.modelVersion || model
          );
          return {
            answer,
            resolvedModel,
          };
        }

        const emptyError = createHttpError(`Empty response from ${endpoint}`, {
          status: response.status,
        });
        lastError = emptyError;
        console.warn(
          `${providerLabel} returned no answer for ${endpoint} (max_tokens=${attemptMaxTokens}):`,
          data
        );
        shouldRetryAttempt = attempt < maxAttempts - 1;
      } catch (error) {
        const requestError =
          error?.name === "AbortError"
            ? createHttpError(
                `${providerLabel} request timed out after ${Math.round(
                  REQUEST_TIMEOUT_MS / 1000
                )}s.`,
                { status: 0 }
              )
            : error;
        if (
          providerId === PROVIDER_GEMINI &&
          isGeminiQuotaOrBalanceError(requestError)
        ) {
          // Throw immediately instead of break+continue: a plain `break`
          // here only exits the endpoint loop, and the outer attempt loop
          // would just retry the SAME rate-limited/exhausted model again
          // (worsening the rate limit) before finally giving up.
          requestError.skipRemainingProvider = true;
          console.warn(
            "Gemini quota/balance exhausted. Switching to the next provider:",
            requestError
          );
          throw requestError;
        }
        lastError = requestError;
        const freeLimitExhausted =
          isOpenRouterFreeRequest &&
          (Number(requestError?.status) === 402 ||
            isOpenRouterFreeLimitMessage(requestError?.message));
        if (freeLimitExhausted) {
          console.warn("OpenRouter free model limit reached:", {
            model,
            reason: normalizeText(requestError?.message || "free limit reached"),
          });
          throw requestError;
        }

        const canRetry =
          isRetryableError(requestError) && attempt < maxAttempts - 1;

        console.warn(
          `${providerLabel} request failed for ${endpoint} (attempt ${attempt + 1}/${maxAttempts}):`,
          requestError
        );

        if (canRetry) {
          shouldRetryAttempt = true;
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    if (shouldRetryAttempt) {
      const backoffMs = getRetryDelayMs(lastError, attempt);
      await sleep(backoffMs);
      continue;
    }

    if (lastError) {
      const authOrConfigError = Boolean(
        lastError.isAuthError ||
          /invalid\s*api\s*key|api\s*key\s*not\s*valid|unauthorized|forbidden/i.test(
            normalizeText(lastError.message)
          )
      );
      if (authOrConfigError) {
        break;
      }
    }
  }

  // Re-throw the original error object (not a fresh Error) so metadata like
  // skipRemainingProvider survives — otherwise callers can never tell a
  // Gemini quota-exhaustion failure apart from any other failure, and the
  // "move to the next provider" fallback never actually triggers.
  if (lastError) {
    throw lastError;
  }

  throw new Error(`Failed to get a response from ${providerLabel} API.`);
}

async function buildModelPolicy(providerOrder, credentials) {
  const normalizedProviders = normalizeProviderOrder(providerOrder);
  const policy = {
    freeApiMode: Boolean(credentials?.freeApiMode),
    openRouterBudgetMode: "free_then_paid",
    customLlmModel: normalizeText(credentials?.customLlmModel),
  };

  if (!normalizedProviders.includes(PROVIDER_OPENROUTER)) {
    return policy;
  }

  const openRouterModels = [
    ...getModelChain(PROVIDER_OPENROUTER, false, policy),
    ...getModelChain(PROVIDER_OPENROUTER, true, policy),
  ];
  if (!openRouterModels.some(isOpenRouterFreeModel)) {
    return policy;
  }

  try {
    policy.openRouterBudgetMode = await resolveOpenRouterBudgetMode(credentials);
  } catch (error) {
    console.warn("Failed to resolve OpenRouter budget mode. Using default mode:", error);
  }

  return policy;
}

async function callAiChat(
  question,
  options,
  requestKey = "",
  targetType = "standard",
  detailedMode = false,
  materialMode = false,
  materialRevision = 0,
  materialContext = "",
  useAccuracyProfile = false,
  providerOrder = DEFAULT_PROVIDER_ORDER,
  credentials = {},
  images = [],
  audios = [],
  preferOpenAiSol = false,
  rejectedAnswers = []
) {
  const cleanedQuestion = normalizeText(question);
  const cleanedOptions = Array.isArray(options)
    ? options.map((option) => normalizeText(option)).filter(Boolean)
    : [];
  const cleanedImages = sanitizeImages(images);
  const cleanedAudios = sanitizeAudios(audios);
  const cleanedRejectedAnswers = Array.isArray(rejectedAnswers)
    ? rejectedAnswers.map((answer) => normalizeText(answer)).filter(Boolean)
    : [];
  const effectiveProviderOrder = getEffectiveProviderOrderForQuestion(
    cleanedQuestion,
    cleanedOptions,
    targetType,
    providerOrder,
    credentials,
    Boolean(cleanedAudios.length),
    Boolean(preferOpenAiSol)
  );
  const modelPolicy = {
    ...(await buildModelPolicy(effectiveProviderOrder, credentials)),
    preferOpenAiSol: Boolean(preferOpenAiSol),
  };
  const cacheKey = JSON.stringify({
    requestKey: requestKey || cleanedQuestion,
    options: cleanedOptions,
    targetType,
    detailedMode: Boolean(detailedMode),
    materialMode: Boolean(materialMode),
    materialRevision: Number(materialRevision) || 0,
    useAccuracyProfile: Boolean(useAccuracyProfile),
    preferOpenAiSol: Boolean(preferOpenAiSol),
    providerOrder: effectiveProviderOrder,
    freeApiMode: modelPolicy.freeApiMode,
    openRouterBudgetMode: modelPolicy.openRouterBudgetMode,
    imagesFingerprint: cleanedImages.map((image) => image.length).join(","),
    audioFingerprint: cleanedAudios.map((audioFile) => audioFile.length).join(","),
    rejectedAnswers: cleanedRejectedAnswers,
  });

  if (answerCache.has(cacheKey)) {
    const cached = answerCache.get(cacheKey);
    if (typeof cached === "string") {
      return { answer: cached, model: "" };
    }
    return cached;
  }

  console.log(
    "OpenRouter mode:",
    modelPolicy.freeApiMode ? "free-first" : "Gemini via OpenRouter"
  );

  let lastInvalidAnswer = "";
  let lastError = null;
  // Unified across BOTH failure kinds (thrown errors and answers rejected
  // as invalid) so the fallback note below can't miss the common case where
  // a provider responds fine but its answer just doesn't pass validation.
  let lastFailureSummary = "";
  let lastFailureProviderId = "";
  const providerErrors = new Map();
  const skippedProviders = new Set();

  for (const plan of buildRequestPlans(
    cleanedQuestion,
    cleanedOptions,
    targetType,
    detailedMode,
    materialContext,
    useAccuracyProfile,
    effectiveProviderOrder,
    modelPolicy,
    cleanedImages
  )) {
    if (skippedProviders.has(plan.providerId)) {
      continue;
    }

    try {
      let requestPrompt = plan.prompt;
      if (cleanedRejectedAnswers.length) {
        requestPrompt += [
          "",
          "Previously marked incorrect by the learning site:",
          ...cleanedRejectedAnswers.map((answer) => `- ${answer}`),
          "Do not return any of those answers again. Reconsider the Japanese cue and choose a different exact textbook answer.",
        ].join("\n");
      }
      let audioMode = cleanedAudios.length
        ? plan.providerId === PROVIDER_GEMINI
          ? "Gemini direct audio"
          : "Visible-text fallback"
        : "";
      if (plan.providerId === PROVIDER_OPENAI && cleanedAudios.length) {
        try {
          const transcript = await getOpenAiAudioTranscript(
            cleanedAudios[0],
            credentials,
            cleanedQuestion
          );
          requestPrompt +=
            `\n\nAudio transcript (use this as the authoritative listening content):\n` +
            `${transcript}\nAnswer the exercise using this transcript and the visible context.`;
          audioMode = "OpenAI gpt-transcribe";
        } catch (transcriptionError) {
          // The visible sentence often contains enough context to solve the
          // blank. Keep the normal OpenAI answer path alive if transcription
          // is unavailable, and leave a diagnostic in the service-worker log.
          console.warn(
            "OpenAI audio transcription failed; continuing with visible text:",
            transcriptionError
          );
        }
      }

      const response = await requestChatCompletion(
        plan.providerId,
        plan.model,
        requestPrompt,
        plan.maxTokens,
        credentials,
        {
          images: plan.images,
          audios: plan.providerId === PROVIDER_GEMINI ? cleanedAudios : [],
          allowThinking: plan.allowThinking || Boolean(cleanedAudios.length),
        }
      );
      const rawAnswer = response.answer;
      const sanitizedAnswer = sanitizeAnswer(
        rawAnswer,
        cleanedQuestion,
        cleanedOptions,
        targetType
      );
      const repeatedRejectedAnswer = cleanedRejectedAnswers.some(
        (rejectedAnswer) =>
          compactText(rejectedAnswer) === compactText(sanitizedAnswer)
      );

      if (repeatedRejectedAnswer) {
        lastInvalidAnswer = rawAnswer;
        lastFailureSummary = `repeated rejected answer "${extractFirstLine(rawAnswer)}"`;
        lastFailureProviderId = plan.providerId;
        providerErrors.set(plan.providerId, lastFailureSummary);
        console.warn("Rejected an answer already marked wrong by the site:", {
          model: plan.model,
          answer: rawAnswer,
        });
        continue;
      }

      if (
        isLikelyInvalidAnswer(
          sanitizedAnswer,
          cleanedQuestion,
          cleanedOptions,
          targetType
        )
      ) {
        lastInvalidAnswer = rawAnswer;
        lastFailureSummary = `invalid answer "${extractFirstLine(rawAnswer)}"`;
        lastFailureProviderId = plan.providerId;
        providerErrors.set(plan.providerId, lastFailureSummary);
        console.warn("Rejected invalid answer:", {
          model: plan.model,
          answer: rawAnswer,
        });
        continue;
      }

      const result = {
        answer: sanitizedAnswer,
        model: response.resolvedModel || plan.model,
        provider: plan.providerId,
        audioMode,
      };

      // Surface the raw calculation so the user can sanity-check it (e.g.
      // verify the circuit topology the model assumed) instead of just
      // trusting an opaque number.
      const answerMode = detectAnswerMode(cleanedQuestion, cleanedOptions, targetType);
      if (answerMode === "number") {
        const expressionText = extractExpressionLine(rawAnswer);
        if (expressionText) {
          result.expression = expressionText;
        }
      }

      // A provider silently failing and falling back to the next one is
      // invisible from the panel alone (it just shows the provider that
      // finally succeeded) — surface it so this doesn't need a console dig.
      if (lastFailureSummary && lastFailureProviderId && lastFailureProviderId !== plan.providerId) {
        result.fallbackNote = `${getProviderLabel(lastFailureProviderId)} failed (${lastFailureSummary.slice(
          0,
          160
        )}) -> used ${getProviderLabel(plan.providerId)} instead`;
        logFallbackEvent(result.fallbackNote);
      }

      answerCache.set(cacheKey, result);
      return result;
    } catch (error) {
      lastError = error;
      lastFailureSummary = normalizeText(error?.message || String(error));
      lastFailureProviderId = plan.providerId;
      providerErrors.set(plan.providerId, lastFailureSummary);
      if (error?.skipRemainingProvider) {
        skippedProviders.add(plan.providerId);
      }
      console.warn(
        `${getProviderLabel(plan.providerId)} request failed for model ${plan.model}:`,
        error
      );
    }
  }

  const lastMessage = normalizeText(lastError?.message || "");
  if (
    lastMessage.includes("Empty response from https://openrouter.ai/api/v1/chat/completions")
  ) {
    throw new Error(
      "OpenRouter returned an empty response. Please retry, or enable another fallback provider in API Providers."
    );
  }

  throw buildProviderChainError(
    effectiveProviderOrder,
    providerErrors,
    lastInvalidAnswer
      ? `Invalid answer from API: ${extractFirstLine(lastInvalidAnswer)}`
      : lastError?.message || "Failed to get a valid response from configured APIs."
  );
}

function normalizeGapfillBlanks(blanks) {
  if (!Array.isArray(blanks)) {
    return [];
  }

  return blanks
    .map((blank, index) => ({
      label: normalizeText(blank?.label) || `空白${index + 1}`,
      options: Array.isArray(blank?.options)
        ? blank.options.map((option) => normalizeText(option)).filter(Boolean)
        : [],
    }))
    .filter((blank) => blank.options.length);
}

function buildGapfillPrompt(markedText, blanks) {
  const instructions = [
    "Fill every numbered blank in the sentence below.",
    "Each blank is written as [1], [2], and so on.",
    "Use the complete text before and after every blank. Do not solve a blank from a nearby keyword alone.",
    "Silently reconstruct the whole sentence or passage with the candidate choices and select the combination that is grammatically correct and most natural in meaning.",
    "Check tense, subject-verb agreement, singular/plural form, articles, prepositions, word order, collocations, and consistency between surrounding sentences.",
    "If Japanese instructions or a Japanese translation are present, use them as an additional meaning constraint without making the completed English unnatural.",
    "For each blank choose the single best option from that blank's own choice list, copied character-for-character.",
    "The blanks are related to each other (e.g. an opening tag and its matching closing tag), so decide all of them together so the whole sentence makes sense as one unit.",
    'Output exactly one line per blank in the form "N: answer" — for example "1: canvas".',
    'Use only the plain blank number before the colon (no brackets, no word "Blank", no extra text).',
    "Do not add explanations, headers, or any line that is not one of the numbered answers.",
  ];

  if (containsJapanese(markedText)) {
    instructions.push("Keep each option text exactly as given (do not translate).");
  }

  const choiceLines = blanks.map(
    (blank, index) => `[${index + 1}]: ${blank.options.join(" | ")}`
  );

  return [
    ...instructions,
    "",
    `Sentence: ${markedText}`,
    "",
    "Choices:",
    ...choiceLines,
  ].join("\n");
}

function parseGapfillAnswers(rawText, blanks) {
  const byIndex = new Map();

  for (const rawLine of String(rawText || "").split(/\r?\n/)) {
    const line = normalizeText(rawLine);
    const match = line.match(/^\[?\s*(\d+)\s*\]?\s*[:：.)\-]\s*(.+)$/);
    if (!match) {
      continue;
    }

    const index = Number(match[1]) - 1;
    if (index < 0 || index >= blanks.length || byIndex.has(index)) {
      continue;
    }

    byIndex.set(index, match[2]);
  }

  return blanks.map((blank, index) => {
    const rawAnswer = byIndex.get(index) || "";
    const matchedOption = findMatchingOption(rawAnswer, blank.options);
    return {
      label: blank.label,
      answer: matchedOption || normalizeText(rawAnswer),
      valid: Boolean(matchedOption),
    };
  });
}

async function callGapfillChat(
  markedText,
  rawBlanks,
  requestKey = "",
  detailedMode = false,
  materialMode = false,
  materialRevision = 0,
  materialContext = "",
  useAccuracyProfile = false,
  providerOrder = DEFAULT_PROVIDER_ORDER,
  credentials = {},
  images = [],
  preferOpenAiSol = false
) {
  const blanks = normalizeGapfillBlanks(rawBlanks);
  if (!blanks.length) {
    throw new Error("No answerable blanks were provided.");
  }

  const cleanedText = normalizeText(markedText);
  const cleanedImages = sanitizeImages(images);
  const effectiveProviderOrder = getEffectiveProviderOrderForQuestion(
    cleanedText,
    blanks.flatMap((blank) => blank.options),
    "standard",
    providerOrder,
    credentials,
    false,
    Boolean(preferOpenAiSol)
  );
  const modelPolicy = {
    ...(await buildModelPolicy(effectiveProviderOrder, credentials)),
    preferOpenAiSol: Boolean(preferOpenAiSol),
  };
  const cacheKey = JSON.stringify({
    gapfill: true,
    requestKey: requestKey || cleanedText,
    blanks,
    detailedMode: Boolean(detailedMode),
    materialMode: Boolean(materialMode),
    materialRevision: Number(materialRevision) || 0,
    useAccuracyProfile: Boolean(useAccuracyProfile),
    providerOrder: effectiveProviderOrder,
    preferOpenAiSol: Boolean(preferOpenAiSol),
    freeApiMode: modelPolicy.freeApiMode,
    openRouterBudgetMode: modelPolicy.openRouterBudgetMode,
    imagesFingerprint: cleanedImages.map((image) => image.length).join(","),
  });

  if (answerCache.has(cacheKey)) {
    return answerCache.get(cacheKey);
  }

  const effectiveDetailedMode = detailedMode || useAccuracyProfile;
  const hasImages = Boolean(cleanedImages.length);
  let plans = buildProviderModelPlans(effectiveProviderOrder, useAccuracyProfile, {
    ...modelPolicy,
    detailedMode: effectiveDetailedMode,
    hasImages,
  });
  if (hasImages) {
    const visionPlans = plans.filter(
      (plan) => !NON_VISION_MODEL_PATTERN.test(plan.model)
    );
    if (visionPlans.length) {
      plans = visionPlans;
    }
  }
  if (!plans.length) {
    throw new Error("No usable model is configured for gapfill questions.");
  }

  const prompt = buildGapfillPrompt(cleanedText, blanks);
  const maxTokens = Math.max(128, blanks.length * 32 + 32);

  let lastError = null;
  let lastFailureSummary = "";
  let lastFailureProviderId = "";
  let bestPartial = null;
  const providerErrors = new Map();
  const skippedProviders = new Set();

  for (const plan of plans) {
    if (skippedProviders.has(plan.providerId)) {
      continue;
    }

    try {
      const response = await requestChatCompletion(
        plan.providerId,
        plan.model,
        prompt,
        maxTokens,
        credentials,
        {
          images: cleanedImages,
          // Choosing a word from context requires comparing every candidate in
          // the complete sentence, even when the global detailed mode is off.
          allowThinking: true,
        }
      );
      const answers = parseGapfillAnswers(response.answer, blanks);
      const validCount = answers.filter((answer) => answer.valid).length;
      const result = {
        answers,
        model: response.resolvedModel || plan.model,
        provider: plan.providerId,
      };

      if (validCount === blanks.length) {
        if (
          lastFailureSummary &&
          lastFailureProviderId &&
          lastFailureProviderId !== plan.providerId
        ) {
          result.fallbackNote = `${getProviderLabel(lastFailureProviderId)} failed (${lastFailureSummary.slice(
            0,
            160
          )}) -> used ${getProviderLabel(plan.providerId)} instead`;
          logFallbackEvent(result.fallbackNote);
        }
        answerCache.set(cacheKey, result);
        return result;
      }

      lastFailureSummary = `only ${validCount}/${blanks.length} blanks valid`;
      lastFailureProviderId = plan.providerId;
      providerErrors.set(plan.providerId, lastFailureSummary);

      if (!bestPartial || validCount > bestPartial.validCount) {
        bestPartial = { ...result, validCount };
      }

      console.warn("Gapfill answer incomplete:", {
        model: plan.model,
        validCount,
        expected: blanks.length,
      });
    } catch (error) {
      lastError = error;
      lastFailureSummary = normalizeText(error?.message || String(error));
      lastFailureProviderId = plan.providerId;
      providerErrors.set(plan.providerId, lastFailureSummary);
      if (error?.skipRemainingProvider) {
        skippedProviders.add(plan.providerId);
      }
      console.warn(
        `${getProviderLabel(plan.providerId)} gapfill request failed for model ${plan.model}:`,
        error
      );
    }
  }

  if (bestPartial) {
    const { validCount, ...result } = bestPartial;
    if (
      lastFailureSummary &&
      lastFailureProviderId &&
      lastFailureProviderId !== result.provider
    ) {
      result.fallbackNote = `${getProviderLabel(lastFailureProviderId)} failed (${lastFailureSummary.slice(
        0,
        160
      )}) -> used ${getProviderLabel(result.provider)} instead`;
      logFallbackEvent(result.fallbackNote);
    }
    answerCache.set(cacheKey, result);
    return result;
  }

  throw buildProviderChainError(
    effectiveProviderOrder,
    providerErrors,
    lastError?.message || "Failed to get a gapfill response."
  );
}

function normalizeMultiBlankBlanks(blanks) {
  if (!Array.isArray(blanks)) {
    return [];
  }

  return blanks
    .map((blank, index) => ({
      label: normalizeText(blank?.label) || `空白${index + 1}`,
      fieldType: normalizeText(blank?.fieldType) || "blank",
    }))
    .filter((blank) => blank.label);
}

function buildMultiBlankPrompt(markedText, blanks, hasImages) {
  const instructions = [
    "This is one multi-part problem with several related blanks, written as [1], [2], and so on in the text below.",
    "The blanks depend on each other (e.g. currents in the same circuit, or a later part building on an earlier part's setup), so work through the WHOLE problem once and keep every answer consistent with the others.",
    "Pay close attention to which section/part of the problem each blank belongs to. Do not reuse a value, formula, or assumption from a different part unless it still genuinely applies there.",
    'If a blank\'s value requires a calculation, output that line as "N: EXPR: <expression>" — a plain arithmetic expression using only +, -, *, /, ^, parentheses, and decimal or scientific-notation numbers. You are bad at arithmetic, so never compute the final value yourself when a calculation is needed.',
    'If a blank is a simple lookup, symbol, or short word/name answer with no calculation, output that line as "N: <answer>" instead.',
    'Example: "1: EXPR: 8 / (100 * 400 / (100 + 400))" or "2: canvas".',
    "Output exactly one line per blank, in order, and nothing else — no headers, no explanations, no restated question.",
  ];

  if (hasImages) {
    instructions.push(
      "One or more images are attached (diagrams or figures). Read them carefully — they define the structure (e.g. circuit topology) needed to answer correctly, and it may differ between parts."
    );
  }

  if (containsJapanese(markedText)) {
    instructions.push("Answer in Japanese for any blank that expects a word rather than a number.");
  }

  const blankList = blanks
    .map((blank, index) => `[${index + 1}]: ${blank.label}`)
    .join("\n");

  return [
    ...instructions,
    "",
    `Problem: ${markedText}`,
    "",
    "Blanks:",
    blankList,
  ].join("\n");
}

function buildMultiBlankAnswersFromMap(byIndex, blanks, markedText) {
  return blanks.map((blank, index) => {
    const rawAnswer = byIndex.get(index) || "";
    const fieldType = blank.fieldType || "blank";
    const sanitized = sanitizeAnswer(rawAnswer, markedText, [], fieldType);
    const answerMode = detectAnswerMode(markedText, [], fieldType);

    let expression = "";
    if (answerMode === "number") {
      const exprText = extractExpressionLine(rawAnswer);
      if (exprText) {
        expression = exprText;
      }
    }

    return {
      label: blank.label,
      answer: sanitized,
      expression,
      valid:
        Boolean(sanitized) &&
        !isLikelyInvalidAnswer(sanitized, markedText, [], fieldType),
    };
  });
}

function parseMultiBlankAnswers(rawText, blanks, markedText) {
  const numberedLines = [];

  for (const rawLine of String(rawText || "").split(/\r?\n/)) {
    const line = normalizeText(rawLine);
    const match = line.match(/^\[?\s*(\d+)\s*\]?\s*[:：.)\-]\s*(.+)$/);
    if (!match) {
      continue;
    }

    numberedLines.push({
      claimedIndex: Number(match[1]) - 1,
      content: match[2],
    });
  }

  // Trust the model's own numbering first.
  const byClaimedIndex = new Map();
  for (const { claimedIndex, content } of numberedLines) {
    if (
      claimedIndex >= 0 &&
      claimedIndex < blanks.length &&
      !byClaimedIndex.has(claimedIndex)
    ) {
      byClaimedIndex.set(claimedIndex, content);
    }
  }
  const claimedAnswers = buildMultiBlankAnswersFromMap(byClaimedIndex, blanks, markedText);
  const claimedValidCount = claimedAnswers.filter((answer) => answer.valid).length;

  if (claimedValidCount >= blanks.length) {
    return claimedAnswers;
  }

  // The model sometimes skips or miscounts a number (e.g. starts at "2:"
  // instead of "1:"), which silently shifts every answer onto the wrong
  // blank instead of just failing loudly. As a fallback, also try trusting
  // plain appearance order over the model's own (possibly wrong) numbers.
  const byPosition = new Map();
  numberedLines.forEach((entry, position) => {
    if (position < blanks.length) {
      byPosition.set(position, entry.content);
    }
  });
  const positionalAnswers = buildMultiBlankAnswersFromMap(byPosition, blanks, markedText);
  const positionalValidCount = positionalAnswers.filter((answer) => answer.valid).length;

  if (positionalValidCount > claimedValidCount) {
    return positionalAnswers;
  }

  // Format-validity alone can't tell "0.1 is I's value" from "0.1 is I1's
  // value" — a shifted numbering scheme looks equally valid either way, so
  // validCount alone ties. If the model's own numbers are monotonically
  // increasing in appearance order but don't start at 1, that's the
  // signature of a consistent off-by-N shift (e.g. it skipped "1:" and
  // began at "2:"), and appearance order is the more trustworthy mapping.
  const isMonotonic = numberedLines.every(
    (entry, i) => i === 0 || entry.claimedIndex > numberedLines[i - 1].claimedIndex
  );
  const looksShifted =
    isMonotonic && numberedLines.length > 0 && numberedLines[0].claimedIndex !== 0;

  if (looksShifted && positionalValidCount === claimedValidCount) {
    return positionalAnswers;
  }

  return claimedAnswers;
}

async function callMultiBlankChat(
  markedText,
  rawBlanks,
  requestKey = "",
  detailedMode = false,
  materialMode = false,
  materialRevision = 0,
  materialContext = "",
  useAccuracyProfile = false,
  providerOrder = DEFAULT_PROVIDER_ORDER,
  credentials = {},
  images = [],
  preferOpenAiSol = false
) {
  const blanks = normalizeMultiBlankBlanks(rawBlanks);
  if (!blanks.length) {
    throw new Error("No answerable blanks were provided.");
  }

  const cleanedText = normalizeText(markedText);
  const cleanedImages = sanitizeImages(images);
  const effectiveProviderOrder = getEffectiveProviderOrderForQuestion(
    cleanedText,
    [],
    "standard",
    providerOrder,
    credentials,
    false,
    Boolean(preferOpenAiSol)
  );
  const modelPolicy = {
    ...(await buildModelPolicy(effectiveProviderOrder, credentials)),
    preferOpenAiSol: Boolean(preferOpenAiSol),
  };
  const cacheKey = JSON.stringify({
    multiblank: true,
    requestKey: requestKey || cleanedText,
    blanks,
    detailedMode: Boolean(detailedMode),
    materialMode: Boolean(materialMode),
    materialRevision: Number(materialRevision) || 0,
    useAccuracyProfile: Boolean(useAccuracyProfile),
    providerOrder: effectiveProviderOrder,
    preferOpenAiSol: Boolean(preferOpenAiSol),
    freeApiMode: modelPolicy.freeApiMode,
    openRouterBudgetMode: modelPolicy.openRouterBudgetMode,
    imagesFingerprint: cleanedImages.map((image) => image.length).join(","),
  });

  if (answerCache.has(cacheKey)) {
    return answerCache.get(cacheKey);
  }

  const effectiveDetailedMode = detailedMode || useAccuracyProfile;
  const hasImages = Boolean(cleanedImages.length);
  let plans = buildProviderModelPlans(effectiveProviderOrder, useAccuracyProfile, {
    ...modelPolicy,
    detailedMode: effectiveDetailedMode,
    hasImages,
  });
  if (hasImages) {
    const visionPlans = plans.filter(
      (plan) => !NON_VISION_MODEL_PATTERN.test(plan.model)
    );
    if (visionPlans.length) {
      plans = visionPlans;
    }
  }
  if (!plans.length) {
    throw new Error("No usable model is configured for multi-part questions.");
  }

  const prompt = buildMultiBlankPrompt(cleanedText, blanks, hasImages);
  // Multi-part problems (often calculation-heavy) benefit from a larger
  // token budget and always get some thinking room, since collapsing
  // several related sub-answers into one pass is inherently harder than a
  // single blank.
  const maxTokens = Math.max(96, blanks.length * 48 + 32);

  let lastError = null;
  let lastFailureSummary = "";
  let lastFailureProviderId = "";
  let bestPartial = null;
  const providerErrors = new Map();
  const skippedProviders = new Set();

  for (const plan of plans) {
    if (skippedProviders.has(plan.providerId)) {
      continue;
    }

    try {
      const response = await requestChatCompletion(
        plan.providerId,
        plan.model,
        prompt,
        maxTokens,
        credentials,
        { images: cleanedImages, allowThinking: true }
      );
      const answers = parseMultiBlankAnswers(response.answer, blanks, cleanedText);
      const validCount = answers.filter((answer) => answer.valid).length;
      const result = {
        answers,
        model: response.resolvedModel || plan.model,
        provider: plan.providerId,
      };

      if (validCount === blanks.length) {
        if (
          lastFailureSummary &&
          lastFailureProviderId &&
          lastFailureProviderId !== plan.providerId
        ) {
          result.fallbackNote = `${getProviderLabel(lastFailureProviderId)} failed (${lastFailureSummary.slice(
            0,
            160
          )}) -> used ${getProviderLabel(plan.providerId)} instead`;
          logFallbackEvent(result.fallbackNote);
        }
        answerCache.set(cacheKey, result);
        return result;
      }

      lastFailureSummary = `only ${validCount}/${blanks.length} blanks valid`;
      lastFailureProviderId = plan.providerId;
      providerErrors.set(plan.providerId, lastFailureSummary);

      if (!bestPartial || validCount > bestPartial.validCount) {
        bestPartial = { ...result, validCount };
      }

      console.warn("Multi-blank answer incomplete:", {
        model: plan.model,
        validCount,
        expected: blanks.length,
        blanks: blanks.map((blank) => blank.label),
        answers: answers.map((answer) => `${answer.label}=${answer.answer || "(empty)"}`),
        rawResponse: response.answer,
      });
    } catch (error) {
      lastError = error;
      lastFailureSummary = normalizeText(error?.message || String(error));
      lastFailureProviderId = plan.providerId;
      providerErrors.set(plan.providerId, lastFailureSummary);
      if (error?.skipRemainingProvider) {
        skippedProviders.add(plan.providerId);
      }
      console.warn(
        `${getProviderLabel(plan.providerId)} multi-blank request failed for model ${plan.model}:`,
        error
      );
    }
  }

  if (bestPartial) {
    const { validCount, ...result } = bestPartial;
    if (
      lastFailureSummary &&
      lastFailureProviderId &&
      lastFailureProviderId !== result.provider
    ) {
      result.fallbackNote = `${getProviderLabel(lastFailureProviderId)} failed (${lastFailureSummary.slice(
        0,
        160
      )}) -> used ${getProviderLabel(result.provider)} instead`;
      logFallbackEvent(result.fallbackNote);
    }
    answerCache.set(cacheKey, result);
    return result;
  }

  throw buildProviderChainError(
    effectiveProviderOrder,
    providerErrors,
    lastError?.message || "Failed to get a multi-blank response."
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "getAnswer") {
    return false;
  }

  const {
    question,
    options,
    images,
    audios,
    audioUrls,
    blanks,
    requestKey,
    targetType,
    fieldLabel,
    preferOpenAiSol,
    rejectedAnswers,
    detailedMode,
    materialMode,
    materialRevision,
  } = request;
  const hasBlanks = Array.isArray(blanks) && blanks.length > 0;
  const isGapfill = targetType === "gapfill" && hasBlanks;
  const isMultiBlank = targetType === "multiblank" && hasBlanks;
  const cleanedImages = sanitizeImages(images);
  let cleanedAudios = sanitizeAudios(audios);
  const cleanedAudioUrls = sanitizeRemoteAudioUrls(audioUrls);
  console.log(
    "Received from content:",
    question,
    hasBlanks ? `blanks=${blanks.length}` : options,
    targetType,
    fieldLabel,
    detailedMode,
    `images=${cleanedImages.length}`,
    `audios=${cleanedAudios.length}`,
    `audioUrls=${cleanedAudioUrls.length}`
  );

  resolveRequestAudios(cleanedAudios, cleanedAudioUrls)
    .then((resolvedAudios) => {
      cleanedAudios = resolvedAudios;
      return loadMaterialState();
    })
    .then((materialState) => {
      let activeProviders = filterProvidersByCredentials(
        materialState.apiProviders,
        materialState
      );

      // A speech/audio Custom LLM opts listening questions into Gemini's
      // direct-audio path when a Gemini key is available, even if Gemini is
      // unchecked. PlaMo is text-only and does not trigger this audio path.
      const preferGeminiAudio = shouldPreferGeminiForCustomAudio(
        activeProviders,
        materialState,
        Boolean(cleanedAudios.length)
      );
      if (
        preferGeminiAudio &&
        normalizeText(materialState.geminiApiKey) &&
        !activeProviders.includes(PROVIDER_GEMINI)
      ) {
        activeProviders = [PROVIDER_GEMINI, ...activeProviders];
      }
      if (!activeProviders.length) {
        throw new Error(
          "No usable API provider is configured. Enable OpenAI/OpenRouter/Gemini/Custom LLM and complete its settings in the popup."
        );
      }

      const droppedForMissingKey = normalizeProviderOrder(
        materialState.apiProviders
      ).filter((providerId) => !activeProviders.includes(providerId));
      if (droppedForMissingKey.length) {
        console.warn(
          "Skipping configured provider(s) with no API key set (check the popup):",
          droppedForMissingKey.map(getProviderLabel)
        );
      }

      const shouldUseMaterial =
        Boolean(materialMode) &&
        materialState.materialMode &&
        Boolean(materialState.materialContext);
      const shouldUseAccuracyProfile =
        shouldUseMaterial && materialState.hasPdfSource;
      const selectedMaterialRevision = shouldUseMaterial
        ? Number(materialRevision || materialState.materialRevision || 0)
        : 0;
      const selectedMaterialContext = shouldUseMaterial
        ? materialState.materialContext
        : "";

      console.log("Model profile:", shouldUseAccuracyProfile ? "material-accuracy" : "standard");

      if (isGapfill) {
        return enqueueAiRequest(() =>
          callGapfillChat(
            question,
            blanks,
            requestKey,
            detailedMode,
            shouldUseMaterial,
            selectedMaterialRevision,
            selectedMaterialContext,
            shouldUseAccuracyProfile,
            activeProviders,
            materialState,
            cleanedImages,
            Boolean(preferOpenAiSol)
          )
        );
      }

      if (isMultiBlank) {
        return enqueueAiRequest(() =>
          callMultiBlankChat(
            question,
            blanks,
            requestKey,
            detailedMode,
            shouldUseMaterial,
            selectedMaterialRevision,
            selectedMaterialContext,
            shouldUseAccuracyProfile,
            activeProviders,
            materialState,
            cleanedImages,
            Boolean(preferOpenAiSol)
          )
        );
      }

      return enqueueAiRequest(() =>
        callAiChat(
          question,
          options,
          requestKey,
          targetType,
          detailedMode,
          shouldUseMaterial,
          selectedMaterialRevision,
          selectedMaterialContext,
          shouldUseAccuracyProfile,
          activeProviders,
          materialState,
          cleanedImages,
          cleanedAudios,
          Boolean(preferOpenAiSol),
          rejectedAnswers
        )
      );
    })
    .then((result) => {
      if (isGapfill || isMultiBlank) {
        const answers = Array.isArray(result?.answers) ? result.answers : [];
        const model = normalizeText(result?.model || "");
        const provider = normalizeText(result?.provider || "");
        const audioMode = normalizeText(result?.audioMode || "");
        const fallbackNote = normalizeText(result?.fallbackNote || "");
        console.log(
          isMultiBlank ? "Parsed multi-blank answers:" : "Parsed gapfill answers:",
          answers
            .map((item) => `${item.label}=${item.answer}${item.expression ? ` (${item.expression})` : ""}`)
            .join(", "),
          "model:",
          model || "(unknown)",
          "provider:",
          provider || "(unknown)",
          fallbackNote ? `fallback: ${fallbackNote}` : ""
        );
        sendResponse({ answers, model, provider, audioMode, fallbackNote });
        return;
      }

      const answer = normalizeText(
        typeof result === "string" ? result : result?.answer || ""
      );
      const model = normalizeText(
        typeof result === "object" ? result?.model || "" : ""
      );
      const provider = normalizeText(
        typeof result === "object" ? result?.provider || "" : ""
      );
      const audioMode = normalizeText(
        typeof result === "object" ? result?.audioMode || "" : ""
      );
      const expression = normalizeText(
        typeof result === "object" ? result?.expression || "" : ""
      );
      const fallbackNote = normalizeText(
        typeof result === "object" ? result?.fallbackNote || "" : ""
      );

      console.log(
        "Parsed answer:",
        answer,
        "model:",
        model || "(unknown)",
        "provider:",
        provider || "(unknown)",
        expression ? `expr: ${expression}` : "",
        fallbackNote ? `fallback: ${fallbackNote}` : ""
      );
      sendResponse({ answer, model, provider, audioMode, expression, fallbackNote });
    })
    .catch((error) => {
      console.error("Error calling AI API:", error);
      sendResponse({
        error: normalizeText(error?.message || "Error fetching answer."),
      });
    });

  return true;
});

const LINGUAPORTA_TAB_URL_PATTERNS = [
  "http://*.linguaporta.jp/user/seibido/*",
  "https://*.linguaporta.jp/user/seibido/*",
];
const contentRestoreInFlight = new Set();

function isSupportedLinguaportaTabUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.toLowerCase();
    return (
      /^https?:$/.test(url.protocol) &&
      (hostname === "linguaporta.jp" || hostname.endsWith(".linguaporta.jp")) &&
      url.pathname.startsWith("/user/seibido/")
    );
  } catch (_error) {
    return false;
  }
}

function pingLinguaportaContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: "linguaportaContentPing" },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        resolve(!runtimeError && response?.ok === true);
      }
    );
  });
}

function injectLinguaportaContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["content.js"],
      },
      () => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve();
      }
    );
  });
}

async function restoreLinguaportaContentScript(tabId) {
  if (!Number.isInteger(tabId) || contentRestoreInFlight.has(tabId)) {
    return;
  }

  contentRestoreInFlight.add(tabId);
  try {
    if (!(await pingLinguaportaContentScript(tabId))) {
      await injectLinguaportaContentScript(tabId);
    }
  } catch (error) {
    console.warn(`Failed to restore content script in tab ${tabId}:`, error);
  } finally {
    contentRestoreInFlight.delete(tabId);
  }
}

function restoreOpenLinguaportaTabs() {
  chrome.tabs.query({ url: LINGUAPORTA_TAB_URL_PATTERNS }, (tabs) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      console.warn("Failed to find open Linguaporta tabs:", runtimeError.message);
      return;
    }

    for (const tab of tabs || []) {
      restoreLinguaportaContentScript(tab.id);
    }
  });
}

chrome.runtime.onInstalled.addListener(restoreOpenLinguaportaTabs);
chrome.runtime.onStartup.addListener(restoreOpenLinguaportaTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isSupportedLinguaportaTabUrl(tab?.url)) {
    restoreLinguaportaContentScript(tabId);
  }
});

// Unpacked-extension reloads start a fresh service worker while existing Linguaporta
// tabs stay open. Repair those tabs immediately instead of waiting for a page
// reload or for the settings popup to be opened.
restoreOpenLinguaportaTabs();
