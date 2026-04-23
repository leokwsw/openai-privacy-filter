# OpenAI Privacy Filter API

English | [简体中文](./README.zh-CN.md)

FastAPI wrapper for [OpenAI Privacy Filter](https://github.com/openai/privacy-filter), with Docker, Docker Compose, and GitHub Container Registry publishing support.

This project helps you turn OpenAI Privacy Filter into a small self-hosted API service for PII detection and text redaction.

## Why This Project

OpenAI Privacy Filter is a strong local model for detecting and masking sensitive text such as names, emails, phone numbers, dates, addresses, account numbers, private URLs, and secrets. The upstream repo ships a Python package and CLI. This repo adds the missing deployment layer many teams want:

- Simple REST API with FastAPI
- Local-first deployment
- Docker and Docker Compose support
- GitHub Actions workflow to publish container images
- Small integration surface for internal tools, RAG pipelines, ETL jobs, and document preprocessing

If you want to run OpenAI Privacy Filter as a backend service instead of calling the CLI directly, this repo is for you.

## Use Cases

- Redact PII before sending text to an LLM
- Sanitize support tickets, chat logs, and transcripts
- Clean internal documents before indexing into RAG systems
- Build a privacy gateway for AI apps
- Add an on-prem redaction layer to compliance-sensitive workflows

## Features

- `GET /health` health check
- `POST /redact/text` text-only redaction response
- `POST /redact/batch` batch redaction response with detected spans and latency
- Configurable model device and checkpoint through environment variables
- Docker image build and Compose-based local startup

## API Overview

### `GET /health`

Returns service status and whether the model is loaded.

### `POST /redact/text`

Request:

```json
{
  "text": "Alice lives at 1 Main Street and her email is [email protected]"
}
```

Response:

```json
{
  "redacted_text": "[PRIVATE_PERSON] lives at [PRIVATE_ADDRESS] and her email is [PRIVATE_EMAIL]",
  "latency_ms": 123.45
}
```

### `POST /redact/batch`

Request:

```json
{
  "texts": [
    "Alice was born on 1990-01-02.",
    "Call Bob at +1 415 555 0114."
  ]
}
```

Returns per-item redaction results, detected spans, summary metadata, and total latency.

## Quick Start

### 1. Local Python Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install ./privacy-filter
python main.py
```

The API starts on `http://127.0.0.1:8080`.

### 2. Docker

Build the image:

```bash
docker build -t openai-privacy-filter .
```

Run the container:

```bash
docker run --rm -p 8080:8080 --env-file .env openai-privacy-filter
```

### 3. Docker Compose

Start the service:

```bash
docker compose up --build
```

Run in the background:

```bash
docker compose up --build -d
```

Stop it:

```bash
docker compose down
```

## Environment Variables

Common options:

- `PORT`: API port, default `8080`
- `OPF_DEVICE`: model device, default `cpu`
- `OPF_OUTPUT_MODE`: OpenAI Privacy Filter output mode, default `typed`
- `OPF_CHECKPOINT`: optional custom checkpoint path

Example `.env`:

```env
PORT=8080
OPF_DEVICE=cpu
OPF_OUTPUT_MODE=typed
```

## Publish Docker Image with GitHub Actions

This repo includes a workflow at [`.github/workflows/publish.yml`](./.github/workflows/publish.yml).

It publishes the container image to GitHub Container Registry:

```text
ghcr.io/leokwsw/openai-privacy-filter
```

Triggers:

- Push to `main`
- Push a version tag like `v1.0.0`
- Manual workflow dispatch

Make sure GitHub Actions has permission to write packages for the repository.

## Project Structure

```text
.
├── .github/workflows/publish.yml
├── compose.yaml
├── Dockerfile
├── main.py
├── requirements.txt
├── src/
│   ├── app.py
│   └── model/response.py
└── privacy-filter/
```

## Positioning

This is not the official OpenAI repo. It is a deployment-focused wrapper around the official OpenAI Privacy Filter project.

Upstream project:

- [openai/privacy-filter](https://github.com/openai/privacy-filter)

If you need the core model, training flow, or evaluation tooling, start with the upstream repo. If you want to expose it as an API service quickly, use this repo.

## SEO Keywords

OpenAI Privacy Filter API, OpenAI Privacy Filter FastAPI, PII redaction API, PII masking service, self-hosted privacy filter, Docker privacy filter, local PII detection, OpenAI privacy filter server, privacy filter for RAG, privacy filter for LLM preprocessing.

## License

This wrapper repo does not change the upstream model license. Review the upstream project for model and code licensing details:

- [OpenAI Privacy Filter license](https://github.com/openai/privacy-filter)
