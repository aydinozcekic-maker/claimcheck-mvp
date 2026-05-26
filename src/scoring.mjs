export function hallucinationScore(results) {
  if (!results.length) return 0;
  const penalty = results.reduce((sum, result) => {
    if (result.label === "CONTRADICTED") return sum + 1;
    if (result.label === "NOT_ENOUGH_INFO") return sum + 0.4;
    return sum;
  }, 0);
  return Number((penalty / results.length).toFixed(3));
}

export function summarize(results) {
  const counts = {
    total_claims: results.length,
    supported: 0,
    contradicted: 0,
    not_enough_info: 0
  };
  for (const result of results) {
    if (result.label === "SUPPORTED") counts.supported += 1;
    if (result.label === "CONTRADICTED") counts.contradicted += 1;
    if (result.label === "NOT_ENOUGH_INFO") counts.not_enough_info += 1;
  }
  return { ...counts, hallucination_score: hallucinationScore(results) };
}
