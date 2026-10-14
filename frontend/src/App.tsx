import { useMemo, useRef, useState } from "react";
import { analyzeLogs, type AnalysisResult, type AnalyzeFn } from "./api";
import { LogInput } from "./components/LogInput";
import { ResultsPanel } from "./components/ResultsPanel";
import { MAX_BODY_BYTES, measureInput } from "./limits";

type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; result: AnalysisResult }
  | { kind: "rejected"; message: string }
  | { kind: "unavailable" };

interface AppProps {
  /** Injectable for tests; defaults to the real backend call. */
  analyze?: AnalyzeFn;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsText(file);
  });
}

const FILE_PATTERN = /\.(log|txt)$/i;

export function App({ analyze = analyzeLogs }: AppProps) {
  const [text, setText] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });
  const [fileError, setFileError] = useState<string | null>(null);
  const requestId = useRef(0);

  const measure = useMemo(() => measureInput(text), [text]);
  const loading = view.kind === "loading";

  async function handleAnalyze() {
    const current = ++requestId.current;
    setFileError(null);
    setView({ kind: "loading" });

    const outcome = await analyze(text);
    if (current !== requestId.current) return; // cleared or superseded

    if (outcome.kind === "result") {
      setView({ kind: "result", result: outcome.result });
    } else if (outcome.kind === "rejected") {
      setView({ kind: "rejected", message: outcome.message });
    } else {
      setView({ kind: "unavailable" });
    }
  }

  function handleClear() {
    requestId.current++;
    setText("");
    setFileError(null);
    setView({ kind: "idle" });
  }

  async function handleFile(file: File) {
    setFileError(null);

    if (!FILE_PATTERN.test(file.name)) {
      setFileError("Unsupported file type: choose a .log or .txt file.");
      return;
    }
    if (file.size > MAX_BODY_BYTES) {
      setFileError("File is too large: the limit is 64 KB.");
      return;
    }

    try {
      setText(await readFileAsText(file));
      setView({ kind: "idle" });
    } catch {
      setFileError("The file could not be read.");
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            IO
          </span>
          <div>
            <h1>IntegrationOps AI</h1>
            <p>AI-Powered API &amp; Connector Troubleshooting</p>
          </div>
        </div>
      </header>

      <main className="layout">
        <LogInput
          value={text}
          measure={measure}
          loading={loading}
          fileError={fileError}
          onChange={setText}
          onFile={(file) => void handleFile(file)}
          onAnalyze={() => void handleAnalyze()}
          onClear={handleClear}
        />

        <div className="results-column">
          {view.kind === "idle" && (
            <section className="card empty-state">
              <h2>Analysis results</h2>
              <p>
                Paste logs or upload a <code>.log</code> / <code>.txt</code>{" "}
                file, then choose <strong>Analyze Logs</strong>.
              </p>
              <p className="muted">
                Expected format:{" "}
                <code>
                  &lt;timestamp&gt; &lt;level&gt; &lt;method&gt;
                  &lt;endpoint&gt; &lt;status&gt; requestId=&lt;id&gt;
                </code>
              </p>
            </section>
          )}

          {view.kind === "loading" && (
            <section className="card" role="status" aria-live="polite">
              <h2>Analysis results</h2>
              <div className="loading">
                <span className="spinner" aria-hidden="true" />
                <p>
                  Analyzing logs with the local AI model. This can take up to a
                  minute per entry.
                </p>
              </div>
            </section>
          )}

          {view.kind === "result" && <ResultsPanel result={view.result} />}

          {view.kind === "rejected" && (
            <section className="card">
              <h2>Analysis results</h2>
              <div className="banner banner-error" role="alert">
                <strong>Request rejected.</strong> {view.message}
              </div>
            </section>
          )}

          {view.kind === "unavailable" && (
            <section className="card">
              <h2>Analysis results</h2>
              <div className="banner banner-error" role="alert">
                <strong>Backend unavailable.</strong> The analysis service did
                not respond. Start it with <code>npm start</code> and try
                again.
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
