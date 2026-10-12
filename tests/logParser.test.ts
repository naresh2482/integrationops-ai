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
});