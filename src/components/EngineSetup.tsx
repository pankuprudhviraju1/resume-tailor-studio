import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plug, Trash2 } from "lucide-react";

import { testEngine, type EngineConfig } from "@/lib/tailor.functions";
import { localRunner } from "@/lib/local-runner";
import { DEFAULT_MODELS, isEngineReady } from "@/hooks/useEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Provider = EngineConfig["provider"];

const PROVIDERS: Array<{ id: Provider; label: string; note: string }> = [
  { id: "openai", label: "OpenAI key", note: "platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini key", note: "aistudio.google.com/apikey" },
  { id: "ollama", label: "Local / free", note: "ollama.com — runs offline" },
];

export function EngineSetup(props: {
  engine: EngineConfig | null;
  onSave: (engine: EngineConfig) => void;
  onClear: () => void;
}) {
  const runTest = useServerFn(testEngine);
  const [provider, setProvider] = useState<Provider>(props.engine?.provider ?? "openai");
  const [model, setModel] = useState(props.engine?.model ?? DEFAULT_MODELS.openai);
  const [apiKey, setApiKey] = useState(props.engine?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(props.engine?.baseUrl ?? "");
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!props.engine) return;
    setProvider(props.engine.provider);
    setModel(props.engine.model);
    setApiKey(props.engine.apiKey ?? "");
    setBaseUrl(props.engine.baseUrl ?? "");
  }, [props.engine]);

  const draft: EngineConfig = {
    provider,
    model: model.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
  };
  const ready = isEngineReady(draft);

  function pick(next: Provider) {
    setProvider(next);
    setModel(DEFAULT_MODELS[next]);
    setBaseUrl("");
    setStatus("idle");
    setMessage(null);
  }

  async function test() {
    setStatus("testing");
    setMessage(null);
    try {
      if (draft.provider === "ollama") {
        await localRunner.test(draft);
      } else {
        await runTest({ data: { engine: draft } });
      }
      props.onSave(draft);
      setStatus("ok");
      setMessage("Connected. Your engine is saved in this browser only.");
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message || "Could not connect.");
    }
  }

  return (
    <div className="border-2 border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="industrial-label mr-auto">00 // AI engine</Label>
        {props.engine && (
          <Button
            variant="outline"
            size="sm"
            onClick={props.onClear}
            className="rounded-none border-2 bg-transparent font-body text-[10px] uppercase shadow-none"
          >
            <Trash2 /> Forget
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {PROVIDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => pick(item.id)}
            className={`border-2 border-border p-3 text-left font-body text-[11px] uppercase tracking-[0.1em] ${
              provider === item.id ? "bg-primary text-primary-foreground" : "bg-transparent"
            }`}
          >
            <span className="block font-bold">{item.label}</span>
            <span className="mt-1 block text-[9px] normal-case tracking-normal opacity-70">
              {item.note}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {provider !== "ollama" && (
          <div>
            <Label className="industrial-label">Your API key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setStatus("idle");
              }}
              placeholder={provider === "openai" ? "sk-..." : "AIza..."}
              className="mt-1 rounded-none border-2 border-border bg-transparent font-mono text-xs shadow-none"
            />
          </div>
        )}
        <div>
          <Label className="industrial-label">Model</Label>
          <Input
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setStatus("idle");
            }}
            placeholder={DEFAULT_MODELS[provider]}
            className="mt-1 rounded-none border-2 border-border bg-transparent font-mono text-xs shadow-none"
          />
        </div>
        {provider === "ollama" && (
          <div>
            <Label className="industrial-label">Ollama address (optional)</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="mt-1 rounded-none border-2 border-border bg-transparent font-mono text-xs shadow-none"
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || status === "testing"}
          onClick={() => void test()}
          className="rounded-none border-2 bg-transparent font-body text-[11px] uppercase shadow-none hover:bg-primary hover:text-primary-foreground"
        >
          {status === "testing" ? <Loader2 className="animate-spin" /> : status === "ok" ? <Check /> : <Plug />}
          {status === "testing" ? "Testing…" : status === "ok" ? "Connected" : "Test & save"}
        </Button>
        <p className="font-body text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {provider === "ollama"
            ? "Free, offline, no key — needs Ollama running on this computer"
            : "Your key stays in your browser and goes only to your provider"}
        </p>
      </div>

      {message && (
        <p
          className={`mt-3 border-l-2 pl-3 font-body text-xs ${
            status === "error" ? "border-destructive text-destructive" : "border-border"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
