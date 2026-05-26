import { retrieveEvidence } from "./evidence.mjs";
import { claimExtractionSchema, verificationSchema } from "./schemas.mjs";
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
        "Keep wording self-contained and preserve dates, numbers, and entity qualifiers."
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
        confidence: 1,
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

  async analyze({ question = "", answer, sources }) {
    const claims = await this.extractClaims(question, answer);
    const results = [];
    for (const claim of claims) {
      const evidence = await retrieveEvidence(claim, sources, {
        tavilyApiKey: this.tavilyApiKey,
        fetchImpl: this.fetchImpl
      });
      results.push(await this.verifyClaim(claim, evidence));
    }
    return { question, answer, claims: results, summary: summarize(results) };
  }
}
