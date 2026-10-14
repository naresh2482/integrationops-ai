import { describe, it, expect, vi } from "vitest";
import { OllamaClient } from "../src/ollamaClient.js";

function getFirstRequestInit(mockFetch: {
    mock: { calls: unknown[][] };
}): RequestInit {
    const init = mockFetch.mock.calls[0]?.[1];

    if (typeof init !== "object" || init === null) {
        throw new Error("Expected fetch to be called with request options");
    }

    return init;
}

describe("OllamaClient", () => {
    it("sends a prompt and returns the generated response", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                response: "The API token may have expired.",
                done: true,
            }),
        });

        const client = new OllamaClient(mockFetch);

        const result = await client.generate(
            "Explain HTTP 401 authentication failure"
        );

        expect(result).toBe("The API token may have expired.");

        expect(mockFetch).toHaveBeenCalledWith(
            "http://localhost:11434/api/generate",
            expect.objectContaining({
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            })
        );

        const { body } = getFirstRequestInit(mockFetch);

        if (typeof body !== "string") {
            throw new Error("Expected request body to be a JSON string");
        }

        const requestBody: unknown = JSON.parse(body);

        expect(requestBody).toMatchObject({
            model: "qwen3:14b",
            stream: false,
            think: false,
        });
    });

    it("throws an error when Ollama returns an HTTP failure", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
        });

        const client = new OllamaClient(mockFetch);

        await expect(
            client.generate("Explain HTTP 401")
        ).rejects.toThrow("Ollama request failed");
    });

    it.each([
        ["missing response", { done: true }],
        ["null response", { response: null }],
        ["numeric response", { response: 123 }],
        ["null JSON body", null],
    ])("rejects %s", async (_scenario, body) => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => body,
        });

        const client = new OllamaClient(mockFetch);

        await expect(
            client.generate("Explain HTTP 401")
        ).rejects.toThrow("Invalid Ollama response");
    });

    it("propagates network failures", async () => {
        const mockFetch = vi.fn().mockRejectedValue(
            new TypeError("fetch failed")
        );

        const client = new OllamaClient(mockFetch);

        await expect(
            client.generate("Explain HTTP 401")
        ).rejects.toThrow("fetch failed");
    });

    it("configures a timeout for Ollama requests", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                response: "Authentication token expired",
            }),
        });

        const client = new OllamaClient(mockFetch);

        await client.generate("Explain HTTP 401");

        const options = getFirstRequestInit(mockFetch);

        expect(options.signal).toBeInstanceOf(AbortSignal);
    });
});