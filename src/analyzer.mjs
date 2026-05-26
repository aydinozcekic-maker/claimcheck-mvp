import { retrieveEvidence } from "./evidence.mjs";
import { applyPolicy, normalizeMode, VERIFICATION_MODES } from "./policy.mjs";
import { claimExtractionSchema, safeRewriteSchema, verificationSchema } from "./schemas.mjs";
import { summarize } from "./scoring.mjs";

export class AnswerAnalyzer {
  constructor({ client, tavilyApiKey = "", fetchImpl = fetch }) {
    this.client = client;
    this.tavilyApiKey = tavilyApiKey;
    this.fetchImpl = fetchImpl;
  }

  async extractClaims(question, answer) {
    const output = await this.client.structured({
      name: "atomic_claims",
      schema: claimExtractionSchema,
      instructions: [
        "Extract atomic, factual, externally verifiable claims from an assistant answer.",
        "Split compound statements. Exclude opinions, advice, hedging, and non-factual prose.",
        "Keep wording self-contained and preserve dates, numbers, and entity qualifiers.",
        "Assign high risk to exact dates, numbers, citations, named identities, safety-sensitive, medical, legal, or financial claims.",
        "Assign medium risk to ordinary externally verifiable facts and low risk only to minor factual context."
      ].join(" "),
      input: `Question:\n${question}\n\nAnswer:\n${answer}`
    });
    return output.claims;
  }

  async verifyClaim(claim, evidence) {
    if (!evidence.length) {
      return {
        ...claim,
        label: "NOT_ENOUGH_INFO",
        reason: "No relevant evidence was retrieved for this claim.",
        confidence: 0,
        evidence
      };
    }

    const evidenceText = evidence
      .map((item, index) => `[${index + 1}] ${item.source} (quality ${item.quality}): ${item.text}`)
      .join("\n\n");
    const verdict = await this.client.structured({
      name: "claim_verification",
      schema: verificationSchema,
      instructions: [
        "You are an evidence-bound fact checker.",
        "Classify the claim using only the supplied evidence; do not use memory or assumptions.",
        "SUPPORTED requires direct support. CONTRADICTED requires direct conflict.",
        "Use NOT_ENOUGH_INFO for partial support, ambiguity, or missing details.",
        "Mention the decisive evidence succinctly in the reason."
      ].join(" "),
      input: `Claim:\n${claim.claim}\n\nEvidence:\n${evidenceText}`
    });
    const confidence = Math.min(1, Math.max(0, Number(verdict.confidence) || 0));
    return { ...claim, ...verdict, confidence, evidence };
  }

  async rewriteSafely(answer, results, mode) {
    if (!results.length) {
      return {
        safe_answer: answer,
        explanation: "No externally verifiable factual claims were selected for intervention."
      };
    }

    const auditedClaims = results.map((result) => ({
      claim: result.claim,
      risk: result.risk,
      label: result.label,
      confidence: result.confidence,
      required_confidence: result.required_confidence,
      action: result.action,
      reason: result.reason,
      evidence: result.evidence.map((item) => `${item.source}: ${item.text}`)
    }));
    return this.client.structured({
      name: "safe_answer",
      schema: safeRewriteSchema,
      instructions: [
        "Rewrite an assistant answer using only the audit results and evidence supplied.",
        "KEEP claims may remain. SOFTEN claims must be qualified and must not sound certain.",
        "For CORRECT claims, state a correction only if the included evidence directly supports it; otherwise omit the detail or say it could not be verified.",
        "For ABSTAIN claims, do not repeat the unsupported factual detail; explicitly acknowledge missing reliable evidence when relevant.",
        "Do not add new factual claims. Keep the answer concise and useful."
      ].join(" "),
      input: `Verification mode: ${VERIFICATION_MODES[mode].label}\n\nOriginal answer:\n${answer}\n\nAudited claims:\n${JSON.stringify(auditedClaims, null, 2)}`
    });
  }

  async analyze({ question = "", answer, sources, mode = "standard" }) {
    const selectedMode = normalizeMode(mode);
    const claims = await this.extractClaims(question, answer);
    const results = [];
    for (const claim of claims) {
      const evidence = await retrieveEvidence(claim, sources, {
        tavilyApiKey: this.tavilyApiKey,
        fetchImpl: this.fetchImpl
      });
      const result = await this.verifyClaim(claim, evidence);
      results.push(applyPolicy(result, selectedMode));
    }
    const safeRewrite = await this.rewriteSafely(answer, results, selectedMode);
    return {
      question,
      answer,
      mode: selectedMode,
      policy: VERIFICATION_MODES[selectedMode],
      safe_answer: safeRewrite.safe_answer,
      safe_answer_explanation: safeRewrite.explanation,
      claims: results,
      summary: summarize(results)
    };
  }
}
