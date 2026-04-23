from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )


class HealthResponse(APIModel):
    status: str = Field(description="Service health status")
    model_loaded: bool = Field(description="Whether the OPF model is ready")


class SpanOut(APIModel):
    label: str = Field(description="Detected entity label")
    start: int = Field(description="Inclusive start offset in the original text")
    end: int = Field(description="Exclusive end offset in the original text")
    text: str = Field(description="Original text detected for the span")
    placeholder: str = Field(description="Replacement placeholder for the span")


class RedactionSummary(APIModel):
    output_mode: str = Field(description="Output mode used by the OPF runtime")
    span_count: int = Field(description="Total number of detected spans")
    by_label: dict[str, int] = Field(description="Detected span counts grouped by privacy label")
    decoded_mismatch: bool = Field(description="Whether decoded output mismatched internal expectations")


class RedactRequest(APIModel):
    text: str = Field(..., description="Text to redact")


class RedactTextOnlyResponse(APIModel):
    redacted_text: str = Field(description="Redacted text output")
    latency_ms: float = Field(description="End-to-end latency in milliseconds")


class RedactResponse(APIModel):
    schema_version: int = Field(description="Response schema version emitted by OPF")
    text: str = Field(description="Original text input")
    redacted_text: str = Field(description="Text after redaction")
    detected_spans: list[SpanOut] = Field(description="Detected spans in the original text")
    summary: RedactionSummary = Field(description="Structured redaction summary emitted by OPF")
    warning: str | None = Field(default=None, description="Optional warning emitted by OPF")
    latency_ms: float = Field(description="Latency for the redaction request in milliseconds")


class RedactBatchRequest(APIModel):
    texts: list[str] = Field(..., min_length=1, description="List of texts to redact")


class RedactBatchResponse(APIModel):
    results: list[RedactResponse] = Field(description="Per-text redaction results")
    total_latency_ms: float = Field(description="Total batch processing latency in milliseconds")
