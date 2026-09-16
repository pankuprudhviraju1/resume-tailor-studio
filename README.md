# Resume Tailor

Upload your resume, paste a job description, and get a one-page, ATS-friendly tailored resume — plus the job's keywords, a LaTeX version, and a score out of 100 with improvements.

It runs on **your** computer with **your** AI engine, so nobody else pays for your usage.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer (or [Bun](https://bun.sh)).

```bash
npm install
npm run dev
```

Then open http://localhost:8080

## Choose your AI engine (first panel on the page)

Pick one of three options, click **Test & save**, and it is remembered in your browser only.

**1. OpenAI key** — get a key at https://platform.openai.com/api-keys
Suggested model: `gpt-4o-mini`

**2. Gemini key** — get a free key at https://aistudio.google.com/apikey
Suggested model: `gemini-2.0-flash`

**3. Local & free (Ollama)** — no key, no internet, no cost.

```bash
# install from https://ollama.com, then:
ollama pull llama3.1
ollama serve
```

Suggested model: `llama3.1`. Address defaults to `http://localhost:11434`.
With Ollama, paste your resume as **text** — local models can't read PDFs.

Ollama only exists on your own machine, so the browser talks to it directly.
That works out of the box when you run this app locally (the recommended way).
If you use a hosted copy of the site instead, Ollama must be told to accept it:

```bash
OLLAMA_ORIGINS=* ollama serve
```

## Privacy

Your API key is stored only in your browser. Each request passes it straight through this app's local server to your chosen provider — it is never saved or logged anywhere. With Ollama nothing leaves your computer at all.

## Getting a PDF

Use the **Print / Save PDF** button on the result — the print layout is tuned to one clean A4 page. The LaTeX version can be compiled at https://overleaf.com or with `pdflatex`.

## Build for production

```bash
npm run build
npm run start
```
