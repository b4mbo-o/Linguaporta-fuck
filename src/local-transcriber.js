import { env, pipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-tiny.en";
const transcribers = new Map();

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.wasm"),
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseAudioDataUrl(dataUrl) {
  const match = /^data:audio\/[^;,]+;base64,(.+)$/s.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("Local Whisper received invalid audio data.");
  }

  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function decodeAudio(dataUrl) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Web Audio is unavailable in this browser.");
  }

  const context = new AudioContextClass({ sampleRate: 16000 });
  try {
    const decoded = await context.decodeAudioData(parseAudioDataUrl(dataUrl));
    const length = decoded.length;
    const mono = new Float32Array(length);
    for (let channelIndex = 0; channelIndex < decoded.numberOfChannels; channelIndex += 1) {
      const channel = decoded.getChannelData(channelIndex);
      const scale = 1 / decoded.numberOfChannels;
      for (let index = 0; index < length; index += 1) {
        mono[index] += channel[index] * scale;
      }
    }
    return mono;
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function hasWebGpu() {
  if (!navigator.gpu) {
    return false;
  }

  try {
    return Boolean(await navigator.gpu.requestAdapter());
  } catch (_error) {
    return false;
  }
}

async function getTranscriber(backend) {
  if (transcribers.has(backend)) {
    return transcribers.get(backend);
  }

  const options = backend === "webgpu"
    ? {
        device: "webgpu",
        dtype: {
          encoder_model: "fp32",
          decoder_model_merged: "q4",
        },
      }
    : {
        device: "wasm",
        dtype: "q8",
      };
  const loading = pipeline(
    "automatic-speech-recognition",
    MODEL_ID,
    options
  ).catch((error) => {
    transcribers.delete(backend);
    throw error;
  });
  transcribers.set(backend, loading);
  return loading;
}

async function transcribeWithBackend(dataUrl, backend) {
  const audio = await decodeAudio(dataUrl);
  const transcriber = await getTranscriber(backend);
  const output = await transcriber(audio, {
    chunk_length_s: 15,
    stride_length_s: 2,
  });
  const text = normalizeText(output?.text);
  if (!text) {
    throw new Error(`Local Whisper (${backend}) returned an empty transcript.`);
  }
  return text;
}

async function transcribeLocally(dataUrl, mode) {
  const normalizedMode = ["auto", "gpu", "cpu"].includes(mode) ? mode : "auto";
  const backends = normalizedMode === "gpu"
    ? ["webgpu"]
    : normalizedMode === "cpu"
      ? ["wasm"]
      : (await hasWebGpu())
        ? ["webgpu", "wasm"]
        : ["wasm"];
  let lastError = null;

  for (const backend of backends) {
    if (backend === "webgpu" && !(await hasWebGpu())) {
      lastError = new Error("WebGPU is unavailable in this browser.");
      continue;
    }
    try {
      return {
        text: await transcribeWithBackend(dataUrl, backend),
        backend,
        model: MODEL_ID,
      };
    } catch (error) {
      lastError = error;
      console.warn(`Local Whisper ${backend} failed:`, error);
    }
  }

  throw lastError || new Error("Local Whisper could not select an execution backend.");
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.target !== "local-transcriber" || request?.action !== "transcribeAudio") {
    return false;
  }

  transcribeLocally(request.dataUrl, request.mode)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: normalizeText(error?.message || "Local Whisper failed."),
      });
    });
  return true;
});
