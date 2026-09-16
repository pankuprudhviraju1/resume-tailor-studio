import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  EngineSchema,
  KeywordInput,
  LatexInput,
  ScoreInput,
  TailorInput,
  keywordRequest,
  latexRequest,
  parseKeywords,
  parseLatex,
  parseScore,
  scoreRequest,
  tailorRequest,
} from "./stages";

export { EngineSchema };
export type { EngineConfig } from "./stages";

export const tailorResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TailorInput.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");
    const markdown = await callModel({ engine: data.engine, ...tailorRequest(data) });
    return { markdown };
  });

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

export const extractKeywords = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => KeywordInput.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");
    return parseKeywords(await callModel({ engine: data.engine, ...keywordRequest(data) }));
  });

export const buildLatexResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LatexInput.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");
    return parseLatex(await callModel({ engine: data.engine, ...latexRequest(data) }));
  });

export const scoreResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ScoreInput.parse(input))
  .handler(async ({ data }) => {
    const { callModel } = await import("./ai-provider.server");
    return parseScore(await callModel({ engine: data.engine, ...scoreRequest(data) }));
  });
