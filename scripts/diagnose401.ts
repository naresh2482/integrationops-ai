import { parseLogLine } from "../src/logParser.js";
import { createDiagnosticPayload } from "../src/diagnosticPayload.js";
import { LogAnalysisService } from "../src/logAnalysisService.js";
import { OllamaClient } from "../src/ollamaClient.js";

// tsconfig sets `types: []`, so Node globals are not typed; declare only what is used.
declare const process: { exitCode?: number };

// Fixed synthetic log. The endpoint carries a fake key to show it never
// reaches the diagnostic payload or the prompt. The raw line is not printed.
const SYNTHETIC_LOG =
  "2026-10-12T10:15:00Z ERROR POST /api/results?api_key=SYNTHETIC-NOT-A-REAL-KEY 401 requestId=req-123";

async function main(): Promise<void> {
  const parsed = parseLogLine(SYNTHETIC_LOG);

  console.log("Validated diagnostic payload:");
  console.log(JSON.stringify(createDiagnosticPayload({ ...parsed }), null, 2));

  console.log("\nRequesting analysis from local Ollama (qwen3:14b)...");
  const service = new LogAnalysisService(new OllamaClient());
  const explanation = await service.analyze(parsed);

  console.log("\nAI explanation:\n");
  console.log(explanation);
}

main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : "unknown error";
  console.error(
    `\nAnalysis failed (${reason}). Is Ollama running on localhost:11434 with qwen3:14b pulled?`
  );
  process.exitCode = 1;
});
