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
- Use strong action verbs and keep bullets to one or two lines.
- Aim for one page for under 8 years of experience, two pages otherwise.

Return GitHub-flavoured Markdown only, in this order:
# Full Name
Contact line (email | phone | location | links) — only details present in the source resume.
## Professional Summary  (3-4 lines, targeted at the role)
## Core Skills  (grouped, comma separated, prioritising skills the job asks for)
## Experience  (company — title — dates, then achievement bullets)
## Projects  (only if present in the source)
## Education
## Certifications  (only if present in the source)

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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 429) {
        throw new Error("Too many requests right now — please try again in a minute.");
      }
      if (res.status === 402) {
        throw new Error("The AI credits for this app have run out. Please top them up.");
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
