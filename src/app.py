import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException

from opf._api import OPF, RedactionResult
from src.model.response import (
    HealthResponse,
    RedactBatchRequest,
    RedactBatchResponse,
    RedactRequest,
    RedactResponse,
    RedactTextOnlyResponse,
    SpanOut,
)

logger = logging.getLogger("opf-server")

MODEL_NOT_LOADED_DETAIL = "Model not loaded"

_redactor: OPF | None = None


def _load_redactor() -> OPF:
    requested_device = os.getenv("OPF_DEVICE", "cpu")
    output_mode = os.getenv("OPF_OUTPUT_MODE", "typed")
    checkpoint = os.getenv("OPF_CHECKPOINT") or None

    logger.info(
        "Loading OPF model (requested_device=%s, resolved_device=%s, output_mode=%s)...",
        requested_device,
        "cpu",
        output_mode,
    )

    start = time.monotonic()
    redactor = OPF(
        model=checkpoint,
        device="cpu",
        output_mode=output_mode,
    )
    redactor.get_runtime()

    elapsed = time.monotonic() - start
    logger.info("Model loaded in %.1fs", elapsed)
    return redactor


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, Any]:
    global _redactor
    _redactor = _load_redactor()
    try:
        yield
    finally:
        _redactor = None


app = FastAPI(
    title="OpenAI Privacy Filter Service",
    version="0.1.0",
    lifespan=lifespan,
)


def get_redactor() -> OPF:
    if _redactor is None:
        raise HTTPException(status_code=503, detail=MODEL_NOT_LOADED_DETAIL)
    return _redactor


def _measure_redaction(text: str) -> tuple[str | RedactionResult, float]:
    start = time.perf_counter()
    result = get_redactor().redact(text)
    latency_ms = (time.perf_counter() - start) * 1000.0
    return result, latency_ms


def _build_span(span) -> SpanOut:
    return SpanOut(
        label=span.label,
        start=span.start,
        end=span.end,
        text=span.text,
        placeholder=span.placeholder,
    )


def _build_response(source_text: str, result: str | RedactionResult, latency_ms: float) -> RedactResponse:
    if isinstance(result, str):
        return RedactResponse(
            schema_version=0,
            text=source_text,
            redacted_text=result,
            detected_spans=[],
            summary={},
            latency_ms=latency_ms,
        )

    return RedactResponse(
        schema_version=result.schema_version,
        text=result.text,
        redacted_text=result.redacted_text,
        detected_spans=[_build_span(span) for span in result.detected_spans],
        summary=result.summary,
        warning=result.warning,
        latency_ms=latency_ms,
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=_redactor is not None)


@app.post("/redact/text", response_model=RedactTextOnlyResponse)
def redact_text(request: RedactRequest) -> RedactTextOnlyResponse:
    result, latency_ms = _measure_redaction(request.text)
    redacted_text = result.redacted_text if isinstance(result, RedactionResult) else result
    return RedactTextOnlyResponse(
        redacted_text=redacted_text,
        latency_ms=latency_ms,
    )


@app.post("/redact/batch", response_model=RedactBatchResponse)
def redact_batch(request: RedactBatchRequest) -> RedactBatchResponse:
    batch_start = time.perf_counter()
    results = []

    for text in request.texts:
        result, latency_ms = _measure_redaction(text)
        results.append(_build_response(text, result, latency_ms))

    total_latency_ms = (time.perf_counter() - batch_start) * 1000.0
    return RedactBatchResponse(
        results=results,
        total_latency_ms=total_latency_ms,
    )
