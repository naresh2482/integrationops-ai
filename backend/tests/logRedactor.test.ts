import { describe, expect, it } from "vitest";
import { redactSensitiveData } from "../src/logRedactor.js";

describe("redactSensitiveData", () => {
    it("redacts bearer authorization tokens", () => {
        const input =
            "Authorization: Bearer secret-token-123";

        const result = redactSensitiveData(input);

        expect(result).toBe(
            "Authorization: Bearer [REDACTED]"
        );

        expect(result).not.toContain("secret-token-123");
    });

    it("redacts bearer tokens and API keys", () => {
        const input = [
            "Authorization: Bearer secret-token-123",
            "X-API-Key: my-private-api-key",
        ].join("\n");

        const result = redactSensitiveData(input);

        expect(result).not.toContain("secret-token-123");
        expect(result).not.toContain("my-private-api-key");

        expect(result).toContain(
            "Authorization: Bearer [REDACTED]"
        );
        expect(result).toContain(
            "X-API-Key: [REDACTED]"
        );
    });

    it("redacts password values", () => {
        const input =
            "2026-10-14 ERROR Login failed password=mySecret123";

        const result = redactSensitiveData(input);

        expect(result).not.toContain("mySecret123");
        expect(result).toContain("password=[REDACTED]");
    });

    it("redacts API keys in query strings", () => {
        const input =
            "GET /api/results?api_key=secret123&page=2";

        const result = redactSensitiveData(input);

        expect(result).not.toContain("secret123");
        expect(result).toContain(
            "api_key=[REDACTED]&page=2"
        );
    });

    it("does not consume the next line when a bearer token is missing", () => {
        const input = [
            "Authorization: Bearer",
            "INFO GET /api/status 200",
        ].join("\n");

        const result = redactSensitiveData(input);

        expect(result).not.toContain("Bearer [REDACTED]");
        expect(result).toContain("INFO GET /api/status 200");
    });

});