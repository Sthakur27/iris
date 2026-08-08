# SidVision — Clinical and Motor-Learning Research Base

**Purpose.** This is the project's durable research memory: what the peer-reviewed evidence
actually says about computerised home vision therapy, written for an engineer with no optometry
background. Every substantive claim is cited inline. Where the evidence is weak, contested, or
absent, that is stated explicitly rather than papered over.

**Last substantive update:** 2026-08-08.

**How to read the evidence labels.** Throughout, claims are tagged:

- **[RCT]** — from a randomised controlled trial, usually the CITT family.
- **[HIGH]** / **[MOD]** / **[LOW]** — GRADE certainty rating where a systematic review assigned one.
- **[EXTRAP]** — general motor-learning, perceptual-learning or adjacent-field evidence being
  extrapolated to vergence/accommodation. Not tested on this system.
- **[CONVENTION]** — standard clinical practice with no controlled evidence behind the specific
  parameter. Copying it is defensible; claiming it is evidence-based is not.
- **[COMMERCIAL]** — from a vendor or vision-therapy practice website. Usable for describing what a
  procedure *is*; not usable as evidence that it works.

---

## 0. Ninety-second primer on the vocabulary

- **Vergence** — the eyes rotating in opposite directions. *Convergence* = inward (for near
  targets), *divergence* = outward. Demand is expressed in **prism dioptres (Δ)**: 1Δ deflects a
  ray 1 cm at 1 m. On an anaglyph display you create vergence demand by laterally displacing the
  red and blue images relative to each other.
- **Accommodation** — the crystalline lens changing power to focus. Demand is in **dioptres (D)**,
  the reciprocal of distance in metres. A screen at 40 cm poses a fixed 2.50 D demand; you can only
  *change* that demand with physical lenses, which is why HTS ships flipper lenses.
- **Phasic vs tonic vergence** — phasic is the fast, open-loop, pulse-driven response to a sudden
  disparity step; tonic is the slow adaptive component that holds a position. Convergence
  insufficiency (CI) patients show specifically slowed *phasic* convergence.
- **Suppression** — the brain ignoring one eye's image to avoid double vision. It defeats the whole
  point of binocular training, and detecting it is a core therapist job.
- **Fusional vergence ranges** — how much prism demand you can overcome before the image blurs
  (blur point), splits (break point), or recovers (recovery point). **PFV** = positive/convergent,
  **NFV** = negative/divergent.
- **NPC** — near point of convergence. How close a target can come before the eyes lose fusion,
  in cm. Normal ≈ ≤ 6 cm break.
- **CISS** — Convergence Insufficiency Symptom Survey, a 15-item questionnaire; higher = worse.
- **Facility** — how *fast* you can change state, in cycles per minute (cpm), as opposed to how
  *far* you can go (amplitude/range).

---

## 1. Why office-based therapy beat home computer therapy in CITT

### 1.1 The result, restated precisely

The CITT randomised 221 children (9–17) to four arms for 12 weeks
([Scheiman et al., *Arch Ophthalmol* 2008 / PMC2779032](https://pmc.ncbi.nlm.nih.gov/articles/PMC2779032/)):

| Arm | Contact | Home dose | CISS @12wk | NPC break | PFV break | "Successful or improved" |
|---|---|---|---|---|---|---|
| Office vergence/accommodative therapy + home reinforcement (OBVAT) | 60 min weekly with a therapist, 1:1 | 15 min/day × 5 days | **15.1** | **4.0 cm** | **30.5Δ** | **73%** |
| Home pencil push-ups (HBPP) | phone contact only | 15 min/day × 5 days | 24.7 | 7.8 cm | 18.9Δ | 43% |
| Home computer therapy + push-ups (HBCVAT+) — *the HTS category* | phone contact only | 15 min HTS + 5 min push-ups/day × 5 days | 21.3 | 6.8 cm | 23.0Δ | 33% |
| Office placebo therapy (OBPT) | 60 min weekly with a therapist | 15 min/day × 5 days | 21.9 | 10.3 cm | 17.8Δ | 35% |

The 2020 Cochrane **network meta-analysis** (737 children, 4 RCTs) confirmed this with formal
certainty ratings ([Scheiman et al., Cochrane / PMC8092638](https://pmc.ncbi.nlm.nih.gov/articles/PMC8092638/)):

- Office-based vs placebo: RR 3.04 (2.32–3.98) **[HIGH]**
- Office-based vs home computer therapy: RR 1.96 **[HIGH]**
- **Home-based therapies vs placebo: no significant difference [LOW]**

Two nuances that matter for product design:

1. **Home computer therapy is not inert on the *mechanical* measures.** Versus placebo it produced
   +2.93 cm NPC and +5.26Δ PFV. It simply did not convert that into symptom relief: on CISS it was
   *1.84 points worse* than placebo. Office-based produced +5.01 cm, +13.78Δ, and −6.79 CISS points.
   So the honest framing is: **HTS-style software moves the machinery a bit and the symptoms not at
   all.**
2. **CISS is heavily placebo-sensitive.** In the adult CINAPS trial, CISS fell −12.4 points with
   real therapy and −10.1 with placebo therapy (p = .56, not significant), while the objective
   composite success was 72% vs 32%
   ([Scheiman et al., *Optom Vis Sci* 2020 / PMC7744390](https://pmc.ncbi.nlm.nih.gov/articles/PMC7744390/)).
   Any product that reports its own success using a symptom questionnaire is measuring, in large
   part, its own attention and ritual.

### 1.2 What the trialists themselves said the difference was

The CITT authors attributed office superiority to three things
([PMC2779032](https://pmc.ncbi.nlm.nih.gov/articles/PMC2779032/)):

> "the greatest ability to control and manipulate stimulus parameters (e.g., vergence amplitude and
> accommodative demand)" · "the greatest ability to incorporate motor learning theory (e.g.,
> modeling and demonstration, transfer of training, patient feedback)" · "the weekly visits …
> permit the inclusion of a variety of procedures, which stress convergence and accommodative
> abilities not typically addressed in home therapy programs"

That is the abstract version. The concrete version is in the trial's own therapy manual, which is
public: [CITT-ART Manual of Procedures, Chapter 7 (OBVAT)](https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/2/74958/files/2019/04/CITT-ART_MOP_Chapter07-2ltr2n8.pdf).
It is the single most useful document for this project and everything in §1.3 comes from it.

### 1.3 What a therapist actually does, item by item — and whether software can copy it

Each item is flagged **REPLICABLE** (software can do this today), **PARTIAL** (a degraded but real
version is possible), or **NOT REPLICABLE** (needs a human or physical apparatus).

#### (a) Teaching internal attribution — "the change is in you, not in the instrument" — **REPLICABLE**

The manual is emphatic and spends more words on this than on any single procedure:

> "a participant may believe that these external items are the keys to their success… the key
> factor is to get the participant to take responsibility for creating internal change."

It even prescribes the wording. Instead of *"try and keep the picture single"* (framed around the
target), the therapist says the participant is *looking too far or too close in space* and must
*change where they are pointing their eyes*.

**Product opportunity.** This is pure copywriting and costs nothing. HTS's instructional text is
mechanical ("press the arrow key where the square pops out"). Every SidVision prompt should be
phrased as an internal action ("pull your eyes in", "get the feeling of looking far away"), never as
a property of the screen.

#### (b) Explicit feedback-cue training — **PARTIAL, and the biggest single gap**

The manual names eight feedback cues the patient is *taught to notice*: **diplopia, blur,
suppression, luster, kinesthetic awareness, SILO, float, localization.** Before any convergence
training begins, the therapist runs a "Level 2: Establishing Presence of Feedback Cues" step where
the patient must *report* blur onset, *report* the split into double, and *report* SILO (Small-In,
Large-Out — the target appears smaller and nearer as you converge).

HTS asks only "where is the square?" — a forced-choice discrimination. It never asks the patient
what they are experiencing, so the patient never learns to read their own visual system.

- SILO, float, blur and diplopia reports are **[REPLICABLE]** as prompted self-report between reps
  ("Did the target look smaller and closer, or larger and further away?"). Self-report is noisy but
  the *point of the question is pedagogic, not metrological.*
- Localization with a physical pointer is **[NOT REPLICABLE]** on screen — it depends on pointing a
  real object into the depth plane where the visual axes cross.
- Kinesthetic awareness is **[PARTIAL]** — you can ask for it verbally, you cannot verify it.

#### (c) Escalating rescue strategies instead of just lowering demand — **REPLICABLE**

The manual's rule when a patient is stuck is explicit: *help them over the obstacle rather than make
the task easier.* Its ordered ladder for a stuck convergence:

1. Verbal cue — "get the feeling of looking close and crossing your eyes."
2. Kinesthetic — touch the target you are trying to fuse.
3. Localization with a pointer / physiological-diplopia demonstration.
4. Binocular minus lenses to drive accommodative convergence.
5. **Only as a last resort**, reduce demand — and even then preferentially with lenses or prism
   rather than by moving targets together.

For divergence there is an equivalent ladder ending in plus lenses / base-out prism.

**Product opportunity.** HTS's staircase does step 5 immediately and silently on every error. A
failure in SidVision should trigger a *rescue sequence* — cue, then re-attempt, then re-attempt with
a hint, and only then a demand reduction. This is the single most mechanically copyable difference
between the two modalities.

#### (d) Procedure variety within a session — **REPLICABLE**

The protocol summary form instructs: *"At each therapy session select at least one therapy procedure
from each category. During a typical vision therapy session the participant will be asked to work on
4 to 5 different procedures."* Categories are gross convergence / vergence / accommodation (plus
concussion-related saccades and pursuits in the newer OBVAM variant).

HTS2's default 25-minute protocol has 5 activities but only *two* real training modes (a vergence
staircase and an accommodative flipper task) — pursuits and saccades are warm-ups. The office
protocol runs ~30 distinct procedures across four phases.

#### (e) Real space, depth, and body motion — **NOT REPLICABLE**

Brock string, 3-dot card, life-saver cards, aperture rule, eccentric circles, Hart charts at 3 m and
a swinging ball hung from the ceiling all put demand in *real physical space* with real
accommodative demand and real proprioceptive/parallax cues. The 2024 **OBVAM** protocol
(Office-Based Vergence/Accommodative *with Motion*) goes further and has patients walk 5–10 steps
forward and backward while making saccades between two pencils
([OBVAM Manual of Procedures 2024](https://research-dev.njit.edu/vision/sites/research.vision/files/OBVAM%20Manual%20of%20Procedures%202024%20Scheiman_0.pdf)).

A browser at a fixed viewing distance can produce disparity but cannot produce a real change in
accommodative demand or in vestibular/proprioceptive context. Note that the one VR feasibility study
found a flat 2D screen produced essentially no accommodative-facility change (+0.60 cpm, p = .53)
whereas a headset did (+4.67 cpm)
([Turnbull & Phillips-style feasibility study, PMC8362637](https://pmc.ncbi.nlm.nih.gov/articles/PMC8362637/)) —
n small, feasibility stage, treat as a hint not a finding.

#### (f) Loose lens and prism work — **NOT REPLICABLE without hardware**

Loose-lens accommodative rock, lens *sorting* (sorting unmarked lenses by strength — a pure
kinesthetic-awareness task), prism flippers (8Δ BO / 4Δ BI), Polaroid flippers that reverse
convergence/divergence on each flip. Some of these are cheap to ship as physical accessories, which
is exactly what HTS already does with its six flipper levels.

#### (g) Anti-suppression monitoring — **PARTIAL, and under-exploited**

Office procedures continuously check suppression: the R/L boxes on a vectogram must both stay
visible; the Polaroid bar reader endpoint is explicitly *"13 cycles per minute **without
suppression**"*. Anaglyph on a screen *can* carry monocular-only probe targets — this is genuinely
implementable (see §7.6) and HTS does not do it during vergence training.

#### (h) Accountability, weekly review and correction of technique — **PARTIAL**

Each weekly office visit includes reviewing the home log, questioning the patient about the previous
week, correcting technique errors, and re-demonstrating: *"Participants will be asked to demonstrate
all home therapy techniques to the therapist before leaving."* Software can nag and can chart, but
it cannot watch you do a Brock string wrong.

Note the raw numbers: therapist-rated adherence ≥75% was **91.4%** in the office arm and **67.3%**
in the home-computer arm ([CITT](https://pmc.ncbi.nlm.nih.gov/articles/PMC2779032/)). Weekly
accountability was worth ~24 percentage points of adherence.

#### (i) Positive reinforcement and frustration management — **REPLICABLE**

> "The participant should be rewarded for attempting a task, even if it is not successfully
> completed." · "Signs of frustration include: general nervous and muscular tension, hesitating
> performance, and possibly a desire to avoid the task."

Reward for *attempt*, not only for correctness. Hesitating performance = rising response latency,
which software can detect directly (see §4.3).

#### (j) Flexible, judgement-based endpoints — **REPLICABLE**

> "The endpoints are reasonable estimates… These endpoints should be considered guidelines, rather
> than rigid criteria. Thus, if a participant appears to have attained the stated objectives… but is
> unable to achieve the precise endpoint, the investigator may move to the next procedure after a
> reasonable effort."

A hard gate ("35Δ or you don't advance") is *not* what the office protocol does, and a patient stuck
one notch below a hard gate for three weeks is a churn candidate.

### 1.4 Two honest caveats about the whole CITT edifice

- **CITT-ART (311 children, 16 weeks) showed office-based therapy improved convergence but produced
  *no* improvement in reading or attention** versus office placebo — NPC improved 10.4 cm vs 6.2 cm,
  but the primary reading/attention outcomes were null
  ([Scheiman et al., *Optom Vis Sci* 2019 / PMC6855327](https://pmc.ncbi.nlm.nih.gov/articles/PMC6855327/);
  [summary](https://www.sciencedaily.com/releases/2019/10/191023083554.htm)). Do not market
  downstream cognitive benefits.
- **The professional bodies remain sceptical of vision therapy generally.** The AAP/AAO/AAPOS joint
  statement holds that behavioural vision therapy is scientifically unproven for learning
  disabilities and dyslexia ([AAO joint statement](https://www.aao.org/education/clinical-statement/joint-statement-learning-disabilities-dyslexia-vis)),
  and a paediatric review concluded evidence supports vision therapy "in the management of
  convergence insufficiency only"
  ([*Children* 2022 / PMC9777217](https://pmc.ncbi.nlm.nih.gov/articles/PMC9777217/)).
  **CI (and to a lesser extent accommodative dysfunction) is the only defensible indication.**
- **Adults are much less well evidenced than children**: the Cochrane adult network had only 107
  participants across 3 RCTs, no composite success outcome, and no GRADE ratings
  ([PMC8092638](https://pmc.ncbi.nlm.nih.gov/articles/PMC8092638/)).

---

## 2. Rep and set structure

This is the section with the largest gap between what practitioners do and what is actually known.
Read the **[CONVENTION]** tags carefully.

### 2.1 What is actually evidence-based about dose

**Total dose and time course — [RCT], good evidence.**
In CITT-ART, NPC and PFV were measured at 4, 8, 12 and 16 weeks. Improvement was
*front-loaded*: **1.9 cm/week NPC and 3.2Δ/week PFV over the first 4 weeks** (7.6 cm and 12.7Δ
absolute), then markedly slower over weeks 4–16, with ~88–93% reaching normal convergence measures
by 12 weeks and "an additional 4 weeks … may be beneficial for some"
([time-course paper, Johns Hopkins record](https://pure.johnshopkins.edu/en/publications/vergenceaccommodative-therapy-for-symptomatic-convergence-insuffi/)).

**Implication:** if a user is 4 weeks in with no measurable change, that is a genuinely informative
signal, not "too early to tell."

**Session count.** 12–16 one-hour office sessions is the studied range. CINAPS used **12 sessions
delivered twice weekly over 6–8 weeks** rather than weekly
([PMC7744390](https://pmc.ncbi.nlm.nih.gov/articles/PMC7744390/)); CONCUSS explicitly randomises
**12 vs 16 sessions** to test whether extra dose helps, which tells you the profession does not yet
know ([CONCUSS protocol, PLOS One 2024 / PMC11567536](https://pmc.ncbi.nlm.nih.gov/articles/PMC11567536/)).

**Home dose.** Every CITT-family protocol uses **15 min/day, 5 days/week** for home reinforcement
([MOP ch.7](https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/2/74958/files/2019/04/CITT-ART_MOP_Chapter07-2ltr2n8.pdf)).
CONCUSS reduced it to **10 min, 3×/week on non-office days**
([PMC11567536](https://pmc.ncbi.nlm.nih.gov/articles/PMC11567536/)). **[CONVENTION]** — these
numbers were chosen for trial feasibility. No study has compared 10 vs 15 vs 25 minutes head-to-head.
HTS2's 25-minute default is longer than anything the trials used.

### 2.2 Rep structure inside a procedure — what the office protocol actually specifies

These are real, specified structures **[CONVENTION]** — used in trials that worked, but never
isolated as an independent variable:

| Procedure | Rep structure |
|---|---|
| Brock String L1 | Hold near bead 5 s → switch to far bead 5 s; ×3; then move near bead 5 cm closer and repeat |
| Brock String L2 | Slow continuous ramp 1 m → 2.5 cm, then reverse; **20 repetitions** |
| 3 Dot Card | Fuse each dot within 3 s, hold 5 s; alternate far/mid/near ×10 (home version: ×20) |
| Eccentric Circles | Fuse → hold 5 s → **look away momentarily** → look back and regain fusion; ×10; then separate cards ~1 cm and repeat |
| Aperture Rule | Fuse → hold for a count of 5 → **look away momentarily** → regain as fast as possible; ×5; then next card |
| Vectogram jump vergence | Fuse → look away several seconds → look back; target **10 cycles/min** |
| Loose-lens accommodative rock | Clear through +/− lens **10 times with no time limit first**, only then work on speed to 10 cpm |

Three structural principles fall out of this and are worth adopting:

1. **Hold-then-release is the unit, not just "get it right once."** Almost every vergence procedure
   requires *sustaining* fusion for ~5 s before the rep counts. HTS's multiple-choice vergence
   counts a keypress; the eye may have been fused for 300 ms.
2. **A look-away reset between reps is standard.** Duration is specified only as "momentarily" or
   "several seconds." **[CONVENTION — no evidence for any specific duration.]** Its rationale is
   that regaining fusion from a neutral position trains the *phasic/step* response, which is exactly
   the subsystem that is deficient in CI (see §6.4).
3. **Accuracy before speed.** Amplitude/clarity endpoints are reached *without regard to the time
   factor*, and only then is speed trained ("Once the participant can achieve clarity through
   +2.00/−6.00 lenses, begin to work on speed"). HTS's Accommodative Rock trains percent-correct and
   cycles-per-minute simultaneously, which conflates two different learning phases.

### 2.3 Massed vs distributed practice

**No vergence-specific evidence exists.** Nothing in the CI literature compares one 25-minute
session to two 12-minute sessions, or 5 days/week to 7.

What we have is **[EXTRAP]**:

- The classic meta-analytic position is that **distributed practice beats massed practice** for
  motor skill learning, and spacing over intervals of days aids consolidation and delayed retention
  ([practice-distribution / oscillatory activity study, PMC2822735](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2822735/);
  [spacing across domains, PMC3946552](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3946552/)).
- But it is **not universal**: a 2026 study of serial motor skills found *shorter* inter-trial
  intervals promoted better consolidation
  ([Dutra et al., *QJEP* 2026](https://journals.sagepub.com/doi/10.1177/17470218251369711)).
- The one directly relevant physiological datapoint cuts *toward* splitting sessions: vergence peak
  velocity measurably declines within a 15-minute sustained step task in a minority of *normal*
  observers (§4.1). If a fraction of users are fatiguing inside 15 minutes, a 25-minute block is
  training a degraded system for its back half.

**Honest bottom line:** two shorter daily sessions are *plausibly* better and are *definitely* not
known to be better. This is a good candidate for SidVision's own A/B test, since the product can
randomise it and measure within-session velocity proxies.

### 2.4 Blocked vs interleaved order

**No vergence-specific evidence.** **[EXTRAP]** The contextual-interference literature says random/
interleaved practice depresses acquisition performance but improves retention and transfer, with a
meta-analysis supporting better retention under high contextual interference
([*Sci Rep* 2024](https://www.nature.com/articles/s41598-024-65753-3)); it has been shown in stroke
rehabilitation ([PMC4069194](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4069194/)).

**But the caveats are serious and apply directly here:** the effect "seems to be more robust in
basic research than in applied settings," and for complex tasks high interference "could be too
challenging for the information processing system, negatively affecting learning"
([same review](https://www.nature.com/articles/s41598-024-65753-3)). CI patients are, by definition,
struggling with the task.

Note what the office protocol actually does: it is **blocked within a session** (you work one
procedure to its endpoint) but **interleaved across categories** (4–5 different procedures per
visit, one from each category) and **randomised at the highest level in Phase 4** — the final RDS
jump-duction endpoint is explicitly *"Random jump duction mode"*, and Polaroid/prism flippers
reverse the demand direction unpredictably. That is a defensible pattern to copy: block early,
interleave late.

### 2.5 Weeks to plateau

- Convergence measures: most gain in the first 4 weeks, continuing but slower to 12–16 weeks
  ([time-course paper](https://pure.johnshopkins.edu/en/publications/vergenceaccommodative-therapy-for-symptomatic-convergence-insuffi/)). **[RCT]**
- Adjacent field, and a useful sanity check: in electronically-monitored amblyopia patching,
  **>80% of improvement occurred within 6 weeks**, with an approximately linear dose-response of
  ~1 logMAR line per 120 hours before plateau
  ([MOTAS/ROTAS, Stewart et al.](https://iovs.arvojournals.org/article.aspx?articleid=2163758);
  [monitored patching RCT, PMC2001048](https://pmc.ncbi.nlm.nih.gov/articles/PMC2001048/)). **[EXTRAP]**
- **Durability:** sustained improvement in convergence peak velocity has been reported one year
  post-therapy in adults ([Alvarez et al.](https://da4e1j5r7gw87.cloudfront.net/wp-content/uploads/sites/478/2017/05/Alvarez-2010.pdf)).
  CITT's own maintenance protocol is minimal: **15 min once per week for 3 months**, then stop
  ([MOP §7.8](https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/2/74958/files/2019/04/CITT-ART_MOP_Chapter07-2ltr2n8.pdf)).

---

## 3. Adherence and boredom

The project lead's intuition — that quitting is a top real-world failure mode — is **supported**.
The more uncomfortable finding is that **the obvious fix (make it a game) has been tried in an
adjacent field and largely failed.**

### 3.1 Measured adherence numbers

| Setting | Adherence | Source |
|---|---|---|
| CITT home computer therapy (HBCVAT+), therapist-rated ≥75% compliant | **67.3%** | [CITT](https://pmc.ncbi.nlm.nih.gov/articles/PMC2779032/) |
| CITT home pencil push-ups | 84.9% | same |
| CITT office arms | 87–91.4% | same |
| **CINAPS adults, electronically logged home computer therapy** | **24% (active) / 30% (placebo) of prescribed sessions completed** | [PMC7744390](https://pmc.ncbi.nlm.nih.gov/articles/PMC7744390/) |
| Amblyopia falling-blocks game, teens (ATS18): completed >75% of prescribed play | **22%** | [ATS trials summary](https://pmc.ncbi.nlm.nih.gov/articles/PMC6402824/) |
| Amblyopia Dig Rush game, ages 7–12 (ATS20): completed >75% | 56% | same |
| Physiotherapy home exercise programmes | as low as ~50%; one pooled review reported 21% | [Physiopedia review](https://www.physio-pedia.com/Adherence_to_Home_Exercise_Programs); [chronic-disease meta-analysis, PMC10080001](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10080001/) |

**The 24–30% figure from CINAPS is the number to design against.** It is electronically logged (not
self-reported), from adults, on exactly the modality SidVision is building — 10 minutes, 3×/week —
and it is catastrophic. CITT's 67.3% was *therapist-rated from interviews and logs*, i.e. almost
certainly inflated relative to what the software would have recorded.

### 3.2 Does making it engaging improve *outcomes*?

**The amblyopia dichoptic-game literature is the best-matched natural experiment, and the answer is
mostly no.**

- ATS18 (Tetris-style falling blocks, ages 13–16): not non-inferior to patching; only 22% of
  participants completed >75% of prescribed play.
- ATS20 (Dig Rush, a purpose-built engaging game, ages 7–12): **no difference in letter scores at 8
  weeks versus spectacles alone**, despite 56% completing >75% of play
  ([PMC6402824](https://pmc.ncbi.nlm.nih.gov/articles/PMC6402824/)).
- A follow-up found no benefit to visual acuity or stereoacuity from 4 or 8 weeks of Dig Rush in
  previously-treated children ([same source](https://pmc.ncbi.nlm.nih.gov/articles/PMC6402824/)).
- Interestingly, the *least* game-like intervention in this family — **passively streaming dichoptic
  movies** — performed comparably to patching (0.07 vs 0.06 logMAR at 2 weeks)
  ([PMC8905014](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8905014/)).

The broader digital-health picture agrees: gamification reliably improves *engagement and
acceptability* and unreliably improves *clinical outcomes*. A representative failure is MyHeartMate,
which achieved high acceptability and initial engagement but missed its primary physical-activity
outcome and most secondary risk factors
([gamification review, *Front Digit Health* 2026](https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1652217/full)).
One review warns explicitly of "artificial inflation on patient-reported outcomes potentially
attributable to activation of the body's innate reward circuit" — i.e. gamification can make your
*symptom questionnaire* improve without your *eyes* improving. Given §1.1's finding that CISS is
already placebo-sensitive, this is a live risk for SidVision specifically.

**Design conclusion.** Engagement is necessary (24% adherence produces nothing) but not sufficient,
and it can actively corrupt your outcome measurement. Build engagement to buy *dose*, and measure
success on objective performance, not on how the user says they feel.

### 3.3 What actually improves adherence, per the evidence

**[EXTRAP]** from physiotherapy and chronic disease:

- **Digital delivery itself helps in the short term.** A systematic review of RCTs found adding
  digital interventions to prescribed home exercise "can likely increase exercise adherence in the
  short term, with longer term effects less certain"
  ([*Arch Physiother* 2022 / PMC9527092](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9527092/)).
- **Self-efficacy is the strongest modifiable predictor** of adherence to home exercise
  ([PMC10080001](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10080001/)). This aligns exactly with
  the CITT manual's insistence on early easy wins and internal attribution (§1.3a).
- **Motivational/cognitive-behavioural programmes have moderate evidence** for improving attendance
  ([Cochrane-style review, PubMed 20630793](https://pubmed.ncbi.nlm.nih.gov/20630793/)).
- **But: "there was strong evidence that adherence strategies are not effective at improving
  long-term adherence with home exercise"** ([Physiopedia synthesis](https://www.physio-pedia.com/Adherence_to_Home_Exercise_Programs)).
  Pain during exercise, perceived ineffectiveness, and lack of time are the dominant barriers.

Two of those three barriers are directly addressable in software: *perceived ineffectiveness* (show
objective progress, not stars) and *discomfort* (see §4 — detect and pre-empt symptom onset rather
than pushing through it).

### 3.4 What is *not* known

- No study has measured why people abandon home vision therapy specifically. There is no published
  qualitative work on boredom as a dropout mechanism in this modality.
- No study compares an engaging vs a plain implementation of the *same* vergence protocol.
- The CITT trials did report adherence but no published secondary analysis I could locate links
  adherence dose to outcome within the home-computer arm. **This is a genuine hole**: we do not know
  whether the home-computer arm failed because of low dose or because the modality is weak.
  The CINAPS result (24% adherence, yet still 72% vs 32% clinical success in the office-driven
  design) hints that the office component was doing the work.

---

## 4. Fatigue and overtraining

### 4.1 Yes, vergence measurably fatigues within a single session

The most directly useful study had normal-vision participants perform a **15-minute sustained
symmetrical disparity-vergence step task** with eye tracking. Peak velocity was sustained by only
**63% of participants for convergence and 69% for divergence**; **23% (convergence) and 29%
(divergence) showed reduced performance**, and the authors concluded the *divergence* system is more
vulnerable, possibly through saturation of the divergence pulse
([Oculomotor Vergence Endurance, *J Eye Mov Res* 2026, doi:10.3390/jemr19030049](https://doi.org/10.3390/jemr19030049)).

Note: these were *normal* observers. CI patients, whose phasic convergence is already slowed, should
be expected to fatigue at least as fast. **A 25-minute unbroken protocol is longer than the interval
over which ~a quarter of healthy eyes start to degrade.**

Supporting evidence:

- Vergence effort correlates positively with reported visual fatigue, within and between subjects,
  and prolonged near work degrades vergence accuracy at distance afterwards
  ([Tyrrell & Owens, PubMed 2258180](https://pubmed.ncbi.nlm.nih.gov/2258180/)).
- Near tasks induce **vergence adaptation**, with fusional stress accounting for ~67% of its
  variance ([PubMed 3454910](https://pubmed.ncbi.nlm.nih.gov/3454910/)).
- Accommodative fatigue increases the innervation needed for the same response and can persist after
  the task as transient myopia ([PubMed 3610543](https://pubmed.ncbi.nlm.nih.gov/3610543/)).
- Accommodative lag increases measurably after a 2-hour near task, alongside subjective fatigue
  ([PMC10588489](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10588489/)).

**Caveat:** none of this establishes that fatiguing *harms training*. In fact one study found that
ramp-tracking exercises *reduced* accommodation/convergence aftereffects
([PubMed 3610543](https://pubmed.ncbi.nlm.nih.gov/3610543/)). The argument for breaks is that
training a degraded system wastes dose and produces the symptoms that drive dropout — not that it
causes injury.

### 4.2 Clinical signs that a session has gone too far

From the CITT manual's own troubleshooting and the CI symptom literature
([CISS domain items](https://pmc.ncbi.nlm.nih.gov/articles/PMC9237593/);
[StatPearls, Convergence Insufficiency](https://www.ncbi.nlm.nih.gov/books/NBK554390/)):

- Diplopia that does not recover within a few seconds
- Onset or increase of **suppression** (loses the doubling cue entirely — often looks like
  *improved* performance, which is the trap)
- Headache, brow ache, eye pull/strain
- Blur that persists after looking away
- Loss of place / words moving on subsequent reading
- Nausea (especially relevant post-concussion)

### 4.3 Signals a browser can detect automatically

All of these are **[REPLICABLE]** from keyboard/mouse timing alone and none require a camera:

| Signal | Interpretation | Notes |
|---|---|---|
| Rising median response latency across a block, at constant demand | Fatigue or effort increase | Best single proxy. Compare rolling window to the session's own first-quartile baseline. |
| Falling achieved demand (staircase reversal level drifting down) at constant nominal difficulty | Fusional range shrinking within session | Direct, and it is the same quantity being trained |
| Declining cycles/min in a facility task at fixed lens level | Accommodative or vergence facility fatigue | This is a *clinical* metric already (§6.3) |
| Rising response-time variability (SD or IQR) | The manual's "hesitating performance" frustration marker | |
| Error runs / lapse rate rising at a demand previously mastered | Fusion loss or suppression onset | |
| **Suppression probe failures** (monocular-only target the user must report) | Suppression onset — the dangerous one | See §7.6; requires interleaved probes |
| Sharp *increase* in accuracy with *decrease* in reported diplopia at high demand | Possible suppression, not success | Counter-intuitive; needs the probe to disambiguate |

**Recommended policy [CONVENTION, extrapolated from §4.1]:** force a break when median latency in a
rolling window exceeds baseline by a set margin, or when the staircase threshold declines by more
than one step across a block. A 60–90 s look-at-distance break is the conventional reset. There is
no evidence for any specific threshold or break duration — instrument it and learn.

---

## 5. Progression rules

### 5.1 What the trials actually used — and it is a hybrid

**Within a computerised procedure: an adaptive staircase.** The CITT office protocol's computer
component (VTS4 Computer Orthoptics RDS) uses exactly this rule:

> "The software program increases the prismatic demand of the task after two correct responses and
> decreases the prismatic demand after an incorrect response."

That is a **2-down / 1-up staircase**, which in classical psychophysics converges on the demand
level yielding **~70.7% correct** — i.e. it deliberately parks the user near threshold, failing
roughly 3 trials in 10. HTS uses the same beep/boop up-down rule
([MOP ch.7 §7.3.5, §7.7.5](https://bpb-us-w2.wpmucdn.com/u.osu.edu/dist/2/74958/files/2019/04/CITT-ART_MOP_Chapter07-2ltr2n8.pdf)).

**Across procedures: a mastery-gated ladder with explicit numeric endpoints.** The trial's protocol
summary form is a checklist a therapist initials. Selected endpoints:

| Phase | Procedure | Endpoint |
|---|---|---|
| 1 | Brock String L1 / L2 | Converge (then *voluntarily* converge) to a bead 2.5 cm from the nose |
| 1 | Vectogram (Quoits) BO | 30Δ base-out |
| 1 | Computer RDS BO | 45Δ base-out, large targets |
| 1 | Loose-lens accommodative rock | Clear +1.50/−3.00, **10 cpm** |
| 2 | Vectograms | 25Δ BO / 12Δ BI |
| 2 | Computer RDS | 45Δ BO / 15Δ BI, medium (8") targets |
| 2 | Loose-lens rock L2 | Clear **+2.00/−6.00, 10 cpm** |
| 3 | Aperture Rule | 30Δ BO (card 12), 15Δ BI (card 6) |
| 3 | Eccentric Circles | 30Δ BO (12 cm separation), 15Δ BI (6 cm) |
| 3 | Computer RDS jump | 45Δ BO ↔ 15Δ BI, small (6") targets, **step** mode |
| 4 | Computer RDS jump | 45Δ BO ↔ 15Δ BI, **15 reps/min, random** mode |
| 4 | Polaroid bar reader/flippers | ±2.00 at 40 cm, **13 cpm, without suppression** |

Note two dimensions of progression beyond raw prism demand that HTS does not use: **target size
shrinks** (large → 8" → 6" random-dot targets, which raises the fusion precision required) and
**mode changes** (ramp → step → *random* step). CONCUSS describes HTS itself as sequencing "from
ramp to step vergence demands" ([PMC11567536](https://pmc.ncbi.nlm.nih.gov/articles/PMC11567536/)).

### 5.2 Threshold training vs comfortable training

**No vergence-specific evidence.** **[EXTRAP]** from perceptual learning:

- **Easy-to-hard progressions generally beat constant-difficulty-hard training**, but with a
  "sweet spot": initial blocks that are *too* easy or *too* hard both produce less benefit than
  intermediate difficulty ([*Psychon Bull Rev* 2019 / PMC6868315](https://pmc.ncbi.nlm.nih.gov/articles/PMC6868315/)).
- **Roving (mixing difficulty levels unpredictably) hurts** when difficulty is genuinely mixed, but
  not when trials are equated for difficulty by per-condition staircases; the harm decreases with
  expertise ([Bilkent repository](https://repository.bilkent.edu.tr/items/d2873bef-4143-48b6-a49e-c669851d18d7)).
  A practical reading: run *separate* staircases per condition (convergence vs divergence vs
  accommodation) rather than one interleaved difficulty pool.

The clinical protocol independently arrives at the same place: *"Determine a level at which the
participant can perform easily… Start at the initial level at which the task is easy and gradually
increase the level of difficulty, being very careful to watch for signs of frustration. Vision
therapy should be success-oriented."*

**Synthesis:** a pure 2-down/1-up staircase (~71% correct) may be too punishing for a symptomatic,
low-motivation home user, even though it is statistically efficient. A gentler rule — e.g. 3-down/
1-up (~79% correct) — or an explicit easy warm-up block before the tracking block, is better aligned
with both the perceptual-learning sweet-spot finding and the clinical guidance. **[EXTRAP —
untested in this population.]**

### 5.3 What clinicians actually use to advance a patient

Per the manual: numeric endpoints as *guidelines*, overridden by clinical judgement, with an
explicit escape hatch for a patient who plateaus one notch short (§1.3j). Progression also has a
**qualitative** criterion that has no numeric analogue: the patient must be able to *appreciate the
different feeling and effort* associated with converging vs diverging, and with plus vs minus
lenses. That criterion appears in nearly every endpoint in the manual and is entirely absent from
HTS.

---

## 6. Meaningful outcome metrics — what a browser can and cannot honestly measure

Be sceptical here. The short version: **a browser can measure psychophysical thresholds and reaction
times honestly, and can measure almost nothing that requires knowing where the eyes actually are.**

### 6.1 Measurable honestly in a browser, today, with a keyboard

| Metric | How | Honesty caveat |
|---|---|---|
| **Fusional vergence range under anaglyph** (Δ at which fusion breaks) | Staircase to a break point on random-dot stereograms | This is *not* the same quantity as clinical PFV measured with a prism bar on a real target at 40 cm. Anaglyph on a screen has no accommodative coupling and different crosstalk. Report it as an in-app measure with its own units and trend it over time; do **not** claim it equals PFV. |
| **Stereoacuity ladder** (arcsec) | Shrinking disparity, forced choice | Digital anaglyph stereo tests correlate only moderately with TNO (r ≈ 0.53) and give systematically different thresholds, though differences may be clinically tolerable ([PMC8380567](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8380567/)). Valid for *within-user trend*, not for a clinical number. |
| **Accommodative facility (cpm)** | Physical flipper lenses + on-screen Landolt C discrimination, exactly as HTS does | **This one is genuinely a clinical metric.** Norms: ~11 cpm monocular / ~8 cpm binocular in adults with ±2.00 D ([Zellers et al.](https://www.aoa.org/AOA/Documents/Practice%20Management/Clinical%20Guidelines/Consensus-based%20guidelines/Care%20of%20Patient%20with%20Accommodative%20and%20Vergence%20Dysfunction.pdf)); ~5.0 ± 2.5 cpm in elementary schoolchildren ([Scheiman](https://www.myopiaprofile.com/articles/measuring-accommodative-facility)). Requires the correct lens power and viewing distance, and clinically requires suppression monitoring. |
| **Vergence facility (cpm)** | Alternating BO/BI anaglyph demand, count fusions/min | Clinical vergence facility uses 12Δ BO / 3Δ BI prism flippers, failing below ~15 cpm ([norms review](https://avehjournal.org/index.php/aveh/article/view/507/1196)). An anaglyph analogue is a *proxy*, not the same test. |
| **Response latency to a disparity step** | Timestamp stimulus onset → keypress | **This is the most valuable browser-native signal, and it must not be called vergence latency.** It is stimulus onset → fusion → perceptual decision → motor response, i.e. vergence latency + fusion time + RT. It is nonetheless a *sensitive within-subject* index that should track the real thing. |
| **Percent correct / lapse rate / RT variability** | Trivially | Fine as process metrics. Useless as clinical outcomes. |
| **Adherence: sessions started, completed, dose in minutes** | Trivially | The single most predictive thing you will have; see §3. |
| **CISS** | Administer the 15-item survey in-app | Validated instrument, cutoff 21 in the CITT trials. **But** sensitivity ~38–42% and specificity ~74–77% for screening ([PMC9237593](https://pmc.ncbi.nlm.nih.gov/articles/PMC9237593/); [PubMed 24532798](https://pubmed.ncbi.nlm.nih.gov/24532798/)), and it is heavily placebo-responsive (§1.1). Track it; never use it alone to claim efficacy. |

### 6.2 Not honestly measurable in a browser

- **Near point of convergence (NPC).** Requires a real target moved toward the nose *and an observer
  watching for one eye to break outward*. A patient's self-report of doubling gives you the
  subjective break only, and the objective break is the clinically meaningful one. A webcam could in
  principle estimate the moment of divergence from pupil positions, but see §6.3.
- **Clinical PFV/NFV blur–break–recovery.** Requires a prism bar and a real accommodative target at
  a real distance; the blur point in particular depends on genuine accommodative demand that a
  fixed-distance screen cannot vary.
- **Accommodative amplitude / accommodative response (lag).** Needs an autorefractor or dynamic
  retinoscopy.
- **Objective vergence peak velocity and the main sequence.** The published measurements use a
  binocular eye tracker at **240 frames/s inside a haploscope** (ISCAN RK-826PCI) — that is how
  convergence peak velocity was shown to rise from 14.7 to 26.1 °/s and time-to-peak-velocity to
  fall from 0.50 to 0.40 s after 12 weeks of office therapy, with latency changing only
  non-significantly (0.25 → 0.22 s, p = .13)
  ([Scheiman et al., *Optom Vis Sci* 2019 / PMC7079725](https://pmc.ncbi.nlm.nih.gov/articles/PMC7079725/)).
  Note the shape of that result: **peak velocity moved a lot; latency barely moved.** So the
  quantity a browser is *least* able to measure is the one that changed most, and the quantity a
  browser's RT most resembles is the one that changed least.

### 6.3 On webcam eye tracking — be pessimistic

WebGazer, the standard browser eye tracker, reports best-case ~1–2° of visual angle after
calibration and an average **4.17° error** against a commercial tracker
([WebGazer, IJCAI 2016](https://cs.brown.edu/people/apapouts/papers/ijcai2016webgazer.pdf)); newer
browser approaches note that landmark-based web trackers "typically exhibit limited accuracy and
temporal stability" ([WebEyeTrack, arXiv 2508.19544](https://arxiv.org/pdf/2508.19544)).

For scale: a 4Δ change in vergence is about **2.3° of eye rotation.** A tracker whose *average
error* is 4.17° cannot resolve clinically meaningful vergence changes, and vergence is a *difference*
between two eyes' angles, so errors compound. Webcam frame rates (30–60 Hz) are also 4–8× too slow
to characterise a peak velocity that occurs ~0.4 s after onset.

**Honest conclusion: a webcam in a browser cannot measure vergence angle, NPC, or peak velocity.**
It has three legitimate uses:

1. **Viewing-distance estimation** from interpupillary distance in pixels — needed to convert screen
   separation into prism dioptres correctly, and to detect the user drifting closer/further. This is
   robust because it depends on a scale, not a gaze angle.
2. **Presence/attention detection** — is the user still there and facing the screen.
3. **Gross gaze-away detection** for the look-away reset. Coarse is fine here.

### 6.4 Which metric best reflects what therapy actually changes

The mechanistic literature points at **phasic (step) convergence** as the deficient subsystem, with
therapy improving peak velocity and response amplitude
([PMC7079725](https://pmc.ncbi.nlm.nih.gov/articles/PMC7079725/);
[Alvarez fMRI, PMC4060559](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4060559/);
[*Sci Rep* 2021 on CI neuro-mechanisms](https://www.nature.com/articles/s41598-021-86171-9)). Frontal
eye fields, posterior parietal cortex and cerebellar vermis activity correlate with symmetrical
vergence peak velocity and increase with training.

**Design implication:** the metric SidVision should trend most prominently is **time-to-fuse on a
step demand at a fixed sub-threshold level** — a fixed "probe block" of, say, 10 steps at 8Δ BO run
at the start of every session. That is a browser-measurable quantity that plausibly tracks the
subsystem therapy actually changes, and holding the demand fixed makes it comparable across
sessions in a way that a staircase level is not.

---

## 7. Exercises HTS does not have

HTS2 ships: Pursuits, Saccades, BI/BO Vergence, Jump Ductions, Jump Ductions Random, BU/BD Vergence,
Accommodative Rock ([htsvision.com — **COMMERCIAL**](https://htsvision.com/hts2/)). Everything below
is in the CITT/OBVAM office or home protocols and absent from that list.

For each: **what it trains / gear needed / can a browser deliver it honestly?**

### 7.1 Brock string — **partially, with a physical string**
Trains gross voluntary convergence, kinesthetic awareness, and NPC, using *physiological diplopia*
(the two strings crossing at the fixation point) as an unfakeable self-feedback cue. Gear: 1 m
string, 2 beads. Endpoint: converge to a bead 2.5 cm from the nose, then do it voluntarily with no
bead at all.

**Browser verdict:** cannot be simulated on screen — the whole point is real depth and a physical
proprioceptive cue. But it is a $2 accessory, and the browser can be an excellent *coach and timer*
for it (guided ramp, rep counting, prompts). This is the highest-value non-screen addition, and it
is the *first* procedure in the office protocol, i.e. the foundation everything else builds on.

### 7.2 Barrel card / 3-dot card — **as a physical accessory**
Same family as Brock string; three coloured dots of decreasing size on a card held to the nose.
Endpoint: fuse each within 3 s, hold 5 s, 10–20 alternations. Cheap printable accessory.

### 7.3 Eccentric circles / life-saver cards — **printable, browser-coached**
Free-space fusion: two circle pairs on card, fused by deliberately crossing (*chiastopic*) or
relaxing (*orthopic*) the eyes with **no glasses, no instrument**. Endpoint: 12 cm separation = 30Δ
BO, 6 cm = 15Δ BI at 40 cm. Feedback cue is built in — a correct fusion produces *three* sets of
circles and the middle one floats and reads "clear".

**Browser verdict:** the targets are printable and the geometry (separation in cm → Δ at a known
distance) is exactly computable. The browser can prescribe separation, count reps, run the
look-away/regain cycle, and log. **This is the single best value-for-effort addition** because it is
free-space training — no anaglyph, no crosstalk, no glasses — and it transfers to real viewing.

### 7.4 Aperture rule and vectograms — **requires proprietary hardware**
Bernell Aperture Rule (a slide rule with a single/double aperture over cards; card 12 = 30Δ BO) and
Polaroid vectograms in an illuminated trainer. Both need purpose-made optical hardware. **Not
browser-deliverable.** Anaglyph random-dot stereograms on screen are the honest substitute and HTS
already does that.

### 7.5 Hart charts at distance and near (letter chart accommodative rock) — **yes, hybrid**
A large letter chart at 3 m and a small one at 40 cm; the user alternates calling letters near/far,
progressively bringing the near chart closer to an age-appropriate amplitude
(distance ≈ 100/(18.5 − 0.3 × age) cm). Trains monocular accommodative amplitude and facility with
**no lenses at all** — the demand comes from real distance.

**Browser verdict:** the near chart is the screen; the distance chart is a printed sheet on the wall.
The browser can generate randomised charts, cue the alternation rhythm, score the called letters via
keyboard entry, and compute the age-appropriate endpoint. **Genuinely honest** — the accommodative
demand is real because the *distances* are real. This is the best accommodative exercise the browser
can deliver without shipping lenses, and HTS has no equivalent.

### 7.6 Anti-suppression procedures — **yes, and this is an unforced HTS omission**
The office protocol's Phase-4 accommodative endpoint is explicitly *"13 cycles per minute **without
suppression**"* using a Polaroid bar reader. Vectogram procedures require the R/L boxes to stay
visible throughout.

**Browser verdict: fully replicable with anaglyph.** Render a probe element visible to only one eye
(pure red or pure blue against the appropriate background) and require the user to report it, either
continuously (a persistent per-eye landmark that must stay visible) or as interleaved probe trials.
This gives you (a) an anti-suppression *treatment*, (b) a suppression *detector* for the fatigue
policy in §4.3, and (c) a data-quality gate — a run of "correct" answers with a failing suppression
probe is not success.

**Caveat:** anaglyph channel separation is imperfect. Anaglyph crosstalk/ghosting is a well-
characterised problem, is display-spectrum-dependent, and causes fusion difficulty and discomfort
([Woods & Rourke, *Ghosting in Anaglyphic Stereoscopic Images*](http://cmst.curtin.edu.au/wp-content/uploads/sites/4/2016/05/2004-08.pdf);
[Woods, *Understanding Crosstalk in Stereoscopic Displays*](http://cmst.curtin.edu.au/wp-content/uploads/sites/4/2016/05/2010-23_understanding_crosstalk_woods.pdf)).
Blue/red is worse than red/cyan for luminance balance. Any suppression probe must be validated per
display or it will produce false positives. A one-time in-app calibration (adjust probe contrast
until the user *just* cannot see it through the wrong lens) is the pragmatic fix.

### 7.7 Metronome-paced pursuits and saccades — **yes, trivially**
HTS has pursuits and saccades but not paced, not with a moving fixation target under external
tempo, and not with body motion. The OBVAM concussion protocol uses two pencils at 12–16 inches,
with the separation progressively reduced, and then adds **walking 5–10 steps forward and backward**
while sustaining the saccades
([OBVAM MoP](https://research-dev.njit.edu/vision/sites/research.vision/files/OBVAM%20Manual%20of%20Procedures%202024%20Scheiman_0.pdf)).

**Browser verdict:** on-screen paced saccades are trivially implementable and honest. The walking
variant is not screen-deliverable, but the browser can *coach* it with audio. Relevant if the
product ever targets post-concussion users — and note the CONCUSS trial (100 participants, 11–25 y)
found early office-based therapy-with-motion effective for concussion-related CI and that watchful
waiting rarely resolved it
([CONCUSS protocol](https://pmc.ncbi.nlm.nih.gov/articles/PMC11567536/);
[fMRI results, *Front Neurosci* 2025](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2025.1703781/full)).

### 7.8 Lens sorting — **only with a lens set, but conceptually important**
Patient sorts 6–8 unmarked lenses by strength purely by how they *feel*. It trains nothing
mechanical; it trains *interoception of accommodative effort*, which is the qualitative endpoint
criterion running through the whole manual (§5.3). If SidVision ships flipper lenses anyway, a
"which lens is stronger?" discrimination game is a cheap analogue.

### 7.9 Dichoptic contrast-balanced training from the amblyopia literature — **implementable, but weak evidence**
Present the same scene to both eyes with reduced contrast to the dominant eye so that binocular
combination is only possible if the weaker eye contributes. Fully implementable in anaglyph.
**But:** the RCT evidence in its home field (amblyopia) is largely null — Dig Rush showed no benefit
over spectacles alone at 8 weeks, and falling-blocks games failed non-inferiority to patching
([PMC6402824](https://pmc.ncbi.nlm.nih.gov/articles/PMC6402824/)). There is **no** evidence at all
for contrast-balanced dichoptic training in convergence insufficiency. Treat it as speculative.

### 7.10 Stereo-acuity ladders — **yes, as engagement + measurement**
Shrinking-disparity forced choice. See §6.1 for the validity caveat. Useful as a within-user
progress ladder and as a between-exercise change of pace; not a clinical outcome.

---

## 8. Safety and red flags

Brief and factual.

### 8.1 Stop and see an optometrist if, during home therapy

- Double vision that persists after stopping, or appears in ordinary daily viewing
- Any **new, constant** eye turn
- Headache or eye pain that worsens across sessions rather than settling
- Blur that persists after the session
- Nausea, dizziness or worsening of post-concussive symptoms
- Any sudden change in vision, flashes, floaters, field loss, or pain — these are unrelated to
  vergence therapy and are ophthalmic emergencies

### 8.2 The strabismus / intractable diplopia risk — real, and the reason for a hard gate

The concern: a patient with a long-standing constant strabismus has usually developed **suppression**
(and possibly anomalous retinal correspondence) as an adaptation. Fusion and anti-suppression
training can break that adaptation without being able to establish stable normal fusion in its place,
leaving the patient with **intractable diplopia** — double vision correctable by neither therapy,
prism, nor surgery ([Graefe's Archive, *Intractable diplopia: a clinical perspective*](https://link.springer.com/content/pdf/10.1007/BF02173316.pdf)).
The AAO's orthoptist-perspective guidance states the rule directly:

> "One must be careful to avoid inadvertently breaking suppression with exercises in the absence of
> stable fusion ability, because this can result in unmanageable diplopia."
> — [AAO, *Adult Strabismus: Orthoptist Perspective*](https://aao.org/disease-review/adult-strabismus-orthoptist-perspective)

The same source notes amblyopia, suppression, and anomalous retinal correspondence as
contraindications for prism therapy, and that careful sensory testing should precede orthoptic
treatment. "Second-degree fusion" targets — flat-fusion stereograms with matching contours, i.e.
precisely the random-dot and anaglyph targets used in vergence software — are the class of stimulus
that most directly forces the issue.

Note that this risk is **not disclosed on the HTS2 product page**, which carries only a generic
disclaimer that the product "does not treat or diagnose any specific medical condition or disease"
([htsvision.com — **COMMERCIAL**](https://htsvision.com/hts2/)).

### 8.3 What the software should refuse to do or warn about

1. **Refuse to run unsupervised vergence/anti-suppression training on anyone reporting a constant
   eye turn, strabismus surgery, amblyopia, or long-standing suppression** without documented
   clinician sign-off. Screen for this at onboarding with plain-language questions and gate hard.
2. **Refuse to diagnose.** CI diagnosis requires NPC, PFV and near phoria measured clinically. CISS
   alone has ~40% sensitivity ([PubMed 24532798](https://pubmed.ncbi.nlm.nih.gov/24532798/)).
   Route users to an eye exam; do not tell them what they have.
3. **Refuse to claim reading, attention, learning or dyslexia benefits.** CITT-ART tested exactly
   this and found nothing ([PMC6855327](https://pmc.ncbi.nlm.nih.gov/articles/PMC6855327/)), and the
   AAP/AAO/AAPOS joint statement is explicit
   ([AAO](https://www.aao.org/education/clinical-statement/joint-statement-learning-disabilities-dyslexia-vis)).
4. **Warn that home computer therapy underperformed office therapy in the definitive trial**, and
   that office therapy is the evidence-based first-line treatment. Being straight about this is both
   ethical and a differentiator.
5. **Warn about photosensitive seizure risk** for any flashing/high-contrast animation, per standard
   WCAG practice.
6. **Never push through symptoms.** Escalating headache/diplopia/nausea should end the session, not
   trigger a "you can do it" prompt.
7. **Post-concussion users should be under clinical care**, not self-treating — the evidence base
   there (CONCUSS) is entirely office-delivered with movement.

---

## Design implications for SidVision

Each item traces to a numbered finding above.

1. **Add a rescue ladder before every demand reduction.** On failure, do not silently step the
   staircase down (HTS's behaviour). Run: verbal internal-attribution cue → retry → stronger cue or
   hint → retry → *only then* reduce demand. The CITT manual's explicit instruction is to "help the
   participant overcome this obstacle, rather than simply make the task easier." *(§1.3c)*

2. **Rewrite every instruction as an internal action.** "Pull your eyes in / let your eyes relax
   outward," never "make the picture single." The trial manual devotes more text to this than to any
   procedure, and it is free to implement. *(§1.3a)*

3. **Ask the user what they perceive, not just where the square is.** After key reps, prompt for the
   feedback cues the office protocol teaches: SILO ("smaller and closer, or larger and further?"),
   float, blur onset, doubling. Log the answers. The pedagogic value is the point; the data is a
   bonus. *(§1.3b)*

4. **Make the rep unit "fuse → hold ~5 s → look away → regain."** Not "keypress." Every office
   vergence procedure requires sustained fusion before a rep counts, and the look-away/regain cycle
   is what trains the phasic subsystem that is actually deficient in CI. *(§2.2, §6.4)*

5. **Separate an accuracy phase from a speed phase.** Reach the amplitude/clarity endpoint with no
   time pressure first, then train cycles-per-minute at that level. HTS conflates the two in
   Accommodative Rock. *(§2.2)*

6. **Cap sessions at ~12–15 minutes and offer two-a-day, rather than one 25-minute block.** Justified
   by within-session vergence fatigue in ~a quarter of *normal* observers over 15 minutes, plus the
   trial protocols' own 10–15 minute home doses. Flag it as an unproven choice and A/B test it —
   the product is uniquely able to answer this question. *(§2.1, §2.3, §4.1)*

7. **Ship a fatigue detector and a forced break.** Trigger on rolling median latency vs
   session-baseline, staircase threshold decline within a block, cpm decline at fixed lens level, and
   suppression-probe failures. 60–90 s look-at-distance break. Log every trigger so thresholds can be
   tuned empirically. *(§4.3)*

8. **Interleave anti-suppression probes into vergence training, with a per-display calibration.**
   Monocular-only probe elements that must be reported. This is a treatment, a safety monitor, and a
   data-quality gate in one, and HTS does not do it. Calibrate probe contrast per user/display
   because anaglyph crosstalk varies. *(§7.6, §5.1)*

9. **Progress along three axes, not one.** Prism demand *and* target size (large → medium → small
   random-dot) *and* mode (ramp → step → random step). That is what the office protocol's endpoint
   ladder does; HTS effectively only escalates Δ. *(§5.1)*

10. **Soften the staircase.** Use ~3-down/1-up (≈79% correct) rather than the 2-down/1-up (≈71%) that
    VTS4/HTS use, and precede each tracking block with an easy warm-up. Rationale: the
    perceptual-learning "easy-to-hard sweet spot" plus the manual's success-oriented guidance, in a
    population with a 24–30% adherence baseline. Mark as an explicit hypothesis to test. *(§5.2, §3.1)*

11. **Run separate staircases per condition** (convergence / divergence / accommodation) rather than
    one pooled difficulty stream, because roving across genuinely mixed difficulty degrades
    perceptual learning while difficulty-matched roving does not. *(§5.2)*

12. **Block early, interleave late.** Mirror the office protocol: within-session blocked practice on
    one procedure in phases 1–2, moving to random/unpredictable demand direction in the final phase.
    *(§2.4, §5.1)*

13. **Add a fixed sub-threshold probe block at the start of every session** — e.g. 10 steps at a
    fixed 8Δ BO — and make *time-to-fuse on that block* the headline progress metric. Fixed demand
    makes it comparable across sessions; it is browser-measurable; and it plausibly tracks phasic
    convergence, the subsystem therapy actually changes. *(§6.1, §6.4)*

14. **Never call browser reaction time "vergence latency," and never call the anaglyph break point
    "PFV."** Give in-app measures their own names and units and present them as trends. The published
    peak-velocity effect was measured at 240 Hz inside a haploscope; latency itself barely changed.
    *(§6.1, §6.2)*

15. **Use the webcam only for viewing-distance estimation, presence, and coarse look-away
    detection.** Webcam gaze error (~1–2° best case, ~4.17° average) exceeds the entire signal you
    would be trying to measure. Do not build an NPC or vergence-angle feature on it. *(§6.3)*

16. **Add three non-screen procedures the browser coaches rather than renders: Brock string,
    eccentric circles, and Hart-chart accommodative rock.** All are in the office protocol, all are
    absent from HTS, all cost under a few dollars in printed/physical accessories, and Hart charts
    give *real* accommodative demand from *real* distance rather than simulated demand. Eccentric
    circles are the best value: free-space, no glasses, no crosstalk, computable geometry. *(§7.1,
    §7.3, §7.5)*

17. **Treat CISS as a monitoring instrument, not an outcome claim.** It moved almost as much on
    placebo as on real therapy in adults (−10.1 vs −12.4, n.s.), and gamification is specifically
    suspected of inflating patient-reported outcomes. Report objective measures alongside it, always.
    *(§1.1, §3.2)*

18. **Design the engagement layer to buy dose, and prove it in objective units.** The amblyopia
    dichoptic-game programme is the cautionary precedent: purpose-built games achieved acceptability
    and still produced 22–56% adherence and null clinical results. Instrument adherence as a
    first-class outcome (CINAPS: 24–30% of prescribed sessions) and treat any adherence gain as a
    hypothesis about outcomes, not a substitute for one. *(§3.1, §3.2)*

19. **Front-load expectations against the real time course.** Tell users the largest gains happen in
    the first ~4 weeks (1.9 cm/week NPC, 3.2Δ/week PFV in the trial), that the full course is 12–16
    weeks, and that a 3-month once-weekly maintenance phase follows. Then hold the product to that:
    if a user's own probe metric has not moved by week 4, surface it and recommend an optometrist
    rather than selling another 12 weeks. *(§2.1, §2.5)*

20. **Copy the manual's flexible-endpoint rule, not a hard gate.** If a user is within a reasonable
    margin of an endpoint after sustained effort, advance them and keep the prior procedure in
    rotation. HTS's star gates can trap a user one notch short indefinitely, which is a churn
    mechanism. *(§1.3j, §5.3)*

21. **Reward attempts, not only successes**, and detect frustration from rising latency and latency
    variability — the manual's "hesitating performance." *(§1.3i, §4.3)*

22. **Gate hard on strabismus, amblyopia, prior strabismus surgery, and long-standing suppression at
    onboarding, and say why.** Breaking suppression without achievable stable fusion can produce
    intractable diplopia. HTS's product page discloses none of this. *(§8.2, §8.3)*

23. **Be explicit in-product that office-based therapy outperformed home computer therapy in the
    definitive trial** and is first-line. Honest positioning: SidVision is for people who cannot or
    will not access office therapy, and for maintenance — not a claimed equal. *(§1.1, §8.3)*

24. **Claim only convergence insufficiency (and accommodative facility).** No reading, attention,
    dyslexia, learning or sports-performance claims. *(§1.4, §8.3)*

---

## Open questions this research could not answer

These are genuine gaps in the literature, not gaps in the search:

1. **Why did home computer therapy fail — low dose, or weak modality?** No published analysis links
   within-arm adherence to outcome in CITT's HBCVAT+ group. This is the single most important
   unanswered question for the product thesis.
2. **Optimal session length and daily frequency for vergence training.** Never studied. No comparison
   of one long vs two short sessions exists.
3. **Optimal look-away reset duration between reps.** "Momentarily" / "several seconds" is all the
   protocol says.
4. **Whether staircase target accuracy (71% vs 79% vs easier) affects vergence learning or dropout.**
   Untested in this population.
5. **Whether an engaging implementation of the *same* vergence protocol produces better outcomes than
   a plain one.** Never tested in vision therapy; tested and largely null in amblyopia.
6. **Whether any within-session fatigue signal predicts worse learning**, as opposed to merely
   indicating tiredness.
7. **Adults generally.** 107 participants across 3 RCTs, no GRADE ratings, no composite outcome — the
   adult evidence base is thin, and most adult users will be self-referred screen workers.
