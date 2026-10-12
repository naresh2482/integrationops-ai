# IntegrationOps AI — Claude Code Instructions

## Project Objective

IntegrationOps AI is a local-first application for analyzing REST API and enterprise integration logs.

Its purpose is to help engineers identify failures, understand supporting evidence, and investigate possible root causes.

Use synthetic logs during development.

## Current Technology Stack

- Node.js
- TypeScript
- Native ESM with NodeNext module resolution
- Vitest for unit testing

Planned integrations:
- Ollama with Qwen3:14b
- React frontend

Do not implement planned integrations unless explicitly requested.

## Development Workflow

For new application behavior, follow:

1. RED — Write a failing test that describes the expected behavior.
2. GREEN — Implement the smallest change that passes the test.
3. REFACTOR — Improve the implementation without changing behavior.
4. VERIFY — Run the required checks.
5. REVIEW — Explain the changes and any limitations.

Do not modify existing test expectations merely to make an implementation pass.

## Coding Standards

- Prefer simple, readable TypeScript.
- Use explicit types where they improve clarity.
- Avoid `any` unless justified.
- Validate untrusted input at appropriate boundaries.
- Prefer small functions with clear responsibilities.
- Avoid premature abstractions and unnecessary dependencies.
- Preserve the existing NodeNext ESM configuration.
- Use `.js` extensions for relative imports where required by NodeNext.

## Security Requirements

- Treat uploaded logs as untrusted input.
- Never expose raw sensitive log content in error messages.
- Do not log credentials, tokens, passwords, or API keys.
- Redact sensitive information before sending content to any LLM, including local Ollama.
- Do not transmit uploaded logs to external AI services without explicit authorization.
- Do not commit secrets or environment files containing credentials.

## Verification

After code changes, run:

- `npm test`
- `npm run typecheck`

Report:
- Tests passed or failed
- TypeScript errors, if any
- Files changed
- Important implementation decisions
- Known limitations

Never claim a check passed unless it was actually executed successfully.

## Scope Control

- Implement only the currently requested task.
- Do not add unrelated features.
- Do not introduce frameworks, custom agents, skills, or MCP servers without approval.
- Ask before making significant architectural changes.
- Prefer incremental changes over large rewrites.

## Git Rules

- Never commit or push changes unless explicitly requested.
- Do not modify unrelated files.
- Show the relevant changes before requesting a commit.

## Project Tracking

- Use `PROJECT_STATUS.md` for completed work, limitations, and the next task.
- Keep one clearly defined next task.
- Update project status at agreed milestones.

## Collaboration

Claude Code assists with implementation, testing, and technical analysis.

The developer retains responsibility for architecture decisions, code review, and approval of changes.

When presenting alternatives, explain the trade-offs and recommend the simplest option that satisfies current requirements.