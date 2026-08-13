---
id: diagnostic
title: Cost diagnostic
icon: troubleshoot
order: 80
routes: [diagnostic]
---

What your sessions cost, and what deserves an action. The diagnostic re-reads the transcripts in `~/.claude/projects` — it never writes anything. The period chosen at the top of the page applies to the whole screen, thresholds included: the percentiles are recomputed on it.

The **Usage & costs** module answers “how much, and where?”; this one answers “is that abnormal, and what do I do about it?”. They read the same material with two different intents.

## The sections of the screen

**The summary** — period cost, sessions analysed, findings, and the number of _critical_ findings. A finding is critical when the session goes past **twice the threshold**, worth watching beyond 1.3 times. Severity is therefore computed on the distance to the threshold, never on a constant: a corpus that settles down sees its critical findings die out on their own.

**To do, in this order** — up to five actions, the ones worth the trouble. The grouping is by **rule, not by session**: an expensive session is not an action, “long sessions re-read their history” is one, and it covers every session it concerns at once. The order comes from the **cumulative impact, not the severity** — a critical rule on two sessions ranks behind a minor rule on fifty, because the sum is what decides what you do on Monday.

**How you work** — your sessions of at least ten turns that produced a change, split into quarters by their edits per hour, then the top quarter compared with the bottom one. This throughput measures an **activity, not a value**: a session that hunts a bug for two hours and fixes it in one line sits at the very bottom, and it worked well. Below 32 sessions kept, two quarters are only two handfuls and the table abstains.

**Pace** — spending seen through time rather than through sessions. The five-hour window is the one a usage limit counts: it knows nothing about sessions, and two sessions run at once fill it twice as fast. Windows are measured at every API response, so they overlap: the peak is not a day but a moment. Concurrent sessions are counted by overlapping bounds — a session left open without being touched counts as open, because that is what it was.

**The detail** — one entry per rule. Each states whether its figure is **measured** (read from the transcript) or **estimated**, with the basis of the calculation: without it, an amount is only an assertion. The heaviest cases are clickable and open the session replay.

**What this report doesn't know** — the blind spots of _your_ period: uncalibrated thresholds, models with no known rate, share of the window actually attributed. A report that hides its blind spots reads like a quote.

## One threshold, two halves

A signal fires past `max(P90 of your corpus, a guardrail)` — and below `min(P10, a ceiling)` for the two inverted signals described further down. The two halves answer two different failures.

The **percentile** says “unusual _here_”. A constant will never know that: 78% cache is excellent on a corpus at 60%, mediocre on a corpus at 99%. It is recomputed at every report, over the chosen period.

The **guardrail** says “and big enough to be worth an action”. Without it, a percentile always names 10% of the corpus, including when everything is fine: we would accuse the least virtuous session of a spotless corpus.

The property that makes the whole thing safe: **a guardrail can only silence.** Taken on the side that demands more — `max` when higher is worse, `min` when it is the other way round — hardening it removes findings and never creates any. At worst it hides a real but minor problem; it never invents one.

Two signals are inverted — **Turns per prompt** and **Cache rate** — because lower is worse there. Their threshold is a P10 and their guardrail a ceiling, taken as `min`. The consequence to keep in mind before touching them: on an inverted signal, **a guardrail set above the percentile has no effect whatsoever, whatever the corpus**. To silence, it has to go below.

## Reading a row of the threshold table

- **Sessions** — those that _carry_ the signal, not the whole corpus. A session without compaction does not have zero compaction waste: it is out of scope, and counting it would drag every percentile towards zero.
- **Median** — that of the sessions carrying the signal, not of the corpus. The gap between it and the threshold says how spread out the distribution is.
- **Decided by** — `your corpus` means the percentile won. `guardrail` means the opposite, and therefore that **the corpus is healthy on that signal**: its worst decile does not reach what would be worth acting on. The tooltip gives the arbitration in figures — both candidates, what the floor silences, and where it comes from.
- **Cases** — the sessions past the threshold. When the corpus decides, it will always be ~10% **of the sessions carrying the signal**: a sort, not an anomaly detection.

Below 30 sessions carrying a signal, the percentile is set aside and the guardrail decides alone — the column says so. The findings stay plausible, they are not calibrated.

## Recalibrating the guardrails

Percentiles recompute themselves; **guardrails do not**. They are the only values written by hand, in `server/diagnostics/thresholds.ts`, and the date of their last review appears under the table, next to the number of sessions in your corpus. A floor set a long time ago, facing a corpus that has grown a great deal since, deserves a second look.

How to go about it, signal by signal:

1. **Compare the floor with the percentile.** A floor far above the P90 makes the signal mute; far below, it no longer serves any purpose. Both are worth looking at — the second is benign, the first makes a whole seam disappear.
2. **Look at the orphans, not at the band.** The tooltip of the “Decided by” column gives both: the sessions between the percentile and the floor, then those among them **no other signal names**. Only the latter really disappear from the report; the others appear under another heading, and silencing them only deduplicates. The gap between the two figures is enormous — a floor can silence dozens of sessions of which only a handful, for a fraction of the amount, are genuinely lost.
3. **Decide on an order of magnitude, never on the current percentile.** Setting a floor on the current P90 would make it circular: it would do nothing but obey the data it is meant to arbitrate. A good floor can be told in one sentence — “a whole standard window”, “half the total-cost floor” — and that is what its `guardBasis` must say.
4. **Update `GUARDS_REVIEWED`** in the same file: the date of the review. That is what the page shows, so one knows whether a floor was weighed recently or inherited from another time.

The floor follows the **legitimacy** of the spending, which explains why two signals with the same unit carry very different values. A tool is meant to consume context, that is its job: its floor is high, at a whole window. Re-reading a file already read, or loading a preamble before the first question, produces nothing: those floors are ten times lower.

## When a threshold is not enough

A signal expressed as a **ratio** ignores the magnitude, and will happily name a two-hundred-token session whose shape is bad and whose stakes are nil. No guardrail fixes that — it judges the ratio, never the size of the session. It is a materiality filter to add to the signal itself, like the `MIN_MATERIAL_COST` of the cache rate. The symptom is recognisable: many cases whose cumulative cost is negligible.

## What these numbers are not

The dollars come from API rates; a flat-fee plan does not bill that way. The tokens attributed to a category — tools, preamble, re-reads — are **estimates** (`chars/4`), not billed counters. The “What this report doesn't know” section, at the bottom of the page, lists the reservations that apply to your period.
