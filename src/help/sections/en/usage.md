---
id: usage
title: Usage & costs
icon: insights
order: 75
routes: [usage]
---

What your sessions consumed: tokens, estimated cost, breakdown by model, by project and by sub-agent. **This page describes; the Diagnostic module judges and proposes actions.** The link to it sits at the top, because this is where an unusual amount gets noticed.

Nothing is written: everything is read back from the transcripts in `~/.claude/projects`.

## The period

`7 d`, `30 d`, `90 d` or `All`. It filters by **local calendar day**, bounds included, and applies to the whole screen.

## What “cost” means here

The banner says it and it should be taken at face value: the amount is computed at **API list rates**, model by model. A Pro or Max plan is billed at a flat fee — this figure says **what this usage would have cost at the API**, not what you paid.

Three points about the calculation:

- cost is computed **per cell (day, model)**, never with an average rate applied to aggregated tokens: a session mixes models, and a model's rate can change over time;
- cache rates are **derived** from the model's input rate — cache write at 1.25×, read at 0.1×;
- a model whose rate I do **not** have is never guessed from its family. Its tokens are counted, its cost is excluded, and the banner **names the models concerned**. A total that silently drops a spend would be worse than an incomplete total that says so.

## The tiles

| Tile           | What it counts                                            |
| -------------- | --------------------------------------------------------- |
| Estimated cost | Sum of the cells, at API rates                            |
| Sessions       | Distinct transcripts that produced at least one response  |
| Responses      | **Model calls**, deduplicated — not file lines            |
| Tokens ↓       | Input, **cache excluded**                                 |
| Tokens ↑       | Generated                                                 |
| Cache read     | Tokens read back from cache, billed at 10% of input price |

The **Responses** count deserves an explanation, because everything else rests on it. Claude Code writes **one transcript line per content block**: a single API response therefore repeats across several lines, with an `output_tokens` that grows as the stream goes. I fold those lines by message identifier and keep only **the largest value of each counter**. Counting lines would inflate every total; keeping only the first would understate them.

## Cost per day

Stacked bars: one stack per day, one segment per model. **A single axis** — every series is dollars, so the stack really totals the day's cost and the segments stay comparable.

A model's colour is a property **of the model, not of its rank**: it is assigned once, from the all-time ranking, and reused for every period. Without that, changing period would repaint the surviving series as soon as a model dropped out of the window. Past the palette, the remaining models share the neutral ink rather than a recycled hue.

The legend under the chart is HTML, reachable by keyboard and by a screen reader.

## Breakdown by model

A doughnut, and **a table beside it** saying the same thing. The table is not a repetition: it is the accessible version of the doughnut, and it gives the response count the doughnut cannot show. A model with no known rate shows `n/a` as its cost.

Identifiers are shortened on screen — `claude-haiku-4-5-20251001` becomes `haiku-4-5`.

## Costliest projects

The top ten, the bar being relative to the most expensive of them. The name shown is the last segment of the slug; the full slug is in the tooltip.

## Sub-agents

The section that has no equivalent anywhere else. A sub-agent's turns are written in **separate** files — `<session>/subagents/agent-*.jsonl`, together with a `.meta.json` naming the agent type. Anyone walking only the main transcripts **never sees those tokens**.

I read them, group them by agent type, and show at the top **the share of the total cost** they represent. That is the figure to look at before generalising a fan-out architecture.

## Performance and freshness

The walk is incremental: a transcript is immutable once its session is over, so a file whose size and date have not moved is **not read again** — only the files touched since the last call are rescanned. That is what makes the page usable on a corpus of more than a thousand files.

`Reload` runs that walk again. A **running** session appears with what it consumed up to its last response written to disk.
