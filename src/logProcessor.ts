import {
    parseLogLine,
    type ParsedLogLine,
} from "./logParser.js";

export interface LogLineError {
  lineNumber: number;
  message: string;
}

export interface LogProcessingResult {
  entries: ParsedLogLine[];
  errors: LogLineError[];
}

export function processLogLines(
    input: string
): LogProcessingResult {
    const entries: ParsedLogLine[] = [];
    const errors: LogLineError[] = [];

    const lines = input.split(/\r?\n/);

    lines.forEach((line, index) => {
        try {
            if (line.trim() === "") {
                return; // Ignore blank lines
            }
            
            const parsed = parseLogLine(line);
            entries.push(parsed);
        } catch {
            errors.push({
                lineNumber: index + 1,
                message: "Invalid log line",
            });
        }
    });

    return { entries, errors };
}