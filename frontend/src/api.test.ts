import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeLogs } from "./api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const validResult = {
  status: "completed",
  summary: {
    totalLines: 1,
    parsedLines: 1,
    rejectedLines: 0,
    analyzedEntries: 1,
    notAnalyzedEntries: 0,
  },
  entries: [],
  errors: [],
};

describe("analyzeLogs", () => {
  it("posts JSON to /api/analyze and returns the result", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(validResult));

    const outcome = await analyzeLogs("line");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analyze",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: "line" }),
      })
    );
    expect(outcome).toMatchObject({ kind: "result", httpStatus: 200 });
  });

  it("keeps the result body of 422 and 502 responses", async () => {
    stubFetch(async () =>
      jsonResponse({ ...validResult, status: "analysis_failed" }, 502)
    );

    expect(await analyzeLogs("x")).toMatchObject({
      kind: "result",
      httpStatus: 502,
      result: { status: "analysis_failed" },
    });
  });

  it("maps backend error bodies to rejected", async () => {
    stubFetch(async () =>
      jsonResponse({ status: "error", error: "Request body exceeds 64 KB" }, 413)
    );

    expect(await analyzeLogs("x")).toEqual({
      kind: "rejected",
      httpStatus: 413,
      message: "Request body exceeds 64 KB",
    });
  });

  it("treats network failures as unavailable", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await analyzeLogs("x")).toEqual({ kind: "unavailable" });
  });

  it("treats non-JSON proxy errors as unavailable", async () => {
    stubFetch(async () => new Response("Bad Gateway", { status: 502 }));

    expect(await analyzeLogs("x")).toEqual({ kind: "unavailable" });
  });

  it("treats unrecognized JSON as unavailable", async () => {
    stubFetch(async () => jsonResponse({ surprise: true }, 200));

    expect(await analyzeLogs("x")).toEqual({ kind: "unavailable" });
  });
});
