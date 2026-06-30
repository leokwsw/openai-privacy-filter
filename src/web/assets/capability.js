// capability.js
//
// Browser-only WebGPU feature detection and device capability probing.
// Pure scoring lives in pii-core.js (scoreDevice); this module just gathers
// the raw signals from the live browser environment.

import { scoreDevice, DEFAULT_MIN_SCORE } from "./pii-core.js";

// Probe WebGPU support and device characteristics.
// Returns: { supported, isFallback, reason, info, score }
export async function probeWebGPU() {
  const result = {
    supported: false,
    isFallback: false,
    reason: "",
    info: {},
    score: 0,
  };

  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
    result.reason = "navigator.gpu is unavailable (no WebGPU in this browser).";
    return result;
  }

  let adapter;
  try {
    adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
  } catch (err) {
    result.reason = `requestAdapter failed: ${err && err.message ? err.message : err}`;
    return result;
  }

  if (!adapter) {
    result.reason = "No WebGPU adapter available on this device.";
    return result;
  }

  const isFallback = Boolean(adapter.isFallbackAdapter);

  // adapter.info is the modern API; requestAdapterInfo() is the older one.
  let adapterInfo = {};
  try {
    if (adapter.info) {
      adapterInfo = adapter.info;
    } else if (typeof adapter.requestAdapterInfo === "function") {
      adapterInfo = await adapter.requestAdapterInfo();
    }
  } catch (_) {
    adapterInfo = {};
  }

  const limits = adapter.limits || {};
  const info = {
    isFallback,
    vendor: adapterInfo.vendor || "",
    architecture: adapterInfo.architecture || "",
    description: adapterInfo.description || adapterInfo.device || "",
    maxBufferSize: Number(limits.maxBufferSize) || undefined,
    maxStorageBufferBindingSize: Number(limits.maxStorageBufferBindingSize) || undefined,
    deviceMemory:
      typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : undefined,
    hardwareConcurrency:
      typeof navigator.hardwareConcurrency === "number"
        ? navigator.hardwareConcurrency
        : undefined,
  };

  // Verify we can actually acquire a device (some browsers advertise an adapter
  // but fail at requestDevice on weak/blocklisted hardware).
  let deviceOk = false;
  try {
    const device = await adapter.requestDevice();
    deviceOk = Boolean(device);
    if (device && typeof device.destroy === "function") {
      // Release immediately; the inference engine requests its own device.
      device.destroy();
    }
  } catch (err) {
    result.reason = `requestDevice failed: ${err && err.message ? err.message : err}`;
    return result;
  }

  result.supported = deviceOk;
  result.isFallback = isFallback;
  result.info = info;
  result.score = scoreDevice(info);
  result.reason = isFallback
    ? "WebGPU available via a fallback (software) adapter."
    : "WebGPU hardware adapter available.";
  return result;
}

export { DEFAULT_MIN_SCORE };

export function describeCapability(cap) {
  if (!cap || !cap.supported) {
    return cap && cap.reason ? cap.reason : "WebGPU not available.";
  }
  const bits = [];
  if (cap.info.vendor) bits.push(cap.info.vendor);
  if (cap.info.architecture) bits.push(cap.info.architecture);
  if (cap.info.description) bits.push(cap.info.description);
  const hw = bits.length ? bits.join(" / ") : "GPU";
  return `${cap.isFallback ? "Software" : "Hardware"} WebGPU — ${hw} (capability score ${cap.score}/100)`;
}
