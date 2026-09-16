/**
 * Local Ollama is reached straight from the browser.
 *
 * Ollama runs on the visitor's own machine, so a server function can never
 * see it — "localhost" there means the server. Calling it from the browser
 * keeps the request on the visitor's computer and costs nothing.
 */
import type { EngineConfig } from "./stages";

export function ollamaBase(engine: EngineConfig) {
  return (engine.baseUrl?.trim() || "http://localhost:11434").replace(/\/+$/, "");
}

function unreachable(base: string): Error {
  const hosted =
    typeof window !== "undefined" && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  return new Error(
    `Could not reach Ollama at ${base}. Make sure it is running (\`ollama serve\`) and the model is pulled.` +
      (hosted
        ? " You are on a hosted address, so Ollama also has to allow this site: start it with OLLAMA_ORIGINS=* ollama serve, or run this app on your own computer."
        : ""),
  );
}

export async function callOllama(options: {
  engine: EngineConfig;
  system: string;
  input: string;
  files?: Array<{ name: string; mimeType: string; base64: string }>;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}): Promise<string> {
  const { engine, system, input, files = [], jsonSchema } = options;
  if (files.length) {
    throw new Error(
      "A local Ollama model cannot read PDF files. Please paste your resume text instead.",
    );
  }
  const base = ollamaBase(engine);

  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: engine.model.trim(),
        stream: false,
        options: { num_ctx: 8192 },
        ...(jsonSchema ? { format: jsonSchema.schema } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: input },
        ],
      }),
    });
  } catch {
    throw unreachable(base);
  }

  if (res.status === 404) {
    throw new Error(
      `Ollama does not have the model "${engine.model}". Run: ollama pull ${engine.model}`,
    );
  }
  if (!res.ok) {
    const detail = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`Ollama returned an error (${res.status}). ${detail}`);
  }

  const json = (await res.json()) as { message?: { content?: string } };
  const text = json.message?.content?.trim();
  if (!text) throw new Error("The local model returned an empty response. Please try again.");
  return text;
}
