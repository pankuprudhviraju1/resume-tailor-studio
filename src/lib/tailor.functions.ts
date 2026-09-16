import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const EngineSchema = z.object({
  provider: z.enum(["openai", "gemini", "ollama"]),
  model: z.string().min(1, "Please choose a model."),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export type EngineConfig = z.infer<typeof EngineSchema>;

const Input = z.object({
  engine: EngineSchema,
  jobDescription: z.string().min(20, "Please paste a longer job description."),
  resumeText: z.string().optional(),
  resumeFile: z
    .object({
      name: z.string(),
      mimeType: z.string(),
      base64: z.string().min(10),
    })
    .optional(),
});

const SYSTEM_PROMPT = `You are an expert technical recruiter and resume writer.
You rewrite a candidate's existing resume so it is tailored to one specific job description.

Hard rules:
- Never invent employers, degrees, certifications, dates or metrics that are not supported by the source resume.
- You may rephrase, reorder, re-group and emphasise real experience, and mirror the vocabulary of the job description.
- Keep it ATS-friendly: plain section headings, no tables, no columns, no graphics.
- Produce a strict one-page resume, regardless of the source resume's length.
- Keep the resume itself between 350 and 500 words. The tailoring notes after the divider do not count.
- Preserve the candidate's valuable work. Never omit a project from the source resume, and do not silently remove unique achievements, roles, education, certifications or skills.
- Compress instead of deleting: remove repeated wording and generic duties, merge overlapping evidence, and shorten lower-relevance material to one concise line.
- Use one compact 2-3 sentence summary, a single compact comma-separated skills section, and no more than 8 experience bullets in total.
- Represent every role from the source. Give the most relevant roles 2-3 concise bullets; list older or less relevant roles as compact one-line entries when space is tight. Keep every bullet to one line where practical.
- Always include a Projects section when the source contains projects. Include every source project: use one strong line per project, adding a second line only for the single most relevant project when essential. Never invent project details.
- Keep Education and Certifications compact, with one line per item.
- Use strong action verbs and preserve the candidate's strongest supported outcomes and metrics.
- Before answering, compare the draft against the source and ensure every source project is named and every distinct, valuable accomplishment is represented somewhere.

Return GitHub-flavoured Markdown only, in this order:
# Full Name
Contact line (email | phone | location | links) — only details present in the source resume.
## Professional Summary  (2 concise lines, targeted at the role)
## Core Skills  (grouped, comma separated, prioritising skills the job asks for)
## Experience  (every source role; company — title — dates, with detail weighted toward relevance)
## Projects  (every source project; concise entries weighted toward relevance)
## Education  (one line per item)
## Certifications  (only if relevant and present; one line per item)

After the resume, add:
---
## How this was tailored
- 4-6 short bullets on what you emphasised or compressed and why. Never claim that source projects or valuable work were removed.
## Keywords from the job description you should verify
- Any required skills the resume does not evidence, so the candidate can add them if true.`;

export const tailorResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");
    if (!data.resumeFile && !(data.resumeText && data.resumeText.trim().length > 50)) {
      throw new Error("Please upload a resume file or paste your resume text.");
    }

    const markdown = await callModel({
      engine: data.engine,
      system: SYSTEM_PROMPT,
      input: `JOB DESCRIPTION:\n${data.jobDescription}\n\n${
        data.resumeText && data.resumeText.trim()
          ? `CANDIDATE RESUME (text):\n${data.resumeText}`
          : "The candidate resume is attached as a file."
      }\n\nWrite the tailored resume now.`,
      ...(data.resumeFile ? { files: [data.resumeFile] } : {}),
    });

    return { markdown };
  });

/* ------------------------------------------------------------------ */
/* Engine connection test                                             */
/* ------------------------------------------------------------------ */

export const testEngine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ engine: EngineSchema }).parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");
    const reply = await callModel({
      engine: data.engine,
      system: "You are a connection test. Reply with the single word OK.",
      input: "Reply with OK.",
    });
    return { ok: true, reply: reply.slice(0, 80) };
  });

/* ------------------------------------------------------------------ */
/* Stage 1 — ATS keywords for the job role                            */
/* ------------------------------------------------------------------ */

const KeywordInput = z.object({
  engine: EngineSchema,
  jobDescription: z.string().min(20, "Please paste a longer job description."),
});

export const extractKeywords = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => KeywordInput.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");
    const keywords = await callModel({
      engine: data.engine,
      system: `You list the keywords an ATS and a human recruiter would scan a candidate's resume for, given one job description.
Rules:
- Include hard skills, tools, technologies, methodologies, domain terms, certifications and the exact job titles implied by the posting.
- Use the posting's own wording. Include common variants and acronyms (e.g. "CI/CD", "continuous integration").
- 30 to 60 keywords, ordered most important first.
- Output ONE single paragraph of keywords separated by commas. No headings, no bullets, no numbering, no explanation, no trailing period.`,
      input: `JOB DESCRIPTION:\n${data.jobDescription}\n\nGive the keywords now.`,
    });

    return {
      keywords: keywords
        .replace(/^[\s\S]*?:\s*/, (m) => (m.length < 40 ? "" : m))
        .replace(/\s+/g, " ")
        .replace(/\.\s*$/, "")
        .trim(),
    };
  });

/* ------------------------------------------------------------------ */
/* Stage 2 — Single-column ATS LaTeX resume                           */
/* ------------------------------------------------------------------ */

const LatexInput = z.object({
  engine: EngineSchema,
  jobDescription: z.string().min(20),
  resumeSource: z.string().min(50),
  keywords: z.string().default(""),
  previousLatex: z.string().optional(),
  improvements: z.array(z.string()).optional(),
});

const LATEX_SYSTEM = `You are an expert resume writer who produces compile-ready LaTeX resumes.

Template requirements (non-negotiable):
- Modern, single-column, reverse-chronological, ATS-optimised.
- \\documentclass[11pt,a4paper]{article} and ONLY these packages: geometry, enumitem, titlesec, hyperref, xcolor.
- No tables, tabular, multicol, minipage, graphics, icons, custom fonts or images. Plain text flow only, so parsers read it.
- Section order: name + contact line, Professional Summary, Skills, Experience, Projects, Education, Certifications (omit a section only if the source has nothing for it).
- Sections use plain \\section*{...} headings with the standard names above.
- Experience entries newest first: company, job title, dates, then \\begin{itemize} bullets.
- Must fit on ONE A4 page. Use \\geometry{margin=0.6in} and compact \\setlist spacing.
- Escape LaTeX special characters (&, %, $, #, _) correctly.

Content rules:
- Never invent employers, degrees, certifications, dates or metrics.
- Preserve EVERY role and EVERY project from the source. Compress wording instead of deleting anything valuable.
- Weave in the supplied job keywords wherever the candidate's real experience supports them, using the job's vocabulary.
- Strong action verbs, quantified outcomes where the source supports them.

Output ONLY the LaTeX source. No markdown fences, no commentary before or after.`;

function stripFences(text: string) {
  return text
    .replace(/^\s*```(?:latex|tex)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

export const buildLatexResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LatexInput.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");

    const revision =
      data.previousLatex && data.improvements?.length
        ? `\n\nPREVIOUS LATEX RESUME:\n${data.previousLatex}\n\nAPPLY THESE IMPROVEMENTS, keeping every role and project and staying on one page:\n${data.improvements
            .map((item, i) => `${i + 1}. ${item}`)
            .join("\n")}`
        : "";

    const latex = await callModel({
      engine: data.engine,
      system: LATEX_SYSTEM,
      input: `JOB DESCRIPTION:\n${data.jobDescription}\n\nATS KEYWORDS TO COVER WHERE TRUTHFUL:\n${data.keywords}\n\nCANDIDATE RESUME SOURCE:\n${data.resumeSource}${revision}\n\nReturn the complete LaTeX resume now.`,
    });

    return { latex: stripFences(latex) };
  });

/* ------------------------------------------------------------------ */
/* Stage 3 — Score the resume against the job                         */
/* ------------------------------------------------------------------ */

const ScoreInput = z.object({
  engine: EngineSchema,
  jobDescription: z.string().min(20),
  latex: z.string().min(50),
  keywords: z.string().default(""),
});

const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", description: "Overall match score out of 100" },
    keyword_coverage: { type: "integer" },
    relevance: { type: "integer" },
    impact: { type: "integer" },
    ats_clarity: { type: "integer" },
    missing_keywords: { type: "array", items: { type: "string" } },
    improvements: {
      type: "array",
      items: { type: "string" },
      description: "Concrete, actionable rewrites. Each one must be applicable without inventing facts.",
    },
  },
  required: [
    "score",
    "keyword_coverage",
    "relevance",
    "impact",
    "ats_clarity",
    "missing_keywords",
    "improvements",
  ],
} as const;

export const scoreResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ScoreInput.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");

    const raw = await callModel({
      engine: data.engine,
      system: `You are a strict technical recruiter scoring one resume against one job description.
Rate each of these four dimensions from 0 to 100: keyword coverage, role relevance, demonstrated impact and metrics, ATS-safe clarity and formatting.
The overall score out of 100 is the weighted average: keyword coverage 30%, relevance 30%, impact 20%, ATS clarity 20%.
Then list 3-7 specific improvements that could be applied WITHOUT inventing employers, degrees, dates or metrics. If the resume already covers something, do not ask for it again.
Return JSON only.`,
      input: `JOB DESCRIPTION:\n${data.jobDescription}\n\nTARGET ATS KEYWORDS:\n${data.keywords}\n\nRESUME (LaTeX source):\n${data.latex}\n\nScore it now.`,
      jsonSchema: { name: "resume_score", schema: SCORE_SCHEMA as unknown as Record<string, unknown> },
    });

    let parsed: {
      score?: number;
      keyword_coverage?: number;
      relevance?: number;
      impact?: number;
      ats_clarity?: number;
      missing_keywords?: string[];
      improvements?: string[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The AI returned an unreadable score. Please try again.");
    }

    const clamp = (value: unknown, max: number) =>
      Math.max(0, Math.min(max, Math.round(Number(value) || 0)));

    return {
      score: clamp(parsed.score, 100),
      breakdown: {
        keywordCoverage: clamp(parsed.keyword_coverage, 100),
        relevance: clamp(parsed.relevance, 100),
        impact: clamp(parsed.impact, 100),
        atsClarity: clamp(parsed.ats_clarity, 100),
      },
      missingKeywords: (parsed.missing_keywords ?? []).filter((k) => typeof k === "string").slice(0, 20),
      improvements: (parsed.improvements ?? []).filter((i) => typeof i === "string").slice(0, 8),
    };
  });
