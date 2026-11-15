# Offmap

Ask any AI for a startup idea and you get the same handful of answers. Offmap measures
that sameness, then goes past it one layer at a time.

**Status: work in progress.** The measurement pipeline works and has been run on one
prompt. The web app in `web/` reads those results. There are no human ratings yet, and
the other prompts have not been run.

## What has been measured so far

Prompt: *"Give me one startup idea for university students."* 150 answers, 50 each from
three model families (Gemini 3.5 Flash-Lite, GPT-OSS 120B, Qwen 3.8 27B), default settings,
one idea per call. Each answer was reduced to tags from a fixed vocabulary of 68 mechanisms.

| Measure | Value |
|---|---|
| Distinct primary mechanisms across 150 ideas | 11 |
| Share of ideas using one of the top three | 81% |
| Share charging a transaction fee | 84% |
| Vocabulary mechanisms never used | 48 of 68 |
| Answers named "CampusSwap" (with or without a hyphen) | 44 of 150 |

Peeling (ban every mechanism that was common in any earlier layer, regenerate, re-tag,
verify, repeat; 30 ideas generated per layer):

| Layer | New consensus that appeared | Verified ideas | Ignored the bans |
|---|---|---|---|
| 0 | campus peer-to-peer marketplace | 150 | n/a |
| 1 | AI lecture-notes summariser, tutor, planner | 26 of 30 | 4 |
| 2 | dorm delivery, campus sensor dashboards | 16 of 29 tagged | 13 |
| 3 | incubators, micro-credentials, pooled subscriptions | 9 of 28 tagged | 19 |

Limits: one prompt, one run, small samples per layer, tags assigned by a small model
(spot-checked by eye, not audited), and no human rating of whether deeper ideas are
better or merely stranger. Raw model replies are in `data/cache.jsonl`.

## How it works

1. `pipeline/run.py baseline` samples default ideas and tags them (`pipeline/taxonomy.py`).
2. `pipeline/mine.py` counts tags and derives bans. It is plain counting; it calls no model.
3. `pipeline/peel.py` regenerates under the bans, re-tags every idea, drops any that still
   use a banned mechanism, and mines the survivors for the next layer.
4. `pipeline/run.py compare` runs default prompting, Verbalized Sampling
   (Zhang et al., template from the authors' repository), a plain avoid-list, and a
   required-mechanism variant on equal terms.

5. `pipeline/export_web.py` reshapes the results into the files the web app reads. It
   counts and renames; it measures nothing new.

## The web app

`web/` is a Vite + React page that shows one square per answer, a scroll-driven scene of
the whole method, then each layer down with what was ruled out, what was kept, what was
dropped and why. Each layer has a "Copy this prompt" button with the exact rule-out prompt. "Where does your idea sit?"
makes one live model call (`web/api/place.js`) to tag an idea with the same prompt and
vocabulary as the pipeline, then looks its approach up in the measured layers.

```
cd web
npm install
npm run build
GEMINI_API_KEY=... GROQ_API_KEY=... npm run preview   # http://localhost:8787
```

The live call tries Gemini first and falls back to Groq. Without either key the rest of
the page still works and the idea box says tagging is unavailable.

## Known limits

- One prompt, one run. Counts will move on a rerun.
- The tagger is a model and can mislabel. Answers it could not tag are counted separately.
- The 68-mechanism vocabulary is ours; a different list would draw the layers differently.
- Depth is distance from the default answer, not quality.
- By the third layer most answers ignore the bans (19 of 30), so only 9 ideas survive.
- Free API tiers cap how much can be run per day (Gemini: 500 requests per model per day),
  which is why only one prompt has been measured so far.

## Run it

```
pip install requests pytest
export GEMINI_API_KEY=... GROQ_API_KEY=...
python -m pytest tests
python -m pipeline.run models
python -m pipeline.run baseline --topic "university students" --models gemini:<model> groq:<model> --tagger gemini:<model>
python -m pipeline.peel --topic "university students" --models gemini:<model> groq:<model> --tagger gemini:<model>
```
