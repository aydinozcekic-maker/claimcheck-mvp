import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIClient } from "../src/openai-client.mjs";

test("OpenAI client sends Responses API structured output configuration", async () => {
  let submitted;
  const client = new OpenAIClient({
    apiKey: "test-key",
    model: "gpt-4o-mini",
    fetchImpl: async (_url, request) => {
      submitted = JSON.parse(request.body);
      return {
        ok: true,
        json: async () => ({
          output: [{ content: [{ type: "output_text", text: "{\"result\":\"ok\"}" }] }]
        })
      };
    }
  });
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { result: { type: "string" } },
    required: ["result"]
  };
  const output = await client.structured({
    name: "test_result",
    schema,
    instructions: "Return a result.",
    input: "Input"
  });
  assert.deepEqual(output, { result: "ok" });
  assert.equal(submitted.text.format.type, "json_schema");
  assert.equal(submitted.text.format.strict, true);
});
