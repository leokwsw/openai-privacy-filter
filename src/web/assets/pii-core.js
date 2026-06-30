// pii-core.js
//
// Framework-free, browser- and Node-importable helpers shared by the
// client-side (WebGPU) and server-backed processing paths.
//
// Everything here is pure (no DOM / no network / no WebGPU), so it can be
// unit-tested in Node and reused across engines.

// Canonical privacy labels, aligned with the server (openai/privacy-filter).
export const REDACTION_LABEL_MAP = {
  account_number: "[ACCOUNT_NUMBER]",
  private_address: "[ADDRESS]",
  private_date: "[DATE]",
  private_email: "[EMAIL]",
  private_person: "[PERSON]",
  private_phone: "[PHONE]",
  private_url: "[URL]",
  secret: "[SECRET]",
};

// Higher priority wins when two detected spans overlap.
const LABEL_PRIORITY = {
  private_email: 100,
  private_url: 95,
  secret: 90,
  private_date: 85,
  private_phone: 80,
  account_number: 70,
  private_person: 50,
  private_address: 40,
};

export function placeholderFor(label) {
  return REDACTION_LABEL_MAP[label] || "[REDACTED]";
}

function priorityFor(label) {
  return LABEL_PRIORITY[label] ?? 0;
}

// --- Regex-based structured PII detectors -------------------------------------

const REGEX_DETECTORS = [
  {
    label: "private_email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    label: "private_url",
    regex: /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi,
  },
  {
    label: "secret",
    // Common API-key / token shapes: sk-..., ghp_..., AKIA..., xoxb-...
    regex:
      /\b(?:sk|pk|rk)-[A-Za-z0-9]{16,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    label: "private_date",
    regex:
      /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
  },
  {
    label: "private_phone",
    // 7+ digits with optional +, spaces, dashes, dots, parentheses.
    regex: /(?:\+?\d[\d\s().-]{6,}\d)/g,
    minDigits: 7,
    maxDigits: 15,
  },
  {
    label: "account_number",
    // Long bare digit runs (IBAN-ish / account / card numbers).
    regex: /\b\d[\d ]{7,}\d\b/g,
    minDigits: 8,
  },
];

function countDigits(value) {
  let count = 0;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") count += 1;
  }
  return count;
}

export function detectRegexSpans(text) {
  if (!text) return [];
  const spans = [];
  for (const detector of REGEX_DETECTORS) {
    const regex = new RegExp(detector.regex.source, detector.regex.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      if (value.length === 0) {
        regex.lastIndex += 1;
        continue;
      }
      if (detector.minDigits || detector.maxDigits) {
        const digits = countDigits(value);
        if (detector.minDigits && digits < detector.minDigits) continue;
        if (detector.maxDigits && digits > detector.maxDigits) continue;
      }
      const start = match.index;
      const end = start + value.length;
      spans.push({
        label: detector.label,
        start,
        end,
        text: value,
        placeholder: placeholderFor(detector.label),
        source: "regex",
      });
    }
  }
  return spans;
}

// --- Span merging / overlap resolution ---------------------------------------

function spansOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

// Greedy, deterministic overlap resolution. Spans are ranked by priority,
// then by length, then by earliest start; lower-ranked overlapping spans drop.
export function mergeSpans(spans) {
  const sorted = [...spans].sort((a, b) => {
    const pri = priorityFor(b.label) - priorityFor(a.label);
    if (pri !== 0) return pri;
    const len = b.end - b.start - (a.end - a.start);
    if (len !== 0) return len;
    return a.start - b.start;
  });

  const kept = [];
  for (const span of sorted) {
    if (span.end <= span.start) continue;
    if (kept.some((existing) => spansOverlap(existing, span))) continue;
    kept.push(span);
  }
  kept.sort((a, b) => a.start - b.start || a.end - b.end);
  return kept;
}

export function buildRedacted(text, spans) {
  if (!text || !spans || spans.length === 0) return text || "";
  const ordered = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const parts = [];
  let cursor = 0;
  for (const span of ordered) {
    if (span.start < cursor || span.start >= span.end) continue;
    const start = Math.max(0, Math.min(span.start, text.length));
    const end = Math.max(0, Math.min(span.end, text.length));
    if (start < cursor || start >= end) continue;
    parts.push(text.slice(cursor, start));
    parts.push(span.placeholder || placeholderFor(span.label));
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}

export function summarize(spans) {
  const byLabel = {};
  for (const span of spans) {
    byLabel[span.label] = (byLabel[span.label] || 0) + 1;
  }
  return { span_count: spans.length, by_label: byLabel };
}

// Build a normalized result object shared by all engines.
export function buildResult(text, rawSpans, { engine, latencyMs, warning } = {}) {
  const spans = mergeSpans(rawSpans);
  return {
    engine: engine || "unknown",
    text,
    detected_spans: spans,
    redacted_text: buildRedacted(text, spans),
    summary: { output_mode: "client", ...summarize(spans) },
    warning: warning || null,
    latency_ms: typeof latencyMs === "number" ? latencyMs : null,
  };
}

// --- Device capability scoring + engine selection ----------------------------

// Score a device's WebGPU capability in [0, 100]. Pure: takes a plain object.
export function scoreDevice(info = {}) {
  if (info.isFallback) return 0; // software/fallback adapter: avoid heavy ML
  let score = 100;

  const deviceMemory = info.deviceMemory;
  if (typeof deviceMemory === "number") {
    if (deviceMemory < 2) score -= 60;
    else if (deviceMemory < 4) score -= 30;
    else if (deviceMemory < 8) score -= 10;
  }

  const maxBufferSize = info.maxBufferSize;
  if (typeof maxBufferSize === "number") {
    const mb = maxBufferSize / (1024 * 1024);
    if (mb < 128) score -= 50;
    else if (mb < 256) score -= 20;
  }

  const cores = info.hardwareConcurrency;
  if (typeof cores === "number" && cores > 0 && cores < 4) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export const DEFAULT_MIN_SCORE = 50;

// Decide which engine to use. Pure and fully testable.
//   preference: "auto" | "client" | "server"
export function chooseEngine({
  preference = "auto",
  webgpuSupported = false,
  deviceScore = 0,
  minScore = DEFAULT_MIN_SCORE,
  clientEnabled = true,
} = {}) {
  if (!clientEnabled) {
    return { engine: "server", reason: "Client inference disabled by config." };
  }
  if (preference === "server") {
    return { engine: "server", reason: "Server mode selected." };
  }
  if (!webgpuSupported) {
    return {
      engine: "server",
      reason: "WebGPU is not supported in this browser; using server.",
    };
  }
  if (preference === "client") {
    return { engine: "client", reason: "On-device (WebGPU) mode selected." };
  }
  // auto
  if (deviceScore >= minScore) {
    return {
      engine: "client",
      reason: `Device looks capable (score ${deviceScore}); running on-device.`,
    };
  }
  return {
    engine: "server",
    reason: `Device underpowered for on-device inference (score ${deviceScore} < ${minScore}); using server.`,
  };
}

// Map a third-party NER entity group to our canonical labels.
export function mapNerLabel(group) {
  if (!group) return null;
  const g = String(group).toUpperCase().replace(/^[BIES]-/, "");
  if (g === "PER" || g === "PERSON" || g === "PERS") return "private_person";
  if (g === "LOC" || g === "LOCATION" || g === "GPE" || g === "FAC")
    return "private_address";
  return null; // ORG / MISC etc. are ignored for privacy redaction
}
