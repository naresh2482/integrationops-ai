import {
    createDiagnosticPayload,
    type SafeDiagnosticEntry,
} from "./diagnosticPayload.js";

// Satisfied by OllamaClient; lets tests inject a mock.
export interface TextGenerator {
    generate(prompt: string): Promise<string>;
}

function buildPrompt(entry: SafeDiagnosticEntry): string {
    return [
        "You are an assistant that helps engineers troubleshoot REST API and integration failures.",
        "Based only on the diagnostic data below, explain the most likely causes of the failure and suggest next troubleshooting steps.",
        "Do not ask for or assume credentials, tokens, or other secrets.",
        "",
        "Diagnostic data:",
        `- Timestamp: ${entry.timestamp}`,
        `- Level: ${entry.level}`,
        `- HTTP method: ${entry.method}`,
        `- HTTP status code: ${entry.statusCode}`,
    ].join("\n");
}

export class LogAnalysisService {
    constructor(private readonly client: TextGenerator) {}

    async analyze(log: object): Promise<string> {
        // Validation boundary: throws before any AI request is made.
        const entry = createDiagnosticPayload({ ...log });

        const response: unknown = await this.client.generate(
            buildPrompt(entry)
        );

        if (typeof response !== "string" || response.trim() === "") {
            throw new Error("Invalid analysis response");
        }

        return response.trim();
    }
}
