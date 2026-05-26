import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

test("server exposes health and the browser application", async () => {
  process.env.PORT = "0";
  process.env.OPENAI_API_KEY = "";
  const { startServer } = await import("../src/server.mjs");
  const server = await startServer();
  if (!server.listening) await once(server, "listening");
  const port = server.address().port;

  try {
    const healthResponse = await fetch(`http://localhost:${port}/api/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.ready, false);

    const pageResponse = await fetch(`http://localhost:${port}/`);
    const page = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(page, /Check claims\. Withhold guesses\. Publish safer answers\./);
  } finally {
    server.close();
  }
});
