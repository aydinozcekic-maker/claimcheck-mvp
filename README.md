# ClaimCheck MVP

ClaimCheck is an evidence-based hallucination finder and safe-answer gate for LLM answers. It splits an answer into atomic factual claims, retrieves evidence from text or URLs supplied by the user and optionally the web, verifies each claim with the strongest available verifier, and rewrites answers so unsupported specifics are not confidently published.

## What It Does

- Accepts a question, an LLM answer, pasted evidence, and public evidence URLs.
- Extracts atomic verifiable claims using an OpenAI model.
- Selects relevant passages from supplied sources.
- Optionally retrieves web evidence through Tavily.
- Uses deterministic date, math, and simple code-output verifiers before falling back to an LLM verifier.
- Classifies claims as `SUPPORTED`, `CONTRADICTED`, or `NOT_ENOUGH_INFO`.
- Tags claims by risk and applies explicit confidence targets.
- Decides whether each claim should be `KEEP`, `SOFTEN`, `CORRECT`, or `ABSTAIN`.
- Produces an evidence-bounded safe rewrite and an original-answer risk score.

The verifier is evidence-bound: when no evidence can be retrieved, it returns `NOT_ENOUGH_INFO` rather than checking a fact from model memory.

## Architecture

```text
Browser UI
  -> POST /api/analyze
  -> Claim extraction (OpenAI Responses API, Structured Outputs)
  -> Evidence retrieval (pasted sources, public URLs, optional Tavily)
  -> Verifier routing (date, math, code, or LLM)
  -> Claim verification (deterministic tools first, LLM evidence verifier as fallback)
  -> Confidence-target policy (keep, soften, correct, abstain)
  -> Safe rewrite and HTML report
```

Key files:

- `src/analyzer.mjs`: extraction, retrieval, verification orchestration.
- `src/openai-client.mjs`: minimal Responses API client with strict JSON Schema output.
- `src/evidence.mjs`: source preparation, relevance ranking, Tavily adapter, source weights.
- `src/verifiers/`: deterministic date, math, and code-output verifiers plus routing.
- `src/policy.mjs`: confidence modes, risk floors, and publication actions.
- `src/scoring.mjs`: report counts and weighted hallucination score.
- `src/server.mjs`: native Node HTTP API and static app server.
- `public/`: English browser interface.
- `test/`: dependency-free unit tests.
- `eval_cases/`: tool-verifiable benchmark cases inspired by self-play evaluation.
- `tools/run-eval.mjs`: evaluates deterministic verifier cases.

## Quick Start

Requirements: Node.js 20 or newer.

1. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Put your OpenAI API key in `.env`:

   ```env
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4o-mini
   ```

3. Start the app:

   ```powershell
   npm start
   ```

4. Open `http://localhost:3000`, choose a verification mode, and select **Load example** to test corrections against supplied evidence.

## Verification Modes

Inspired by *Why Language Models Hallucinate* (Kalai et al., 2025), the app makes abstention an explicit behavior rather than forcing every factual detail through.

| Mode | Base confidence target | Use case |
| --- | ---: | --- |
| Standard | 70% | General factual content |
| Careful | 85% | Research, publishing, business |
| High Stakes | 95% | Medical, legal, financial, or safety content |

Risky exact facts such as dates, numbers, citations, identities, and safety-sensitive statements require at least 90% confidence even in less strict modes. A claim below its required threshold is softened or withheld instead of published as certain.

## Verifier Tools

Inspired by *Absolute Zero: Reinforced Self-play Reasoning with Zero Data* (Zhao et al., 2025), ClaimCheck now prefers verifiable tools when a claim can be checked mechanically. This does not train a new model; it upgrades the runtime verification layer.

| Verifier | Checks | Example |
| --- | --- | --- |
| `date` | Years and exact dates found in claim/evidence text | `Founded in 2016` vs evidence saying `December 2015` |
| `math` | Hallucination-score arithmetic and simple percentage-change claims | `The score is 37%` from `2 contradicted, 1 unsupported, 8 total` |
| `code` | Simple JavaScript output claims from fenced snippets | `The function returns 9` when execution returns `8` |
| `llm` | Ordinary textual factual claims | headquarters, founders, entity relationships |

The verifier routing logic lives in `src/verifiers/index.mjs`. Deterministic verifiers return confidence `1.0` when they can directly compute or compare the result, and the LLM verifier is used only when no deterministic verifier can resolve the claim.

No package installation is needed; the MVP uses Node's built-in HTTP server and `fetch`.

## Optional Web Retrieval

Add a Tavily key to `.env` to search for evidence for each extracted claim:

```env
TAVILY_API_KEY=your_tavily_api_key
```

Without this key, verification operates only on pasted evidence and URLs supplied in the form.

## API

### `POST /api/analyze`

Request:

```json
{
  "question": "Who founded OpenAI?",
  "answer": "OpenAI was founded in 2016 by Elon Musk and Sam Altman.",
  "mode": "careful",
  "sourceText": "OpenAI was founded in December 2015 with several founding members including Sam Altman and Elon Musk.",
  "sourceUrls": []
}
```

Response shape:

```json
{
  "claims": [
    {
      "claim": "OpenAI was founded in 2016.",
      "type": "date",
      "importance": "high",
      "risk": "high",
      "verifier": "date",
      "label": "CONTRADICTED",
      "reason": "The evidence states that OpenAI was founded in December 2015.",
      "confidence": 0.98,
      "required_confidence": 0.9,
      "action": "CORRECT",
      "evidence": []
    }
  ],
  "safe_answer": "OpenAI was founded in December 2015.",
  "summary": {
    "total_claims": 1,
    "supported": 0,
    "contradicted": 1,
    "not_enough_info": 0,
    "corrected": 1,
    "hallucination_score": 1
  }
}
```

### `GET /api/health`

Reports whether the OpenAI API key and optional web-search integration are configured.

## Risk Score

The MVP uses the requested weighted formula:

```text
(contradicted * 1.0 + not_enough_info * 0.4) / total_claims
```

This score is an indicator for review prioritization, not a probability that an answer is false.

The safe rewrite is a proposed revised answer based on the audited claims; production deployments should independently audit the rewritten output before automatically publishing high-stakes content.

## Run Tests

```powershell
npm test
```

Tests run locally with stub model output and do not require keys or network access.

## Run Deterministic Evaluations

The project includes JSONL benchmark cases that can be verified without LLM calls:

```powershell
npm run eval
```

You can generate additional math-score cases with:

```powershell
node tools/generate-eval-cases.mjs
node tools/run-eval.mjs eval_cases/generated_math_claims.jsonl
```

This is the practical project-level lesson from Absolute Zero: use self-generated, tool-verifiable cases to improve the checker over time.

## Current MVP Limits

- URL ingestion handles text and HTML pages, not uploaded PDFs.
- The code verifier is intentionally narrow: it handles simple JavaScript snippets, blocks unsafe features, and is intended for verification/evaluation cases rather than arbitrary user code execution.
- The math verifier covers selected deterministic patterns, not full symbolic mathematics.
- The date verifier compares explicit dates/years, not temporal logic over complex events.
- URL ingestion rejects obvious private IP addresses; production deployments should also apply DNS-resolution and network egress controls against SSRF.
- Pasted excerpts are assigned a reasonable default source quality; a production system should store source provenance explicitly.
- Web search is optional and depends on a configured Tavily account.
- For medical, legal, or financial use, add domain-specific source allowlists and freshness rules before deployment.

## OpenAI Integration Reference

The code calls the OpenAI Responses API and uses Structured Outputs with `text.format` and a strict JSON Schema, following OpenAI's official documentation:

- [Responses API reference](https://platform.openai.com/docs/api-reference/responses/create)
- [Structured model outputs guide](https://platform.openai.com/docs/guides/structured-outputs)

## Design Reference

- Adam Tauman Kalai, Ofir Nachum, Santosh S. Vempala, and Edwin Zhang. *Why Language Models Hallucinate*. arXiv:2509.04664v1, September 4, 2025.
- Andrew Zhao et al. *Absolute Zero: Reinforced Self-play Reasoning with Zero Data*. arXiv:2505.03335v3, October 17, 2025.
