import { createHttpServer } from "./httpServer.js";
import { LogAnalysisService } from "./logAnalysisService.js";
import { OllamaClient } from "./ollamaClient.js";

// Bound to loopback only; this is a local development server.
const HOST = "127.0.0.1";
const PORT = Number(process.env["PORT"] ?? 3000);

const server = createHttpServer({
    analyzer: new LogAnalysisService(new OllamaClient()),
});

server.listen(PORT, HOST, () => {
    console.log(`IntegrationOps AI API listening on http://${HOST}:${PORT}`);
});
