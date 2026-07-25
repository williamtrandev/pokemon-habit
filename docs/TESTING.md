# Testing

Two tiers. Run tier 1 on every change; run tier 2 when a feature touches the UI.

## Tier 1 — logic units (vitest)

Pure game logic (`gameLogic`, `species`, `date`, `types`) — fast, deterministic, no simulator.

```bash
npm test          # run once (CI gate)
npm run test:watch
```

Tests live in `src/__tests__/*.test.ts`. When you add a feature that changes a
rule (XP curve, decay, streaks, evolution, a new creature state), add or update a
case here first — it's the cheapest place to lock behavior.

## Tier 2 — E2E on the iOS simulator (Maestro)

Drives the real app: taps, text input, tab navigation, assertions. Covers what
units can't — rendering and user flows.

Prereqs (once):

```bash
curl -Ls https://get.maestro.mobile.dev | bash   # installs `maestro`
brew install openjdk@21                           # Maestro needs a JVM
npm run ios                                        # build+install on a booted sim
```

If `maestro` reports "Unable to locate a Java Runtime", point it at the JDK:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"
```

Run the flows:

```bash
npm run test:e2e        # = maestro test .maestro
maestro test .maestro/01-smoke.yaml   # a single flow
```

Flows (`.maestro/`):
- `01-smoke.yaml` — boots to empty state, visits all three tabs.
- `02-add-habit.yaml` — add-habit flow through the editor (waits on PokéAPI).
- `03-complete.yaml` — complete a habit, assert the day closes out.

Selector notes (Maestro matches by visible Vietnamese text):
- **Regex is anchored to an element's *full* text.** A substring won't match — wrap
  it: `.*Chạy bộ E2E.*`. Exact nodes (tab labels, ring `1/1`) match directly, and
  tab labels use `^Nuôi$` so they don't collide with words in other elements.
- **RN cards are one merged accessibility node** (title + form + toggle collapse into
  one label). To make the completion toggle independently tappable, `CreatureCard`'s
  outer `Pressable` is `accessible={false}` and the toggle carries an
  `accessibilityLabel` (`Hoàn thành <title>`) — also a real VoiceOver fix. The add
  FAB carries `accessibilityLabel="Thêm mục tiêu"`.
- **The Home empty-state card routes to the Habits tab**, not the editor — add flows
  open the editor from the Habits FAB.

When adding a screen, prefer giving interactive controls an `accessibilityLabel`
(stable selector + better a11y) over tapping by position.

### Seeding deterministic states

Some states are tedious to reach by tapping (mid-evolution, Mega, fainted, long
streaks). Seed them straight into the booted sim's AsyncStorage:

```bash
npm run seed:sim              # inject a demo herd (4 creatures across states)
node scripts/seed-sim.mjs --empty   # reset to empty
```

## CI

`.github/workflows/test.yml` runs on every PR and push to `main`:
- `units` — `npm test` (the fast gate, always runs).
- `e2e` (matrix iOS + Android) — the way large RN/Expo projects run E2E in CI:
  the build is **offloaded to EAS Build** (cloud) and the flows run on **Maestro
  Cloud** (real devices). No native toolchain, simulator/emulator, or Metro on
  the runner — that path is too slow and flaky on hosted runners (`expo run`
  stays foreground and hangs; from-source pod builds take 100+ min).

### One-time setup (needed for the `e2e` job to run)

It's gated on two secrets, so until they exist the job is skipped and CI stays
green.

1. Create an Expo account, then locally: `npx eas-cli@latest login && npx eas-cli@latest init` (writes the EAS project id into `app.json`).
2. GitHub ▸ Settings ▸ Secrets and variables ▸ Actions, add:
   - `EXPO_TOKEN` — expo.dev ▸ Account ▸ Access tokens.
   - `MAESTRO_CLOUD_API_KEY` — console.mobile.dev.
3. Merge gate: GitHub ▸ Settings ▸ Branches ▸ `main`, mark `units` and
   `e2e (ios)` / `e2e (android)` as required status checks.

Build profile lives in `eas.json` (`e2e`: iOS simulator + Android APK). Both
are debug-signed / unsigned-simulator, so no store credentials are needed.

Note: EAS Build and Maestro Cloud are paid services (with free tiers). If you'd
rather not use them, a self-hosted macOS runner can build locally in ~10 min; the
previous xcodebuild/gradle + local-Maestro job is in git history.

## Adding tests for a new feature

1. Rule/logic change → add a `vitest` case in `src/__tests__/`.
2. New screen or flow → add a `.maestro/*.yaml` flow (seed state if needed).
3. `npm test` green locally before pushing; dispatch `e2e-ios` for UI-heavy work.
