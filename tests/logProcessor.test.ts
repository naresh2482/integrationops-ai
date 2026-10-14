import {describe, expect, it} from 'vitest';
import { processLogLines } from '../src/logProcessor.js';

describe(('processLogLines'), () => {
    it("parses multiple valid log lines", () => {
        const input = [
            "2026-10-12T10:16:00Z INFO GET /api/status 200 requestId=req-124",
            "2026-10-12T10:15:00Z ERROR POST /api/results 401 requestId=req-123",
        ].join("\n");
        
        const result = processLogLines(input);

        expect(result.entries).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
        expect(result.entries[0]?.requestId).toBe("req-124");
        expect(result.entries[1]?.statusCode).toBe(401);

    });

    it("continues processing after a malformed log line", () => {
        const input = [
            "2026-10-12T10:16:00Z INFO GET /api/status 200 requestId=req-124",
            "INVALID LOG LINE",
            "2026-10-12T10:15:00Z ERROR POST /api/results 401 requestId=req-123",
        ].join("\n");

        const result = processLogLines(input);

        expect(result.entries).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        

        expect(result.errors[0]).toEqual({
            lineNumber: 2,
            message: "Invalid log line",
        });
    });

    it('ignore blank lines', () => {
        const input = [
            "2026-10-12T10:16:00Z INFO GET /api/status 200 requestId=req-124",
            "",
            "   ",
            "2026-10-12T10:15:00Z ERROR POST /api/results 401 requestId=req-123",
        ].join("\n");

        const result = processLogLines(input);

        expect(result.entries).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
    });
});