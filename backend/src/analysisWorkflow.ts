import { processLogLines, type LogLineError } from "./logProcessor.js";
import {
    createDiagnosticPayload,
    type SafeDiagnosticEntry,
} from "./diagnosticPayload.js";

export const MAX_LOG_LINES = 100;
export const MAX_ANALYZED_ENTRIES = 3;

// Satisfied by LogAnalysisService.
export interface LogAnalyzer {
    analyze(log: object): Promise<string>;
}

export class AnalysisInputError extends Error {
    constructor(readonly reason: "empty_input" | "too_many_lines") {
        super(
            reason === "empty_input"
                ? "Log input is empty"
                : `Log input exceeds ${MAX_LOG_LINES} lines`
        );
    }
}

export type EntryAnalysis =
    | { status: "completed"; explanation: string }
    | { status: "failed" }
    | { status: "skipped"; reason: string };

export interface AnalyzedEntry extends SafeDiagnosticEntry {
    lineNumber: number;
    analysis: EntryAnalysis;
}

export interface AnalysisResult {
    status: "completed" | "partial" | "analysis_failed" | "no_valid_entries";
    summary: {
        totalLines: number;
        parsedLines: number;
        rejectedLines: number;
        analyzedEntries: number;
        notAnalyzedEntries: number;
    };
    entries: AnalyzedEntry[];
    errors: LogLineError[];
}

const SKIPPED_LIMIT = `Analysis limit of ${MAX_ANALYZED_ENTRIES} entries per request reached`;
const SKIPPED_FAILURE = "Skipped after an earlier analysis failed";

export async function analyzeLogs(
    input: string,
    analyzer: LogAnalyzer
): Promise<AnalysisResult> {
    const nonBlankLineNumbers: number[] = [];
    input.split(/\r?\n/).forEach((line, index) => {
        if (line.trim() !== "") {
            nonBlankLineNumbers.push(index + 1);
        }
    });

    if (nonBlankLineNumbers.length === 0) {
        throw new AnalysisInputError("empty_input");
    }
    if (nonBlankLineNumbers.length > MAX_LOG_LINES) {
        throw new AnalysisInputError("too_many_lines");
    }

    const { entries, errors: parseErrors } = processLogLines(input);

    // processLogLines drops line numbers from successful entries; recover them.
    const failed = new Set(parseErrors.map((e) => e.lineNumber));
    const parsedLineNumbers = nonBlankLineNumbers.filter((n) => !failed.has(n));

    const errors: LogLineError[] = [...parseErrors];
    const valid: Array<{ lineNumber: number; payload: SafeDiagnosticEntry }> = [];

    entries.forEach((entry, index) => {
        const lineNumber = parsedLineNumbers[index]!;
        try {
            // Drops endpoint and requestId; only the allowlisted fields remain.
            valid.push({
                lineNumber,
                payload: createDiagnosticPayload({ ...entry }),
            });
        } catch {
            errors.push({ lineNumber, message: "Invalid diagnostic data" });
        }
    });
    errors.sort((a, b) => a.lineNumber - b.lineNumber);

    const analyzed: AnalyzedEntry[] = [];
    let aiFailed = false;
    let completedCount = 0;

    for (const [index, { lineNumber, payload }] of valid.entries()) {
        let analysis: EntryAnalysis;

        if (aiFailed) {
            analysis = { status: "skipped", reason: SKIPPED_FAILURE };
        } else if (index >= MAX_ANALYZED_ENTRIES) {
            analysis = { status: "skipped", reason: SKIPPED_LIMIT };
        } else {
            try {
                const explanation = await analyzer.analyze(payload);
                analysis = { status: "completed", explanation };
                completedCount++;
            } catch {
                // Details are intentionally discarded; they may be internal.
                analysis = { status: "failed" };
                aiFailed = true;
            }
        }

        analyzed.push({ lineNumber, ...payload, analysis });
    }

    const attempted = analyzed.filter(
        (e) => e.analysis.status !== "skipped"
    ).length;

    let status: AnalysisResult["status"];
    if (valid.length === 0) {
        status = "no_valid_entries";
    } else if (completedCount === attempted) {
        status = "completed";
    } else if (completedCount === 0) {
        status = "analysis_failed";
    } else {
        status = "partial";
    }

    return {
        status,
        summary: {
            totalLines: nonBlankLineNumbers.length,
            parsedLines: valid.length,
            rejectedLines: errors.length,
            analyzedEntries: completedCount,
            notAnalyzedEntries: analyzed.filter(
                (e) => e.analysis.status === "skipped"
            ).length,
        },
        entries: analyzed,
        errors,
    };
}
