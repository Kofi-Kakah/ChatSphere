# ChatSphere test suite — how to run and extend it

This directory holds the QA documentation. This file is the operator's guide: how to run each layer, how to add a test, and how to update the visual baselines.

| Document | Contents |
|---|---|
| [TEST_PLAN.md](./TEST_PLAN.md) | Strategy, risk areas, layer definitions |
| [TRACEABILITY.md](./TRACEABILITY.md) | Every test ID with its implementation and execution result |
| [BUGS.md](./BUGS.md) | Every filed defect with reproduction steps, severity, and status |
| [TEST_RESULTS.md](./TEST_RESULTS.md) | Running log of executed runs and observed numbers |
| [VISUAL_BASELINES.md](./VISUAL_BASELINES.md) | The 30 approved screenshots, masks, and review rules |
| [EXPLORATORY_SESSION.md](./EXPLORATORY_SESSION.md) | The Phase 13 50-step, three-user chaos session |
| [MANUAL_CHECKLIST.md](./MANUAL_CHECKLIST.md) | Checks that need real hardware or a TURN provider |
| `evidence/` | Raw logs and JSON/Markdown output for every claim in the docs |

The authoritative instruction set is `Testing.md`. Nothing in the docs is marked PASS unless a test was executed and its output logged in `evidence/`.

---

## 1. Prerequisites

- **Node.js**: the suite is developed and verified on Node 22/24 with npm. Both `backend/` and `frontend/` have their own `package.json`; install in each once.
- **Playwright browsers**: `npx playwright install chromium firefox webkit` from the repo root. E2E, a11y, visual, and exploratory runs need them.
- **MongoDB**: none required. Backend, security, load, soak, and E2E suites start `mongodb-memory-server` themselves and download a `mongod` binary on first use into `backend/.cache/mongodb-binaries/` (`MONGOMS_DOWNLOAD_DIR` is set in both configs).
- **Env files**: no `.env*` file is read by the test suites. Backend tests build their own config via `backend/tests/helpers/config.js`. Do not read, print, or commit `.env*`.
- **Disk space**: every killed `mongodb-memory-server` can leave a ~300 MB `mongo-mem-*` directory in `%TEMP%`. Check free space before long runs (`df -h /c`); a full C: drive makes every `mongod` fail. Clean up only with explicit approval.

## 2. Run everything

```bash
npm run test:all
```

`test:all` runs, in order: `test:api → test:socket → test:db → test:web → test:security → test:load → test:e2e → test:a11y → test:visual`.

Rules that make the counts meaningful:

- **Run it sequentially and alone.** E2E binds fixed ports **3101** (test harness) and **5175** (Vite dev server), with the hidden control server on **3102**. Two runs in parallel collide.
- **Never run a second suite while `test:all` is running**; the build/E2E stage also writes `test-results/` and `playwright-report/`.
- `test:soak` (30 minutes) and `test:exploratory` (50-step chaos session) are **not** part of `test:all`; run them deliberately.

Current baseline (Phase 12 pair, unchanged through Phase 14): **556 tests = 464 passed + 92 expected fail**, exit 0, with identical per-stage counts in two consecutive runs.

## 3. Layers and commands

| Command | Runner | Location | Needs | Typical time |
|---|---|---|---|---|
| `npm run test:api` | Vitest + Supertest + in-memory Mongo | `backend/tests/api`, `backend/tests/health.test.js` | — | ~1.5 min |
| `npm run test:socket` | Vitest + `socket.io-client` | `backend/tests/socket` | — | ~2 min |
| `npm run test:db` | Vitest + Mongoose | `backend/tests/db` | — | ~1.5 min |
| `npm run test:web` | Vitest + jsdom + React Testing Library | `frontend/src/**/*.test.{js,jsx}` | — | ~20 s |
| `npm run test:security` | Vitest | `backend/tests/security` | — | ~2 min |
| `npm run test:load` | Vitest + socket load harness | `backend/tests/load` | — | ~2 min |
| `npm run test:soak` | Vitest (opt-in) | `backend/tests/soak` | — | ~30 min |
| `npm run test:e2e` | Playwright, Chromium | `tests/e2e` | browsers | ~6 min |
| `npm run test:e2e:cross` | Playwright, Firefox + WebKit | `tests/e2e` | browsers | ~15–25 min |
| `npm run test:a11y` | Playwright + axe | `tests/a11y` | browsers | ~1 min |
| `npm run test:visual` | Playwright screenshots | `tests/visual` | browsers + baselines | ~50 s |
| `npm run test:exploratory` | Playwright, Chromium (opt-in) | `tests/exploratory` | browsers | ~2.5 min |

Single file / single test:

```bash
cd backend && npx vitest run --config vitest.config.js --configLoader runner tests/api/messages.test.js
cd frontend && npx vitest run --config vitest.config.js src/features/chats/chats.test.jsx
npx playwright test --config tests/playwright.config.js --project=chromium tests/e2e/chat-flows.spec.js
npx playwright test --config tests/playwright.config.js --project=chromium tests/e2e/chat-flows.spec.js -g "CHAT-020"
```

Playwright writes an HTML report to `playwright-report/` and failure artifacts (traces, screenshots) to `test-results/`. Traces are retained only on failure. Vitest prints to the console; redirect it to a file when you need evidence.

## 4. How each layer boots

### Backend (Vitest)

- `backend/vitest.config.js` sets `MONGOMS_DOWNLOAD_DIR` and `UPLOAD_DIR` under `backend/.cache/`.
- `backend/tests/helpers/db.js` starts one in-memory Mongo per suite and **aborts unless the database name contains `test`** (`assertTestDatabaseName`). Never relax this guard.
- Most API suites boot the real Express app through `createApp()` with a test config, then drive it with Supertest. Socket suites start a real HTTP server plus `attachSocketIO` and connect real `socket.io-client` instances.
- Test-only harnesses (`backend/tests/harness/`) never run in production code paths.

### Frontend (Vitest)

- jsdom with `frontend/src/test/setup.js` (RTL cleanup, storage reset, matchMedia and observer stubs).
- Component tests mock the API client and socket; they assert user-visible behavior, not implementation details.

### E2E / a11y / visual / exploratory (Playwright)

- `tests/playwright.config.js` starts two servers: `backend/tests/harness/e2e-server.js` on **3101** and `vite dev` on **5175**, both with `reuseExistingServer: false`.
- The harness runs the real app against a fresh in-memory database whose name contains `test`, and exposes `/health`, `/snapshot`, `/seed`, and `/restart-main` on **3102** for setup and resilience tests.
- The harness **bypasses the three REST rate-limiter layers for E2E traffic only** (it asserts exactly three layers were replaced). REST rate limiting is still covered by `test:api` and `test:security`; production code is untouched.
- `workers: 1`, `fullyParallel: false`, `retries: 0`, 60 s per test (120 s for WebKit). Tests are expected to pass first time; do not add retries to mask flakiness.
- Multi-user flows open isolated browser contexts. Every socket test uses a third user (**`dave`**) as the must-not-receive witness.
- Chromium uses fake media device flags (`tests/helpers/media.js`); Firefox/WebKit run `tests/e2e/**` only, and the fake-microphone test is skipped there.

## 5. Expected-fail convention

An open bug is pinned by a test that **fails for the right reason**, so the suite stays green and the bug cannot silently disappear.

- Backend and frontend (Vitest): `it.fails('BUG-0NN / TEST-ID: expected behavior', async () => { … })`.
- Playwright: `test.fail(true, 'BUG-0NN: one-line reason')` inside the test.

Rules:

- Name every expected-fail test with its **BUG ID and test ID**, and state the observable defect in the name.
- Counts are reported as **`N = X passed + Y expected fail`**. A rising `X` or falling `Y` without a bug fix is a red flag: an expected-fail test may have started passing (the bug was fixed by accident) or been skipped.
- When a fix is approved and landed, **promote** the test: replace `it.fails` / `test.fail` with a normal test and update `BUGS.md`, `TRACEABILITY.md`, and `TEST_RESULTS.md` in the same change.
- Never delete an expected-fail test to make a suite green, and never write a test that passes for the wrong reason.

## 6. Adding tests

1. Find the test ID in [TRACEABILITY.md](./TRACEABILITY.md). If the behavior is not covered, add a row first (layer, phase, expected implementation).
2. Pick the lowest layer that can prove the behavior: API before socket, socket before E2E, unit before browser. UI-only behavior goes to E2E.
3. Name the test `<TEST-ID>: <behavior>` (backend/frontend) or use the test ID in the title (Playwright), so failures map to the matrix.
4. Follow determinism rules in §7. No arbitrary `sleep`; wait for observable conditions.
5. If the test reproduces a defect, file it in `BUGS.md` (severity, steps, expected/actual, evidence, suspected cause) **before** converting the test to expected-fail.
6. Run the single file, then the full stage, then `test:all` before claiming green. Record the log in `docs/testing/evidence/` and the counts in `TEST_RESULTS.md`.
7. High-risk tests (authorization, data loss, security) must be proven able to fail — run them against a deliberately broken **copy in a temp directory**, never against the real source.

## 7. Determinism rules

- **No arbitrary sleeps.** Wait for elements, socket acks, or store state.
- **Fixed ports, one worker.** Do not "fix" a port conflict by changing the config for one run; stop the other process.
- **`dave` witness.** For any "X must not receive/send this" assertion, use a third authenticated user who is not a participant.
- **Fresh users per run.** Helpers generate suffixed users (`ava*`, `avb*`, …) so parallel/rerun state cannot leak.
- **Bound Playwright actions.** Long multi-step specs call `page.setDefaultTimeout(… )` so a missing element fails a step instead of hanging the test.
- **Escape overlays in error paths.** A step that leaves a dialog open will cascade into unrelated failures; close it in the `catch`.
- **Selectors:** prefer roles and labels. `getByText`/`getByLabel` are substring matches — use `getByRole('dialog', { name })` when two accessible names share a prefix.
- **Never load real `.env` values** and never log message text, tokens, passwords, or file contents.

## 8. Updating visual baselines

Baselines live in `tests/visual/screens.spec.js-snapshots/` (30 images: login/chat/profile × light/dark × 5 viewports) and are **approved standards**.

```bash
npx playwright test --config tests/playwright.config.js --project=chromium tests/visual --update-snapshots=changed
npx playwright test --config tests/playwright.config.js --project=chromium tests/visual
```

- Use `=changed` to refresh only images that differ; `=all` rewrites everything; `=missing` adds new viewports.
- Regenerate **only after an intentional, reviewed UI change**. Compare against [DESIGN_BOARD_COMPARISON.md](./DESIGN_BOARD_COMPARISON.md), then get approval.
- Never regenerate to silence an unexplained diff — file a bug instead.
- Keep the masks to volatile pixels only: bubble `<time>` elements, date separators, and the random profile username.
- Baselines are OS/font-stack specific (`-chromium-win32`). A different OS reports missing baselines by design; do not commit a second set without approval.
- The 30 non-default chat-background baselines are **BLOCKED** by BUG-050 (no theme picker or `data-chat-theme`), not missing by accident.

## 9. Environment limitations (why some rows are BLOCKED, not FAIL)

- **WebKit on Windows has no `MediaRecorder`** — Safari voice recording cannot be exercised here; Chrome/Firefox are covered and the MIME branch is unit-tested.
- **`context.setOffline()` blocks HTTP, not WebRTC UDP**, and loopback ICE never breaks — mid-call network loss must be tested on real devices.
- **Headless Chromium auto-grants fake media**, so permission-denial and camera-light checks are manual (`MANUAL_CHECKLIST.md`).
- **The `Notification` and `Audio` APIs are stubbed** in tests; real OS prompts and notification centers are manual.
- **Visual and axe runs are Chromium-only**; Firefox/WebKit cover the functional E2E flows.
- **Playwright WebKit's cookie API reports `sameSite: "None"` for every cookie** — assert `SameSite` on the raw `Set-Cookie` header instead.

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `EADDRINUSE` on 3101 / 3102 / 5175 | Another suite or dev server is running. Stop it; do not change the port for one run. |
| Every `mongod` fails with `fassert` and free space is ~0 | Leftover `mongo-mem-*` dirs in `%TEMP%`. Check `df -h /c`; request approval before deleting. |
| E2E gets `429` on login/register | You are running against a non-harness server. E2E must use `tests/playwright.config.js`, which starts the harness. |
| Visual test reports a missing baseline | Wrong OS/browser, or a new viewport was added — see §8. |
| A test passes locally but the count differs | Compare per-stage counts, not the total. An expected-fail test that started passing is a real signal. |
| A multi-step spec hangs for minutes | An overlay stayed open. Bound default timeouts and close overlays in the error path (§7). |

## 11. Evidence convention

- Every documented run keeps its raw log in `docs/testing/evidence/`, named `<phase>-<suite>-<run>.log` (for example `phase12-soak.log`, `phase14-test-all-run1.log`).
- Screenshots and JSON reports go next to the log in the same dated/phase-named subdirectory.
- A result without a log link is not a result. When a document says PASS/PARTIAL/FAIL, the row must link to the run that produced it.
