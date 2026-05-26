import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { AnswerAnalyzer } from "./analyzer.mjs";
import { getConfig } from "./config.mjs";
import { prepareSources } from "./evidence.mjs";
import { OpenAIClient } from "./openai-client.mjs";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length > 2_000_000) throw new Error("Request payload is too large.");
  return JSON.parse(raw || "{}");
}

function validatedInput(payload) {
  const question = String(payload.question || "").trim();
  const answer = String(payload.answer || "").trim();
  const sourceText = String(payload.sourceText || "").trim();
  const sourceUrls = Array.isArray(payload.sourceUrls)
    ? payload.sourceUrls.map((url) => String(url).trim()).filter(Boolean)
    : [];
  const mode = String(payload.mode || "standard");
  if (!answer) throw new Error("An answer to analyze is required.");
  if (answer.length > 30000 || sourceText.length > 200000) {
    throw new Error("The answer or evidence text exceeds the MVP size limit.");
  }
  return { question, answer, sourceText, sourceUrls, mode };
}

async function serveStatic(pathname, response) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(target).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream" });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

export async function startServer() {
  const config = await getConfig();
  const analyzer = new AnswerAnalyzer({
    client: new OpenAIClient({ apiKey: config.openaiApiKey, model: config.openaiModel }),
    tavilyApiKey: config.tavilyApiKey
  });

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, {
          ready: Boolean(config.openaiApiKey),
          webSearchEnabled: Boolean(config.tavilyApiKey),
          model: config.openaiModel
        });
      }
      if (request.method === "POST" && url.pathname === "/api/analyze") {
        const input = validatedInput(await readJson(request));
        const sources = await prepareSources(input);
        const report = await analyzer.analyze({ ...input, sources });
        return sendJson(response, 200, report);
      }
      if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Analysis failed." });
    }
  });

  server.listen(config.port, () => {
    const address = server.address();
    const port = typeof address === "object" ? address.port : config.port;
    console.log(`ClaimCheck is running at http://localhost:${port}`);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
