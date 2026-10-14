import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { request, type Server } from "node:http";
import { createHttpServer, MAX_BODY_BYTES } from "../src/httpServer.js";
import { LogAnalysisService } from "../src/logAnalysisService.js";

const VALID_LINE =
    "2026-10-12T10:15:00Z ERROR POST /api/login 401 requestId=req-123";

let server: Server | undefined;

afterEach(async () => {
    if (server) {
        const s = server;
        server = undefined;
        await new Promise<void>((resolve) => s.close(() => resolve()));
    }
});

async function start(generate: (prompt: string) => Promise<string>) {
    const mockGenerate = vi.fn(generate);
    server = createHttpServer({
        analyzer: new LogAnalysisService({ generate: mockGenerate }),
    });
    await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", resolve)
    );
    const { port } = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${port}`, mockGenerate };
}

function post(baseUrl: string, body: string, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
    });
}

describe("HTTP API", () => {
    it("GET /health returns status and service name", async () => {
        const { baseUrl } = await start(async () => "x");

        const res = await fetch(`${baseUrl}/health`);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            status: "ok",
            service: "integrationops-ai",
        });
    });

    it("POST /api/analyze returns an AI explanation", async () => {
        const { baseUrl } = await start(async () => "The token may be expired.");

        const res = await post(baseUrl, JSON.stringify({ logs: VALID_LINE }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("completed");
        expect(body.summary.parsedLines).toBe(1);
        expect(body.entries[0].analysis).toEqual({
            status: "completed",
            explanation: "The token may be expired.",
        });
    });

    it("never sends endpoints, request IDs, or secrets to the model", async () => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");
        const logs =
            "2026-10-12T10:15:00Z ERROR POST /api/users?api_key=secret123 401 requestId=sensitive-id";

        const res = await post(baseUrl, JSON.stringify({ logs }));
        const responseText = await res.text();

        const prompt = mockGenerate.mock.calls[0]![0];
        for (const text of [prompt, responseText]) {
            expect(text).not.toContain("secret123");
            expect(text).not.toContain("sensitive-id");
            expect(text).not.toContain("/api/users");
        }
    });

    it("analyzes multiple lines and reports malformed ones", async () => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");
        const logs = [VALID_LINE, "garbage password=hunter2", VALID_LINE].join("\n");

        const res = await post(baseUrl, JSON.stringify({ logs }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(mockGenerate).toHaveBeenCalledTimes(2);
        expect(body.summary.rejectedLines).toBe(1);
        expect(body.errors).toEqual([{ lineNumber: 2, message: "Invalid log line" }]);
        expect(JSON.stringify(body)).not.toContain("hunter2");
    });

    it("returns 422 when no line is valid", async () => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");

        const res = await post(baseUrl, JSON.stringify({ logs: "nope" }));
        const body = await res.json();

        expect(res.status).toBe(422);
        expect(body.status).toBe("no_valid_entries");
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it.each([
        ["empty logs", JSON.stringify({ logs: "" })],
        ["whitespace logs", JSON.stringify({ logs: "  \n " })],
        ["missing logs", JSON.stringify({})],
        ["non-string logs", JSON.stringify({ logs: 42 })],
        ["array body", JSON.stringify([VALID_LINE])],
        ["null body", "null"],
        ["invalid JSON", "{not json password=hunter2"],
    ])("returns 400 for %s", async (_name, body) => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");

        const res = await post(baseUrl, body);
        const text = await res.text();

        expect(res.status).toBe(400);
        expect(text).not.toContain("hunter2");
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("returns 413 when the body exceeds 64 KB", async () => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");
        const body = JSON.stringify({ logs: "a".repeat(MAX_BODY_BYTES + 1) });

        const res = await post(baseUrl, body);

        expect(res.status).toBe(413);
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("returns 422 when there are more than 100 log lines", async () => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");
        const logs = Array(101).fill(VALID_LINE).join("\n");

        const res = await post(baseUrl, JSON.stringify({ logs }));

        expect(res.status).toBe(422);
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("analyzes at most 3 entries and reports the rest as not analyzed", async () => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");
        const logs = Array(5).fill(VALID_LINE).join("\n");

        const res = await post(baseUrl, JSON.stringify({ logs }));
        const body = await res.json();

        expect(mockGenerate).toHaveBeenCalledTimes(3);
        expect(body.summary.analyzedEntries).toBe(3);
        expect(body.summary.notAnalyzedEntries).toBe(2);
        expect(body.entries[3].analysis.status).toBe("skipped");
    });

    it("returns 502 without internal details when Ollama fails", async () => {
        const { baseUrl } = await start(async () => {
            throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
        });

        const res = await post(baseUrl, JSON.stringify({ logs: VALID_LINE }));
        const text = await res.text();

        expect(res.status).toBe(502);
        expect(JSON.parse(text).status).toBe("analysis_failed");
        expect(text).not.toContain("ECONNREFUSED");
        expect(text).not.toContain("11434");
    });

    it("does not enable CORS", async () => {
        const { baseUrl } = await start(async () => "ok");

        const res = await fetch(`${baseUrl}/health`, {
            headers: { Origin: "http://evil.example" },
        });

        expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("returns 404 for unknown routes and 405 for wrong methods", async () => {
        const { baseUrl } = await start(async () => "ok");

        expect((await fetch(`${baseUrl}/nope`)).status).toBe(404);
        expect((await fetch(`${baseUrl}/api/analyze`)).status).toBe(405);
        expect(
            (await fetch(`${baseUrl}/health`, { method: "POST" })).status
        ).toBe(405);
    });

    it.each([
        ["text/plain"],
        ["application/x-www-form-urlencoded"],
        ["application/jsonp"],
        [""],
    ])("returns 415 for unsupported Content-Type %j", async (contentType) => {
        const { baseUrl, mockGenerate } = await start(async () => "ok");
        const headers: Record<string, string> = {};
        if (contentType !== "") headers["Content-Type"] = contentType;

        const res = await fetch(`${baseUrl}/api/analyze`, {
            method: "POST",
            headers,
            body: new Uint8Array(Buffer.from(JSON.stringify({ logs: VALID_LINE }))),
        });

        expect(res.status).toBe(415);
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it.each([
        ["application/json; charset=utf-8"],
        ["Application/JSON"],
        ["application/json;charset=UTF-8"],
    ])("accepts Content-Type %j", async (contentType) => {
        const { baseUrl } = await start(async () => "ok");

        const res = await fetch(`${baseUrl}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: JSON.stringify({ logs: VALID_LINE }),
        });

        expect(res.status).toBe(200);
    });

    it("stops reading and closes the connection once the limit is exceeded", async () => {
        const { baseUrl } = await start(async () => "ok");
        const target = 200 * 1024 * 1024;
        const chunk = Buffer.alloc(16 * 1024, "a");

        const outcome = await new Promise<{ status?: number; written: number }>(
            (resolve) => {
                let written = 0;
                let status: number | undefined;
                let finished = false;
                const done = () => {
                    if (!finished) {
                        finished = true;
                        resolve({ ...(status !== undefined && { status }), written });
                    }
                };
                // No Content-Length: chunked, so the limit must be enforced while streaming.
                const req = request(
                    `${baseUrl}/api/analyze`,
                    { method: "POST", headers: { "Content-Type": "application/json" } },
                    (res) => {
                        status = res.statusCode;
                        res.resume();
                        res.on("end", () => {
                            done();
                            req.destroy();
                        });
                    }
                );
                req.on("error", done);
                req.on("close", done);

                // One chunk per tick so the client can read an early response.
                const write = () => {
                    if (finished) return;
                    if (written >= target) {
                        req.end();
                        return;
                    }
                    written += chunk.length;
                    req.write(chunk);
                    setImmediate(write);
                };
                write();
            }
        );

        expect(outcome.status).toBe(413);
        // The server must hang up well before the full 200 MB is sent.
        expect(outcome.written).toBeLessThan(target / 4);
    });

    it("keeps the connection usable after a 415 for a small body", async () => {
        const { baseUrl } = await start(async () => "ok");

        const first = await fetch(`${baseUrl}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: "hello",
        });
        const second = await fetch(`${baseUrl}/health`);

        expect(first.status).toBe(415);
        expect(second.status).toBe(200);
    });
});
