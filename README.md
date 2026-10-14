# IntegrationOps AI

An AI-assisted troubleshooting application for REST API and enterprise integration logs.

## Project Overview

IntegrationOps AI aims to help engineers investigate integration failures by analyzing application logs, identifying relevant evidence, and suggesting possible root causes.

The application is being developed incrementally using Test-Driven Development (TDD).

## Current Features

- Parse REST API log entries in a predefined format
- Extract timestamps, log levels, HTTP methods, endpoints, status codes, and request IDs
- Reject log lines that do not match the supported format
- Validate a minimal diagnostic payload (timestamp, level, method, status code) before any AI request
- Local AI troubleshooting through Ollama (`qwen3:14b`); endpoints, request IDs, and raw messages are never sent to the model
- REST API for submitting logs and receiving explanations
- Unit testing with Vitest

## Technology Stack

**Current**
- Node.js (built-in `node:http`, no web framework)
- TypeScript
- Vitest
- Ollama with Qwen3:14b for local AI analysis

**Planned**
- React for the user interface

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

```bash
npm install
```

### Run the API

Requires Ollama running locally with the model pulled (`ollama pull qwen3:14b`).

```bash
npm start            # listens on http://127.0.0.1:3000
PORT=3100 npm start  # custom port
```

The server binds to `127.0.0.1` only and sends no CORS headers.

## REST API

### `GET /health`

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok","service":"integrationops-ai"}
```

### `POST /api/analyze`

```bash
curl -X POST http://127.0.0.1:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"logs":"2026-10-12T10:15:00Z ERROR POST /api/login 401 requestId=req-123"}'
```

Multiple lines are separated with `\n`. Example response:

```json
{
  "status": "completed",
  "summary": {
    "totalLines": 2,
    "parsedLines": 1,
    "rejectedLines": 1,
    "analyzedEntries": 1,
    "notAnalyzedEntries": 0
  },
  "entries": [
    {
      "lineNumber": 1,
      "timestamp": "2026-10-12T10:15:00Z",
      "level": "ERROR",
      "method": "POST",
      "statusCode": 401,
      "analysis": { "status": "completed", "explanation": "..." }
    }
  ],
  "errors": [{ "lineNumber": 2, "message": "Invalid log line" }]
}
```

`entries[].analysis.status` is `completed`, `failed`, or `skipped` (with a `reason`).
Endpoints and request IDs are intentionally omitted from responses.

| Status | Meaning |
|---|---|
| 200 | `completed` or `partial` |
| 400 | Invalid JSON, or `logs` missing, not a string, or blank |
| 404 / 405 | Unknown route / wrong method |
| 415 | `Content-Type` is not `application/json` (parameters such as `; charset=utf-8` are accepted) |
| 413 | Request body larger than 64 KB (reading stops immediately; the connection is closed shortly after) |
| 422 | More than 100 non-blank lines, or no valid log lines |
| 502 | `analysis_failed`: Ollama unavailable or returned an invalid response |

Limits: 64 KB body, 100 non-blank lines, and at most 3 entries analyzed per request
(sequentially). Remaining valid entries are reported as `skipped`. After one AI failure
the remaining entries are skipped.

### Run the Local Diagnosis Script

```bash
npx tsx scripts/diagnose401.ts
```

### Run Tests

```bash
npm test
```

### Type Checking

```bash
npm run typecheck
```

## Supported Log Format

```text
2026-10-12T10:15:00Z ERROR POST /api/results 401 requestId=req-123
```

The current parser supports this fixed field order and does not yet perform comprehensive field validation.

## Project Status

The parser, redaction, validated diagnostic payload, Ollama integration, and REST API are implemented and tested.

See `PROJECT_STATUS.md` for current progress and the next development task.

## Development Approach

Build → Test → Understand → Commit

The project emphasizes incremental development, automated testing, secure handling of logs, and evidence-grounded AI analysis.