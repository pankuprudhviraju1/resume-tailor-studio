# Reduce improvement rounds from 4 to 2 (cost safeguard)

## What changes

- `src/routes/index.tsx`: change `const MAX_ROUNDS = 4` to `const MAX_ROUNDS = 2`.
- No other behavior changes. The flow stays: keywords → tailored resume → LaTeX → score/improve loop, still stopping early at the target score (95+). The round history display keeps working unchanged.

## Effect

- Each full resume run uses roughly half as many score/improve calls, cutting the AI credit cost per run by roughly 40–50%.
- Everything else — outputs, layout, download/print, tailoring notes — remains exactly as it is.
