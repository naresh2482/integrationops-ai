import { describe, it, expect } from "vitest";
import { parseLogLine } from "../src/logParser.js";

describe("Log Parser", () => {
  it("should parse a valid REST API error log", () => {
    // Arrange
    const line =
      "2026-10-12T10:15:00Z ERROR POST /api/results 401 requestId=req-123";

    // Act
    const result = parseLogLine(line);

    // Assert
    expect(result).toEqual({
      timestamp: "2026-10-12T10:15:00Z",
      level: "ERROR",
      method: "POST",
      endpoint: "/api/results",
      statusCode: 401,
      requestId: "req-123",
    });
  });

  it("should throw when the HTTP status code is invalid", () => {
    // Arrange
    const line =
      "2026-10-12T10:15:00Z ERROR POST /api/results 999 requestId=req-123";

    // Act & Assert
    expect(() => parseLogLine(line)).toThrow("Invalid HTTP status code");
  });

  it.each(["099", "600"])(
    "should throw for out-of-range HTTP status code %s",
    (code) => {
      // Arrange
      const line = `2026-10-12T10:15:00Z ERROR POST /api/results ${code} requestId=req-123`;

      // Act & Assert
      expect(() => parseLogLine(line)).toThrow("Invalid HTTP status code");
    },
  );

  it.each([100, 599])(
    "should accept boundary HTTP status code %i",
    (code) => {
      // Arrange
      const line = `2026-10-12T10:15:00Z ERROR POST /api/results ${code} requestId=req-123`;

      // Act
      const result = parseLogLine(line);

      // Assert
      expect(result.statusCode).toBe(code);
    },
  );

  it.each([
    ["empty line", ""],
    ["whitespace-only line", "   "],
    [
      "missing requestId",
      "2026-10-12T10:15:00Z ERROR POST /api/results 401",
    ],
    [
      "requestId key without value",
      "2026-10-12T10:15:00Z ERROR POST /api/results 401 requestId=",
    ],
    [
      "missing status code",
      "2026-10-12T10:15:00Z ERROR POST /api/results requestId=req-123",
    ],
    [
      "missing endpoint",
      "2026-10-12T10:15:00Z ERROR POST 401 requestId=req-123",
    ],
    [
      "missing timestamp",
      "ERROR POST /api/results 401 requestId=req-123",
    ],
    [
      "requestId before status code",
      "2026-10-12T10:15:00Z ERROR POST /api/results requestId=req-123 401",
    ],
  ])("should throw for malformed line: %s", (_name, line) => {
    // Act & Assert
    expect(() => parseLogLine(line)).toThrow("Invalid log line format");
  });
});
