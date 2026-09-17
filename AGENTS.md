# Working on Iris

Iris is a local-first vision therapy practice app built with strict TypeScript,
plain DOM APIs, and Vite. Read `README.md` for current features and setup. Prefer
the existing small modules and shared UI helpers over adding frameworks or dependencies.

## Code map

- `src/core/`: settings, persisted types, calibration, rendering geometry, integrity
  checks, and the session runner.
- `src/procedures/`: exercises implementing the shared procedure interface.
- `src/ui/screens/`: home, calibration, session, results, and settings screens.
- `src/ui/procedureControls.ts`: shared exercise settings, presets, and keyboard handling.
- `src/ui/analysis.ts`: deterministic results analysis; coaching narrates these findings.
- `src/styles.css` and `src/ui/screens.css`: shared visual styles and screen layouts.
- `server/analyzePlugin.ts`: optional development-only Anthropic coaching endpoint.
- `docs/`: research and design history. Check current code before treating older notes
  as a description of shipped behavior.

## Keep the README current

Update `README.md` in the same change whenever you add, remove, or change a
user-facing feature, exercise, control, workflow, setup command, configuration
option, storage behavior, or external service integration.

- Describe the resulting behavior and how to use it, rather than adding a running changelog.
- For exercises, document availability, default duration, equipment, and relevant controls.
- For integrations, explain configuration, what data leaves the browser, and whether
  the feature works in development, a static build, or both.
- Correct or remove descriptions made obsolete by the change. Keep examples, commands,
  links, and feature tables aligned with the implementation.
- Internal refactors and styling-only adjustments do not need filler documentation
  when the existing README remains accurate.

## Implementation conventions

- Follow nearby TypeScript style and use the `el()` helper in `src/ui/router.ts`.
  Use the router for navigation so browser history and screen teardown keep working.
- Keep session timing, pause state, and persistence in the shared runner/state modules.
  Dispose event listeners, animation frames, timers, and observers on exit or abort.
- Preserve existing `iris.*` localStorage data. New fields must tolerate older records;
  do not clear or silently invalidate saved calibration, history, or presets.
- When adding an exercise, check its ID/types, registry and hit-feedback support,
  duration/availability, home listing, session resolution, preview, and results labels
  and analysis. Include it in the structured plan only when that is intended.
- Replay should restart the original selection and duration directly, while retaining
  calibration checks. Keep interrupted-session behavior compatible with saved records.

## Exercise behavior and interface

- Preserve calibrated geometry, lens orientation, and response-integrity checks when
  changing presentation. Training targets need the dark stage for anaglyph separation.
- Do not present browser response timing as measured eye movement or invent clinical
  conclusions. Built-in defaults are not a personal prescription.
- Keep Pause and End session reachable. Paused or hidden sessions must not advance
  practice timing or record unintended responses.
- Use the shared settings panel where appropriate: compact gear, accessible name,
  disclosure state, and scrollable content on small screens.
- Give buttons at least a 44px touch target, visible keyboard focus, and descriptive
  labels. Isolate settings keystrokes from exercise response handlers.
- Check narrow screens for horizontal overflow, overlapping HUD/buttons, clipped
  readouts, and controls obscuring each other. Show Hit FX only where supported.

## Verification

- Run `pnpm build` for code changes; it includes TypeScript checking. Use
  `pnpm typecheck` for a quicker check while working. npm equivalents also work.
- For behavior changes, verify the affected flow in the browser, including saved
  results and replay when relevant. Add focused regression tests for nontrivial logic
  where useful; do not add a test framework for a cosmetic change alone.
- For UI changes, inspect desktop and phone widths, including a narrow 320px viewport.
  Exercise collapsed/expanded settings and keyboard interaction when affected.
- Use isolated browser data for verification; do not overwrite the user's calibration
  or session history. Keep development on port 5183 rather than silently switching
  origins when the port is occupied.
- For documentation-only edits, check claims against code, local links, and Markdown
  formatting; a production rebuild is unnecessary.
- Run `git diff --check` before handing off. Report checks performed and any remaining
  limitations accurately.

## Secrets and external services

Never commit or print `.api`, `.env*` secret values, or API keys. Coaching credentials
stay in the dev-server process, never in client code or localStorage. Keep coaching
opt-in per request and preserve core functionality without an API key. Do not send
real session data to external services as part of routine verification.
