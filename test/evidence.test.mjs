import test from "node:test";
import assert from "node:assert/strict";
import { prepareSources, retrieveEvidence, sourceQuality } from "../src/evidence.mjs";

test("pasted documents are split and relevant passages are retrieved", async () => {
  const sources = await prepareSources({
    sourceText: "OpenAI was founded in December 2015.\n---\nParis is the capital of France.",
    sourceUrls: []
  });
  const evidence = await retrieveEvidence(
    { claim: "OpenAI was founded in 2015." },
    sources
  );
  assert.equal(sources.length, 2);
  assert.equal(evidence[0].source, "Provided document 1");
  assert.match(evidence[0].text, /December 2015/);
});

test("government and academic URLs receive a stronger source quality weight", () => {
  assert.equal(sourceQuality("https://www.fda.gov/report", "web"), 0.9);
  assert.equal(sourceQuality("https://en.wikipedia.org/wiki/Fact", "web"), 0.6);
});

test("private URL sources are rejected", async () => {
  await assert.rejects(
    prepareSources({ sourceText: "", sourceUrls: ["http://169.254.169.254/latest"] }),
    /Private or local/
  );
});
