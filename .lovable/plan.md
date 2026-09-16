# Run it free, on their own laptop

Goal: nobody's usage costs you anything. The app stops using Lovable's AI entirely. Instead each person either pastes their own AI key or runs a free model on their own machine, and you ship the project as a folder they download and run locally.

## What changes for the user

A new "AI engine" panel at the top of the page, with two choices:

1. **Your own key** — pick OpenAI or Google Gemini, paste the key, pick a model. The key is remembered only in their own browser and never sent anywhere except their chosen provider.
2. **Local model (free, offline)** — runs through Ollama on their laptop. They pick the model name (e.g. `llama3.1`, `qwen2.5`). No key, no cost, works offline.

Until an engine is set up, the Generate button is disabled and a short setup note explains the two options with links. A "Test connection" button confirms it works before they burn time on a full run.

Everything else stays exactly as it is: keywords, tailored one-page resume, LaTeX download, score and improvement rounds, print/PDF, "Why these changes?" notes.

## Cost to you

Zero AI cost. The Lovable AI path and its hidden key are removed, so a visitor with no key simply can't generate — they use their own key or their own local model.

## Running on their laptop

The project is delivered as a downloadable folder with a README:

- install Node, run one install command, run one start command, open the shown local address
- how to get an OpenAI or Gemini key
- how to install Ollama, pull a model, and allow the app to talk to it
- note that all resume text stays on their machine (with a key, only the provider sees it)

## Technical section

- New `src/lib/ai-provider.server.ts`: one `callModel({ provider, apiKey, model, baseUrl, system, input, jsonSchema })` entry point with adapters for OpenAI (`/v1/chat/completions`, JSON schema response format), Gemini (`generateContent`, JSON response schema), and Ollama (`/api/chat`, `format: json` when a schema is requested). Keeps the existing retry-on-429/5xx and friendly-error behaviour.
- Delete `src/lib/ai-gateway.server.ts` and every `LOVABLE_API_KEY` reference.
- `src/lib/tailor.functions.ts`: the four server functions (`tailorResume`, `extractKeywords`, `buildLatexResume`, `scoreResume`) gain a validated `engine` field in their input and forward it to `callModel`. Prompts unchanged. Add `testEngine` for the connection check.
  - Requests are proxied through the local server functions rather than called from the browser, so provider CORS and Ollama origin restrictions are avoided and the key is only held for the lifetime of the request — never stored server-side, never logged.
- New `src/components/EngineSetup.tsx` + `src/hooks/useEngine.ts`: engine config in `localStorage` (read inside `useEffect` to avoid hydration mismatch), passed into each pipeline call from `src/routes/index.tsx`.
- Styling follows the existing industrial/mono design tokens in `src/styles.css`; no new colour values.
- `README.md` at project root with local-run and provider setup instructions; packaged copy (source only, no `node_modules`/build output) placed in Files as a ZIP.
