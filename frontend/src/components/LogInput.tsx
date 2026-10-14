import { useId, useRef } from "react";
import {
  MAX_BODY_BYTES,
  MAX_LOG_LINES,
  type InputMeasure,
} from "../limits";

interface Props {
  value: string;
  measure: InputMeasure;
  loading: boolean;
  fileError: string | null;
  onChange: (value: string) => void;
  onFile: (file: File) => void;
  onAnalyze: () => void;
  onClear: () => void;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function LogInput({
  value,
  measure,
  loading,
  fileError,
  onChange,
  onFile,
  onAnalyze,
  onClear,
}: Props) {
  const textareaId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const canAnalyze =
    !loading && !measure.isBlank && !measure.overBytes && !measure.overLines;

  return (
    <section className="card" aria-labelledby={`${textareaId}-title`}>
      <h2 id={`${textareaId}-title`}>Log input</h2>
      <label htmlFor={textareaId} className="visually-hidden">
        Log lines
      </label>
      <textarea
        id={textareaId}
        className="log-textarea"
        value={value}
        placeholder="2026-10-12T10:15:00Z ERROR POST /api/login 401 requestId=req-123"
        spellCheck={false}
        autoComplete="off"
        disabled={loading}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="meter-row" aria-live="polite">
        <span className={measure.overLines ? "meter meter-bad" : "meter"}>
          {measure.lines} / {MAX_LOG_LINES} lines
        </span>
        <span className={measure.overBytes ? "meter meter-bad" : "meter"}>
          {formatKb(measure.bodyBytes)} / {formatKb(MAX_BODY_BYTES)}
        </span>
      </div>

      {measure.overLines && (
        <p className="field-error" role="alert">
          Too many lines: the limit is {MAX_LOG_LINES} non-blank lines.
        </p>
      )}
      {measure.overBytes && (
        <p className="field-error" role="alert">
          Input is too large: the limit is {formatKb(MAX_BODY_BYTES)}.
        </p>
      )}
      {fileError && (
        <p className="field-error" role="alert">
          {fileError}
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canAnalyze}
          onClick={onAnalyze}
        >
          {loading ? "Analyzing…" : "Analyze Logs"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => fileInput.current?.click()}
        >
          Upload .log / .txt
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".log,.txt,text/plain"
          className="visually-hidden"
          aria-label="Upload log file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <p className="hint">
        Logs are sent only to the local backend. At most 3 valid entries per
        request receive AI analysis.
      </p>
    </section>
  );
}
