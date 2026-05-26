const API_URL = "https://api.openai.com/v1/responses";

function responseText(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("");
}

export class OpenAIClient {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async structured({ name, schema, instructions, input }) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required to extract and verify claims.");
    }

    const response = await this.fetchImpl(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          { role: "developer", content: instructions },
          { role: "user", content: input }
        ],
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema
          }
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error?.message || `OpenAI request failed (${response.status}).`;
      throw new Error(message);
    }

    const text = responseText(payload);
    if (!text) throw new Error("The model returned no structured output.");
    return JSON.parse(text);
  }
}
