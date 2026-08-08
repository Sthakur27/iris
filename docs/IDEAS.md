# Iris — Ideas

How we beat HTS2. Written for a single adult user with convergence insufficiency and
accommodative dysfunction, a laptop, a webcam, red/blue anaglyph glasses, and a set of
monocular flippers (±0.75 to ±5.00 D).

---

## 1. The core thesis

**HTS measures the wrong variable, and never verifies that the stimulus it thinks it is
delivering actually arrived.**

CI is not primarily an accuracy deficit. Patients with CI can usually fuse a 20Δ base-out
demand *eventually*; what is broken is the phasic system — the fast, reflexive pulse that
gets the eyes there. Slowed phasic convergence is the measured signature of the disorder,
and tonic adaptation is downstream of phasic output. HTS scores percent-correct and
cycles-per-minute. Percent-correct at a fixed demand is nearly blind to latency: a rep that
fused in 300 ms and a rep that fused in 4 s score identically. We have twenty years of
therapy software optimising a number that is roughly orthogonal to the pathology. That is
the first line of attack: **time-to-fusion is the primary outcome, on every rep, from day
one.** It costs two timestamps.

The second line of attack is **verification by construction.** HTS's vergence task is a
4-alternative forced choice (target above/below/left/right of centre). Chance is 25%, so a
quarter of every "correct" count is noise, and the 80% mastery gate is really a 73% gate.
Worse, nothing in the system can tell whether the user turned their head, leaned back
(which *reduces* the delivered Δ, since demand is 100·d/D), squinted a pinhole through the
flipper, or suppressed one eye outright and guessed. A therapist catches all of this with
their eyes and their voice within seconds. A 2019 keyboard app catches none of it. This is
the most plausible mechanistic explanation for why CITT found home computer therapy no
better than pencil push-ups: unsupervised, unverified, off-threshold practice is not
practice. Our design rule is that **every response must be impossible to produce without
performing the intended oculomotor act**, and where the screen cannot enforce that, the
webcam flags it.

Everything below follows from those two, plus three smaller structural weaknesses: HTS
trains only *step* demands (never ramp, never sustained hold, so it never trains tonic
adaptation or measures a break/recovery point); it uses fixed doctor-assigned ladders that
leave a competent user practising at 95% correct, which is not training; and it packs all
of it into one massed 25-minute block, against everything known about distributed practice
and retention.

---

## 2. Exercise and mechanic ideas

### 2.1 Rebuilding the vergence core

**Two-key fusion protocol** — SPACE the instant the target pops into depth, then an arrow /
digit to identify it. Two timestamps per rep: fusion latency and decision time.
*vs HTS:* separates the oculomotor event from the perceptual-decision-and-motor event, which
HTS conflates into a single keypress. A space press followed by a wrong identification does
not count as fusion, so it cannot be gamed.
*Cost:* S

**Cyclopean digits instead of 4AFC position** — the popped-out region spells a digit or a
Landolt gap in one of 8 orientations, not "which quadrant".
*vs HTS:* drops guess rate from 25% to 10–12%, which materially improves every accuracy
number downstream and makes an 80% criterion mean what it says. Also monocularly
uninformative by construction — there is nothing there without fusion.
*Cost:* S

**Three demand regimes as separate trainable modes** — *step* (unpredictable jump, scored on
latency), *ramp* (disparity creeps until fusion breaks, then reverses until it recovers),
*hold* (fuse at X Δ and stay fused for 20–60 s).
*vs HTS:* HTS only does step. Ramp yields an actual break point and recovery point — the
numbers a clinician gets with a prism bar — every session instead of never. Hold is the only
way to train tonic adaptation, which is where durable symptom relief comes from, and HTS's
momentary self-paced reps cannot touch it.
*Cost:* M

**Continuous verification probes during hold** — while holding fusion, digits appear inside
the fused target every 2–4 s and must be reported.
*vs HTS:* proves fusion was maintained *continuously*, not just at the two instants a
keypress happened. Time-to-first-break and number-of-breaks become measurable.
*Cost:* M

**Suppression probes** — every 10–20 s, a small element rendered to one eye only appears at a
random location; the user reports it. Per-eye miss rate becomes a **suppression index**.
*vs HTS:* this is the therapist asking "can you still see the red one?", automated and
logged. HTS has flat-fusion fallbacks for users who cannot fuse, but no ongoing suppression
monitoring at all — so a user can suppress their way through a whole programme.
*Cost:* S/M

**Dichoptic contrast balancing** — when the suppression index rises, attenuate contrast in
the dominant eye until the probe is seen again. The contrast offset required is itself a
graded measure of suppression depth.
*vs HTS:* turns a binary "are you suppressing" into a continuous, trendable quantity, and
gives the exercise a way to keep working rather than silently failing.
*Cost:* M

**Peripheral fusion lock** — a high-contrast binocular frame/vernier surround around every
stereo field, visible identically to both eyes.
*vs HTS:* standard in clinical stereo targets, cheap to add, anchors fusion and suppresses
the rivalry that makes random-dot fields drift apart. Removes a class of false failures.
*Cost:* S

**Per-display anaglyph calibration wizard** — null the ghost (adjust channel mixing until the
"wrong eye" image disappears), then photometrically match the two eyes' brightness, then
render through a Dubois-style anaglyph matrix rather than a naive channel split.
*vs HTS:* HTS uses fixed colours. Every laptop panel and every pair of cheap glasses has
different spectral leakage, and the blue channel is dramatically dimmer than red — a
luminance imbalance that actively *induces* suppression of the blue eye. This is a real,
unaddressed source of both discomfort and bogus scores.
*Cost:* S/M

**Signed-depth reporting** — sometimes ask "in front or behind?" rather than "where?".
*vs HTS:* forces the user to extract disparity *sign*, which is what distinguishes real
stereopsis from a monocular position cue leaking through ghosting.
*Cost:* S

### 2.2 Using the webcam

All of this runs in-browser (MediaPipe FaceMesh / FaceLandmarker class). Frames never leave
the machine and are never stored unless the user opts into a debug clip.

**Closed-loop demand (distance servo)** — estimate viewing distance continuously from
interpupillary distance in pixels, and adjust on-screen disparity in real time so the
*delivered* Δ equals the prescribed Δ.
*vs HTS:* HTS assumes a viewing distance it cannot see. Since demand = 100·d/D, leaning back
20 cm silently cuts a 20Δ demand to 13Δ — the single easiest way to cheat a vergence task,
and the app never knows. We deliver the prescription instead of hoping.
*Cost:* M

**Head-yaw and lean flags** — pause with a spoken cue when yaw exceeds ~8° or distance drifts
out of band.
*vs HTS:* head turn converts a vergence task into a version task. Currently free to do and
invisible.
*Cost:* S (given the landmark pipeline)

**Squint detection (eye aspect ratio)** — flag narrowed lid aperture, especially during
accommodative rock.
*vs HTS:* squinting creates a pinhole that extends depth of field and lets you read a Landolt
C through a −4.00 D flipper *without accommodating at all*. This defeats the entire rock
procedure and HTS is completely blind to it. Probably the highest-value single webcam signal.
*Cost:* S/M

**Pupil-constriction check on minus lenses** — normalise pupil diameter by iris diameter
(the iris is a stable ~11.7 mm ruler) and look for constriction when a minus flipper goes up.
*vs HTS:* the near triad means genuine accommodative effort is accompanied by miosis. This is
an objective, if noisy, proxy for "did you actually accommodate" versus "did you guess".
*Caveat:* lighting- and screen-luminance-dependent; only valid if screen brightness is held
fixed during the block, and only useful as a within-block relative signal. **Experimental —
report as a flag, never as a dioptric measurement.**
*Cost:* M

**Blink and face-presence logging** — blink rate per block, and fraction of the rep with a
face detected at all.
*vs HTS:* blink suppression during effortful fusion is a decent within-session strain proxy,
and face-absence is how you find out that 90 seconds of "therapy" happened with nobody in
the chair. Weak alone, useful as a trend and as a data-quality gate.
*Cost:* S

**Rest verification** — during the enforced look-away interval, confirm the user actually
looked away (face turned or absent). Gentle, not punitive.
*vs HTS:* HTS has no rests to verify.
*Cost:* S

### 2.3 Using audio

**Voice coaching** — spoken instructions and pacing ("hold… hold… now flip"), Web Speech
synthesis or prerecorded clips.
*vs HTS:* HTS puts instructions on screen, which forces the user to break fusion to read
them. A therapist's instructions arrive by ear precisely so the eyes can stay on target.
*Cost:* S

**Spoken perceptual report** — keyword spotting for "single" / "double" / "blurry" during
holds and ramps.
*vs HTS:* this is the running dialogue a therapist maintains, and it is the only way to get
diplopia and blur *onset* points rather than just pass/fail. HTS collects zero subjective
data.
*Cost:* M (Web Speech recognition is fussy; a 3-key fallback is fine)

**Metronome-locked accommodative rock** — beats drive the flip; cycles/min becomes an
*input* under staircase control rather than only an output.
*vs HTS:* HTS measures cpm as a result of self-pacing, which conflates "how fast can you
clear" with "how fast do you feel like going today". Driving the tempo makes facility a
proper threshold measurement.
*Cost:* S

**Audio-cued saccades** — stereo-panned click cues the next target location before it is
visible.
*vs HTS:* HTS saccades are purely visually guided. Auditory- and memory-guided saccades are
a distinct, harder, more transferable class, and panning is free.
*Cost:* S

### 2.4 Leaving the screen plane

The screen decouples vergence from accommodation — disparity changes while the accommodative
target stays at 40 cm forever. That is exactly the coupling CI patients need retrained.

**Hart-chart far–near rock** — print two letter charts at home; one taped near the laptop,
one on a wall 3–6 m away. The app calls the rhythm, holds the answer key, takes spoken or
typed answers, and scores it.
*vs HTS:* HTS physically cannot do this. It is the standard accommodative facility exercise,
it uses real accommodative distance rather than lens-simulated distance, and implementation
is little more than a timer plus an answer key. Best value-to-effort ratio in the document.
*Requires:* a sheet of printer paper.
*Cost:* S

**Brock string module** — app calls out bead order and dwell times; webcam confirms the head
is steady and the user is present; user reports which bead is single and the string-crossing
percept.
*vs HTS:* true real-space vergence across multiple distances with correct accommodative
coupling, plus built-in physiological-diplopia feedback that anaglyph tasks cannot give.
*Requires:* string and three beads (a few dollars — **cheap hardware the user does not
currently own**).
*Cost:* S

**Physiological diplopia training** — tasks where the *correct answer is "I see two."*
*vs HTS:* HTS only ever rewards singleness, which trains the user to ignore doubling. Being
able to notice diplopia is the feedback channel the whole therapy depends on.
*Cost:* S

### 2.5 Making the target worth looking at

**Depth-plane reading** — render arbitrary text (an article, a book chapter, an RSS feed, a
PR diff) as a red/blue dichoptic pair at a prescribed disparity, and read it there.
*vs HTS:* converts a sustained-hold block from a chore into content consumption, and it is
the most transferable possible task since reading at near *is* the symptomatic activity.
Sustained hold gets its duration for free because you want to finish the paragraph.
*Note:* pair with periodic suppression probes so it stays verified; it is not a substitute
for threshold work.
*Cost:* M

**Foveation-verified pursuits** — the pursuit target carries a symbol that changes every
~800 ms and is too small to resolve peripherally; report the symbols.
*vs HTS:* HTS pursuits are "follow the dot", scored on nothing at all — there is no way to
fail. Making legibility contingent on foveation turns an unscored filler exercise into a
measured one, without any eye tracking.
*Cost:* S/M

**Combined vergence + accommodative load** — hold a base-out demand *while* running the
flipper rock.
*vs HTS:* HTS keeps the two subsystems in separate 7-minute silos. Combined loading is what
office therapy escalates to and is where the transfer to real-world symptoms lives.
*Safety:* advanced tier only, gated behind stable performance on each alone, and hard-stopped
on any symptom report.
*Cost:* M

**Number-naming saccade sprints** — a printed or on-screen grid of digits read aloud
line-by-line against the clock, with per-line timing.
*vs HTS:* gives a repeatable saccadic-efficiency number in seconds rather than an unscored
3-minute block. Use a generically generated grid, **not** the King-Devick cards (proprietary
instrument).
*Cost:* S

**Anti-saccades** — flash on one side, look to the *opposite* side; verified by a target that
only appears there briefly.
*vs HTS:* trains inhibitory control, is genuinely engaging, and is a different capacity from
the pro-saccades HTS drills.
*Cost:* S/M

---

## 3. Adaptive difficulty and progression

**Per-rep staircase, not a fixed ladder** — 3-down-1-up on demand, converging on the ~79%
correct point.
*vs HTS:* HTS assigns a level and you sit there. Every session then produces a *threshold in
Δ* rather than a percentage at an arbitrary demand — a real number that can go up.
*Cost:* S/M

**Latency-anchored threshold** — a second staircase that tracks the demand at which median
time-to-fusion equals 1.0 s, rather than the demand at which accuracy hits 79%.
*vs HTS:* directly targets the phasic deficit. Expect it to move earlier and more sensitively
than the accuracy threshold, because eventual fusion is preserved in CI long after speed is.
*Cost:* M

**Enforced success band (70–85%)** — if rolling accuracy exceeds the band, escalate demand
mid-block automatically; if it drops below, back off.
*vs HTS:* a user cruising at 95% correct is being entertained, not treated. This is a direct
attack on the most likely reason home therapy underperformed in CITT.
*Cost:* S

**Readiness warm-up and autoregulation** — 60 s at a fixed reference demand at the start of
every session; compare today's median latency to the 30-day baseline and set today's working
demand ±1 rung accordingly.
*vs HTS:* HTS's plan is identical whether you slept 4 hours or 9. This is velocity-based
training borrowed from strength sport, and it will read instantly to a software engineer.
*Cost:* S/M

**Five independent capacity tracks** — convergence step latency, convergence sustained-hold
duration, divergence range, accommodative facility (cpm at criterion), suppression index.
Each with its own staircase and its own graph.
*vs HTS:* one star track collapses five different capacities into one ordinal ladder, so you
cannot see that your divergence is fine and your hold duration is the problem.
*Cost:* M

**Screen-ceiling honesty** — `maxDemandPd()` already exists; use it to cap the staircase and,
when the ceiling is hit, tell the user what to change (move closer, larger display, switch to
real-space Brock/Hart work).
*vs HTS:* a 35Δ goal is geometrically unreachable on a 13" laptop at 40 cm. HTS will happily
let you fail at it forever without ever saying why.
*Cost:* S (mostly already built)

**Mastery without ceremony** — a level is "owned" when the rolling 7-day threshold has
exceeded it on 3 separate sessions. No stars, no gate to click through.
*vs HTS:* star gates are a clinician-assignment artifact; with no clinician in the loop they
are pure friction.
*Cost:* S

**Scheduled deload weeks** — every 4th week, cut volume ~50% and hold demand at 80% of
threshold.
*vs HTS:* HTS has one protocol forever. Deloads let tonic adaptation consolidate and
reliably rescue plateaus in every other motor domain.
*Cost:* S

**Fortnightly assessment mode** — a separate, non-adaptive, non-gamified run: ramp to
break/recovery in both directions, fixed-demand latency block, facility at fixed tempo,
suppression probe battery. Never modified by the training staircases.
*vs HTS:* keeps a clean measurement baseline that training-mode adaptation cannot corrupt.
Nothing in HTS is a measurement rather than an exercise.
*Cost:* M

---

## 4. Rest, pacing and session design

**Distributed practice: 3 × 8 min, not 1 × 25 min** — same daily volume, three scheduled
slots.
*vs HTS:* HTS's Daily Therapy Protocol is a massed 25-minute block. Distributed practice
beats massed for motor retention, and three 8-minute slots are far easier to actually do.
*Cost:* S for the plan, M for the scheduling/notification layer.

**Interleaved micro-blocks** — instead of 7 min divergence then 7 min convergence, rotate
60–90 s micro-blocks across procedures within a session.
*vs HTS:* blocked practice looks better in-session and retains worse; random/interleaved
practice is the opposite. The runner already sequences steps, so this is close to free — the
best theory-to-effort ratio here.
*Cost:* S

**Purposeful rests** — the between-rep interval is a far-fixation exercise (divergence toward
tonic rest position) with a small attention task: count how many times the distant target
changes.
*vs HTS:* HTS has no rest structure at all, so reps run back-to-back into fatigue. A dead
timer gets skipped; a 20-second task with a number at the end gets done.
*Cost:* S

**Fatigue-triggered breaks** — already scaffolded in `FatigueMonitor`; extend the triggers to
include latency-tail inflation and a rising suppression-probe miss rate, not just accuracy
and mean latency.
*vs HTS:* HTS runs the clock regardless. Practising while decompensating trains
decompensation.
*Cost:* S

**Session shape** — warm-up → threshold work → volume work → cooldown far-fixation, announced
by voice so it feels like being coached rather than timed.
*Cost:* S

**Symptom hard-stop** — one-tap symptom report between blocks; headache, nausea or persistent
diplopia ends the session immediately and logs it.
*vs HTS:* asthenopia is the symptom we are treating; pushing through it is counterproductive
and possibly harmful.
*Cost:* S

**Build-wait therapy** — a git hook / CI webhook fires a 90-second vergence micro-block while
the test suite runs.
*vs HTS:* turns dead time the user already spends staring at a terminal into distributed
practice. See §6.
*Cost:* M

---

## 5. Measurement and post-session AI analysis

### 5.1 What to capture per rep

Rough shape of the record. The point is that everything downstream — staircases, coach notes,
escalation rules — is impossible without this being captured from the very first session.

```ts
interface Rep {
  t: number                       // stimulus onset, epoch ms
  procedure: ProcedureId
  mode: 'step' | 'ramp' | 'hold'
  demandPd: number                // signed: + = convergence
  fromDemandPd: number            // step magnitude and direction matter
  deliveredPd: number             // recomputed from measured viewing distance
  flipperD?: { left: number; right: number }
  eye?: EyeSide

  fusionLatencyMs: number | null  // SPACE press; null = never fused
  decisionMs: number              // SPACE -> identify
  correct: boolean
  nAlternatives: number           // so guess rate is recoverable later

  holdMs?: number                 // hold mode
  breaks?: number
  probeHits?: number
  probeMisses?: number
  suppressionProbe?: { eye: EyeSide; seen: boolean; latencyMs: number }

  cam?: {                         // per-rep aggregates, not frames
    distanceCmMean: number; distanceCmSd: number
    yawDeg: number; pitchDeg: number
    earMin: number                // squint
    blinks: number
    pupilIrisRatio: number | null
    faceSeenFraction: number
  }

  ctx: {
    repIndex: number; msIntoSession: number; msIntoBlock: number
    localHour: number
    screenNits?: number; ambientLux?: number
    calibration: Calibration      // never trust a stale calibration
  }
}
```

Plus per block: self-reported difficulty (RPE 1–10, one tap) and symptom flags
(none/blur/double/ache/headache). Plus weekly: a symptom questionnaire and one *functional*
number the user actually cares about — "minutes of comfortable reading before symptoms".

### 5.2 What is genuinely worth analysing

- **Latency distribution, not the mean.** Track median *and* p90. In CI the tail is the
  pathology; improvement typically shows up as the tail collapsing well before the median
  moves. A mean hides exactly the thing we care about.
- **Latency vs step magnitude slope.** Milliseconds of extra fusion time per extra Δ. A real
  dynamic parameter of the phasic system, and a single number that can be trended.
- **Convergence:divergence latency ratio.** CI should show a specific convergence
  disadvantage; watching that asymmetry normalise is the cleanest evidence of treatment
  effect available to us.
- **Within-session decay curve.** Fit latency and accuracy against time-in-session; the decay
  *rate* is an endurance measure and a treatment target in its own right. HTS averages this
  away into one number.
- **Recovery across rests.** How much performance rebounds after a 20-second look-away — a
  distinct capacity from raw threshold.
- **Break/recovery hysteresis** from ramp mode. The gap between where fusion breaks and where
  it recovers is clinically meaningful and gets measured every fortnight.
- **Suppression index per eye over weeks.**
- **Delivered vs prescribed Δ.** If the median delivered demand was 14Δ when the prescription
  said 20Δ, every other number this session is suspect. Report it before anything else.
- **Change-point detection over linear trendlines.** "Something changed 9 days ago" is
  actionable; a regression slope over noisy n=1 data is not. Plateau detection should trigger
  a program change, not a congratulation.

### 5.3 What is astrology — do not ship it

- Vergence angle in degrees or Δ inferred from a 720p webcam. Landmark jitter is larger than
  the entire clinical range. We can detect gross eye movement; we cannot measure alignment.
- Accommodative amplitude in dioptres from pupil size. Direction of change, maybe. A number,
  no.
- Stereoacuity in arcseconds from an uncalibrated laptop panel. Disparity resolution is
  floored by pixel pitch; if we report it at all, report the floor alongside it.
- Any day-to-day comparison. Day-to-day variance on these measures is enormous; nothing under
  a 5-session rolling window should be shown as a trend.
- Composite "eye health scores out of 100" that add together Δ, ms and percentages.
- Correlations with weather, moon phase, or inferred HRV.
- p-values on n=1 self-selected data.

### 5.4 What the AI should actually do

**Architecture rule: statistics are computed in code; the model narrates and prioritises.**
The LLM receives a structured summary (thresholds, latency quantiles, deltas vs baseline,
flags fired, adherence) — never raw reps — and returns a constrained object: three sentences,
one thing that improved, one thing to change tomorrow chosen from a fixed menu of program
adjustments. No free-form protocol invention. This keeps the analysis reproducible and keeps
the model out of the position of doing arithmetic it is bad at.

**Post-session note (M).** What a good coach would say: name the single number that moved,
attribute it if the data supports attribution ("your p90 fusion latency dropped 400 ms; your
median didn't move, which is the normal order"), name one thing that was off ("you were
27 cm from the screen for the last third — the demand you actually got was 26Δ, not 20"), and
give tomorrow's one adjustment. Never more than one adjustment.

**Weekly review (M).** What improved, what plateaued, whether adherence explains it, and one
program change. Includes the delivered-vs-prescribed audit and the data-quality gate
(face-seen fraction, calibration staleness).

**Anomaly explanation (S).** "Today was 40% worse than baseline; it was also your third
session after 22:00 this week." Correlational, stated as correlational.

**Escalation rules — hardcoded, not LLM-judged (S).** The model may phrase these; it may
never decide them:

- new or worsening headache, nausea, or dizziness during or after sessions
- diplopia that persists after the session ends or that appears at distance
- any transient vision loss, flashes, floaters, or new-onset visible eye turn
- a monotonic decline in threshold over ≥3 weeks despite good adherence
- no meaningful improvement after 8–12 weeks of adherent therapy
- a sudden new asymmetry between eyes

Any of these produces a plain-language "book an appointment" card with the specific numbers
attached, and the app says plainly and permanently that it is not a medical device and that a
baseline and follow-up exam belong in the plan regardless.

**Clinician export (S).** A one-page markdown/PDF with the actual numbers — break/recovery
points, latency quantiles, facility, suppression index, adherence. HTS generates reports for
a doctor who already has the account; here the user should walk into the appointment with
better data than the exam will generate.

---

## 6. Motivation and adherence

The user is a software engineer doing this alone. Every idea here is shaped by that.

**Build-wait micro-sessions** — a git post-commit hook or CI webhook pings a local endpoint;
the pinned tab lights up with a 90-second block while the suite runs.
*vs HTS:* HTS requires you to decide to open HTS. This requires no decision at all, and it is
distributed practice by construction. Probably the highest-leverage adherence idea available.
*Cost:* M

**Therapy as a repo** — sessions written as JSON and auto-committed to a local git repo.
Adherence is a contribution graph; `git log` is your history.
*vs HTS:* the streak mechanic reskinned into something this user already has a strong
relationship with, at nearly zero implementation cost, and it makes the data portable.
*Cost:* S

**`iris status` in the shell prompt / MOTD** — today's remaining blocks and current
threshold, in the terminal.
*Cost:* S

**Forgivable streaks** — the headline metric is 7-day adherence percentage, not consecutive
days; two-a-days earn freeze tokens.
*vs HTS:* a broken consecutive-day streak is the single most reliable quit trigger in
consumer health apps. Never build a mechanic whose failure mode is quitting.
*Cost:* S

**The threshold graph is the hero, not the streak** — one big chart of convergence latency
threshold over weeks on the home screen.
*vs HTS:* HTS shows percent-correct, which saturates and then stops being motivating. A
threshold keeps moving.
*Cost:* S

**Calibration game** — before each session, predict your threshold; score your prediction
accuracy over time (Brier-ish).
*vs HTS:* forces genuine engagement with the metric rather than passive consumption, and
prediction-scoring is unusually sticky for this particular audience.
*Cost:* S

**Fortnightly "bench run"** — the assessment session framed explicitly as a benchmark, with a
run number and a diff against last time.
*Cost:* S (rides on §3's assessment mode)

**Reading and content as the therapy vehicle** — see §2.5. The session stops being a tax.
*Cost:* M

**Track the outcome that matters** — weekly: "how many hours could you code before your eyes
ached?" Plot that next to the threshold.
*vs HTS:* symptom relief is the actual goal; Δ is a surrogate. Seeing the surrogate and the
outcome move together is what sustains a 12-week programme.
*Cost:* S

**Notification discipline** — at most one nudge a day, timed to when the user has
historically actually completed sessions.
*Cost:* S

**Keep training and measurement separate** — assessment runs are never gamified, never
adaptive, never scored for streaks.
*vs HTS:* if the number you are optimising is also the number you are measuring by, the
measurement rots. This is a discipline, not a feature, but it is worth writing down.
*Cost:* S

---

## 7. Ideas we should reject

- **Webcam eye tracking that reports vergence angle.** Tempting and completely fake at
  laptop-webcam precision. Ship the gross flags (yaw, distance, squint, presence); never a
  number in degrees or Δ.
- **A daily "eye score out of 100."** Combines incomparable units, saturates, and hides the
  three numbers that actually moved.
- **VR / stereo headset modes, IR eye trackers, second monitors, a phoropter.** Hardware the
  user does not own. Mark and skip.
- **Any exercise solvable monocularly, presented as fusion training.** The default failure
  mode of anaglyph apps, and the most likely reason CITT's home arm underperformed.
- **Auto-escalating demand without a geometric ceiling check.** Chasing 35Δ on a 13" laptop is
  arithmetically impossible; `maxDemandPd()` must gate the staircase or the user grinds
  against a wall the software built.
- **"Push through the headache."** Asthenopia is the presenting symptom. Discomfort is a stop
  signal here, not a training signal.
- **Flicker, strobe, or fast-alternating full-field stimuli.** Photosensitive seizure risk for
  no therapeutic gain.
- **The app choosing flipper powers.** Flippers are prescribed. We may schedule, sequence and
  score prescribed powers; we may not invent them, and we should not let a staircase wander
  into powers that were never prescribed.
- **LLM-invented exercise protocols at runtime.** Non-reproducible, unvalidatable, and it
  destroys any longitudinal comparison. The model chooses from a fixed menu or it does not
  choose.
- **Any diagnostic claim.** "Your CI has resolved" is not something this app gets to say.
  Escalation rules point to an optometrist; they never replace one.
- **Eye yoga, palming, blue-light scores, Bates-method anything.** No evidence, and shipping
  them next to real work discredits the real work.
- **Cloud sync, accounts, multi-user, sharing.** One user, one laptop, local storage. Every
  hour spent here is an hour not spent on measurement.
- **Storing webcam frames.** All CV in-browser, frames discarded immediately, explicit opt-in
  for any debug capture.
- **Reproducing the King-Devick cards or the CISS verbatim.** Proprietary/validated
  instruments; generate equivalent generic material instead, and be clear that a
  self-administered symptom scale is a self-tracking tool, not a validated score.
- **Gamifying assessment runs.** Covered above; it is the fastest way to make our own data
  worthless.

---

## Recommended build order

After an HTS-parity v1 ships. Ordered by value-to-effort.

**Tier 1 — cheap, unlocks everything else**

1. **Two-key fusion protocol + full per-rep telemetry schema** (S). Nothing else in this
   document works without it, and it is two timestamps and a struct.
2. **Cyclopean digits / 8-way Landolt instead of 4AFC** (S). Halves the guess rate; improves
   every number retroactively.
3. **Anaglyph calibration wizard: ghost null, luminance match, Dubois matrix** (S/M).
   Eliminates a whole class of false failures and blue-eye suppression.
4. **Enforced success band + per-rep staircase** (S/M). Stops practising at 95% correct.
5. **Interleaved micro-blocks + purposeful rests** (S). Nearly free given the existing runner.
6. **Hart-chart far–near rock** (S, one sheet of paper). Real accommodative distance, which
   HTS structurally cannot offer.

**Tier 2 — the measurement product**

7. **Ramp mode + fortnightly assessment run** (M). Break/recovery points every two weeks.
8. **Sustained hold with continuous verification probes** (M). The tonic-adaptation trainer.
9. **Suppression probes and suppression index** (S/M).
10. **Latency-anchored threshold + readiness autoregulation** (S/M).
11. **Deterministic escalation rules + structured-stats coach note + clinician export** (M).

**Tier 3 — the differentiators**

12. **Webcam: squint and yaw flags first, then the distance servo** (M). Squint detection
    alone rescues the accommodative rock procedure.
13. **Build-wait micro-sessions + git-repo session log** (S/M). The adherence lever.
14. **Depth-plane reading** (M). The retention lever.
15. **Brock string module** (S, needs a few dollars of string and beads).

**Deferred / research**

Pupil-constriction accommodation proxy, dichoptic contrast balancing, spoken perceptual
report, anti-saccades, combined vergence+accommodative loading.
