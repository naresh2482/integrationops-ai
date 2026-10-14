export class OllamaClient {
  constructor(
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async generate(prompt: string): Promise<string> {
    const response = await this.fetchFn(
      "http://localhost:11434/api/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen3:14b",
          prompt,
          stream: false,
          think: false,
        }),
        signal: AbortSignal.timeout(120_000),
      }
    );

    if (!response.ok) {
      throw new Error("Ollama request failed");
    }

    const data: unknown = await response.json();

    if (
      typeof data !== "object" ||
      data === null ||
      !("response" in data) ||
      typeof data.response !== "string"
    ) {
      throw new Error("Invalid Ollama response");
    }

    return data.response;
  }
}