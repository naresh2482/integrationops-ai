import {
    createServer,
    type IncomingMessage,
    type Server,
    type ServerResponse,
} from "node:http";
import {
    analyzeLogs,
    AnalysisInputError,
    type LogAnalyzer,
} from "./analysisWorkflow.js";

export const MAX_BODY_BYTES = 64 * 1024;
const SERVICE_NAME = "integrationops-ai";
const REJECT_GRACE_MS = 1000;

export interface HttpServerDependencies {
    analyzer: LogAnalyzer;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
        "X-Content-Type-Options": "nosniff",
    });
    res.end(payload);
}

function sendError(res: ServerResponse, status: number, message: string): void {
    sendJson(res, status, { status: "error", error: message });
}

type BodyResult = { ok: true; text: string } | { ok: false };

// Reads at most MAX_BODY_BYTES. On overflow it stops consuming immediately and
// buffered chunks are released; the caller closes the connection.
function readBody(req: IncomingMessage): Promise<BodyResult> {
    return new Promise((resolve) => {
        const declared = Number(req.headers["content-length"]);
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
            req.pause();
            resolve({ ok: false });
            return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        req.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                chunks.length = 0;
                req.removeAllListeners("data");
                req.removeAllListeners("end");
                req.pause();
                resolve({ ok: false });
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            resolve({ ok: true, text: Buffer.concat(chunks).toString("utf8") });
        });
        req.on("error", () => resolve({ ok: false }));
    });
}

function isJsonContentType(header: string | undefined): boolean {
    const mediaType = (header ?? "").split(";")[0]?.trim().toLowerCase();
    return mediaType === "application/json";
}

// Responds and stops consuming an oversized or undeclared-length request body
// (nothing is read or buffered), then drops the connection after a short grace
// period so the client can read the response before the socket is torn down.
// "Connection: close" is deliberately not set: it makes Node end the socket at
// once, and the resulting reset can discard the response for streaming clients.
function rejectAndClose(
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    message: string
): void {
    sendError(res, status, message);

    // A small, fully declared body is cheap to drain, which keeps the
    // keep-alive connection reusable.
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared <= MAX_BODY_BYTES) {
        req.resume();
        return;
    }

    req.removeAllListeners("data");
    req.on("error", () => undefined);
    req.pause();
    setTimeout(() => req.destroy(), REJECT_GRACE_MS).unref();
}

function extractLogs(bodyText: string): string | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(bodyText);
    } catch {
        return undefined;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return undefined;
    }
    const logs = (parsed as Record<string, unknown>)["logs"];
    return typeof logs === "string" ? logs : undefined;
}

async function handleAnalyze(
    req: IncomingMessage,
    res: ServerResponse,
    deps: HttpServerDependencies
): Promise<void> {
    if (!isJsonContentType(req.headers["content-type"])) {
        rejectAndClose(req, res, 415, "Content-Type must be application/json");
        return;
    }

    const body = await readBody(req);
    if (!body.ok) {
        rejectAndClose(req, res, 413, "Request body exceeds 64 KB");
        return;
    }

    const logs = extractLogs(body.text);
    if (logs === undefined || logs.trim() === "") {
        sendError(
            res,
            400,
            'Request body must be JSON with a non-empty string field "logs"'
        );
        return;
    }

    try {
        const result = await analyzeLogs(logs, deps.analyzer);
        const status =
            result.status === "no_valid_entries"
                ? 422
                : result.status === "analysis_failed"
                  ? 502
                  : 200;
        sendJson(res, status, result);
    } catch (error) {
        if (error instanceof AnalysisInputError) {
            sendError(res, 422, error.message);
            return;
        }
        sendError(res, 500, "Internal server error");
    }
}

export function createHttpServer(deps: HttpServerDependencies): Server {
    return createServer((req, res) => {
        const path = (req.url ?? "").split("?")[0];

        if (path === "/health") {
            if (req.method !== "GET") {
                res.setHeader("Allow", "GET");
                sendError(res, 405, "Method not allowed");
                return;
            }
            sendJson(res, 200, { status: "ok", service: SERVICE_NAME });
            return;
        }

        if (path === "/api/analyze") {
            if (req.method !== "POST") {
                res.setHeader("Allow", "POST");
                sendError(res, 405, "Method not allowed");
                return;
            }
            handleAnalyze(req, res, deps).catch(() => {
                if (!res.headersSent) {
                    sendError(res, 500, "Internal server error");
                }
            });
            return;
        }

        sendError(res, 404, "Not found");
    });
}
