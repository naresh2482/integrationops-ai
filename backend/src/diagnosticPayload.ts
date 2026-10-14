export interface SafeDiagnosticEntry {
    timestamp: string;
    level: string;
    method: string;
    statusCode: number;
}

const ALLOWED_LEVELS = new Set([
    "DEBUG",
    "INFO",
    "WARN",
    "ERROR",
    "FATAL",
]);

const ALLOWED_METHODS = new Set([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
]);

export function createDiagnosticPayload(
    log: Record<string, unknown>
): SafeDiagnosticEntry {
    const { timestamp, level, method, statusCode } = log;

    // Runtime type validation
    if (
        typeof timestamp !== "string" ||
        typeof level !== "string" ||
        typeof method !== "string" ||
        typeof statusCode !== "number"
    ) {
        throw new Error("Invalid diagnostic payload");
    }

    // Semantic validation
    if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp) ||
        !Number.isFinite(Date.parse(timestamp)) ||
        !ALLOWED_LEVELS.has(level) ||
        !ALLOWED_METHODS.has(method) ||
        !Number.isInteger(statusCode) ||
        statusCode < 100 ||
        statusCode > 599
    ) {
        throw new Error("Invalid diagnostic payload");
    }

    // Explicitly construct the allowlisted output
    return {
        timestamp,
        level,
        method,
        statusCode,
    };
}