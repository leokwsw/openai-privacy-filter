// server-engine.js
//
// Server-backed engine: calls the FastAPI /redact endpoint (the real
// openai/privacy-filter model). Output is normalized to the same shape the
// client engine returns so the UI can render either one identically.

export function createServerEngine(options = {}) {
  const endpoint = options.endpoint || "/redact";

  return {
    name: "server",
    backend: "server",
    async run(text) {
      const started =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text || "" }),
      });
      if (!resp.ok) {
        let detail = `Request failed (${resp.status})`;
        try {
          const payload = await resp.json();
          if (payload && payload.detail) detail = payload.detail;
        } catch (_) {
          /* ignore */
        }
        throw new Error(detail);
      }
      const data = await resp.json();
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      return {
        engine: "server",
        backend: "server",
        text: data.text ?? text ?? "",
        detected_spans: data.detected_spans || [],
        redacted_text: data.redacted_text ?? "",
        summary: data.summary || {},
        warning: data.warning || null,
        latency_ms:
          typeof data.latency_ms === "number" ? data.latency_ms : now - started,
      };
    },
  };
}
