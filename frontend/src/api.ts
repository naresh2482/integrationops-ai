// Types mirror backend/src/analysisWorkflow.ts exactly.
export type EntryAnalysis =
  | { status: "completed"; explanation: string }
  | { status: "failed" }
  | { status: "skipped"; reason: string };

export interface AnalyzedEntry {
  lineNumber: number;
  timestamp: string;
  level: string;
  method: string;
  statusCode: number;
  analysis: EntryAnalysis;
}

export interface LineError {
  lineNumber: number;
  message: string;
}

export type AnalysisStatus =
  | "completed"
  | "partial"
  | "analysis_failed"
  | "no_valid_entries";

export interface AnalysisResult {
  status: AnalysisStatus;
  summary: {
    totalLines: number;
    parsedLines: number;
    rejectedLines: number;
    analyzedEntries: number;
    notAnalyzedEntries: number;
  };
  entries: AnalyzedEntry[];
  errors: LineError[];
}

export type AnalyzeOutcome =
  | { kind: "result"; httpStatus: number; result: AnalysisResult }
  | { kind: "rejected"; httpStatus: number; message: string }
  | { kind: "unavailable" };

export type AnalyzeFn = (logs: string) => Promise<AnalyzeOutcome>;

const STATUSES: readonly string[] = [
  "completed",
  "partial",
  "analysis_failed",
  "no_valid_entries",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  return (
    isRecord(value) &&
    typeof value["status"] === "string" &&
    STATUSES.includes(value["status"]) &&
    isRecord(value["summary"]) &&
    Array.isArray(value["entries"]) &&
    Array.isArray(value["errors"])
  );
}

export const analyzeLogs: AnalyzeFn = async (logs) => {
  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });
  } catch {
    return { kind: "unavailable" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Not JSON: typically a dev-proxy error page when the backend is down.
    return { kind: "unavailable" };
  }

  if (isAnalysisResult(body)) {
    return { kind: "result", httpStatus: response.status, result: body };
  }

  if (isRecord(body) && typeof body["error"] === "string") {
    return {
      kind: "rejected",
      httpStatus: response.status,
      message: body["error"],
    };
  }

  return { kind: "unavailable" };
};
