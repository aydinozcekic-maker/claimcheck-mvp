import test from "node:test";
import assert from "node:assert/strict";
import { hallucinationScore, summarize } from "../src/scoring.mjs";

test("hallucination score weights contradictions above missing evidence", () => {
  const results = [
    { label: "SUPPORTED" },
    { label: "CONTRADICTED" },
    { label: "NOT_ENOUGH_INFO" }
  ];
  assert.equal(hallucinationScore(results), 0.467);
  assert.deepEqual(summarize(results), {
    total_claims: 3,
    supported: 1,
    contradicted: 1,
    not_enough_info: 1,
    kept: 0,
    softened: 0,
    corrected: 0,
    abstained: 0,
    hallucination_score: 0.467
  });
});

test("an answer without factual claims has no penalty", () => {
  assert.equal(hallucinationScore([]), 0);
});
