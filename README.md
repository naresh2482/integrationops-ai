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
- React dashboard: paste or upload logs, see parsed and rejected counts, per-entry AI explanations, and parsing errors
- Unit testing with Vitest

## Technology Stack

**Current**
- Node.js (built-in `node:http`, no web framework)
- TypeScript
- Vitest
- Ollama with Qwen3:14b for local AI analysis

- React 19, Vite, and Vitest with React Testing Library (frontend)

## Getting Started

### Prerequisites

- Node.js
- npm

### Repository Structure

```text
integrationops-ai/
├── backend/            Node.js + TypeScript API (src/, tests/, scripts/, package.json, tsconfig.json)
├── frontend/           React + TypeScript + Vite UI (src/, vite.config.ts, package.json)
├── docs/               Project documentation
├── package.json        Root convenience scripts that delegate to backend/
├── README.md
├── PROJECT_STATUS.md
└── CLAUDE.md
```

### Installation

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Run the API

Requires Ollama running locally with the model pulled (`ollama pull qwen3:14b`).

```bash
# from the repository root
npm start            # listens on http://127.0.0.1:3000
PORT=3100 npm start  # custom port

# or from backend/
cd backend && npm start
```

The server binds to `127.0.0.1` only and sends no CORS headers.

### Run the Web UI

Start the backend first, then the frontend dev server:

```bash
# terminal 1 (repository root)
npm start                 # API on http://127.0.0.1:3000

# terminal 2
npm run dev:frontend      # UI on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173. The Vite dev server proxies `/api` and `/health` to
`http://127.0.0.1:3000`, so the browser only talks to one origin and the backend needs
no CORS headers. If the backend uses a different port, update `BACKEND` in
`frontend/vite.config.ts`.

Frontend checks:

```bash
npm run test:frontend       # Vitest + React Testing Library
npm run typecheck:frontend
npm run build:frontend      # typecheck + production build into frontend/dist
```

UI behavior and safeguards:
- Input limits mirror the backend: 64 KB request body and 100 non-blank lines (Analyze is disabled beyond them); uploaded files must be `.log` or `.txt` and at most 64 KB
- At most 3 valid entries per request receive AI analysis; the rest are shown as not analyzed
- AI explanations are rendered as sanitized Markdown (raw HTML, images, and `javascript:`/`data:` links are not rendered), shown in collapsible cards (first one expanded), and labelled as hypotheses, not verified root causes
- Logs are held only in component state: nothing is written to browser storage or the console
- States handled: empty, loading, success, partial, validation error, backend unavailable, Ollama failure

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
cd backend && npx tsx scripts/diagnose401.ts
```

### Run Tests

```bash
npm test             # from the root (runs backend tests once)
cd backend && npm test -- --run
```

### Type Checking

```bash
npm run typecheck    # from the root
cd backend && npm run typecheck
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