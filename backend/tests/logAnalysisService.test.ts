import { describe, it, expect, vi } from "vitest";
import { OllamaClient } from "../src/ollamaClient.js";
import {
    LogAnalysisService,
    type TextGenerator,
} from "../src/logAnalysisService.js";

function createMockClient(
    response: string = "The API token may have expired."
) {
    const generate = vi.fn<(prompt: string) => Promise<string>>()
        .mockResolvedValue(response);
    const client: TextGenerator = { generate };
    return { client, generate };
}

const validLog = {
    timestamp: "2026-10-14T10:00:00Z",
    level: "ERROR",
    method: "POST",
    statusCode: 401,
};

describe("LogAnalysisService", () => {
    it("returns the generated troubleshooting explanation", async () => {
        const { client } = createMockClient("The API token may have expired.");
        const service = new LogAnalysisService(client);

        const result = await service.analyze(validLog);

        expect(result).toBe("The API token may have expired.");
    });

    it("builds the prompt from the validated diagnostic fields", async () => {
        const { client, generate } = createMockClient();
        const service = new LogAnalysisService(client);

        await service.analyze(validLog);

        expect(generate).toHaveBeenCalledTimes(1);
        const prompt = generate.mock.calls[0]![0];

        expect(prompt).toContain("2026-10-14T10:00:00Z");
        expect(prompt).toContain("ERROR");
        expect(prompt).toContain("POST");
        expect(prompt).toContain("401");
    });

    it("excludes sensitive and non-allowlisted fields from the prompt", async () => {
        const { client, generate } = createMockClient();
        const service = new LogAnalysisService(client);

        await service.analyze({
            ...validLog,
            endpoint: "/api/users?api_key=secret123",
            requestId: "sensitive-request-id",
            message: "Authorization: Bearer secret-token password=hunter2",
        });

        const prompt = generate.mock.calls[0]![0];

        expect(prompt).not.toContain("secret123");
        expect(prompt).not.toContain("/api/users");
        expect(prompt).not.toContain("sensitive-request-id");
        expect(prompt).not.toContain("secret-token");
        expect(prompt).not.toContain("hunter2");
        expect(prompt).not.toContain("Bearer");
    });

    it.each([
        ["non-string timestamp", { ...validLog, timestamp: 12345 }],
        ["malformed timestamp", { ...validLog, timestamp: "yesterday" }],
        ["unknown level", { ...validLog, level: "SECRET=abc" }],
        ["unknown method", { ...validLog, method: "STEAL" }],
        ["string status code", { ...validLog, statusCode: "401" }],
        ["out-of-range status code", { ...validLog, statusCode: 999 }],
        ["missing fields", {}],
    ])("rejects invalid input without calling Ollama: %s", async (_name, log) => {
        const { client, generate } = createMockClient();
        const service = new LogAnalysisService(client);

        await expect(service.analyze(log)).rejects.toThrow(
            "Invalid diagnostic payload"
        );
        expect(generate).not.toHaveBeenCalled();
    });

    it("does not include input values in validation errors", async () => {
        const { client } = createMockClient();
        const service = new LogAnalysisService(client);

        await expect(
            service.analyze({ ...validLog, level: "password=hunter2" })
        ).rejects.toThrow(/^Invalid diagnostic payload$/);
    });

    it("propagates AI client failures", async () => {
        const generate = vi.fn<(prompt: string) => Promise<string>>()
            .mockRejectedValue(new Error("Ollama request failed"));
        const service = new LogAnalysisService({ generate });

        await expect(service.analyze(validLog)).rejects.toThrow(
            "Ollama request failed"
        );
    });

    it.each([
        ["empty string", ""],
        ["whitespace only", "  \n\t "],
    ])("rejects an empty AI response: %s", async (_name, response) => {
        const { client } = createMockClient(response);
        const service = new LogAnalysisService(client);

        await expect(service.analyze(validLog)).rejects.toThrow(
            "Invalid analysis response"
        );
    });

    it("rejects a non-string AI response at runtime", async () => {
        const generate = vi.fn().mockResolvedValue(undefined);
        const service = new LogAnalysisService({ generate });

        await expect(service.analyze(validLog)).rejects.toThrow(
            "Invalid analysis response"
        );
    });

    it("trims surrounding whitespace from the response", async () => {
        const { client } = createMockClient("\n  Token expired.  \n");
        const service = new LogAnalysisService(client);

        await expect(service.analyze(validLog)).resolves.toBe("Token expired.");
    });

    it("accepts the real OllamaClient as its AI client", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ response: "Check token expiry." }),
        });
        const service = new LogAnalysisService(new OllamaClient(fetchFn));

        await expect(service.analyze(validLog)).resolves.toBe(
            "Check token expiry."
        );
    });
});
