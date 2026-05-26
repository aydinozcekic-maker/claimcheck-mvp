const form = document.querySelector("#analysis-form");
const status = document.querySelector("#status");
const message = document.querySelector("#message");
const report = document.querySelector("#report");
const results = document.querySelector("#results");
const metrics = document.querySelector("#metrics");
const submit = document.querySelector("#submit");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

async function health() {
  const response = await fetch("/api/health");
  const setup = await response.json();
  status.textContent = setup.ready
    ? `Ready | ${setup.model}${setup.webSearchEnabled ? " | web search on" : ""}`
    : "Add OPENAI_API_KEY to begin";
}

document.querySelector("#load-example").addEventListener("click", () => {
  document.querySelector("#question").value = "Who founded OpenAI and when was it founded?";
  document.querySelector("#answer").value =
    "OpenAI was founded in 2016 by Elon Musk and Sam Altman. It is headquartered in New York.";
  document.querySelector("#sourceText").value =
    "OpenAI was founded in December 2015 with several founding members including Sam Altman and Elon Musk. Its headquarters are in San Francisco, California.";
  document.querySelector("#mode").value = "careful";
});

function evidenceHtml(evidence) {
  return evidence.map((item) => {
    const source = item.url
      ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source)}</a>`
      : escapeHtml(item.source);
    return `<span class="citation">${source}: ${escapeHtml(item.text.slice(0, 180))}${item.text.length > 180 ? "..." : ""}</span>`;
  }).join("");
}

function render(reportData) {
  const summary = reportData.summary;
  const score = `${Math.round(summary.hallucination_score * 100)}%`;
  metrics.innerHTML = [
    [score, "Original risk"],
    [summary.kept, "Claims kept"],
    [summary.corrected, "To correct"],
    [summary.softened + summary.abstained, "Withheld / softened"]
  ].map(([value, label]) => `<div class="metric"><b>${value}</b><span>${label}</span></div>`).join("");
  document.querySelector("#claim-count").textContent = `${summary.total_claims} factual claims analyzed`;
  document.querySelector("#safe-answer-text").textContent = reportData.safe_answer;
  document.querySelector("#safe-answer-explanation").textContent = reportData.safe_answer_explanation;
  document.querySelector("#policy-target").textContent =
    `${reportData.policy.label} mode | ${Math.round(reportData.policy.threshold * 100)}% base target`;
  results.innerHTML = reportData.claims.map((item) => `
    <tr>
      <td>${escapeHtml(item.claim)}<span class="risk ${item.risk}">${escapeHtml(item.risk)} risk</span></td>
      <td><span class="badge ${item.label}">${item.label.replaceAll("_", " ")}</span></td>
      <td><span class="badge action ${item.action}">${item.action}</span><span class="threshold">Needs ${Math.round(item.required_confidence * 100)}%</span></td>
      <td>
        <p class="reason">${escapeHtml(item.reason)} <span class="muted">(${Math.round(item.confidence * 100)}% confidence)</span></p>
        ${evidenceHtml(item.evidence)}
      </td>
    </tr>
  `).join("");
  report.classList.remove("hidden");
  report.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.className = "";
  message.textContent = "Checking claims and preparing a safer answer...";
  submit.disabled = true;
  try {
    const payload = {
      question: document.querySelector("#question").value,
      answer: document.querySelector("#answer").value,
      mode: document.querySelector("#mode").value,
      sourceText: document.querySelector("#sourceText").value,
      sourceUrls: document.querySelector("#sourceUrls").value.split(/\r?\n/).filter(Boolean)
    };
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Analysis failed.");
    render(data);
    message.textContent = "Report complete.";
  } catch (error) {
    message.className = "error";
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

health().catch(() => {
  status.textContent = "Server unavailable";
});
