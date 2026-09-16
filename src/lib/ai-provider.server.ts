/**
 * Bring-your-own AI engine.
 *
 * The app has no built-in AI key: each visitor supplies either their own
 * provider key (OpenAI / Google Gemini) or points at a local Ollama install.
 * The key travels with the request, is used once, and is never stored or logged.
 */

export type Engine = {
  provider: "openai" | "gemini" | "ollama";
  model: string;
  apiKey?: string;
  baseUrl?: string;
};

export type AttachedFile = {
  name: string;
  mimeType: string;
  base64: string;
};

export type JsonSchemaFormat = {
  name: string;
  schema: Record<string, unknown>;
};

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function friendlyError(provider: Engine["provider"], status: number, detail: string): Error {
  const short = detail.replace(/\s+/g, " ").slice(0, 240);
  if (provider === "ollama" && (status === 0 || status === 404)) {
    return new Error(
      "Could not reach Ollama. Make sure it is running (`ollama serve`) and that the model is pulled.",
    );
  }
  if (status === 401 || status === 403) {
    return new Error("That API key was rejected. Please check the key and try again.");
  }
  if (status === 402) {
    return new Error("Your provider account has no credit left for this request.");
  }
  if (status === 429) {
    return new Error("Your provider is rate limiting you right now — try again in a minute.");
  }
  if (status >= 500) {
    return new Error("The AI provider is temporarily unavailable. Please try again in a moment.");
  }
  return new Error(`The AI request failed (error ${status}). ${short}`);
}

/** Gemini's schema dialect rejects a few JSON Schema keywords. */
function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "additionalProperties" || key === "$schema") continue;
        out[key] = clean(value);
      }
      return out;
    }
    return node;
  };
  return clean(schema) as Record<string, unknown>;
}

async function sendWithRetry(send: () => Promise<Response>, provider: Engine["provider"]) {
  let res: Response;
  try {
    res = await send();
  } catch (error) {
    if (provider === "ollama") throw friendlyError("ollama", 0, String(error));
    throw new Error(`Could not reach the AI provider. ${String(error).slice(0, 160)}`);
  }
  for (let attempt = 1; attempt <= 3 && (res.status === 429 || res.status >= 500); attempt++) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : attempt * 1500 + Math.random() * 500;
    await new Promise((r) => setTimeout(r, waitMs));
    res = await send();
  }
  return res;
}

export async function callModel(options: {
  engine: Engine;
  system: string;
  input: string;
  files?: AttachedFile[];
  jsonSchema?: JsonSchemaFormat;
}): Promise<string> {
  const { engine, system, input, files = [], jsonSchema } = options;
  const model = engine.model.trim();
  if (!model) throw new Error("Please choose a model for your AI engine.");

  if (engine.provider === "ollama") {
    if (files.length) {
      throw new Error(
        "A local Ollama model cannot read PDF files. Please paste your resume text instead.",
      );
    }
    const base = trimSlash(engine.baseUrl?.trim() || "http://localhost:11434");
    const res = await sendWithRetry(
      () =>
        fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            options: { num_ctx: 8192 },
            ...(jsonSchema ? { format: geminiSchema(jsonSchema.schema) } : {}),
            messages: [
              { role: "system", content: system },
              { role: "user", content: input },
            ],
          }),
        }),
      "ollama",
    );
    if (!res.ok) throw friendlyError("ollama", res.status, await res.text());
    const json = (await res.json()) as { message?: { content?: string } };
    const text = json.message?.content?.trim();
    if (!text) throw new Error("The local model returned an empty response. Please try again.");
    return text;
  }

  if (engine.provider === "gemini") {
    const key = engine.apiKey?.trim();
    if (!key) throw new Error("Please add your Google Gemini API key.");
    const base = trimSlash(engine.baseUrl?.trim() || "https://generativelanguage.googleapis.com");
    const parts: Array<Record<string, unknown>> = [{ text: input }];
    for (const file of files) {
      parts.push({ inline_data: { mime_type: file.mimeType, data: file.base64 } });
    }
    const res = await sendWithRetry(
      () =>
        fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts }],
            ...(jsonSchema
              ? {
                  generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: geminiSchema(jsonSchema.schema),
                  },
                }
              : {}),
          }),
        }),
      "gemini",
    );
    if (!res.ok) throw friendlyError("gemini", res.status, await res.text());
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini returned an empty response. Please try again.");
    return text;
  }

  // OpenAI-compatible chat completions.
  const key = engine.apiKey?.trim();
  if (!key) throw new Error("Please add your OpenAI API key.");
  const base = trimSlash(engine.baseUrl?.trim() || "https://api.openai.com");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: input }];
  for (const file of files) {
    content.push({
      type: "file",
      file: { filename: file.name, file_data: `data:${file.mimeType};base64,${file.base64}` },
    });
  }
  const res = await sendWithRetry(
    () =>
      fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content },
          ],
          ...(jsonSchema
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
                },
              }
            : {}),
        }),
      }),
    "openai",
  );
  if (!res.ok) throw friendlyError("openai", res.status, await res.text());
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The model returned an empty response. Please try again.");
  return text;
}
