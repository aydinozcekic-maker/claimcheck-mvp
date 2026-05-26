export const claimExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          type: {
            type: "string",
            enum: ["date", "entity", "number", "location", "causal", "other"]
          },
          importance: { type: "string", enum: ["high", "medium", "low"] },
          risk: { type: "string", enum: ["high", "medium", "low"] }
        },
        required: ["claim", "type", "importance", "risk"]
      }
    }
  },
  required: ["claims"]
};

export const verificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: {
      type: "string",
      enum: ["SUPPORTED", "CONTRADICTED", "NOT_ENOUGH_INFO"]
    },
    reason: { type: "string" },
    confidence: { type: "number" }
  },
  required: ["label", "reason", "confidence"]
};

export const safeRewriteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    safe_answer: { type: "string" },
    explanation: { type: "string" }
  },
  required: ["safe_answer", "explanation"]
};
