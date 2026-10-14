import { useId, useState } from "react";
import { MAX_ANALYZED_ENTRIES } from "../limits";
import type { AnalysisResult, AnalyzedEntry } from "../api";
import { Markdown } from "./Markdown";

function Banner({ result }: { result: AnalysisResult }) {
  const { summary } = result;

  switch (result.status) {
    case "completed":
      return (
        <div className="banner banner-ok" role="status">
          <strong>Analysis complete.</strong>{" "}
          {summary.notAnalyzedEntries > 0
            ? `${summary.notAnalyzedEntries} valid ${plural(summary.notAnalyzedEntries, "entry", "entries")} not analyzed (limit of ${MAX_ANALYZED_ENTRIES} per request).`
            : "All valid entries were analyzed."}
        </div>
      );
    case "partial":
      return (
        <div className="banner banner-warn" role="status">
          <strong>Partial analysis.</strong> The AI model failed part-way
          through; remaining entries were skipped. Some explanations are
          missing.
        </div>
      );
    case "analysis_failed":
      return (
        <div className="banner banner-error" role="alert">
          <strong>AI analysis failed.</strong> Logs were parsed, but the local
          Ollama model did not return an explanation. Check that Ollama is
          running and that the model is available, then try again.
        </div>
      );
    case "no_valid_entries":
      return (
        <div className="banner banner-error" role="alert">
          <strong>No valid log lines.</strong> Nothing could be analyzed.
        </div>
      );
  }
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function EntryChips({ entry }: { entry: AnalyzedEntry }) {
  return (
    <>
      <span className="chip">Line {entry.lineNumber}</span>
      <span className={`chip status-${Math.floor(entry.statusCode / 100)}xx`}>
        HTTP {entry.statusCode}
      </span>
      <span className="chip">{entry.method}</span>
      <span className="chip">{entry.level}</span>
      <time className="muted">{entry.timestamp}</time>
    </>
  );
}

function EntryCard({
  entry,
  defaultExpanded,
}: {
  entry: AnalyzedEntry;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const regionId = useId();
  const { analysis } = entry;

  return (
    <li className="entry">
      {analysis.status === "completed" ? (
        <>
          <button
            type="button"
            className="entry-toggle"
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="entry-head">
              <EntryChips entry={entry} />
            </span>
            <span className="chevron" aria-hidden="true">
              {expanded ? "▾" : "▸"}
            </span>
          </button>
          <div id={regionId} className="explanation" hidden={!expanded}>
            <h4>AI hypothesis and suggested steps</h4>
            <Markdown>{analysis.explanation}</Markdown>
          </div>
        </>
      ) : (
        <>
          <div className="entry-head entry-head-static">
            <EntryChips entry={entry} />
          </div>
          {analysis.status === "failed" && (
            <p className="entry-note note-error">
              AI analysis failed for this entry.
            </p>
          )}
          {analysis.status === "skipped" && (
            <p className="entry-note note-warn">
              Not analyzed: {analysis.reason}.
            </p>
          )}
        </>
      )}
    </li>
  );
}

export function ResultsPanel({ result }: { result: AnalysisResult }) {
  const { summary, entries, errors } = result;

  return (
    <section className="card" aria-labelledby="results-title">
      <h2 id="results-title">Analysis results</h2>
      <Banner result={result} />

      <dl className="stats">
        <div>
          <dt>Parsed</dt>
          <dd>{summary.parsedLines}</dd>
        </div>
        <div>
          <dt>Rejected</dt>
          <dd>{summary.rejectedLines}</dd>
        </div>
        <div>
          <dt>Analyzed</dt>
          <dd>{summary.analyzedEntries}</dd>
        </div>
        <div>
          <dt>Not analyzed</dt>
          <dd>{summary.notAnalyzedEntries}</dd>
        </div>
      </dl>

      <p className="disclaimer">
        AI output is a hypothesis to guide investigation, not a verified root
        cause. Confirm against your systems before acting. Only the timestamp,
        level, method, and status code are sent to the model; endpoints,
        request IDs, and raw messages are never shown or sent.
      </p>

      {entries.length > 0 && (
        <>
          <h3>Diagnostic entries</h3>
          <ul className="entry-list">
            {entries.map((entry, index) => (
              <EntryCard
                key={entry.lineNumber}
                entry={entry}
                defaultExpanded={index === 0}
              />
            ))}
          </ul>
        </>
      )}

      {errors.length > 0 && (
        <>
          <h3>Parsing errors</h3>
          <ul className="error-list">
            {errors.map((error) => (
              <li key={`${error.lineNumber}-${error.message}`}>
                <span className="chip">Line {error.lineNumber}</span>{" "}
                {error.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
