// client-engine.js
//
// On-device PII detection engine. Runs a token-classification (NER) model in
// the browser via transformers.js with the WebGPU backend, then combines its
// person/location predictions with regex detectors for structured PII
// (email, phone, URL, date, account numbers, secrets).
//
// transformers.js is loaded lazily from a CDN the first time the engine runs,
// so the rest of the page works even if the CDN is blocked (the orchestrator
// falls back to the server engine on any failure here).

import {
  detectRegexSpans,
  buildResult,
  mapNerLabel,
  placeholderFor,
} from "./pii-core.js";

const DEFAULT_TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";
const DEFAULT_MODEL_ID = "Xenova/bert-base-multilingual-cased-ner-hrl";

let _transformersPromise = null;

function loadTransformers(url) {
  if (!_transformersPromise) {
    _transformersPromise = import(/* @vite-ignore */ url || DEFAULT_TRANSFORMERS_URL);
  }
  return _transformersPromise;
}

// Normalize transformers.js token-classification output into our span shape.
function nerEntitiesToSpans(entities, text) {
  const spans = [];
  for (const entity of entities || []) {
    const label = mapNerLabel(entity.entity_group || entity.entity);
    if (!label) continue;
    let start = entity.start;
    let end = entity.end;
    // Some configs omit char offsets; recover them from the word when needed.
    if (typeof start !== "number" || typeof end !== "number") {
      const word = (entity.word || "").replace(/^##/, "");
      if (!word) continue;
      const idx = text.indexOf(word);
      if (idx === -1) continue;
      start = idx;
      end = idx + word.length;
    }
    if (start >= end) continue;
    spans.push({
      label,
      start,
      end,
      text: text.slice(start, end),
      placeholder: placeholderFor(label),
      source: "ner",
      score: entity.score,
    });
  }
  return spans;
}

export function createClientEngine(options = {}) {
  const modelId = options.modelId || DEFAULT_MODEL_ID;
  const transformersUrl = options.transformersUrl || DEFAULT_TRANSFORMERS_URL;
  const device = options.device || "webgpu";
  const dtype = options.dtype || "q8";

  let pipelinePromise = null;
  let backend = device;

  async function getPipeline(onProgress) {
    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        const tf = await loadTransformers(transformersUrl);
        const { pipeline, env } = tf;
        // Use remote models from the HF Hub; cache in the browser.
        if (env) {
          env.allowLocalModels = false;
          env.useBrowserCache = true;
        }
        try {
          return await pipeline("token-classification", modelId, {
            device,
            dtype,
            progress_callback: onProgress,
          });
        } catch (err) {
          // Retry once on the WASM backend if WebGPU pipeline creation fails.
          if (device === "webgpu") {
            backend = "wasm";
            return await pipeline("token-classification", modelId, {
              device: "wasm",
              dtype,
              progress_callback: onProgress,
            });
          }
          throw err;
        }
      })();
    }
    return pipelinePromise;
  }

  return {
    name: "client",
    get backend() {
      return backend;
    },
    // Warm up (download + compile) ahead of time; resolves to the backend used.
    async warmup(onProgress) {
      await getPipeline(onProgress);
      return backend;
    },
    async run(text, onProgress) {
      const started =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const input = text || "";
      const regexSpans = detectRegexSpans(input);

      let nerSpans = [];
      if (input.trim()) {
        const ner = await getPipeline(onProgress);
        const entities = await ner(input, { aggregation_strategy: "simple" });
        nerSpans = nerEntitiesToSpans(entities, input);
      }

      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const result = buildResult(input, [...nerSpans, ...regexSpans], {
        engine: "client",
        latencyMs: now - started,
      });
      result.backend = backend;
      return result;
    },
  };
}

export { DEFAULT_MODEL_ID };
