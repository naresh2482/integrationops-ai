import { describe, it, expect } from "vitest";
import { createDiagnosticPayload } from "../src/diagnosticPayload.js";

describe("createDiagnosticPayload", () => {
    it("includes only allowlisted diagnostic fields", () => {
        const log = {
            timestamp: "2026-10-14T10:00:00Z",
            level: "ERROR",
            method: "POST",
            endpoint: "/api/users?api_key=secret123",
            statusCode: 401,
            requestId: "sensitive-request-id",
            message: "Authorization: Bearer secret-token",
        };

        const result = createDiagnosticPayload(log);

        expect(result).toEqual({
            timestamp: "2026-10-14T10:00:00Z",
            level: "ERROR",
            method: "POST",
            statusCode: 401,
        });

        expect(JSON.stringify(result)).not.toContain("secret123");
        expect(JSON.stringify(result)).not.toContain("secret-token");
        expect(JSON.stringify(result)).not.toContain("sensitive-request-id");
    });

    it("rejects invalid diagnostic field types", () => {
        const log = {
            timestamp: 12345,
            level: "ERROR",
            method: "POST",
            statusCode: "401",
        };

        expect(() => createDiagnosticPayload(log)).toThrow(
            "Invalid diagnostic payload"
        );
    });

    it("rejects invalid diagnostic field values", () => {
        const log = {
            timestamp: "not-a-date",
            level: "SECRET_TOKEN",
            method: "INVALID_METHOD",
            statusCode: 999,
        };

        expect(() => createDiagnosticPayload(log)).toThrow(
            "Invalid diagnostic payload"
        );
    });

    it.each([
        ["invalid timestamp", { timestamp: "not-a-date" }],
        ["invalid level", { level: "SECRET_TOKEN" }],
        ["invalid method", { method: "INVALID_METHOD" }],
        ["status below 100", { statusCode: 99 }],
        ["status above 599", { statusCode: 600 }],
        ["fractional status", { statusCode: 200.5 }],
    ])("rejects %s", (_scenario, override) => {
        const validLog = {
            timestamp: "2026-10-14T10:00:00Z",
            level: "ERROR",
            method: "POST",
            statusCode: 401,
        };

        expect(() =>
            createDiagnosticPayload({ ...validLog, ...override })
        ).toThrow("Invalid diagnostic payload");
    });
});