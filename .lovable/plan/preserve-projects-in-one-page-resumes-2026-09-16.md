# Preserve projects in one-page resumes

## Changes
- Update the resume-writing rules so every project from the source resume remains represented; highly relevant projects receive concise impact bullets, while less relevant projects use a compact one-line entry.
- Preserve unique achievements, skills, certifications, education, and roles instead of silently deleting valuable evidence; remove only repetition and generic wording.
- Tighten the generated format and print typography so the extra project coverage still targets a single A4 page.
- Clarify in the optional tailoring notes when information was compressed, never claiming that source work was discarded.

## Technical details
- Revise the server-side generation prompt, including project limits, total length, bullet counts, and explicit source-coverage checks.
- Adjust print-only spacing and text sizing without shrinking the normal on-screen result.
- Verify the page loads and the updated constraints are present.
