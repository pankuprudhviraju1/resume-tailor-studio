import { useEffect, useState } from "react";
import type { EngineConfig } from "@/lib/tailor.functions";

const STORAGE_KEY = "resume-tailor-engine";

export const DEFAULT_MODELS: Record<EngineConfig["provider"], string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  ollama: "llama3.1",
};

export function isEngineReady(engine: EngineConfig | null): engine is EngineConfig {
  if (!engine || !engine.model.trim()) return false;
  if (engine.provider === "ollama") return true;
  return Boolean(engine.apiKey && engine.apiKey.trim().length > 10);
}

/**
 * The AI engine lives only in this browser. Nothing is stored on a server.
 */
export function useEngine() {
  const [engine, setEngine] = useState<EngineConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as EngineConfig;
        if (parsed && typeof parsed.provider === "string") setEngine(parsed);
      }
    } catch {
      // Ignore unreadable stored config.
    }
    setLoaded(true);
  }, []);

  function save(next: EngineConfig) {
    setEngine(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing: keep it in memory for this session only.
    }
  }

  function clear() {
    setEngine(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }

  return { engine, loaded, save, clear };
}
