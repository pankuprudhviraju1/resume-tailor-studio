/**
 * Browser-side pipeline for the local (Ollama) engine.
 * Returns exactly the same shapes as the server functions.
 */
import { callOllama } from "./ollama-browser";
import {
  keywordRequest,
  latexRequest,
  parseKeywords,
  parseLatex,
  parseScore,
  scoreRequest,
  tailorRequest,
  type KeywordInputType,
  type LatexInputType,
  type ScoreInputType,
  type TailorInputType,
} from "./stages";

export const localRunner = {
  async tailor(data: TailorInputType) {
    const markdown = await callOllama({ engine: data.engine, ...tailorRequest(data) });
    return { markdown };
  },
  async keywords(data: KeywordInputType) {
    return parseKeywords(await callOllama({ engine: data.engine, ...keywordRequest(data) }));
  },
  async latex(data: LatexInputType) {
    return parseLatex(await callOllama({ engine: data.engine, ...latexRequest(data) }));
  },
  async score(data: ScoreInputType) {
    return parseScore(await callOllama({ engine: data.engine, ...scoreRequest(data) }));
  },
  async test(engine: TailorInputType["engine"]) {
    const reply = await callOllama({
      engine,
      system: "You are a connection test. Reply with the single word OK.",
      input: "Reply with OK.",
    });
    return { ok: true as const, reply: reply.slice(0, 80) };
  },
};
