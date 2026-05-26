# ClaimCheck MVP

ClaimCheck is an evidence-based hallucination finder for LLM answers. It splits an answer into atomic factual claims, retrieves evidence from text or URLs supplied by the user and optionally the web, verifies each claim against that evidence, and calculates a simple risk score.

## What It Does

- Accepts a question, an LLM answer, pasted evidence, and public evidence URLs.
- Extracts atomic verifiable claims using an OpenAI model.
- Selects relevant passages from supplied sources.
- Optionally retrieves web evidence through Tavily.
- Classifies claims as `SUPPORTED`, `CONTRADICTED`, or `NOT_ENOUGH_INFO`.
- Shows reasons, evidence excerpts, confidence, and a hallucination risk score.

The verifier is evidence-bound: when no evidence can be retrieved, it returns `NOT_ENOUGH_INFO` rather than checking a fact from model memory.

## Architecture

```text
Browser UI
  -> POST /api/analyze
  -> Claim extraction (OpenAI Responses API, Structured Outputs)
  -> Evidence retrieval (pasted sources, public URLs, optional Tavily)
  -> Claim verification (OpenAI Responses API, evidence only)
  -> Score and HTML report
```

Key files:

- `src/analyzer.mjs`: extraction, retrieval, verification orchestration.
- `src/openai-client.mjs`: minimal Responses API client with strict JSON Schema output.
- `src/evidence.mjs`: source preparation, relevance ranking, Tavily adapter, source weights.
- `src/scoring.mjs`: report counts and weighted hallucination score.
- `src/server.mjs`: native Node HTTP API and static app server.
- `public/`: English browser interface.
- `test/`: dependency-free unit tests.

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

4. Open `http://localhost:3000` and select **Load example** to test a contradicted founding-year claim against supplied evidence.

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
      "label": "CONTRADICTED",
      "reason": "The evidence states that OpenAI was founded in December 2015.",
      "confidence": 0.98,
      "evidence": []
    }
  ],
  "summary": {
    "total_claims": 1,
    "supported": 0,
    "contradicted": 1,
    "not_enough_info": 0,
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

## Run Tests

```powershell
npm test
```

Tests run locally with stub model output and do not require keys or network access.

## Current MVP Limits

- URL ingestion handles text and HTML pages, not uploaded PDFs.
- URL ingestion rejects obvious private IP addresses; production deployments should also apply DNS-resolution and network egress controls against SSRF.
- Pasted excerpts are assigned a reasonable default source quality; a production system should store source provenance explicitly.
- Web search is optional and depends on a configured Tavily account.
- For medical, legal, or financial use, add domain-specific source allowlists and freshness rules before deployment.

## OpenAI Integration Reference

The code calls the OpenAI Responses API and uses Structured Outputs with `text.format` and a strict JSON Schema, following OpenAI's official documentation:

- [Responses API reference](https://platform.openai.com/docs/api-reference/responses/create)
- [Structured model outputs guide](https://platform.openai.com/docs/guides/structured-outputs)
