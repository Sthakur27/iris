# Failure modes

The user of Iris is a software engineer with **no optometry background**, working alone at
home with no clinician watching. Almost every way this goes wrong is silent: the app keeps
producing plausible numbers while the actual therapy is worthless or harmful.

This file is the durable checklist. Every countermeasure below is either implemented, assigned,
or explicitly deferred. Keep it updated as the build proceeds.

Legend: **[core]** owned by the project manager · **[ui]** setup/home/session/results ·
**[proc]** the procedure implementations · **[defer]** acknowledged, not yet built

---

## 1. Setup and calibration

These corrupt every downstream number, and the user cannot possibly notice.

| # | Failure | Why it's silent | Countermeasure |
|---|---------|-----------------|----------------|
| 1.1 | Red filter is over the other eye than configured | Convergence and divergence swap. The user diligently trains the exact opposite of what was prescribed. | Forced eye-check in setup: close your left eye, click the square that vanishes. Re-verify on every session start, one click. **[ui]** |
| 1.2 | Screen scale miscalibrated (card slider misjudged) | Every prism dioptre value is wrong by the same factor, so nothing looks anomalous. | Card-match calibration; re-prompt if `pxPerCm` falls outside a sane 20–120 range. **[ui]** |
| 1.3 | Browser zoom is not 100% | CSS pixels stop matching the calibrated physical size. Demand silently scales. | Detect via `devicePixelRatio` / `visualViewport.scale` and block the session until it's 100%. **[core]** |
| 1.4 | Viewing distance not what was entered | Demand in Δ is inversely proportional to distance. | Ask at setup, re-confirm at each session start, and state the number on the stage HUD so it stays salient. **[ui]** |
| 1.5 | Sitting at a different distance than was calibrated | Demand is `100 x separation / distance`, so distance scales it silently in both directions. **Sitting back** makes every rep easier than the reported figure — the direction that flatters. **Leaning in** makes it harder, so the app under-reports what was done. Earlier versions of this file and the setup copy claimed the reverse; the geometry says otherwise. | Distance shown persistently; explicit warning in onboarding. Webcam distance estimation **[defer]**. |
| 1.6 | Dirty, scratched, or wrong-tint anaglyph glasses | Channel leak means both eyes see both images, so nothing is actually being separated. | Ghosting check in the pre-session checklist: "close one eye — can you still faintly see the other colour?" **[ui]** |
| 1.7 | Red/cyan glasses used where red/blue is expected | Partial leak; fusion is unreliable and blamed on the user. | Covered by 1.6's ghosting check. |
| 1.8 | Room too bright | Washes out the anaglyph separation. | Pre-session checklist item. **[ui]** |
| 1.9 | Wrong flipper level held, or flipper held backwards | The whole accommodative rock is training the wrong power. HTS's own manual warns about flipper orientation. | Large persistent "hold level N, number facing you" cue on the stage. **[proc]** |
| 1.10 | Wearing / not wearing habitual correction inconsistently | Sessions become mutually incomparable. | Recorded once in settings; surfaced on the results screen as a comparability caveat. **[ui]** |

## 2. During the exercise

| # | Failure | Why it's silent | Countermeasure |
|---|---------|-----------------|----------------|
| 2.1 | **Guessing to protect a score** | Four-alternative forced choice floors at 25%. A guesser produces a full dataset that looks like effort. | Catch trials, accuracy tested against chance rather than a fixed pass mark, anticipation rejection under 250 ms, honest "I can't see it" key. No score, streak, or personal best displayed anywhere. **[core + proc]** — implemented in `src/core/integrity.ts` |
| 2.2 | **Suppression** — the brain switches one eye off | The user reports a single clear image and feels successful. They are not fusing at all, and this is the single most important thing to detect. | Periodic monocular probe: a mark rendered in one channel only, which the user must report. Repeated misses on one side means that eye is being suppressed → stop, reduce demand, flag it. **[proc]** |
| 2.3 | Closing one eye / peeking | Defeats the exercise entirely. | A true random-dot stereogram is self-verifying — the target is *invisible* monocularly, so this fails immediately. Only the flat-fusion fallback is cheatable; flag that in its UI copy. **[proc]** |
| 2.4 | Head turn or tilt to relieve the demand | Reduces effective vergence demand invisibly. | Onboarding warning; webcam head-pose check **[defer]**. |
| 2.5 | Missing the FLIP cue in Accommodative Rock | The physical lens flip *is* the exercise. Without it the rep trains nothing. | Unmissable full-width flip cue on every colour change. **[proc]** |
| 2.6 | Tabbing away mid-procedure while the clock runs | Produces a "completed" session that never happened. | Pause the session clock on `visibilitychange` and resume on return. **[core]** |
| 2.7 | Skipping rest intervals | Destroys the distributed-practice benefit, which is one of the few well-supported effects we have. | Rest screens have no skip button and no interaction until the timer expires. **[core + ui]** |
| 2.8 | Grinding at a demand far above threshold | Feels like hard work, produces no learning, and builds frustration. | `IntegrityMonitor.recommendation()` forces the demand down whenever responses are at chance. **[core]** |
| 2.9 | Pushing through headache, nausea, or persistent double vision | The user assumes discomfort means it's working. | Post-session symptom check-in; specific escalation copy on any of these. **[ui]** |
| 2.10 | Overtraining — "more must be better" | Fatigue degrades both performance and learning. | Within-session fatigue monitor forces breaks; hard cap of two sessions per day with an explanation rather than a silent block. **[core + ui]** |
| 2.11 | Training while exhausted, late at night | Poor consolidation; noisy data blamed on the therapy. | Session timestamps recorded; results screen notes when sessions cluster late. **[defer]** |

## 3. Interpreting results

| # | Failure | Countermeasure |
|---|---------|----------------|
| 3.1 | Reading day-to-day noise as progress or regression | Never present a single session as a trend. Show a rolling window and state the spread. **[ui]** |
| 3.2 | Comparing sessions recorded under different calibration | Stamp each session with its calibration; mark cross-calibration comparisons as not comparable. **[ui]** |
| 3.3 | Treating the app as diagnostic | Plain statement that this is practice software, not a diagnosis, and that NPC / fusional ranges / CISS need a real exam. **[ui]** |
| 3.4 | Believing a browser measures things it cannot | Report reaction latency honestly as *keyboard response time*, never as vergence peak velocity. It is a proxy, and a noisy one. **[ui]** |
| 3.5 | Chasing the headline number instead of the skill | The headline metric is *highest demand sustained with trustworthy responses* — a number that guessing cannot inflate. **[ui]** |

## 4. Safety

Brief and factual — this informs product warnings, it is not medical advice.

- **Strabismus and second-degree fusion targets.** HTS's own Jump Ductions manual warns that a
  strabismic patient without normal retinal correspondence can, rarely, be pushed toward
  intractable diplopia by flat-fusion targets. The flat-fusion fallback must carry that warning
  and point at an optometrist rather than presenting itself as a free downgrade. **[proc + ui]**
- **Stop-and-see-someone signals:** sudden or persistent double vision, double vision that
  persists after the session ends, headache that recurs with each session, nausea, or performance
  that goes backwards over several weeks. All of these should produce an explicit
  "stop and book an eye exam" message, not a suggestion to lower the level. **[ui]**
- **This app does not know the user's diagnosis.** All prescribed values — flipper ladder,
  convergence and divergence goals — are editable and default to HTS's published values, which are
  *not* a prescription. Say so where they are edited. **[ui]**

## 5. Deferred, with reasons

- **Webcam head-distance and head-pose tracking** (covers 1.5 and 2.4). Highest-value deferred
  item; needs a face-landmark model and a calibration step of its own.
- **Late-session detection** (2.11). Cheap, but needs several weeks of data before it says anything.
- **Objective vergence measurement.** A browser cannot measure eye position. Anything claiming
  fusional range or NPC from keyboard data would be fabricated precision — see 3.4.
