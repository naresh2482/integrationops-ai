import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { AnalysisResult, AnalyzeFn, AnalyzeOutcome } from "./api";

const LINE = "2026-10-12T10:15:00Z ERROR POST /api/login 401 requestId=req-123";

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    status: "completed",
    summary: {
      totalLines: 1,
      parsedLines: 1,
      rejectedLines: 0,
      analyzedEntries: 1,
      notAnalyzedEntries: 0,
    },
    entries: [
      {
        lineNumber: 1,
        timestamp: "2026-10-12T10:15:00Z",
        level: "ERROR",
        method: "POST",
        statusCode: 401,
        analysis: { status: "completed", explanation: "The token may be expired." },
      },
    ],
    errors: [],
    ...overrides,
  };
}

function resultOutcome(result: AnalysisResult, httpStatus = 200): AnalyzeOutcome {
  return { kind: "result", httpStatus, result };
}

function setup(outcome: AnalyzeOutcome = resultOutcome(makeResult())) {
  const analyze = vi.fn<AnalyzeFn>().mockResolvedValue(outcome);
  const user = userEvent.setup();
  render(<App analyze={analyze} />);
  return { analyze, user };
}

const textbox = () => screen.getByRole("textbox", { name: /log lines/i });
const analyzeButton = () => screen.getByRole("button", { name: /analyze logs/i });

async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  // paste() is much faster than typing for large inputs
  await user.click(textbox());
  await user.paste(text);
}

describe("App", () => {
  it("shows branding and the empty state initially", () => {
    setup();

    expect(screen.getByRole("heading", { name: "IntegrationOps AI" })).toBeInTheDocument();
    expect(
      screen.getByText("AI-Powered API & Connector Troubleshooting")
    ).toBeInTheDocument();
    expect(screen.getByText(/paste logs or upload/i)).toBeInTheDocument();
    expect(analyzeButton()).toBeDisabled();
  });

  it("accepts text entry, shows size feedback, and clears", async () => {
    const { user } = setup();

    await paste(user, `${LINE}\n${LINE}`);

    expect(textbox()).toHaveValue(`${LINE}\n${LINE}`);
    expect(screen.getByText("2 / 100 lines")).toBeInTheDocument();
    expect(analyzeButton()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(textbox()).toHaveValue("");
    expect(screen.getByText("0 / 100 lines")).toBeInTheDocument();
    expect(analyzeButton()).toBeDisabled();
  });

  it("keeps Analyze disabled for whitespace-only input", async () => {
    const { user, analyze } = setup();

    await paste(user, "   \n\n  ");

    expect(analyzeButton()).toBeDisabled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("loads a .log file into the text area", async () => {
    const { user } = setup();
    const file = new File([LINE], "api.log", { type: "text/plain" });

    await user.upload(screen.getByLabelText("Upload log file"), file);

    expect(await screen.findByDisplayValue(LINE)).toBeInTheDocument();
  });

  it("rejects unsupported file types even if the picker allows them", async () => {
    const analyze = vi.fn<AnalyzeFn>();
    // applyAccept: false simulates a user bypassing the picker's filter.
    const user = userEvent.setup({ applyAccept: false });
    render(<App analyze={analyze} />);
    const file = new File(["x"], "data.csv", { type: "text/csv" });

    await user.upload(screen.getByLabelText("Upload log file"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(/unsupported file type/i);
    expect(textbox()).toHaveValue("");
  });

  it("rejects files larger than 64 KB without reading them", async () => {
    const { user } = setup();
    const file = new File(["a".repeat(64 * 1024 + 1)], "big.txt", {
      type: "text/plain",
    });

    await user.upload(screen.getByLabelText("Upload log file"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(/file is too large/i);
    expect(textbox()).toHaveValue("");
  });

  it("blocks input over the 100-line limit", async () => {
    const { user, analyze } = setup();

    await paste(user, Array(101).fill(LINE).join("\n"));

    expect(screen.getByText("101 / 100 lines")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/too many lines/i);
    expect(analyzeButton()).toBeDisabled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("blocks input over the 64 KB limit", async () => {
    const { user } = setup();

    await paste(user, "a".repeat(64 * 1024 + 1));

    expect(screen.getByRole("alert")).toHaveTextContent(/too large/i);
    expect(analyzeButton()).toBeDisabled();
  });

  it("shows a loading indicator while analysis is pending", async () => {
    let resolve!: (outcome: AnalyzeOutcome) => void;
    const analyze = vi.fn<AnalyzeFn>(
      () => new Promise<AnalyzeOutcome>((r) => (resolve = r))
    );
    const user = userEvent.setup();
    render(<App analyze={analyze} />);

    await paste(user, LINE);
    await user.click(analyzeButton());

    expect(screen.getByText(/analyzing logs with the local ai model/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyzing/i })).toBeDisabled();

    resolve(resultOutcome(makeResult()));

    expect(await screen.findByText("Analysis complete.")).toBeInTheDocument();
    expect(screen.queryByText(/analyzing logs with the local ai model/i)).toBeNull();
  });

  it("renders a successful analysis", async () => {
    const { user, analyze } = setup();

    await paste(user, LINE);
    await user.click(analyzeButton());

    expect(analyze).toHaveBeenCalledWith(LINE);
    expect(await screen.findByText("Analysis complete.")).toBeInTheDocument();
    expect(screen.getByText("HTTP 401")).toBeInTheDocument();
    expect(screen.getByText("Line 1")).toBeInTheDocument();
    expect(screen.getByText("The token may be expired.")).toBeInTheDocument();
    expect(screen.getByText(/hypothesis to guide investigation/i)).toBeInTheDocument();
  });

  it("shows parsing errors with line numbers and no raw content", async () => {
    const result = makeResult({
      summary: {
        totalLines: 3,
        parsedLines: 1,
        rejectedLines: 2,
        analyzedEntries: 1,
        notAnalyzedEntries: 0,
      },
      errors: [
        { lineNumber: 2, message: "Invalid log line" },
        { lineNumber: 3, message: "Invalid diagnostic data" },
      ],
    });
    const { user } = setup(resultOutcome(result));

    await paste(user, `${LINE}\nsecret garbage password=hunter2\nbad`);
    await user.click(analyzeButton());

    const heading = await screen.findByRole("heading", { name: "Parsing errors" });
    const list = heading.nextElementSibling as HTMLElement;
    expect(within(list).getByText("Line 2")).toBeInTheDocument();
    expect(within(list).getByText(/Invalid log line/)).toBeInTheDocument();
    expect(within(list).getByText("Line 3")).toBeInTheDocument();
    expect(screen.getByText("Rejected").nextElementSibling).toHaveTextContent("2");

    // Raw input stays in the text area only; it never appears in the results.
    const resultsText = screen.getByRole("heading", { name: "Analysis results" })
      .closest("section")!.textContent;
    expect(resultsText).not.toContain("hunter2");
    expect(resultsText).not.toContain("secret garbage");
  });

  it("shows partial analysis and skipped entries clearly", async () => {
    const result = makeResult({
      status: "partial",
      summary: {
        totalLines: 3,
        parsedLines: 3,
        rejectedLines: 0,
        analyzedEntries: 1,
        notAnalyzedEntries: 1,
      },
      entries: [
        { ...makeResult().entries[0]! },
        {
          lineNumber: 2,
          timestamp: "2026-10-12T10:16:00Z",
          level: "ERROR",
          method: "GET",
          statusCode: 500,
          analysis: { status: "failed" },
        },
        {
          lineNumber: 3,
          timestamp: "2026-10-12T10:17:00Z",
          level: "ERROR",
          method: "GET",
          statusCode: 503,
          analysis: { status: "skipped", reason: "Skipped after an earlier analysis failed" },
        },
      ],
    });
    const { user } = setup(resultOutcome(result));

    await paste(user, LINE);
    await user.click(analyzeButton());

    expect(await screen.findByText("Partial analysis.")).toBeInTheDocument();
    expect(screen.getByText(/AI analysis failed for this entry/)).toBeInTheDocument();
    expect(
      screen.getByText(/Not analyzed: Skipped after an earlier analysis failed/)
    ).toBeInTheDocument();
  });

  it("notes entries skipped because of the 3-entry limit", async () => {
    const result = makeResult({
      summary: {
        totalLines: 5,
        parsedLines: 5,
        rejectedLines: 0,
        analyzedEntries: 3,
        notAnalyzedEntries: 2,
      },
    });
    const { user } = setup(resultOutcome(result));

    await paste(user, LINE);
    await user.click(analyzeButton());

    expect(
      await screen.findByText(/2 valid entries not analyzed \(limit of 3 per request\)/)
    ).toBeInTheDocument();
  });

  it("shows an Ollama failure while keeping parsed entries", async () => {
    const result = makeResult({
      status: "analysis_failed",
      summary: {
        totalLines: 1,
        parsedLines: 1,
        rejectedLines: 0,
        analyzedEntries: 0,
        notAnalyzedEntries: 0,
      },
      entries: [
        {
          ...makeResult().entries[0]!,
          analysis: { status: "failed" },
        },
      ],
    });
    const { user } = setup(resultOutcome(result, 502));

    await paste(user, LINE);
    await user.click(analyzeButton());

    expect(await screen.findByText("AI analysis failed.")).toBeInTheDocument();
    expect(screen.getByText("HTTP 401")).toBeInTheDocument();
  });

  it("shows the no-valid-entries state", async () => {
    const result = makeResult({
      status: "no_valid_entries",
      summary: {
        totalLines: 1,
        parsedLines: 0,
        rejectedLines: 1,
        analyzedEntries: 0,
        notAnalyzedEntries: 0,
      },
      entries: [],
      errors: [{ lineNumber: 1, message: "Invalid log line" }],
    });
    const { user } = setup(resultOutcome(result, 422));

    await paste(user, "nonsense");
    await user.click(analyzeButton());

    expect(await screen.findByText("No valid log lines.")).toBeInTheDocument();
    expect(screen.getByText("Line 1")).toBeInTheDocument();
  });

  it("shows server-side validation errors", async () => {
    const { user } = setup({
      kind: "rejected",
      httpStatus: 422,
      message: "Log input exceeds 100 lines",
    });

    await paste(user, LINE);
    await user.click(analyzeButton());

    expect(await screen.findByText("Request rejected.")).toBeInTheDocument();
    expect(screen.getByText(/exceeds 100 lines/)).toBeInTheDocument();
  });

  it("shows a backend-unavailable message and allows retry", async () => {
    const { user, analyze } = setup({ kind: "unavailable" });

    await paste(user, LINE);
    await user.click(analyzeButton());

    expect(await screen.findByText("Backend unavailable.")).toBeInTheDocument();
    expect(analyzeButton()).toBeEnabled();

    await user.click(analyzeButton());
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("does not write logs to browser storage or the console", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const { user } = setup();

    await paste(user, LINE);
    await user.click(analyzeButton());
    await screen.findByText("Analysis complete.");

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  describe("AI Markdown rendering", () => {
    async function renderExplanation(explanation: string) {
      const result = makeResult();
      result.entries[0]!.analysis = { status: "completed", explanation };
      const { user } = setup(resultOutcome(result));
      await paste(user, LINE);
      await user.click(analyzeButton());
      await screen.findByText("Analysis complete.");
      return user;
    }

    it("renders headings, bold text, lists, and code blocks", async () => {
      await renderExplanation(
        [
          "## Most Likely Causes",
          "",
          "The token is **expired**.",
          "",
          "1. Check the header",
          "2. Rotate the key",
          "",
          "- first bullet",
          "",
          "Inline `Authorization` header:",
          "",
          "```",
          "Authorization: Bearer <token>",
          "```",
        ].join("\n")
      );

      expect(
        screen.getByRole("heading", { name: "Most Likely Causes" })
      ).toBeInTheDocument();
      expect(screen.getByText("expired").tagName).toBe("STRONG");
      expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
        expect.arrayContaining(["Check the header", "Rotate the key", "first bullet"])
      );
      expect(screen.getByText("Authorization").tagName).toBe("CODE");
      const block = screen.getByText("Authorization: Bearer <token>");
      expect(block.tagName).toBe("CODE");
      expect(block.closest("pre")).not.toBeNull();
    });

    it("does not render raw HTML or run scripts", async () => {
      await renderExplanation(
        [
          'Before <img src=x onerror="window.__pwned=1"> after',
          "",
          "<script>window.__pwned=1</script>",
          "",
          '<iframe src="https://evil.example"></iframe>',
          "",
          '<div onclick="window.__pwned=1">click</div>',
        ].join("\n")
      );

      const root = document.querySelector(".markdown")!;
      expect(root.querySelector("img")).toBeNull();
      expect(root.querySelector("script")).toBeNull();
      expect(root.querySelector("iframe")).toBeNull();
      expect(root.querySelector("[onclick]")).toBeNull();
      expect(root.querySelector("[onerror]")).toBeNull();
      expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });

    it("drops unsafe link protocols and images", async () => {
      await renderExplanation(
        [
          "[js](javascript:alert(1))",
          "",
          "[data](data:text/html;base64,PHNjcmlwdD4=)",
          "",
          "[vb](vbscript:msgbox)",
          "",
          "![tracker](https://evil.example/pixel.png)",
        ].join("\n")
      );

      const root = document.querySelector(".markdown")!;
      for (const anchor of root.querySelectorAll("a")) {
        expect(anchor.getAttribute("href") ?? "").not.toMatch(
          /^(javascript|data|vbscript):/i
        );
      }
      expect(root.querySelector("img")).toBeNull();
      expect(root.innerHTML.toLowerCase()).not.toContain("javascript:");
    });

    it("opens safe links in a new tab without opener access", async () => {
      await renderExplanation("See [the docs](https://example.com/auth).");

      const link = screen.getByRole("link", { name: "the docs" });
      expect(link).toHaveAttribute("href", "https://example.com/auth");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    });
  });

  describe("collapsible diagnostic cards", () => {
    function twoEntryResult(): AnalysisResult {
      const first = makeResult().entries[0]!;
      return makeResult({
        summary: {
          totalLines: 2,
          parsedLines: 2,
          rejectedLines: 0,
          analyzedEntries: 2,
          notAnalyzedEntries: 0,
        },
        entries: [
          { ...first, analysis: { status: "completed", explanation: "First explanation" } },
          {
            ...first,
            lineNumber: 2,
            statusCode: 500,
            analysis: { status: "completed", explanation: "Second explanation" },
          },
        ],
      });
    }

    async function showTwoEntries() {
      const { user } = setup(resultOutcome(twoEntryResult()));
      await paste(user, `${LINE}\n${LINE}`);
      await user.click(analyzeButton());
      await screen.findByText("Analysis complete.");
      return user;
    }

    it("expands the first card and collapses the rest by default", async () => {
      await showTwoEntries();

      const [first, second] = screen.getAllByRole("button", { name: /^Line \d+/ });
      expect(first).toHaveAttribute("aria-expanded", "true");
      expect(second).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText("First explanation")).toBeVisible();
      expect(screen.getByText("Second explanation")).not.toBeVisible();
    });

    it("toggles a card with the mouse and links the button to its region", async () => {
      const user = await showTwoEntries();
      const second = screen.getAllByRole("button", { name: /^Line \d+/ })[1]!;

      await user.click(second);

      expect(second).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Second explanation")).toBeVisible();
      const regionId = second.getAttribute("aria-controls")!;
      expect(document.getElementById(regionId)).toContainElement(
        screen.getByText("Second explanation")
      );

      await user.click(second);

      expect(second).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText("Second explanation")).not.toBeVisible();
    });

    it("can be toggled from the keyboard", async () => {
      const user = await showTwoEntries();
      const first = screen.getAllByRole("button", { name: /^Line \d+/ })[0]!;

      first.focus();
      await user.keyboard("{Enter}");
      expect(first).toHaveAttribute("aria-expanded", "false");

      await user.keyboard(" ");
      expect(first).toHaveAttribute("aria-expanded", "true");
    });
  });
});
