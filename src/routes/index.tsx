import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  FileText,
  Upload,
  Copy,
  Download,
  Printer,
  Loader2,
  Info,
  ChevronDown,
} from "lucide-react";

import {
  tailorResume,
  extractKeywords,
  buildLatexResume,
  scoreResume,
} from "@/lib/tailor.functions";
import { localRunner } from "@/lib/local-runner";
import { Markdown } from "@/components/Markdown";
import { EngineSetup } from "@/components/EngineSetup";
import { useEngine, isEngineReady } from "@/hooks/useEngine";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Resume Tailor — Match your resume to any job description" },
      {
        name: "description",
        content:
          "Upload your resume, paste a job description, and get ATS keywords, a one-page LaTeX resume and a match score out of 100.",
      },
      { property: "og:title", content: "Resume Tailor — Match your resume to any job" },
      {
        property: "og:description",
        content:
          "ATS keywords, a single-column LaTeX resume and a match score out of 100 — from your resume and one job description.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROUNDS = 4;
const TARGET_SCORE = 95;

type Breakdown = {
  keywordCoverage: number;
  relevance: number;
  impact: number;
  atsClarity: number;
};

type Round = {
  round: number;
  score: number;
  breakdown: Breakdown;
  missingKeywords: string[];
  improvements: string[];
};

function splitTailoredResult(markdown: string) {
  const notesHeading = /^## How this was tailored\s*$/m;
  const match = notesHeading.exec(markdown);
  if (!match) return { resume: markdown.trim(), notes: "" };

  const beforeHeading = markdown.slice(0, match.index).replace(/\n---\s*$/, "").trim();
  const notes = markdown.slice(match.index).trim();
  return { resume: beforeHeading, notes };
}

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Home() {
  const tailorFn = useServerFn(tailorResume);
  const keywordsFn = useServerFn(extractKeywords);
  const latexFn = useServerFn(buildLatexResume);
  const scoreFn = useServerFn(scoreResume);
  const { engine, save: saveEngine, clear: clearEngine } = useEngine();

  // A local Ollama model only exists on the visitor's own machine, so those
  // requests run in the browser; hosted providers go through the server.
  const isLocal = engine?.provider === "ollama";
  const tailor = (args: { data: Parameters<typeof tailorFn>[0]["data"] }) =>
    isLocal ? localRunner.tailor(args.data) : tailorFn(args);
  const getKeywords = (args: { data: Parameters<typeof keywordsFn>[0]["data"] }) =>
    isLocal ? localRunner.keywords(args.data) : keywordsFn(args);
  const getLatex = (args: { data: Parameters<typeof latexFn>[0]["data"] }) =>
    isLocal ? localRunner.latex(args.data) : latexFn(args);
  const getScore = (args: { data: Parameters<typeof scoreFn>[0]["data"] }) =>
    isLocal ? localRunner.score(args.data) : scoreFn(args);


  const inputRef = useRef<HTMLInputElement>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [file, setFile] = useState<{ name: string; mimeType: string; base64: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [stage, setStage] = useState<string | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [tailoringNotes, setTailoringNotes] = useState<string>("");
  const [keywords, setKeywords] = useState<string>("");
  const [latex, setLatex] = useState<string>("");
  const [rounds, setRounds] = useState<Round[]>([]);

  async function handleFile(picked: File | undefined) {
    if (!picked) return;
    setNotice(null);
    if (picked.size > MAX_BYTES) {
      setNotice("That file is larger than 8 MB. Please upload a smaller one.");
      return;
    }
    const isPdf = picked.type === "application/pdf" || picked.name.toLowerCase().endsWith(".pdf");
    const isText = picked.type.startsWith("text/") || /\.(txt|md)$/i.test(picked.name);

    if (isText) {
      setResumeText(await picked.text());
      setFile(null);
      setNotice(`Loaded the text from ${picked.name}.`);
      return;
    }
    if (!isPdf) {
      setNotice(
        "Please upload a PDF or a plain text file. If your resume is a Word document, save it as PDF first — or paste the text below.",
      );
      return;
    }
    const buffer = await picked.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    setFile({ name: picked.name, mimeType: "application/pdf", base64: btoa(binary) });
    setResumeText("");
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!isEngineReady(engine)) {
        throw new Error("Set up your AI engine first.");
      }
      setStage("Tailoring your resume…");
      setResume(null);
      setTailoringNotes("");
      setKeywords("");
      setLatex("");
      setRounds([]);

      const tailored = await tailor({
        data: {
          engine,
          jobDescription,
          ...(resumeText.trim() ? { resumeText } : {}),
          ...(file ? { resumeFile: file } : {}),
        },
      });
      const split = splitTailoredResult(tailored.markdown);
      setResume(split.resume);
      setTailoringNotes(split.notes);

      setStage("Extracting ATS keywords…");
      const kw = await getKeywords({ data: { engine, jobDescription } });
      setKeywords(kw.keywords);

      setStage("Building the LaTeX resume…");
      let current = (
        await getLatex({
          data: {
            engine,
            jobDescription,
            resumeSource: split.resume,
            keywords: kw.keywords,
          },
        })
      ).latex;
      setLatex(current);

      const collected: Round[] = [];
      let best = { latex: current, score: -1 };

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        setStage(`Scoring round ${round}…`);
        const result = await getScore({
          data: { engine, jobDescription, latex: current, keywords: kw.keywords },
        });
        collected.push({ round, ...result });
        setRounds([...collected]);
        if (result.score > best.score) best = { latex: current, score: result.score };
        if (result.score >= TARGET_SCORE || round === MAX_ROUNDS) break;

        setStage(`Applying improvements (round ${round})…`);
        current = (
          await getLatex({
            data: {
              engine,
              jobDescription,
              resumeSource: split.resume,
              keywords: kw.keywords,
              previousLatex: current,
              improvements: result.improvements,
            },
          })
        ).latex;
        setLatex(current);
      }

      setLatex(best.latex);
      setStage(null);
      return true;
    },
    onError: () => setStage(null),
  });

  const ready =
    isEngineReady(engine) &&
    (file !== null || resumeText.trim().length > 50) &&
    jobDescription.trim().length > 20;
  const latest = rounds.length ? rounds[rounds.length - 1] : null;

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const actionClass =
    "rounded-none border-2 bg-transparent font-body uppercase shadow-none hover:bg-primary hover:text-primary-foreground";

  return (
    <main className="min-h-screen bg-background p-3 text-foreground sm:p-6 lg:p-10">
      <div className="industrial-frame mx-auto grid min-h-[calc(100vh-5rem)] max-w-[90rem] bg-card lg:grid-cols-[44%_56%]">
        <section className="app-input-panel flex flex-col border-b-[3px] border-border p-5 sm:p-8 lg:border-r-[3px] lg:border-b-0 lg:p-10">
          <header className="mb-12 flex items-start justify-between gap-4">
            <h1 className="text-[clamp(3.5rem,8vw,7.5rem)] leading-[0.82] uppercase">
              Resume<br />Tailor
            </h1>
            <span className="font-body text-[10px] font-bold uppercase tracking-[0.16em]">AI / 01</span>
          </header>

          <div className="flex-1 space-y-8">
            <EngineSetup engine={engine} onSave={saveEngine} onClear={clearEngine} />

            <div>
              <Label className="industrial-label">01 // Source file</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                className="mt-2 h-auto min-h-28 w-full rounded-none border-2 border-dashed border-border bg-transparent px-4 py-7 font-body uppercase shadow-none hover:bg-primary hover:text-primary-foreground"
              >
                <Upload className="h-4 w-4" />
                <span className="max-w-full truncate text-xs font-bold sm:text-sm">
                  {file ? file.name : "Choose PDF or text file"}
                </span>
              </Button>
              <input ref={inputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
              <p className="mt-2 font-body text-[10px] uppercase tracking-[0.12em] text-muted-foreground">PDF, TXT or MD // Max 8 MB</p>
            </div>

            <div>
              <Label className="industrial-label">02 // Resume text alternative</Label>
              <Textarea
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value);
                  if (e.target.value.trim()) setFile(null);
                }}
                placeholder="Paste resume text here..."
                className="industrial-textarea mt-2 min-h-36"
              />
            </div>

            <div>
              <Label className="industrial-label">03 // Target job description</Label>
              <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste full job requirements here..." className="industrial-textarea mt-2 min-h-56" />
            </div>
          </div>

          <div className="mt-8">
            {notice && <p className="mb-3 border-l-2 border-border pl-3 font-body text-xs uppercase">{notice}</p>}
            {mutation.isError && <p className="mb-3 border-l-2 border-destructive pl-3 font-body text-xs text-destructive">{(mutation.error as Error).message || "Something went wrong. Please try again."}</p>}
            <Button size="lg" disabled={!ready || mutation.isPending} onClick={() => mutation.mutate()} className="h-auto w-full rounded-none border-2 border-border py-7 font-display text-xl uppercase shadow-none hover:bg-card hover:text-foreground sm:text-2xl">
              {mutation.isPending ? <><Loader2 className="animate-spin" /> Working…</> : <><FileText /> Process & tailor</>}
            </Button>
            {stage && <p className="mt-3 font-body text-[10px] uppercase tracking-[0.12em]">{stage}</p>}
            {!ready && (
              <p className="mt-3 font-body text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {isEngineReady(engine)
                  ? "Resume + job description required"
                  : "Set up your AI engine above first"}
              </p>
            )}
          </div>
        </section>

        <section className="output-panel flex min-h-[46rem] flex-col bg-secondary p-5 sm:p-8 lg:p-10">
          <div className="print-result-actions mb-7 flex flex-wrap items-end gap-4 border-b-2 border-border pb-5">
            <div className="mr-auto">
              <p className="industrial-label">04 // Tailored output</p>
              <h2 className="mt-2 text-3xl uppercase sm:text-4xl">Revised draft</h2>
            </div>
            {resume && <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void copy(resume, "resume")} className={actionClass}><Copy /> {copied === "resume" ? "Copied" : "Copy"}</Button>
              <Button variant="outline" size="sm" onClick={() => downloadText(resume, "tailored-resume.md", "text/markdown")} className={actionClass}><Download /> Download</Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className={actionClass}><Printer /> Print</Button>
            </div>}
          </div>

          {resume ? (
            <section className="print-result flex flex-1 flex-col">
              <article className="resume-doc flex-1 border-2 border-border bg-card p-6 sm:p-9">
                <Markdown source={resume} />
              </article>
              {tailoringNotes && <details className="print-notes group mt-6 border-t-2 border-border pt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-body text-xs font-bold uppercase tracking-[0.12em] marker:hidden">
                  <Info className="h-4 w-4" /> Why these changes?
                  <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="tailoring-notes mt-4 border-l-2 border-border pl-4 font-body text-sm"><Markdown source={tailoringNotes} /></div>
              </details>}
            </section>
          ) : (
            <div className="flex flex-1 items-center justify-center border-2 border-border bg-card p-8 text-center">
              <div>
                <p className="font-display text-5xl uppercase sm:text-7xl">No draft</p>
                <p className="mt-4 font-body text-xs uppercase tracking-[0.16em] text-muted-foreground">Your tailored resume will appear here</p>
              </div>
            </div>
          )}

          {keywords && (
            <section className="print-notes mt-8 border-t-2 border-border pt-6">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <p className="industrial-label mr-auto">05 // ATS keywords</p>
                <Button variant="outline" size="sm" onClick={() => void copy(keywords, "keywords")} className={actionClass}><Copy /> {copied === "keywords" ? "Copied" : "Copy"}</Button>
              </div>
              <p className="border-2 border-border bg-card p-4 font-body text-sm leading-relaxed">{keywords}</p>
            </section>
          )}

          {latex && (
            <section className="print-notes mt-8 border-t-2 border-border pt-6">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <p className="industrial-label mr-auto">06 // LaTeX resume (single column, ATS)</p>
                <Button variant="outline" size="sm" onClick={() => void copy(latex, "latex")} className={actionClass}><Copy /> {copied === "latex" ? "Copied" : "Copy"}</Button>
                <Button variant="outline" size="sm" onClick={() => downloadText(latex, "resume.tex", "application/x-tex")} className={actionClass}><Download /> .tex</Button>
              </div>
              <pre className="max-h-96 overflow-auto border-2 border-border bg-card p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{latex}</pre>
              <p className="mt-2 font-body text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Paste into Overleaf and compile with pdfLaTeX</p>
            </section>
          )}

          {latest && (
            <section className="print-notes mt-8 border-t-2 border-border pt-6">
              <p className="industrial-label">07 // Match score</p>
              <div className="mt-3 flex flex-wrap items-end gap-6 border-2 border-border bg-card p-5">
                <p className="font-display text-6xl leading-none">{latest.score}<span className="text-2xl">/100</span></p>
                <ul className="font-body text-xs uppercase tracking-[0.1em]">
                  <li>Keywords {latest.breakdown.keywordCoverage}%</li>
                  <li>Relevance {latest.breakdown.relevance}%</li>
                  <li>Impact {latest.breakdown.impact}%</li>
                  <li>ATS clarity {latest.breakdown.atsClarity}%</li>
                </ul>
                {rounds.length > 1 && (
                  <p className="ml-auto font-body text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Rounds: {rounds.map((r) => r.score).join(" → ")}
                  </p>
                )}
              </div>

              {latest.improvements.length > 0 && (
                <div className="mt-4">
                  <p className="font-body text-xs font-bold uppercase tracking-[0.12em]">Improvements still worth making</p>
                  <ul className="mt-2 list-disc space-y-1 border-l-2 border-border pl-6 font-body text-sm">
                    {latest.improvements.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}

              {latest.missingKeywords.length > 0 && (
                <div className="mt-4">
                  <p className="font-body text-xs font-bold uppercase tracking-[0.12em]">Keywords to add only if true for you</p>
                  <p className="mt-2 border-l-2 border-border pl-6 font-body text-sm">{latest.missingKeywords.join(", ")}</p>
                </div>
              )}
            </section>
          )}

          <footer className="mt-6 flex justify-between gap-4 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span>ATS format</span><span>One page target</span><span>Source faithful</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
