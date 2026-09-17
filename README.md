# Iris

A browser-based home vision therapy practice app with a structured daily plan, individual
exercises, interactive depth scenes, and session history. Built with TypeScript and Vite.
Core practice runs locally without an account or API key.

**This is practice software, not a diagnosis.** Iris cannot measure eye position, near point of
convergence, fusional ranges, or clinical symptom scores. Built-in training defaults are not a
personal prescription; use Settings to enter the goals assigned by your clinician.

## Quick start

Install Node.js and pnpm, then run:

```bash
pnpm install
pnpm dev
```

Open [localhost:5183](http://localhost:5183) and complete the calibration wizard. The dev server
uses a fixed port and fails if it is occupied: changing ports would give you a different browser
storage location. Keep using the same hostname and port to retain access to your saved data.

### Equipment and calibration

- Red/blue anaglyph glasses for binocular exercises, with the **red lens over your right eye**.
- A monocular flipper lens set for accommodative exercises, as prescribed.
- Your screen dimensions, a supported screen preset, or a bank card for calibrating screen scale.

Calibration records screen scale and viewing distance. Keep the same browser zoom and display
scaling afterward; detected scaling changes block new sessions until corrected or recalibrated.
Each session reminds you of your calibrated viewing distance.

## Choose how to practice

**Structured plan** runs the following sequence continuously, with Pause available throughout:

| Exercise | Duration |
|---|---:|
| Pursuits | 3 minutes |
| Saccades | 3 minutes |
| Divergence | 7 minutes |
| Convergence | 7 minutes |
| Accommodative Rock | 5 minutes |

The base plan totals **25 minutes**. Jump Ductions adds another 7 minutes once Convergence and
Divergence have each been completed at least once.

**Self-guided** lets you choose one exercise using its Play button. It uses the listed duration,
with a half-length option for shorter sessions. In addition to the plan exercises, it includes:

| Exercise | Duration | Activity |
|---|---:|---|
| Number Search | 5 minutes | Find scattered digits while practicing with flippers |
| Cyclopean Letters | 5 minutes | Identify letters in a binocular random-dot target |
| Depth Cinema | 7 minutes | Animated depth scene with adjustable vergence and motion |
| Depth Rings | 7 minutes | Concentric rings with adjustable stack depth and spread |
| Depth Spiral | 7 minutes | Lettered square-spiral fusion target |
| Depth Helix | 7 minutes | Binocular helix with rotation and depth controls |

The experimental depth exercises and Cyclopean Letters are self-guided only and do not join the
structured plan. The home screen also shows your practice history over the last 14 days.

### Session controls

- **Pause / Resume** stops and restarts the session clock. Hiding the tab also pauses timing.
- **End session** saves the recorded portion of a session.
- **Replay** on Results starts the same exercise or plan directly, retaining the original duration
  for new sessions and checking calibration again.
- **Hit FX** toggles extra chimes and visual feedback on exercises that produce response trials.
  It is hidden for the four continuous depth exercises.
- The **gear icon** opens exercise settings where available. Panels scroll on small screens.
  Shared settings panels support five saved presets; `1`–`5` loads a preset and `Shift` + `1`–`5`
  saves one. The backslash key toggles the panel where supported.

Exercise-specific response keys and controls are explained in the preview and on-screen prompts.
Sessions do not enforce a daily cap or scheduled breaks. After two sessions in a day, Iris shows
an advisory; you can pause whenever you need a break.

## Number Search

Choose **Self-guided → Number Search** for a flipper exercise with **100 scattered characters**:
90 capital letters and exactly 10 digits (0–9). Characters are spread across the screen without
rows or columns, with compact controls at the top and instructions along the bottom.

Use your flippers and eye-covering setup as instructed by your clinician. Find a number in any
order, click or tap it, then flip your lens and find another. Each digit disappears when selected,
the remaining-number counter updates, and all other characters stay in place. Clicking a letter
does nothing.

After all 10 digits are found, select **New board** to continue with a fresh arrangement, or
**End session** to finish. The default session is five minutes, with the self-guided half-length
option available. Pause and resume whenever needed; responses are saved with your session results.
Number Search is available on its own and is not included in the structured daily plan.

## Results and optional coaching

Results include recorded exercise activity, response-integrity findings, symptom reporting, and
history charts where comparable data is available. Scored exercises use checks such as catch
trials, response timing, and accuracy against chance. Charts keep different calibrations separate;
keyboard response time is not a measurement of eye movement.

An optional post-session narration sends a summary of findings and goals to Anthropic **only when
you select the send button**. Standard results and exercises work without it.

To enable narration during local development, set `ANTHROPIC_API_KEY` in your shell or a gitignored
`.api`, `.env.local`, or `.env` file in the project root, then restart the dev server:

```dotenv
ANTHROPIC_API_KEY=your-key-here
```

The key stays in the Node.js dev server. The browser calls `/api/analyze`, which forwards the
summary to Anthropic. This middleware is included only in the development server: a static build
or `pnpm preview` does not provide the coaching endpoint.

## Development

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the local Vite server on port 5183 |
| `pnpm typecheck` | Check TypeScript without emitting files |
| `pnpm build` | Typecheck and build static assets into `dist/` |
| `pnpm preview` | Preview the built assets locally |

The production build can be served as static files. Navigation uses hash routes, so application
routes do not need server-side URL rewrites. Preview and other deployments have separate browser
storage when their origin differs from the development server.

```text
src/core/        rendering, geometry, integrity checks, session runner, settings and storage
src/procedures/  structured-plan exercises and self-guided activities
src/ui/          screens, previews, exercise controls, feedback, results and analysis
server/          optional development-only coaching endpoint
docs/           research, product ideas and failure-mode analysis
```

## Storage and privacy

Settings, calibration, session history, symptoms, and exercise presets are stored in browser
`localStorage` under `iris.*` keys. There is no account, database, or automatic device sync.
Clearing site data removes the saved information. Core exercise data stays in the browser;
requesting optional coaching sends the analysis summary to the configured Anthropic service.

## Project notes

- [Failure modes](docs/FAILURE-MODES.md) — risks and integrity checks
- [Research](docs/RESEARCH.md) — background sources and rationale
- [Ideas](docs/IDEAS.md) — product exploration

These notes capture design history; the current behavior is described above and implemented in
`src/`.
