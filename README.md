# IntegrationOps AI

An AI-assisted troubleshooting application for REST API and enterprise integration logs.

## Project Overview

IntegrationOps AI aims to help engineers investigate integration failures by analyzing application logs, identifying relevant evidence, and suggesting possible root causes.

The application is being developed incrementally using Test-Driven Development (TDD).

## Current Features

- Parse REST API log entries in a predefined format
- Extract timestamps, log levels, HTTP methods, endpoints, status codes, and request IDs
- Reject log lines that do not match the supported format
- Unit testing with Vitest

## Technology Stack

**Current**
- Node.js
- TypeScript
- Vitest

**Planned**
- Ollama with Qwen3:14b for local AI analysis
- React for the user interface

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

```bash
npm install
```

### Run the Application

```bash
npm run dev
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

The initial log parser is implemented and tested.

See `PROJECT_STATUS.md` for current progress and the next development task.

## Development Approach

Build → Test → Understand → Commit

The project emphasizes incremental development, automated testing, secure handling of logs, and evidence-grounded AI analysis.