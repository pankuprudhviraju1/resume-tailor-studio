import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
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

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } };

const SYSTEM_PROMPT = `You are an expert technical recruiter and resume writer.
You rewrite a candidate's existing resume so it is tailored to one specific job description.

Hard rules:
- Never invent employers, degrees, certifications, dates or metrics that are not supported by the source resume.
- You may rephrase, reorder, re-group and emphasise real experience, and mirror the vocabulary of the job description.
- Keep it ATS-friendly: plain section headings, no tables, no columns, no graphics.
- Produce a strict one-page resume, regardless of the source resume's length.
- Keep the resume itself between 400 and 550 words. The tailoring notes after the divider do not count.
- Prioritise only evidence that directly supports this role; remove repetition, generic duties and low-relevance details.
- Use a two-line summary, a compact comma-separated skills section, and no more than 10 experience bullets in total.
- Include at most 4 relevant roles with 2-3 concise bullets each. Keep every bullet to one line where practical.
- Include at most one highly relevant project. Omit Projects entirely when experience already proves the same skills.
- Keep Education and Certifications compact, with one line per item.
- Use strong action verbs and preserve the candidate's strongest supported outcomes and metrics.

Return GitHub-flavoured Markdown only, in this order:
# Full Name
Contact line (email | phone | location | links) — only details present in the source resume.
## Professional Summary  (2 concise lines, targeted at the role)
## Core Skills  (grouped, comma separated, prioritising skills the job asks for)
## Experience  (up to 4 relevant roles; company — title — dates, then 2-3 achievement bullets)
## Projects  (at most one; only when both relevant and present in the source)
## Education  (one line per item)
## Certifications  (only if relevant and present; one line per item)

After the resume, add:
---
## How this was tailored
- 4-6 short bullets on what you emphasised and why.
## Keywords from the job description you should verify
- Any required skills the resume does not evidence, so the candidate can add them if true.`;

export const tailorResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("AI is not configured for this app (missing LOVABLE_API_KEY).");
    }
    if (!data.resumeFile && !(data.resumeText && data.resumeText.trim().length > 50)) {
      throw new Error("Please upload a resume file or paste your resume text.");
    }

    const blocks: ContentBlock[] = [
      {
        type: "text",
        text: `JOB DESCRIPTION:\n${data.jobDescription}\n\n${
          data.resumeText && data.resumeText.trim()
            ? `CANDIDATE RESUME (text):\n${data.resumeText}`
            : "The candidate resume is attached as a file."
        }\n\nWrite the tailored resume now.`,
      },
    ];

    if (data.resumeFile) {
      blocks.push({
        type: "file",
        file: {
          filename: data.resumeFile.name,
          file_data: `data:${data.resumeFile.mimeType};base64,${data.resumeFile.base64}`,
        },
      });
    }

    const callGateway = () =>
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3.8-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: blocks },
          ],
        }),
      });

    let res = await callGateway();
    // 429 and 5xx are transient: retry with bounded backoff before giving up.
    for (let attempt = 1; attempt <= 3 && (res.status === 429 || res.status >= 500); attempt++) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : attempt * 1500 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, waitMs));
      res = await callGateway();
    }

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 429) {
        throw new Error("Too many requests right now — please try again in a minute.");
      }
      if (res.status === 402) {
        throw new Error("The AI credits for this app have run out. Please top them up.");
      }
      if (res.status >= 500) {
        throw new Error("The AI service is temporarily unavailable. Please try again in a moment.");
      }
      console.error("AI gateway error", res.status, detail);
      throw new Error(`Could not generate the resume (error ${res.status}). ${detail.slice(0, 300)}`);
    }


    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("The AI returned an empty response. Please try again.");
    }
    return { markdown: content };
  });
