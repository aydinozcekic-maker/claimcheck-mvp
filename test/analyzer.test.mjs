import test from "node:test";
import assert from "node:assert/strict";
import { AnswerAnalyzer } from "../src/analyzer.mjs";

class StubClient {
  constructor(outputs) {
    this.outputs = [...outputs];
  }

  async structured() {
    return this.outputs.shift();
  }
}

test("analyzer produces an evidence-backed contradicted verdict and summary", async () => {
  const analyzer = new AnswerAnalyzer({
    client: new StubClient([
      { claims: [{ claim: "OpenAI was founded in 2016.", type: "date", importance: "high", risk: "high" }] },
      { label: "CONTRADICTED", reason: "The supplied source states December 2015.", confidence: 0.98 },
      { safe_answer: "OpenAI was founded in December 2015.", explanation: "Corrected from the supplied evidence." }
    ])
  });
  const report = await analyzer.analyze({
    question: "When was OpenAI founded?",
    answer: "OpenAI was founded in 2016.",
    sources: [{
      source: "Official history",
      text: "OpenAI was founded in December 2015.",
      url: null,
      origin: "provided",
      quality: 0.8
    }],
    mode: "careful"
  });
  assert.equal(report.claims[0].label, "CONTRADICTED");
  assert.equal(report.claims[0].action, "CORRECT");
  assert.equal(report.claims[0].required_confidence, 0.9);
  assert.equal(report.safe_answer, "OpenAI was founded in December 2015.");
  assert.equal(report.summary.hallucination_score, 1);
  assert.equal(report.summary.corrected, 1);
});

test("analyzer refuses to verify from model memory when evidence is absent", async () => {
  const analyzer = new AnswerAnalyzer({
    client: new StubClient([
      { claims: [{ claim: "A fact exists.", type: "other", importance: "low", risk: "low" }] },
      { safe_answer: "I could not verify that detail.", explanation: "No evidence was retrieved." }
    ])
  });
  const report = await analyzer.analyze({ answer: "A fact exists.", sources: [] });
  assert.equal(report.claims[0].label, "NOT_ENOUGH_INFO");
  assert.equal(report.claims[0].action, "ABSTAIN");
  assert.equal(report.claims[0].confidence, 0);
  assert.match(report.claims[0].reason, /No relevant evidence/);
});

test("verifier confidence is constrained to the public API range", async () => {
  const analyzer = new AnswerAnalyzer({
    client: new StubClient([{ label: "SUPPORTED", reason: "Evidence agrees.", confidence: 1.7 }])
  });
  const result = await analyzer.verifyClaim(
    { claim: "A fact.", type: "other", importance: "low" },
    [{ source: "Source", text: "A fact.", quality: 0.8 }]
  );
  assert.equal(result.confidence, 1);
});
