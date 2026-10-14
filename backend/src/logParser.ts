export interface ParsedLogLine {
  timestamp: string;
  level: string;
  method: string;
  endpoint: string;
  statusCode: number;
  requestId: string;
}

// Format: <timestamp> <level> <method> <endpoint> <statusCode> requestId=<id>
const LOG_LINE_PATTERN =
  /^(\S+) (\S+) (\S+) (\S+) (\d{3}) requestId=(\S+)$/;

export function parseLogLine(line: string): ParsedLogLine {
  const match = LOG_LINE_PATTERN.exec(line.trim());
  if (!match) {
    throw new Error("Invalid log line format");
  }

  const [, timestamp, level, method, endpoint, statusCodeText, requestId] =
    match;

  const statusCode = Number(statusCodeText);
  if (statusCode < 100 || statusCode > 599) {
    throw new Error("Invalid HTTP status code");
  }

  return {
    timestamp: timestamp!,
    level: level!,
    method: method!,
    endpoint: endpoint!,
    statusCode,
    requestId: requestId!,
  };
}
