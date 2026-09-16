import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  FileText,
  Upload,
  Sparkles,
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
    <main className="min-h-screen bg-background text-foreground">
      <header className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] opacity-80">
            <Sparkles className="h-4 w-4" /> Resume Tailor
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight md:text-5xl">
            One resume in, a role-specific resume out.
          </h1>
          <p className="mt-4 max-w-2xl text-base opacity-85">
            Add your current resume and the job description you are targeting. You get back an
            ATS-friendly rewrite that mirrors the language of the role — using only the experience
            you already have.
          </p>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-12 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <Label className="text-sm font-semibold">1. Your current resume</Label>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/60 px-4 py-8 text-center transition-colors hover:border-ring hover:bg-secondary"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {file ? file.name : "Choose a PDF or text file"}
            </span>
            <span className="text-xs text-muted-foreground">PDF, TXT or MD · up to 8 MB</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <p className="mt-4 text-xs text-muted-foreground">Or paste your resume text instead:</p>
          <Textarea
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value);
              if (e.target.value.trim()) setFile(null);
            }}
            placeholder="Name, contact details, experience, skills, education…"
            className="mt-2 min-h-40 font-body"
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <Label className="text-sm font-semibold">2. The job description</Label>
          <Textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job posting: responsibilities, requirements, tech stack…"
            className="mt-3 min-h-[19.5rem]"
          />
        </div>

        <div className="md:col-span-2">
          {notice && <p className="mb-3 text-sm text-muted-foreground">{notice}</p>}
          {mutation.isError && (
            <p className="mb-3 text-sm text-destructive">
              {(mutation.error as Error).message || "Something went wrong. Please try again."}
            </p>
          )}
          <Button size="lg" disabled={!ready || mutation.isPending} onClick={submit}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Tailoring your resume…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" /> Generate tailored resume
              </>
            )}
          </Button>
          {!ready && (
            <span className="ml-3 text-sm text-muted-foreground">
              Add a resume and a job description to continue.
            </span>
          )}
        </div>
      </section>

      {resume && (
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-2xl">Your tailored resume</h2>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          </div>
          <article className="resume-doc rounded-xl border border-border bg-card p-8 shadow-card md:p-12">
            <Markdown source={resume} />
          </article>
          {tailoringNotes && (
            <details className="group mt-6 border-t border-border pt-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground marker:hidden">
                <Info className="h-4 w-4 text-primary" />
                Why these changes?
                <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="tailoring-notes mt-4 border-l-2 border-border pl-5 text-sm text-muted-foreground">
                <Markdown source={tailoringNotes} />
              </div>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
