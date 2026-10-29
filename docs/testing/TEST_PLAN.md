# ChatSphere Test Plan

**Status:** Draft for approval (Phase 0)
**Date:** 2026-10-25
**Owner:** QA / SDET
**Companion document:** [TRACEABILITY.md](./TRACEABILITY.md)

---

## 1. Purpose and sources of truth

This plan covers independent QA of ChatSphere as required by `Testing.md`. Truth order:

1. **Spec:** `Agents.Md` (Section 1 features, Section 5 behavior, Section 6 data/API/socket contracts).
2. **Design board:** `frontend/public/chatsphere-design-board.png`.
3. **Code:** used to understand *how* behavior is produced, never to declare what is correct.

Path discrepancies found in `Testing.md` (recorded as documentation defects, not app bugs):

- The design board is at `frontend/public/chatsphere-design-board.png`; `docs/design/chatsphere-design-board.png` does not exist.
- The repo uses `backend/` and `frontend/`, not `server/` and `client/`.
- `README.md` says `cd server` and references `server/.env.example`; the real folders are `backend/` and `frontend/`.
- `docs/PROGRESS.md` contains a duplicated block of phases 3–16 marked "Not started" after the same phases marked "Approved". It is internally inconsistent.

---

## 2. Scope

### 2.1 In scope

All 17 features from `Agents.Md` Section 1, plus cross-cutting areas: security, accessibility, responsive layouts/browsers, performance/resilience, logging/configuration, and the MongoDB/Mongoose data layer.

### 2.2 Out of scope / blocked unless the user confirms implementation

- **Web Push** (service worker + VAPID) — no service worker, VAPID config, or push code found. Phase 13 item only if approved and implemented.
- **Group video calls** — no call signaling exists at all; see 2.3.
- **Video-file messages** — the upload allowlist has no video MIME types.
- **Cloudflare R2** — only the local storage provider exists.
- Real third-party services, real email/SMS/push, production TURN, real production data.

### 2.3 Implementation snapshot (reconnaissance fact, not a test result)

The app is **not feature-complete against the spec**. At the time of this plan:

| # | Feature | What exists | Test readiness |
|---|---|---|---|
| 1 | Register/login | REST register/login/refresh/logout/me; JWT access + rotating refresh cookie; login/register UI; rate limit | Partially testable; no logout UI, no session bootstrap on reload, no redirect-back |
| 2 | Profiles | `PATCH /users/me`, user search, self profile page | Partially testable; no avatar endpoint/UI, no privacy UI/enforcement, no other-user profile page |
| 3 | 1:1 chat | Models/indexes, race-safe find-or-create, conversation list, socket send/dedupe, minimal chat UI | Partially testable; messages REST route throws, no pagination, no retry/reconcile, UI crashes on listed conversations |
| 4 | Group chat | REST create/add/remove/leave, partial role checks, system messages | Partially testable; no group UI, no live conversation events/room updates |
| 5 | Presence | Socket snapshot/update, multi-tab count, 10 s grace, `lastSeenAt` | Partially testable; broadcasts ignore contact scoping and privacy |
| 6 | Typing | Server `typing:start/stop` broadcast | Partially testable; client never emits or renders typing |
| 7 | Timestamps | Server timestamps in UTC | Not testable in UI; no timestamps or date separators rendered |
| 8 | Read receipts | Server writes delivered/read pointers and emits `message:status` | Partially testable; no client emit/ticks, no privacy/monotonic rules |
| 9 | Emoji picker | Lazy `emoji-picker-react`, cursor insertion, drafts | Partially testable; no jumbo rendering, no mobile sheet, app theme not passed explicitly |
| 10 | Files/images | Upload validation (magic bytes), thumbnails, signed-URL helpers, attachment schema | Partially testable; no signed URL returned, no media API/UI, no lightbox |
| 11 | Photo sharing | — | Missing (no media endpoint, Photos tab, or lightbox) |
| 12 | Audio | Upload allowlist for audio, DB fields | Partially testable; no recording, player, or Audio tab |
| 13 | Notifications | Unread counts, tab title, toast, desktop stub | Partially testable; no permission UI, sound, mute, missed-call notices |
| 14 | Chat themes | DB enum field, PATCH theme, system message | Partially testable; no picker, no theme tokens/patterns, no real-time conversation broadcast |
| 15 | Video/audio calls | `GET /api/calls/ice-config` (STUN + static env TURN) | **Blocked**: no `call:*` handlers, no WebRTC client, no call screens/logs/notifications |
| 16 | Light/dark | Tokens, zustand store, inline no-flash script, OS/tab sync in store | Partially testable; toggle unreachable in the real app, no-flash script misreads persisted state |
| 17 | MongoDB/Mongoose | Models, core indexes, auth flow | Partially testable; TTL semantics risk, no query-plan evidence |

**Consequence:** a full run of the catalog now will produce many FAILs that are missing-feature failures, not regressions. The plan still defines all tests so coverage is explicit from day one; see question Q6.

---

## 3. Reconnaissance facts and evidence

### 3.1 Repository and runtime

| Item | Observed |
|---|---|
| Layout | `backend/` (Express 5, ESM), `frontend/` (React 19, Vite 8, Tailwind 4), `docs/` |
| Package managers | npm, separate `package-lock.json` per folder |
| Backend runtime | Node >= 22.12, current Node v24.18.0 |
| Backend port | 3001, already listening (PID 12652) |
| Frontend port | 5173, already listening (PID 9068) |
| Database | Remote MongoDB reached by the running backend; root `.env` exists and was **not read** |
| Env loading | `backend/package.json` uses `--env-file-if-exists=../.env`; `frontend` uses Vite env |
| Health | `GET http://localhost:3001/api/health` → `200`, `{"status":"ok","database":"connected"}`, helmet headers present |
| UI | `http://localhost:5173/` loads the Login screen; screenshot saved at `docs/testing/recon-login.png`; no console errors |
| Design board | `frontend/public/chatsphere-design-board.png` (rich desktop/tablet/phone/call/media screens) |
| Existing tests | Only `backend/tests/health.test.js` (5 tests) |
| Backend test stack | Vitest 5.0.5, Supertest 7.1.4, mongodb-memory-server 10.2.3 |
| Frontend test stack | **None** (no Vitest, Testing Library, Playwright, axe) |

### 3.2 Commands and checks run

| Command | Result |
|---|---|
| `cd backend && npm test` | **PASS** — 1 file, 5 tests (health, server start, CORS, env fail-fast, DB readiness) |
| `cd frontend && npm run build` | **PASS** — build completes; two build warnings (`INEFFECTIVE_DYNAMIC_IMPORT` for `store/auth.js`, plugin timing) |
| `cd frontend && npm run lint` | **FAIL** — 11 errors, including `Avatar is not defined` in `Chats.jsx`, unused `ack`, `setState`-in-effect, empty catch block |
| `curl /api/health`, `curl /` | PASS — backend 200, frontend 200 |
| Browser load `/` | PASS — login screen renders, no console errors |

### 3.3 Suspected defects seen during code recon (must be reproduced before being logged as BUGs)

These are **leads**, not verified results. Each becomes a `BUG-nnn` only after a failing regression test exists (per `Testing.md` 2.3).

| ID | Suspicion | Evidence (code) |
|---|---|---|
| R-01 | `GET /conversations/:id/messages` throws `ReferenceError` (`before`, `limit` undefined) and has no membership check | `backend/src/routes/conversations.js:75-80` |
| R-02 | Chat list crashes for any non-empty conversation list (`Avatar` not imported) — promoted to **BUG-031**, fixed 2026-10-25 pending verification | `frontend/src/features/chats/Chats.jsx:114`; lint error |
| R-03 | No video/audio call signaling or client implementation despite feature 15 | no `call:*` in `backend/src/sockets/index.js`; grep found no `RTCPeerConnection`/`getUserMedia` |
| R-04 | Presence snapshot is sent to every user and updates are broadcast globally, ignoring contacts and privacy | `backend/src/sockets/index.js:39-51,97-111` |
| R-05 | Delivered/read handlers do not verify membership or privacy and do not keep pointers monotonic; clients never emit them | `backend/src/sockets/index.js:82-95`; no client emit |
| R-06 | Uploads are not exposed with signed URLs; `GET /api/uploads/:id` requires both Bearer auth and a signature, so `<img>`/media UI cannot load them; participant check is explicitly skipped | `backend/src/controllers/upload.controller.js:82-98` |
| R-07 | Upload TTL deletes every upload after 24 h, including attached messages (data loss) | `backend/src/models/Upload.js:19` |
| R-08 | `PATCH /conversations/:id` lets any member rename groups/change themes, accepts unvalidated theme values at route level, and never broadcasts the update | `backend/src/routes/conversations.js:56-74` |
| R-09 | Group membership changes do not update socket rooms or notify clients; removed users keep receiving events until reconnect | `backend/src/routes/conversations.js:34-54`; room join only at connect |
| R-10 | Socket events have no zod validation, message length cap, type validation, rate limiting, or ack contract enforcement | `backend/src/sockets/index.js:54-95` |
| R-11 | Session does not survive reload: access token is memory-only and there is no bootstrap refresh; protected routes redirect to login | `frontend/src/store/auth.js`, `ProtectedRoute.jsx:5-6`, `App.jsx:20-24` |
| R-12 | No logout UI, no theme toggle in the real UI, no typing/groups/media/call UI; message timestamps, date separators, grouping, sender labels, and ticks were missing — those were promoted to **BUG-033**, fixed and verified 2026-10-25; `Shell.jsx` is still unused mock UI | `frontend/src/App.jsx`, `frontend/src/app/Shell.jsx`, `Chats.jsx`, `MessageList.jsx` |
| R-13 | No-flash script reads the entire zustand JSON string as the theme preference; persisted dark users paint light first — promoted to **BUG-032**, fixed 2026-10-25 pending verification | `frontend/index.html:8-26`, `frontend/src/store/theme.js:17-44` |
| R-14 | Username validation requires at least two digits, which the spec does not; character set `a-z 0-9 _` is not enforced | `backend/src/validation/auth.js:4`; `frontend/src/features/auth/Register.jsx:23` |
| R-15 | Message attachments can be attached concurrently (owner check + `updateMany` not atomic), and `attachedTo: 'pending'` stores a non-ObjectId string in an ObjectId ref | `backend/src/services/conversation.service.js:37-44` |
| R-16 | Client socket has no token-refresh path; after the 15-minute access token expires, reconnects fail until a REST call refreshes and the app remounts | `frontend/src/lib/socket.js` |
| R-17 | Own messages trigger toast/unread in other tabs (server echoes `message:new` to the sender; no sender check) | `backend/src/sockets/index.js:65`; `Chats.jsx:23-35` |
| R-18 | Docs are stale (README folders, PROGRESS duplicate phases) | `README.md`, `docs/PROGRESS.md` |
| R-19 → **BUG-001** | All protected REST routes hang: `requireAuth` is a factory registered unwrapped, so `next()` is never called | `backend/src/middleware/auth.js:4`; routes e.g. `conversations.js:9`; regression test `tests/api/bug-001-auth-hang.test.js` |

---

## 4. Strategy and layers

| Layer | Tool | Coverage | Phase |
|---|---|---|---|
| Backend unit/integration | Vitest 5 + Supertest 7 + mongodb-memory-server 10 | services, validation, REST, models/indexes, auth, uploads | 2, 4 |
| Socket/real-time | `socket.io-client` 4.8.4 inside Vitest | handshake auth, rooms, all events, ack shapes, multi-client, reconnect | 3 |
| Frontend unit/component | Vitest + jsdom + React Testing Library + user-event + jest-dom | forms, stores, message list logic, composer, emoji, call reducer, time formatting | 5 |
| E2E | Playwright 1.64 + isolated contexts (alice/bob/carol/dave) | full multi-user flows, real-time visibility, responsive, keyboard | 6, 7, 8, 10 |
| Accessibility | `@axe-core/playwright` 4.14 + manual keyboard/screen-reader seeds | all screens, both modes, 4 backgrounds | 9 |
| Visual | Playwright screenshots | light/dark × 4 backgrounds × 5 viewports vs approved baselines/design board | 9 |
| Security | Supertest + socket attack harness + `npm audit` + secret scan + build grep | full authz tables, injection, upload attacks, socket abuse, CSRF, headers | 11 |
| Load/soak | custom `socket.io-client` harness (or Artillery 2.0.34 if approved) | 100/500 sockets, latency, errors, memory, 30-min soak | 12 |
| Media inspection | `sharp` metadata (already a backend dep) | EXIF/GPS removal, dimensions, thumbnails | 7 |
| Performance | Playwright + Lighthouse 13.5 (optional) | virtualization, bundle size, client leaks, Lighthouse | 12 |

### 4.1 Truthfulness and quality rules

- No PASS without an executed test and captured output. Statuses: `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`, `FLAKY`.
- No arbitrary sleeps: event/condition waits, Playwright `page.clock`, Vitest fake timers.
- Failing tests re-run 3×; inconsistent results become `FLAKY` and are quarantined.
- The 10 highest-risk tests are proven able to fail against a broken copy of the code in a temp directory, never against the real source.
- One phase at a time, Phase Report + STOP at each gate.

---

## 5. Proposed test dependencies (approval required)

All are dev-only; no production dependency changes.

| Package | Version | Folder | Purpose |
|---|---|---|---|
| `socket.io-client` | 4.8.4 | backend dev | socket integration/attack/load harness (matches server 4.8.4) |
| `@vitest/coverage-v8` | 5.0.5 | backend dev | coverage reports (optional but recommended) |
| `vitest` | 5.0.5 | frontend dev | component/unit runner |
| `jsdom` | 30.1.3 | frontend dev | DOM environment |
| `@testing-library/react` | 16.3.3 | frontend dev | component tests |
| `@testing-library/dom` | peer of RTL | frontend dev | required peer |
| `@testing-library/user-event` | 14.6.8 | frontend dev | realistic interactions |
| `@testing-library/jest-dom` | 7.0.1 | frontend dev | DOM matchers |
| `@playwright/test` | 1.64.1 | frontend dev (or root test workspace) | E2E, visual, network, clocks, fake media |
| `@axe-core/playwright` | 4.14.0 | frontend dev | accessibility scans |
| `artillery` | 2.0.34 | optional | load tests; otherwise a custom socket.io-client harness (no extra dep) |
| `lighthouse` | 13.5.0 | optional | performance audit numbers |

Also requires Playwright browser binaries (`npx playwright install chromium firefox webkit`, large download) and, optionally, external tools:

- `gitleaks` (secrets scan) — or a documented custom scan fallback.
- `exiftool` — optional; `sharp` metadata is sufficient for EXIF/GPS verification.
- Docker + OWASP ZAP baseline — optional; skip if Docker is unavailable.

**Not adding:** any production library, test runner for the wrong layer, or code-change dependency.

---

## 6. Test environments and data safety

### 6.1 Backend and socket tests

- Use `mongodb-memory-server` per test file/worker; unique DB name per run.
- **Guard:** before any write/cleanup, assert the database name matches `/test/i`; abort otherwise.
- Generate JWT secrets per run (random, in-memory); never read the root `.env`.
- Each test creates unique data (random suffix) and cleans up; safe to parallelize.

### 6.2 E2E environment (recommended)

- A **test-only** harness entry (e.g. `backend/tests/harness/e2e-server.js`) starts a `MongoMemoryServer`, then `createApp` + `attachSocketIO`, and listens on a test port (e.g. **3101**).
- Playwright `webServer` starts the harness and the Vite dev server on a test port (e.g. **5175**) with `VITE_API_BASE_URL=http://localhost:3101/api`.
- This keeps all E2E data in memory, never touching the user's remote MongoDB.
- The harness replaces exactly three REST limiter layers (global `/api`, login, register) with pass-through handlers and aborts unless exactly three are found. The app's 20 auth requests/15 min per IP cannot accommodate a 40-test multi-user suite from one loopback address; rate limiting is covered by the backend API/socket suites. This bypass exists only in the E2E harness, never in app source.
- Chromium, Firefox, and WebKit must match the installed `@playwright/test` version; run `npx playwright install firefox webkit` after dependency updates (Phase 6 initially failed at launch because only older browser revisions were present).
- If a real test database is preferred instead, a `.env.test` with placeholders is required (names only, user fills values): `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGIN`, `PORT`. The DB name must contain `test`.

### 6.3 Media assets

`tests/assets/` will contain generated or synthetic files: valid/invalid images, documents, audio, executables renamed to images, zero-byte/corrupt/truncated files, SVG with script, decompression-bomb PNG, filenames with traversal/Unicode/NUL. All generated by scripts, no copyrighted content.

---

## 7. Fixtures and harness

- **Users:** `alice` (primary), `bob`, `carol`, `dave` (outsider for every authorization test), `erin` (all privacy settings off). Unique random suffix per run.
- **Helpers:** `loginAs` (API session), `createSocket(user)`, `expectNoEvent(socket, event, window)`, `makeConversation`, `uploadAsset`, Playwright multi-context fixture, fake media flags (`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`), network control via CDP, timezone/color-scheme/permission emulation.
- **Viewports:** 360×760, 390×844, 768×1024, 1024×768, 1440×900.
- **Browsers:** Chromium (primary), Firefox, WebKit; WebKit media codec limits reported honestly.

---

## 8. Test ID conventions

`AUTH`, `PROF`, `PRES`, `CHAT`, `TS`, `TYP`, `REC`, `GRP`, `EMO`, `FILE`, `PHOTO`, `AUD`, `NOTIF`, `THEME`, `CALL`, `MODE`, `DB`, `SEC`, `A11Y`, `RESP`, `PERF`, `LOG` — three digits each (e.g. `AUTH-007`). Full mapping in `TRACEABILITY.md`.

---

## 9. Phase schedule

| Phase | Scope | Gate |
|---|---|---|
| 0 | Recon, this plan, traceability | **This approval** |
| 1 | Test infrastructure + smoke per layer (backend, socket, frontend, E2E, assets, scripts) | Smoke passes twice |
| 2 | REST tests (auth, profiles, conversations, messages, uploads, ICE config, REST authz) | All REST routes covered |
| 3 | Socket tests (auth, rooms, all events, validation, authz, presence, receipts, resync) | Every event covered |
| 4 | DB integrity, indexes, query plans, races, outage | All logged |
| 5 | Frontend unit/component tests | Logic covered |
| 6 | E2E flows (features 1–9, 12, 14) | Chromium pass; FF/WebKit logged |
| 7 | Media tests (files/images/audio) | Every file-matrix row has a result |
| 8 | Calling tests + manual checklist | Suite stable 3× |
| 9 | Appearance, a11y, responsive, visual baselines | Baselines approved |
| 10 | Notifications | Every rule has a result |
| 11 | Security (full authz tables, injection, uploads, abuse) | S1 findings reported immediately |
| 12 | Performance/resilience | Numbers recorded with method |
| 13 | Exploratory/chaos session | Log written, findings filed |
| 14 | Final report, traceability complete, `test:all` twice | Report approved |

All phases depend on feature availability; see Q6.

---

## 10. Reporting

- `TEST_RESULTS.md` is the running log of every executed test with status, evidence path, command.
- `BUGS.md` uses the `Testing.md` format; severities S1–S4. Spec deviations and open questions are logged separately.
- `MANUAL_CHECKLIST.md` holds what automation cannot honestly verify (TURN/network, real devices, screen readers, etc.).
- `TRACEABILITY.md` must have no empty rows at Phase 14.

---

## 11. Risks and assumptions

| Risk | Impact | Mitigation |
|---|---|---|
| Many features absent (calls, group/media/call UI, themes UI, privacy) | Large FAIL volume that is not regression signal | Report as spec deviations/blocked; prioritize what exists (Q6) |
| E2E memory-server harness needs test-only server entry | Allowed as test infrastructure, but must be approved | Keep it under `tests/`, never import into app |
| Test DB is remote in the running dev app | Accidental data damage | Never point tests at root `.env`; memory server + name guard |
| Real-time flakiness | False FAIL/FLAKY | Event/condition waits, deterministic fixtures, 3× reruns |
| Playwright browser downloads | Time/disk | One-time install; ask approval |
| WebKit media codecs differ | Some audio/call tests BLOCKED on WebKit | Feature-detect MIME; document limits |
| Design board path/spec differences | Wrong visual baselines | Board path fixed in this plan; Q7 |
| No TURN/ExpressTURN credentials | Cross-network calls untestable | Manual checklist; no static secrets in bundle |
| Stale docs (`README`, `PROGRESS`) | Misleading setup and status | Log as doc deviations; do not edit app docs except `docs/testing/` |

---

## 12. Decisions needed before Phase 1

1. **Q1 — Dependencies:** approve the list in Section 5 (including Playwright browser downloads)? Anything to remove?
2. **Q2 — Test database:** accept the in-memory E2E harness (recommended), or provide a dedicated `*_test` MongoDB via `.env.test` (names only, values filled by you)?
3. **Q3 — Optional features:** Web Push, group video calls, video-file messages, and R2 were approved in the build plan, but none are implemented. Confirm they are out of scope for testing, or should their absence be logged as S2 spec deviations now?
4. **Q4 — Start commands:** confirm the commands to use are `cd backend && npm run dev` (loads `../.env`, port 3001) and `cd frontend && npm run dev` (port 5173). `README.md` currently documents a non-existent `server/` folder.
5. **Q5 — Known bugs:** are there any known bugs or behaviors I should skip or treat as accepted for now?
6. **Q6 — App completeness gating:** the app is not finished against the spec. Choose: **(a) test the current state now** and log every missing feature as FAIL/spec deviation (recommended for an honest baseline), **(b) test only implemented features and mark the rest `BLOCKED`/`NOT TESTED` until built**, or **(c) wait for implementation** before Phase 2. Phase 1 (infrastructure) can proceed under any option.
7. **Q7 — Design/status docs:** confirm the design board is `frontend/public/chatsphere-design-board.png`, and that `docs/PROGRESS.md`'s duplicate "Not started" rows and `README.md`'s `server/` paths are stale (I will log them, not edit them).

---

**Phase 0 exit criterion:** user approves this plan.
