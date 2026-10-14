import { describe, it, expect, vi } from "vitest";
import {
    analyzeLogs,
    AnalysisInputError,
    MAX_ANALYZED_ENTRIES,
    MAX_LOG_LINES,
    type LogAnalyzer,
} from "../src/analysisWorkflow.js";

const line = (status: number, id = "req-1", path = "/api/login") =>
    `2026-10-12T10:15:00Z ERROR POST ${path} ${status} requestId=${id}`;

function mockAnalyzer(explanation = "Check the token.") {
    const analyze = vi
        .fn<(log: object) => Promise<string>>()
        .mockResolvedValue(explanation);
    const analyzer: LogAnalyzer = { analyze };
    return { analyzer, analyze };
}

describe("analyzeLogs", () => {
    it("analyzes a single valid line", async () => {
        const { analyzer } = mockAnalyzer("Token expired.");

        const result = await analyzeLogs(line(401), analyzer);

        expect(result.status).toBe("completed");
        expect(result.summary).toEqual({
            totalLines: 1,
            parsedLines: 1,
            rejectedLines: 0,
            analyzedEntries: 1,
            notAnalyzedEntries: 0,
        });
        expect(result.entries).toEqual([
            {
                lineNumber: 1,
                timestamp: "2026-10-12T10:15:00Z",
                level: "ERROR",
                method: "POST",
                statusCode: 401,
                analysis: { status: "completed", explanation: "Token expired." },
            },
        ]);
        expect(result.errors).toEqual([]);
    });

    it("handles multiple lines and keeps original line numbers", async () => {
        const { analyzer, analyze } = mockAnalyzer();
        const input = [line(401), "", "not a log line", line(500)].join("\n");

        const result = await analyzeLogs(input, analyzer);

        expect(analyze).toHaveBeenCalledTimes(2);
        expect(result.summary.totalLines).toBe(3);
        expect(result.summary.parsedLines).toBe(2);
        expect(result.summary.rejectedLines).toBe(1);
        expect(result.entries.map((e) => e.lineNumber)).toEqual([1, 4]);
        expect(result.errors).toEqual([
            { lineNumber: 3, message: "Invalid log line" },
        ]);
    });

    it("never echoes rejected raw lines", async () => {
        const { analyzer } = mockAnalyzer();
        const input = [
            "garbage password=hunter2 Authorization: Bearer abc",
            line(401),
        ].join("\n");

        const result = await analyzeLogs(input, analyzer);

        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain("hunter2");
        expect(serialized).not.toContain("Bearer");
        expect(serialized).not.toContain("garbage");
    });

    it("rejects entries that parse but fail diagnostic validation", async () => {
        const { analyzer, analyze } = mockAnalyzer();
        const input = "2026-10-12T10:15:00Z SECRET=abc POST /x 401 requestId=r1";

        const result = await analyzeLogs(input, analyzer);

        expect(analyze).not.toHaveBeenCalled();
        expect(result.status).toBe("no_valid_entries");
        expect(result.errors).toEqual([
            { lineNumber: 1, message: "Invalid diagnostic data" },
        ]);
        expect(JSON.stringify(result)).not.toContain("SECRET");
    });

    it.each([[""], ["   "], ["\n\n  \n"]])(
        "rejects empty input %j",
        async (input) => {
            const { analyzer, analyze } = mockAnalyzer();

            await expect(analyzeLogs(input, analyzer)).rejects.toBeInstanceOf(
                AnalysisInputError
            );
            expect(analyze).not.toHaveBeenCalled();
        }
    );

    it("rejects more than the maximum number of lines", async () => {
        const { analyzer, analyze } = mockAnalyzer();
        const input = Array(MAX_LOG_LINES + 1).fill(line(401)).join("\n");

        await expect(analyzeLogs(input, analyzer)).rejects.toMatchObject({
            reason: "too_many_lines",
        });
        expect(analyze).not.toHaveBeenCalled();
    });

    it("accepts exactly the maximum number of lines", async () => {
        const { analyzer } = mockAnalyzer();
        const input = Array(MAX_LOG_LINES).fill("bad line").join("\n");

        const result = await analyzeLogs(input, analyzer);

        expect(result.summary.rejectedLines).toBe(MAX_LOG_LINES);
    });

    it("analyzes at most 3 entries sequentially and reports the rest", async () => {
        let active = 0;
        let maxActive = 0;
        const analyze = vi.fn(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active--;
            return "ok";
        });
        const input = Array.from({ length: 5 }, (_, i) => line(401, `r${i}`)).join("\n");

        const result = await analyzeLogs(input, { analyze });

        expect(analyze).toHaveBeenCalledTimes(MAX_ANALYZED_ENTRIES);
        expect(maxActive).toBe(1);
        expect(result.summary.analyzedEntries).toBe(3);
        expect(result.summary.notAnalyzedEntries).toBe(2);
        expect(result.entries.map((e) => e.analysis.status)).toEqual([
            "completed",
            "completed",
            "completed",
            "skipped",
            "skipped",
        ]);
    });

    it("passes only allowlisted diagnostic fields to the analyzer", async () => {
        const { analyzer, analyze } = mockAnalyzer();
        const input = line(401, "sensitive-id", "/api/users?api_key=secret123");

        const result = await analyzeLogs(input, analyzer);

        expect(analyze.mock.calls[0]![0]).toEqual({
            timestamp: "2026-10-12T10:15:00Z",
            level: "ERROR",
            method: "POST",
            statusCode: 401,
        });
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain("secret123");
        expect(serialized).not.toContain("sensitive-id");
        expect(serialized).not.toContain("/api/users");
    });

    it("reports analyzer failure generically and stops further requests", async () => {
        const analyze = vi
            .fn<(log: object) => Promise<string>>()
            .mockRejectedValue(new Error("connect ECONNREFUSED internal-host:11434"));
        const input = [line(401), line(500)].join("\n");

        const result = await analyzeLogs(input, { analyze });

        expect(analyze).toHaveBeenCalledTimes(1);
        expect(result.status).toBe("analysis_failed");
        expect(result.entries.map((e) => e.analysis.status)).toEqual([
            "failed",
            "skipped",
        ]);
        expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
        expect(JSON.stringify(result)).not.toContain("internal-host");
    });

    it("reports partial status when a later analysis fails", async () => {
        const analyze = vi
            .fn<(log: object) => Promise<string>>()
            .mockResolvedValueOnce("first ok")
            .mockRejectedValueOnce(new Error("boom"));
        const input = [line(401), line(500), line(502)].join("\n");

        const result = await analyzeLogs(input, { analyze });

        expect(result.status).toBe("partial");
        expect(result.entries.map((e) => e.analysis.status)).toEqual([
            "completed",
            "failed",
            "skipped",
        ]);
    });

    it.each([
        {
            name: "leading blank lines and CRLF endings",
            input: ["", "", line(401), "bad", line(500)].join("\r\n"),
            valid: [3, 5],
            invalid: [4],
        },
        {
            name: "whitespace-only lines between entries",
            input: [line(401), "   ", "\t", "bad one", "", line(404), "bad two"].join("\n"),
            valid: [1, 6],
            invalid: [4, 7],
        },
        {
            name: "malformed first line and trailing blank lines",
            input: ["bad", line(401), "", ""].join("\n"),
            valid: [2],
            invalid: [1],
        },
        {
            name: "parseable line that fails diagnostic validation",
            input: [
                line(401),
                "",
                "2026-10-12T10:15:00Z NOPE POST /x 401 requestId=r1",
                "bad",
                line(500),
            ].join("\n"),
            valid: [1, 5],
            invalid: [3, 4],
        },
    ])("maps line numbers correctly: $name", async ({ input, valid, invalid }) => {
        const { analyzer } = mockAnalyzer();

        const result = await analyzeLogs(input, analyzer);

        expect(result.entries.map((e) => e.lineNumber)).toEqual(valid);
        expect(result.errors.map((e) => e.lineNumber)).toEqual(invalid);
        expect(result.summary.totalLines).toBe(valid.length + invalid.length);
    });

    it("keeps each explanation attached to the right line", async () => {
        const analyze = vi
            .fn<(log: object) => Promise<string>>()
            .mockImplementation(async (log) => `status ${(log as { statusCode: number }).statusCode}`);
        const input = ["bad", "", line(401), "bad", line(503)].join("\n");

        const result = await analyzeLogs(input, { analyze });

        expect(
            result.entries.map((e) => [e.lineNumber, e.statusCode, e.analysis])
        ).toEqual([
            [3, 401, { status: "completed", explanation: "status 401" }],
            [5, 503, { status: "completed", explanation: "status 503" }],
        ]);
    });
});
