// Mirror the backend limits (backend/src/httpServer.ts, analysisWorkflow.ts).
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_LOG_LINES = 100;
export const MAX_ANALYZED_ENTRIES = 3;

export interface InputMeasure {
  /** Size of the JSON request body the backend will receive. */
  bodyBytes: number;
  /** Non-blank lines, counted the same way as the backend. */
  lines: number;
  isBlank: boolean;
  overBytes: boolean;
  overLines: boolean;
}

export function measureInput(text: string): InputMeasure {
  const bodyBytes = new TextEncoder().encode(
    JSON.stringify({ logs: text })
  ).length;
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;

  return {
    bodyBytes,
    lines,
    isBlank: lines === 0,
    overBytes: bodyBytes > MAX_BODY_BYTES,
    overLines: lines > MAX_LOG_LINES,
  };
}
