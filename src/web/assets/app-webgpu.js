// app-webgpu.js
//
// Orchestrates the WebGPU (on-device) version of the Privacy Filter UI:
//   - Probes WebGPU capability.
//   - Lets the user pick Auto / On-device / Server.
//   - Runs the chosen engine, transparently falling back to the server
//     whenever on-device inference is unavailable, underpowered, or errors.

import { chooseEngine, DEFAULT_MIN_SCORE } from "./pii-core.js";
import { probeWebGPU, describeCapability } from "./capability.js";
import { createClientEngine } from "./client-engine.js";
import { createServerEngine } from "./server-engine.js";

const PALETTE = [
  "#ff8c61", "#5ad19a", "#6aa6ff", "#ffc24b", "#c08bff",
  "#4fd1c5", "#d6a05c", "#ff7ad9", "#e0c84b", "#ff6b6b",
];
const colorCache = new Map();
function labelColor(label) {
  if (!colorCache.has(label)) {
    colorCache.set(label, PALETTE[colorCache.size % PALETTE.length]);
  }
  return colorCache.get(label);
}

const EXAMPLES = [
  "Alice was born on 1990-01-02 and lives at 1 Main St.",
  "Email me at alice@example.com or call 415-555-0101.",
  "Me llamo Laura Gomez y vivo en Madrid. Mi correo es laura@correo.es.",
  "Mon e-mail est jean.dupont@example.fr et mon telephone est +33 6 12 34 56 78.",
  "My AWS key is AKIAIOSFODNN7EXAMPLE and card 4111 1111 1111 1111.",
];

const els = {};
function $(id) {
  return document.getElementById(id);
}

let config = {
  clientEnabled: true,
  modelId: undefined,
  transformersUrl: undefined,
  minScore: DEFAULT_MIN_SCORE,
};
let capability = { supported: false, score: 0, reason: "Probing..." };
let clientEngine = null;
const serverEngine = createServerEngine();

// Text awaiting explicit user consent before it may be sent to the server
// (set only when forced On-device mode cannot run locally).
let pendingServerText = null;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function setStatus(message, kind) {
  els.status.textContent = message;
  els.status.className = "status" + (kind ? " " + kind : "");
}

function setEngineBadge(engine, backend, latencyMs, fellBack) {
  let label;
  if (engine === "client") {
    label = `Processed on-device · WebGPU${backend && backend !== "webgpu" ? ` (${backend})` : ""}`;
  } else {
    label = "Processed on server";
  }
  if (typeof latencyMs === "number") label += ` · ${latencyMs.toFixed(0)} ms`;
  els.engineBadge.textContent = label;
  els.engineBadge.className =
    "engine-badge " + (engine === "client" ? "on-device" : "on-server");
  els.fallbackNote.style.display = fellBack ? "block" : "none";
}

function renderHighlights(text, spans) {
  if (!text) {
    els.highlighted.innerHTML =
      '<span class="placeholder">No entities detected yet.</span>';
    return;
  }
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let html = "";
  for (const span of sorted) {
    if (span.start < cursor || span.start >= span.end) continue;
    html += escapeHtml(text.slice(cursor, span.start));
    html += `<mark style="background:${labelColor(span.label)}">${escapeHtml(
      text.slice(span.start, span.end)
    )}<span class="tag">${escapeHtml(span.label)}</span></mark>`;
    cursor = span.end;
  }
  html += escapeHtml(text.slice(cursor));
  els.highlighted.innerHTML =
    html || '<span class="placeholder">No entities detected.</span>';
}

function renderSummary(spans) {
  if (!spans || spans.length === 0) {
    els.summary.innerHTML = '<li class="placeholder">No entities detected.</li>';
    return;
  }
  const counts = {};
  for (const span of spans) counts[span.label] = (counts[span.label] || 0) + 1;
  const ordered = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  els.summary.innerHTML = ordered
    .map(
      ([label, count]) =>
        `<li><span class="swatch" style="background:${labelColor(
          label
        )}"></span><code>${escapeHtml(label)}</code> &times; ${count}</li>`
    )
    .join("");
}

function renderResult(result) {
  renderHighlights(result.text, result.detected_spans || []);
  els.redacted.textContent = result.redacted_text || "";
  renderSummary(result.detected_spans || []);
}

function getPreference() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "auto";
}

function ensureClientEngine() {
  if (!clientEngine) {
    clientEngine = createClientEngine({
      modelId: config.modelId,
      transformersUrl: config.transformersUrl,
    });
  }
  return clientEngine;
}

function hideConsent() {
  pendingServerText = null;
  els.consent.style.display = "none";
}

// Offer the user an explicit choice to send text to the server. Used only when
// forced On-device mode cannot run locally; nothing is sent until they click.
function offerServerConsent(text, message) {
  pendingServerText = text;
  setStatus(`${message} Nothing has been sent anywhere.`, "warn");
  els.consent.style.display = "block";
}

async function runOnServer(text, { fellBack } = {}) {
  const result = await serverEngine.run(text);
  renderResult(result);
  setEngineBadge("server", "server", result.latency_ms, Boolean(fellBack));
  if (result.warning) setStatus(result.warning, "warn");
  return result;
}

async function run() {
  const text = els.input.value;
  setStatus("", "");
  hideConsent();
  if (!text.trim()) {
    renderHighlights("", []);
    els.redacted.innerHTML =
      '<span class="placeholder">Redacted text will appear here.</span>';
    renderSummary([]);
    els.engineBadge.textContent = "";
    els.fallbackNote.style.display = "none";
    return;
  }

  const preference = getPreference();
  const decision = chooseEngine({
    preference,
    webgpuSupported: capability.supported,
    deviceScore: capability.score,
    minScore: config.minScore,
    clientEnabled: config.clientEnabled,
  });

  // Forced On-device mode that cannot run locally: never auto-upload. Ask first.
  if (decision.engine === "blocked") {
    offerServerConsent(text, decision.reason);
    return;
  }

  els.submit.disabled = true;
  els.submit.textContent = "Detecting...";

  try {
    if (decision.engine === "client") {
      const engine = ensureClientEngine();
      setStatus("Loading on-device model (first run downloads weights)...", "info");
      await engine.warmup((p) => {
        if (p && p.status === "progress" && typeof p.progress === "number") {
          setStatus(
            `Downloading model: ${(p.file || "").split("/").pop()} ${p.progress.toFixed(0)}%`,
            "info"
          );
        }
      });
      setStatus("Running on-device inference...", "info");
      const result = await engine.run(text);
      renderResult(result);
      setEngineBadge("client", result.backend, result.latency_ms, false);
      setStatus(decision.reason, "ok");
      return;
    }

    // Server engine. This is reached for explicit Server mode and for Auto mode
    // fallback only (Auto is permitted to use the server automatically).
    const fellBack = preference === "auto";
    await runOnServer(text, { fellBack });
    setStatus(decision.reason, fellBack ? "warn" : "ok");
  } catch (err) {
    if (decision.engine === "client") {
      // Forced On-device failed at runtime: do NOT silently upload. Ask first.
      offerServerConsent(
        text,
        `On-device inference failed (${err && err.message ? err.message : err}).`
      );
    } else {
      setStatus(
        `Request failed: ${err && err.message ? err.message : err}`,
        "error"
      );
    }
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = "Detect & Redact";
  }
}

async function onConsentToServer() {
  if (pendingServerText == null) return;
  const text = pendingServerText;
  hideConsent();
  els.submit.disabled = true;
  els.submit.textContent = "Detecting...";
  setStatus("Processing on the server with your consent...", "info");
  try {
    await runOnServer(text, { fellBack: true });
    setStatus("Processed on the server with your consent.", "ok");
  } catch (err) {
    setStatus(
      `Server request failed: ${err && err.message ? err.message : err}`,
      "error"
    );
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = "Detect & Redact";
  }
}

function clearAll() {
  els.input.value = "";
  renderHighlights("", []);
  els.redacted.innerHTML =
    '<span class="placeholder">Redacted text will appear here.</span>';
  renderSummary([]);
  els.engineBadge.textContent = "";
  els.fallbackNote.style.display = "none";
  hideConsent();
  setStatus("", "");
  els.input.focus();
}

async function copyRedacted() {
  const text = els.redacted.textContent;
  if (!text || els.redacted.querySelector(".placeholder")) return;
  try {
    await navigator.clipboard.writeText(text);
    els.copy.textContent = "Copied!";
  } catch (_) {
    els.copy.textContent = "Copy failed";
  }
  setTimeout(() => (els.copy.textContent = "Copy"), 1500);
}

async function loadConfig() {
  try {
    const resp = await fetch("/config");
    if (resp.ok) {
      const data = await resp.json();
      config = {
        clientEnabled: data.client_enabled !== false,
        modelId: data.client_model || undefined,
        transformersUrl: data.transformers_url || undefined,
        minScore:
          typeof data.client_min_score === "number"
            ? data.client_min_score
            : DEFAULT_MIN_SCORE,
      };
    }
  } catch (_) {
    /* keep defaults */
  }
}

async function init() {
  els.input = $("input-text");
  els.submit = $("submit-btn");
  els.clear = $("clear-btn");
  els.copy = $("copy-btn");
  els.highlighted = $("highlighted");
  els.redacted = $("redacted");
  els.summary = $("summary");
  els.status = $("status");
  els.engineBadge = $("engine-badge");
  els.fallbackNote = $("fallback-note");
  els.consent = $("consent");
  els.consentBtn = $("consent-btn");
  els.capability = $("capability");
  els.examples = $("examples");

  els.submit.addEventListener("click", run);
  els.clear.addEventListener("click", clearAll);
  els.copy.addEventListener("click", copyRedacted);
  els.consentBtn.addEventListener("click", onConsentToServer);
  els.input.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
  });

  // Re-running after a mode change should drop any pending consent prompt.
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener("change", () => {
      hideConsent();
      setStatus("", "");
    });
  }

  for (const example of EXAMPLES) {
    const chip = document.createElement("button");
    chip.className = "example-chip";
    chip.title = example;
    chip.textContent = example;
    chip.addEventListener("click", () => {
      els.input.value = example;
      run();
    });
    els.examples.appendChild(chip);
  }

  await loadConfig();

  els.capability.textContent = "Detecting WebGPU capability...";
  capability = await probeWebGPU();
  els.capability.textContent = describeCapability(capability);
  els.capability.className =
    "capability " + (capability.supported ? "ok" : "muted");

  if (!config.clientEnabled) {
    setStatus("On-device inference is disabled by server config.", "warn");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
