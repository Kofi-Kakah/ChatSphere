# Phase 13 — Exploratory and chaos session

**Date:** 2026-10-28
**App commit:** `57302b2` (no application source changes during this phase; only test files and docs)
**Harness:** [tests/exploratory/chaos.spec.js](../../tests/exploratory/chaos.spec.js) — one Playwright test, 50 numbered steps, three browser contexts (alice, bob, carol) against the E2E server (backend 3101 / control 3102 / Vite 5175, in-memory MongoDB).
**Command:**

```bash
CHAOS_RUN=run3 npm run test:exploratory
```

Every step is wrapped so an anomaly is recorded with its evidence instead of failing the run; a run is successful when all 50 steps execute and the summary is written. Findings are filed in [BUGS.md](./BUGS.md); this document is the session log.

## Run history

| Run | Steps | Anomalies | Step errors | Duration | Outcome |
|---|---|---|---|---|---|
| run 1 | 50 | 6 | 0 | 2.5 min | Completed; first pass at all surfaces |
| run 2 | 50 recorded | 7 | 9 | 15 min (test timeout) | **Aborted by a harness defect**, not a product result — `getByLabel('Image viewer')` substring-matched both the dialog and its Close button (strict-mode violation); the resulting overlay blocked later clicks and the remaining steps cascaded into timeouts. Fixed in the harness afterwards (role-based dialog locator, 20 s default action timeout, Escape in the step catch). Evidence kept for traceability. |
| **run 3** | **50** | **8** | **0** | **2.4 min** | **Authoritative run** — completes every step. |

Run 1 found the same search, duplicate-row, stale-history, jumbo-emoji, and 1-character-username defects, plus the unbroken-word overflow (then step 30, 842,282 px because the 100,000-character message from step 10 was still on screen). Run 3 reordered the long-content and viewport steps, so its 59,684 px overflow and 303/333 px phone overflow are measured on clean screens; the profile-bio 500 was recorded as an anomaly only after the harness began checking the HTTP status. Where runs disagree, run 3's numbers are quoted.

Setup per run: three fresh users (`chaosa`/`chaosb`/`chaosc`), direct chats AB and AC renamed "Chaos AB"/"Chaos AC", group "Chaos Group". Only Alice's account is used for the destructive profile tests; the harness restores the username afterwards.

## Results (run 3)

*ok* = behaved as expected; *anomaly* = a finding, mapped to a bug or an open question.

| # | Step | Result | Note |
|---|---|---|---|
| 01 | three clients connect and list their conversations | ok | 3/2/2 rows |
| 02 | open Chaos AB on alice and bob | ok | both headers show Chaos AB |
| 03 | baseline message is delivered to the other user | ok | delivered exactly once to bob |
| 04 | double Enter on one draft | ok | stored 1 copy |
| 05 | double-click the Send button | ok | stored 1 copy |
| 06 | ten Enter presses on one draft | ok | stored 1 copy |
| 07 | whitespace-only message is blocked by the client | ok | no bubble added |
| 08 | newline-only message is blocked by the client | ok | no bubble added |
| 09 | 4001-character message has no client limit | ok | accepted — BUG-019 (server accepts >4000) |
| 10 | 100,000-character paste | ok | 2,969 ms, socket connected, stored 1 — BUG-019 extended |
| 11 | HTML and script payload renders as text | ok | inert in bob's DOM (no execution, no `<b>`/`<img>`) |
| 12 | three-emoji and four-emoji sizing | **anomaly** | 3-emoji and 4-emoji both 15 px — BUG-035 |
| 13 | emoji picker inserts at the caret | ok | inserted at caret; picker closes via the emoji button |
| 14 | emoji picker after send | ok | picker stays open after send (not graded; spec is silent) |
| 15 | conversation search filters the list | **anomaly** | non-matching query left all 3 rows — **BUG-093** |
| 16 | New chat with an existing contact does not duplicate the row | **anomaly** | UI 4 rows, API 3 — **BUG-094** |
| 17 | New chat with an unknown username | ok | prompt + "not found" alert |
| 18 | New chat cancelled with an empty prompt | ok | no change |
| 19 | New chat with your own username | **anomaly** | header "Chat", 6 UI rows for 4 conversations, 1 self chat — Q-001 + **BUG-094** |
| 20 | profile: 161-character bio | **anomaly** | PATCH 500 + raw Mongoose text — BUG-088 |
| 21 | profile: one-character username | **anomaly** | accepted (200, "Saved") — BUG-013 |
| 22 | group: three users send at the same time | ok | all three messages visible to all three users |
| 23 | three-user interleave does not cross conversations | ok | direct and group messages stayed in their chats |
| 24 | stale history after a slow conversation switch | **anomaly** | header AB, 11 → 1 bubbles, AC message on screen — **BUG-095** |
| 25 | rapid conversation switching (30 clicks) | ok | 30 clicks in 7,610 ms; final header Chaos Group |
| 26 | draft survives switching away and back | ok | draft restored |
| 27 | info panel toggles 20 times quickly | ok | final `aria-pressed=true` |
| 28 | media tabs switch 12 times | ok | final selected tab Audio |
| 29 | send 30 messages quickly and check order | ok | bob got all 30 in order; 30 ws events, 0 duplicates; 71 DOM bubbles, 71 unique |
| 30 | zero-width and control-looking characters | ok | rendered |
| 31 | paste an image, send it, and confirm delivery | ok | delivered to bob; media API 200 with 1 item |
| 32 | drop a file on the composer | ok | drop created a chip |
| 33 | send while an upload is still in progress | ok | blocked with "Wait for uploads to finish"; nothing stored |
| 34 | cancel an in-flight upload | ok | chip removed |
| 35 | upload a rejected executable | ok | chip shows the file; send rejected (400) |
| 36 | upload an oversized file | ok | rejected client-side with a toast |
| 37 | voice recording start, stop, and send | ok | voice message delivered to bob |
| 38 | voice recording cancelled | ok | recording bar closed, nothing sent |
| 39 | lightbox opens and navigates from the Photos tab | ok | tile opened, ArrowRight navigated, Esc closed |
| 40 | close a tab in the middle of an upload | ok | server healthy (200) after the tab closed |
| 41 | switch account in one browser | ok | bob sees 2 rows after login on the same tab |
| 42 | offline send leaves a pending bubble and shows the banner | ok (expectation matched BUG-034/091) | banner shown and cleared; offline bubble stayed; **0 server copies** after reconnect — BUG-034/BUG-091 |
| 43 | 3 offline flaps while typing preserve the draft | ok | draft intact |
| 44 | viewport rotation mid-conversation | ok (known BUG-067) | overflow 303 px at 390×844, 333 px at 360×760; 0 at 768 and 1440 |
| 45 | 200% zoom (720×450) | ok | composer 201 px wide, no horizontal overflow |
| 46 | long unbroken word does not overflow the page | **anomaly** | 4,000 unbroken chars → 59,684 px document overflow — **BUG-096** |
| 47 | scroll up while messages arrive | ok (known BUG-076) | `scrollTop=0`, 0 "New messages" pills |
| 48 | browser back and forward | ok | stayed inside the app URL |
| 49 | reload keeps the session | ok (known BUG-039) | reload landed on the login form |
| 50 | console, page errors, and failed requests | ok | 10 console errors, 3 failed requests, all accounted for: 6 duplicate-key warnings (BUG-094), 1 × 500 (bio, BUG-088), 1 × 400 (executable upload), 1 aborted upload (cancel step), 2 offline polling failures (intentional) |

Zero page errors. No unhandled exceptions, no unexpected failed requests.

## Findings filed this phase

| ID | Severity | Summary | Reproduced |
|---|---|---|---|
| BUG-093 | S3 | Conversation search box is inert | run 1, run 3 |
| BUG-094 | S3 | "New chat" prepends without dedupe → duplicate rows and React key collisions | runs 1–3 |
| BUG-095 | S2 | Fast conversation switching shows the previous chat's messages under the new header | run 1, run 3 |
| BUG-096 | S2 | A 4,000-character unbroken word overflows the page horizontally | run 1, run 3 |

Existing bugs re-confirmed with Phase 13 evidence: BUG-013 (1-character username), BUG-019 (>4,000 and 100,000-character text), BUG-034 + BUG-091 (offline send never reconciled or resynced), BUG-035 (no jumbo emoji), BUG-039 (reload logs out), BUG-067 (phone layout overflow), BUG-076 (no "New messages" pill), BUG-088 (profile 500 leaks Mongoose text). Q-001 (self-chat) was extended with the UI path.

## Not exercised / blocked

- **Switching light/dark mode and chat background mid-call** — there is no calling UI at all (BUG-062) and no call persistence (BUG-063), so the call screen cannot be reached from the app. The mode/background switch itself is covered by Phase 9 (theme tests, visual matrix) on every screen that exists.
- **Browser notification permission flow / notification click-through** — covered by Phase 10 E2E; not repeated here (permission prompts cannot be driven from the chaos harness without granting them globally).
- **Mobile touch gestures** (long-press, on-screen keyboard) — not reproducible in headless Chromium; the phone layout is already broken (BUG-067), so the session records the horizontal overflow instead.

## Harness defects fixed during the phase

1. `getByLabel('Image viewer')` substring-matched the dialog **and** the "Close image viewer" button → strict-mode violation that left the overlay open (run 2). Now uses `getByRole('dialog', { name: 'Image viewer' })` and closes with Esc, falling back to the Close button.
2. An open overlay could hang a step until the 15-minute test timeout. Each page now has a 20 s default action timeout and the step catch presses Escape.
3. Run 1's viewport measurement included the 100,000-character message; the viewport and long-word steps were reordered and the mobile check now runs on a clean group chat.
4. `page.once('dialog')` handlers, attachment chips, and the emoji picker are explicitly cleaned up between steps so one step cannot contaminate the next.

## Evidence

- Session summaries: [phase13-session-run3.json](./evidence/phase13-session-run3.json), [phase13-session-run3.md](./evidence/phase13-session-run3.md) (authoritative); run 1 and run 2 equivalents alongside.
- Console/runner logs: [phase13-run3.log](./evidence/phase13-run3.log), [phase13-run1.log](./evidence/phase13-run1.log), [phase13-run2.log](./evidence/phase13-run2.log) (aborted).
- API probe for the profile limits and self-chat: [phase13-api-probe.log](./evidence/phase13-api-probe.log), [phase13-api-probe-server.log](./evidence/phase13-api-probe-server.log).
- Step-failure screenshots: [phase13/](./evidence/phase13).
