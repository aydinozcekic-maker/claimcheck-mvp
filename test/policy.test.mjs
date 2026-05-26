import test from "node:test";
import assert from "node:assert/strict";
import { applyPolicy, normalizeMode, requiredConfidence } from "../src/policy.mjs";

test("high-risk claims require at least ninety percent confidence in standard mode", () => {
  assert.equal(requiredConfidence("standard", "high"), 0.9);
  assert.equal(requiredConfidence("careful", "high"), 0.9);
  assert.equal(requiredConfidence("high_stakes", "low"), 0.95);
});

test("policy keeps supported claims only above the applicable threshold", () => {
  const supported = { label: "SUPPORTED", confidence: 0.86, risk: "medium" };
  assert.equal(applyPolicy(supported, "careful").action, "KEEP");
  assert.equal(applyPolicy(supported, "high_stakes").action, "SOFTEN");
});

test("policy corrects contradictions and abstains without evidence", () => {
  assert.equal(applyPolicy({ label: "CONTRADICTED", confidence: 1, risk: "high" }, "standard").action, "CORRECT");
  assert.equal(applyPolicy({ label: "NOT_ENOUGH_INFO", confidence: 0, risk: "low" }, "standard").action, "ABSTAIN");
  assert.equal(normalizeMode("unknown"), "standard");
});
