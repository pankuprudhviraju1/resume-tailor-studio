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

import { tailorResume } from "@/lib/tailor.functions";
import { Markdown } from "@/components/Markdown";
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
          "Upload your resume, paste a job description, and get an ATS-friendly resume rewritten for that exact role in seconds.",
      },
      { property: "og:title", content: "Resume Tailor — Match your resume to any job" },
      {
        property: "og:description",
        content:
          "Upload your resume, paste a job description, and get an ATS-friendly tailored resume in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const MAX_BYTES = 8 * 1024 * 1024;

type TailorInput = {
  jobDescription: string;
  resumeText?: string;
  resumeFile?: { name: string; mimeType: string; base64: string };
};

function splitTailoredResult(markdown: string) {
  const notesHeading = /^## How this was tailored\s*$/m;
  const match = notesHeading.exec(markdown);
  if (!match) return { resume: markdown.trim(), notes: "" };

  const beforeHeading = markdown.slice(0, match.index).replace(/\n---\s*$/, "").trim();
  const notes = markdown.slice(match.index).trim();
  return { resume: beforeHeading, notes };
}

function Home() {
  const tailor = useServerFn(tailorResume);
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [file, setFile] = useState<{ name: string; mimeType: string; base64: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: (vars: TailorInput) => tailor({ data: vars }),
  });


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

  const ready = (file !== null || resumeText.trim().length > 50) && jobDescription.trim().length > 20;
  const result = mutation.data?.markdown;
  const separatedResult = result ? splitTailoredResult(result) : null;
  const resume = separatedResult?.resume;
  const tailoringNotes = separatedResult?.notes;

  function submit() {
    setNotice(null);
    mutation.mutate({
      jobDescription,
      ...(resumeText.trim() ? { resumeText } : {}),
      ...(file ? { resumeFile: file } : {}),
    });
  }

  function download() {
    if (!resume) return;
    const blob = new Blob([resume], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tailored-resume.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    if (!resume) return;
    await navigator.clipboard.writeText(resume);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
            <Button size="lg" disabled={!ready || mutation.isPending} onClick={submit} className="h-auto w-full rounded-none border-2 border-border py-7 font-display text-xl uppercase shadow-none hover:bg-card hover:text-foreground sm:text-2xl">
              {mutation.isPending ? <><Loader2 className="animate-spin" /> Tailoring resume...</> : <><FileText /> Process & tailor</>}
            </Button>
            {!ready && <p className="mt-3 font-body text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Resume + job description required</p>}
          </div>
        </section>

        <section className="output-panel flex min-h-[46rem] flex-col bg-secondary p-5 sm:p-8 lg:p-10">
          <div className="print-result-actions mb-7 flex flex-wrap items-end gap-4 border-b-2 border-border pb-5">
            <div className="mr-auto">
              <p className="industrial-label">04 // Tailored output</p>
              <h2 className="mt-2 text-3xl uppercase sm:text-4xl">Revised draft</h2>
            </div>
            {resume && <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void copy()} className="rounded-none border-2 bg-transparent font-body uppercase shadow-none hover:bg-primary hover:text-primary-foreground"><Copy /> {copied ? "Copied" : "Copy"}</Button>
              <Button variant="outline" size="sm" onClick={download} className="rounded-none border-2 bg-transparent font-body uppercase shadow-none hover:bg-primary hover:text-primary-foreground"><Download /> Download</Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-none border-2 bg-transparent font-body uppercase shadow-none hover:bg-primary hover:text-primary-foreground"><Printer /> Print</Button>
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

          <footer className="mt-6 flex justify-between gap-4 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span>ATS format</span><span>One page target</span><span>Source faithful</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
