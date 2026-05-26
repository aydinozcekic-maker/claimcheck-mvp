export const VERIFICATION_MODES = {
  standard: {
    label: "Standard",
    threshold: 0.7,
    description: "General fact checking with moderate evidence requirements."
  },
  careful: {
    label: "Careful",
    threshold: 0.85,
    description: "Research, publishing, and business content."
  },
  high_stakes: {
    label: "High Stakes",
    threshold: 0.95,
    description: "Medical, legal, financial, and safety-sensitive content."
  }
};

const RISK_FLOORS = {
  low: 0.7,
  medium: 0.8,
  high: 0.9
};

export function normalizeMode(mode) {
  return Object.hasOwn(VERIFICATION_MODES, mode) ? mode : "standard";
}

export function requiredConfidence(mode, risk = "medium") {
  const selectedMode = VERIFICATION_MODES[normalizeMode(mode)];
  return Math.max(selectedMode.threshold, RISK_FLOORS[risk] || RISK_FLOORS.medium);
}

export function applyPolicy(result, mode) {
  const threshold = requiredConfidence(mode, result.risk);
  if (result.label === "CONTRADICTED") {
    return { ...result, required_confidence: threshold, action: "CORRECT" };
  }
  if (result.label === "NOT_ENOUGH_INFO") {
    return { ...result, required_confidence: threshold, action: "ABSTAIN" };
  }
  if (result.confidence >= threshold) {
    return { ...result, required_confidence: threshold, action: "KEEP" };
  }
  return { ...result, required_confidence: threshold, action: "SOFTEN" };
}
