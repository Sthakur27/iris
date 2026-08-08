# Iris

A local, unlimited-use home vision therapy app for convergence and accommodative work. Rebuilds
what HTS2 does and then fixes what it gets wrong.

**This is practice software, not a diagnosis.** It cannot measure your near point of convergence,
your fusional ranges, or your symptom score — those need a real exam. Every prescribed value in it
defaults to HTS's published numbers, which are not a prescription. Set your own in Settings.

## Running it

```bash
pnpm install && pnpm dev
```

Then open the printed URL and work through the calibration wizard.

Whatever browser zoom you calibrate at is fine — it gets baked into the measurement and stays
correct. What breaks the calibration is *changing* zoom or display scaling afterwards, so the app
records the rendering environment at calibration time and blocks a session if it has drifted since.

## Gear

- Red/blue anaglyph glasses
- A monocular flipper lens set (the default ladder runs +0.75/−1.50 up to −5.00/+2.50)
- A credit card, once, for screen calibration

## What it does differently from HTS

| | HTS2 | Iris |
|---|---|---|
| Scoring | Percent correct, cycles/min | Highest demand sustained with *trustworthy* responses |
| Guessing | Guarded only by an 80% pass mark | Catch trials, accuracy tested against chance, sub-250 ms responses rejected, a free "I can't see it" key |
| Suppression | Not detected | Monocular probes, alternating eyes, flagged when one eye stops reporting |
| Progression | Fixed level ladders with star gates | Adaptive, driven by whether responses are trustworthy at the current demand |
| Rest | None between reps | Enforced look-away resets, skippable but recorded as skipped |
| Screen limits | Silent | Computes and warns when the prescribed goal exceeds what your screen and viewing distance can display |
| Clock | Runs regardless | Pauses when the tab is hidden, or when you pause |
| Dose | Unlimited | Two sessions a day, with an explanation |

## Layout

```
src/core/        anaglyph rendering, geometry, integrity, safety, session runner, storage
src/procedures/  the six therapy procedures
src/ui/          calibration wizard, home, settings, session shell, results and analysis
docs/            research, product ideas, failure-mode analysis
```

## Documents

- [docs/FAILURE-MODES.md](docs/FAILURE-MODES.md) — every known way this goes silently wrong, and who owns the fix
- [docs/RESEARCH.md](docs/RESEARCH.md) — the clinical and motor-learning evidence base
- [docs/IDEAS.md](docs/IDEAS.md) — product ideas beyond HTS parity

## Storage

Everything lives in `localStorage` under `iris.*`. No server, no database, no account.
Clearing site data resets your history.
