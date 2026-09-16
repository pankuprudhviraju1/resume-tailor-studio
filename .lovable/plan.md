# Resume Tailor: keywords, LaTeX template, and score-until-100 loop

Turn the single "tailor" step into a three-stage pipeline that runs automatically when you press the button, with each stage visible in the output panel.

## Stage 1 — ATS keywords

From the job description alone, produce the keywords an ATS or recruiter would scan for, as one plain paragraph separated by commas (no bullets, no headings).

Shown in its own block with a Copy button. Keywords already evidenced in your resume are listed first; the rest are the gaps stage 3 works on.

## Stage 2 — LaTeX resume

Rebuild your resume as compile-ready LaTeX in a modern, single-column, ATS-optimised, reverse-chronological template:

- Name + contact line, then Summary, Skills, Experience (newest first), Projects, Education, Certifications
- No tables, columns, graphics, or fancy fonts — plain text flow so parsers read it
- Standard `article` class with `geometry`, `enumitem`, `titlesec`, `hyperref` only
- One page target; every source role and every source project preserved (existing rule kept)
- Keywords from stage 1 woven in only where your real experience supports them — nothing invented

Output shown in a code block with Copy and Download (`resume.tex`) actions. The rendered Markdown preview and current print/PDF path stay as they are.

## Stage 3 — Score and improve loop

Rate the resume against the job out of 100 with a short breakdown (keyword coverage, relevance, impact/metrics, clarity/ATS-safety) plus a list of concrete improvements.

Then loop automatically: rewrite the LaTeX applying its own improvements and re-score, up to 4 rounds, stopping early once the score reaches 95+. The panel shows each round's score so you can watch it climb, and the final LaTeX is the best-scoring version. Scores are the model's judgement, not a guarantee of an interview.

## Interface changes

Output panel gains three sections: **Keywords**, **LaTeX resume**, **Score & improvements** (with the round-by-round scores), alongside the existing rendered resume and the collapsed "Why these changes?" notes. A progress line shows which stage is running ("Extracting keywords… / Building LaTeX… / Scoring round 2…").

## Technical notes

- `src/lib/tailor.functions.ts` gains three server functions — `extractKeywords`, `buildLatexResume`, `scoreResume` — plus an orchestrating `tailorPipeline` that runs the loop server-side and streams stage results back; existing gateway retry/error handling reused.
- Model: `openai/gpt-6-astra` via the gateway Responses API with streaming (each call can be long-running); scoring uses a strict structured schema so the number and improvement list parse reliably.
- The loop is bounded (max 4 rounds, early exit at 95) to keep credit use and wait time predictable.
- `src/routes/index.tsx` renders the new sections and per-round progress; download actions extended with `.tex`.
