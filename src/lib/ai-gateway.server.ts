const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

type JsonSchemaFormat = {
  name: string;
  schema: Record<string, unknown>;
};

function friendlyError(status: number, detail: string): Error {
  if (status === 429) {
    return new Error("Too many requests right now — please try again in a minute.");
  }
  if (status === 402) {
    return new Error("The AI credits for this app have run out. Please top them up.");
  }
  if (status === 403) {
    return new Error("AI access is blocked for this workspace. Please check the AI settings.");
  }
  if (status >= 500) {
    return new Error("The AI service is temporarily unavailable. Please try again in a moment.");
  }
  console.error("AI gateway error", status, detail);
  return new Error(`The AI request failed (error ${status}). ${detail.slice(0, 300)}`);
}

/**
 * Calls Lovable AI (reasoning model, streaming) and returns the final text.
 * Streaming keeps bytes flowing so long reasoning runs are not severed.
 */
export async function callAstra(options: {
  system: string;
  input: string;
  effort?: "low" | "medium" | "high";
  jsonSchema?: JsonSchemaFormat;
}): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new Error("AI is not configured for this app (missing LOVABLE_API_KEY).");
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    stream: true,
    instructions: options.system,
    input: options.input,
    reasoning: { effort: options.effort ?? "low", summary: "auto" },
  };
  if (options.jsonSchema) {
    body["text"] = {
      format: {
        type: "json_schema",
        name: options.jsonSchema.name,
        strict: true,
        schema: options.jsonSchema.schema,
      },
    };
  }

  const send = () =>
    fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify(body),
    });

  let res = await send();
  for (let attempt = 1; attempt <= 3 && (res.status === 429 || res.status >= 500); attempt++) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : attempt * 1500 + Math.random() * 500;
    await new Promise((r) => setTimeout(r, waitMs));
    res = await send();
  }

  if (!res.ok || !res.body) {
    throw friendlyError(res.status, await res.text());
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completedText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string; output?: unknown };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && event.response) {
          if (typeof event.response.output_text === "string") {
            completedText = event.response.output_text;
          } else if (Array.isArray(event.response.output)) {
            completedText = (event.response.output as Array<{ content?: Array<{ text?: string }> }>)
              .flatMap((item) => item.content ?? [])
              .map((part) => part.text ?? "")
              .join("");
          }
        }
      } catch {
        // Ignore non-JSON keepalive lines.
      }
    }
  }

  const result = (text.trim() || completedText.trim()).trim();
  if (!result) {
    throw new Error("The AI returned an empty response. Please try again.");
  }
  return result;
}
