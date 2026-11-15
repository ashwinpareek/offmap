# Offmap

Ask any AI for a startup idea and you get the same handful of answers. Offmap measures
that sameness, then goes past it one layer at a time.

**Status: experiment stage.** The measurement pipeline works and has been run on one
prompt. There is no web app yet and no human ratings yet.

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

## Run it

```
pip install requests pytest
export GEMINI_API_KEY=... GROQ_API_KEY=...
python -m pytest tests
python -m pipeline.run models
python -m pipeline.run baseline --topic "university students" --models gemini:<model> groq:<model> --tagger gemini:<model>
python -m pipeline.peel --topic "university students" --models gemini:<model> groq:<model> --tagger gemini:<model>
```
