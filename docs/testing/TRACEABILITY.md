# ChatSphere Test Traceability Matrix

**Status:** Phase 0–14 approved (Phase 14 report approved 2026-10-28; **BUG-095 and BUG-096 are the only authorized fixes so far**). Backend REST: 140 tests (121 passed + 19 expected fail). Socket/real-time: 84 tests (45 passed + 39 expected fail). Database: 38 tests (32 passed + 6 expected fail). Frontend: 90 tests (79 passed + 11 expected fail). Security: 72 tests (56 passed + 16 expected fail). Load/soak: 5 tests (4 passed + 1 expected fail). E2E Chromium: 107 passed. Accessibility: 14 axe scans passed. Visual: 8 comparisons against 30 baselines. Full `test:all`: **558 tests, 466 passed + 92 expected fail**, exit 0 ([post-fix log](./evidence/bug-096-test-all.log)); the pre-fix baseline was 556 = 464 + 92 ([Phase 14 run 1](./evidence/phase14-test-all-run1.log); [run 2](./evidence/phase14-test-all-run2.log)). **BUG-095 is fixed** (CHAT-021 PASS) and **BUG-096 is fixed** (CHAT-022 PASS; both regressions proven red first; chaos steps 24 and 46 now pass, 8 anomalies → 6). Every feature row below now carries an executed result or an explicit reason; **14 rows remain unexecuted** (AUTH-017, PRES-008, TS-006, TYP-002, GRP-008, EMO-004, EMO-006, AUD-010, NOTIF-012, CALL-021, MODE-008, LOG-001…LOG-003) and are listed with reasons in [TEST_RESULTS.md](./TEST_RESULTS.md#phase-14-checks-final-regression-and-handoff). Phase 13 ran a separate 50-step, three-user chaos session (not part of `test:all`); run 3 completed every step with 8 anomalies and 0 errors and filed **BUG-093…BUG-096** (inert search, duplicate rows/key collisions, stale history, unbroken-word overflow — 2 × S2, 2 × S3), re-confirming BUG-013/019/034/035/039/067/076/088/091 and extending Q-001. Calling remains unimplemented (BUG-017/BUG-062/BUG-063), which blocked the mid-call scenario. BUG-031/BUG-032/BUG-033/BUG-053…BUG-061 plus BUG-020/BUG-012/SD-003/SD-004 fixes are approved and verified (BUG-021 partially); BUG-002/BUG-003 still await your verification.
**Date:** 2026-10-28
**Legend — Impl:** `Yes` / `Partial` / `Missing` (observed implementation, not correctness)
**Legend — Exec:** `PASS` / `PARTIAL` / `FAIL` / `BLOCKED` / `NOT TESTED` / `FLAKY` (FAIL rows link to a reproduced bug in `BUGS.md`)

> Truthfulness rule: nothing is marked PASS unless executed and observed. Phase 2 executed the backend REST suite (`backend/tests/api`, 103 tests); Phase 3 executed the socket suite (`backend/tests/socket`, 64 tests); Phase 4 executed the database suite (`backend/tests/db`, 35 tests); Phase 5 executed the frontend unit/component suite (`frontend/src`, 59 tests). Rows marked FAIL have a reproduced, logged bug and an expected-fail test keeping the suite green; the bug stays open until an approved fix lands.

---

## 1. Requirement sources

| Source | Location | Note |
|---|---|---|
| Build spec | `Agents.Md` | Sections 1, 5, 6 |
| QA instructions | `Testing.md` | Phases and catalogs |
| Design board | `frontend/public/chatsphere-design-board.png` | `docs/design/...` in Testing.md is stale |
| Running app | `backend/` + `frontend/` | backend :3001, frontend :5173 |

---

## 2. Feature coverage

### 2.1 Register and login (`Agents.Md` 5.1)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| AUTH-001…002 | Register happy; duplicate email/username with case variations | API, E2E | 2, 6 | Yes | PARTIAL (API PASS; E2E register happy + taken-username error PASS; duplicate email E2E not exercised) |
| AUTH-003 | Username 2/3/20/21 chars, uppercase, spaces, emoji, homoglyphs, char set; digit-rule deviation | API, WEB | 2, 5 | Partial | PARTIAL (2/21 boundaries PASS; charset/emoji/homoglyphs untested; SD-001) |
| AUTH-004 | Email/displayName/password validation; 7 vs 8 chars; common passwords; 10k inputs; extra fields | API | 2 | Partial | PARTIAL (validation + common passwords PASS; 10k inputs untested) |
| AUTH-005 | Login by email and username, case-insensitive | API, E2E | 2, 6 | Yes | PASS (API + E2E: includes mixed-case username and email) |
| AUTH-006 | Generic errors and timing do not reveal account existence | API, SEC, E2E | 2, 6, 11 | Unknown | PARTIAL (identical bodies in API + E2E for wrong password vs unknown account; timing not measured) |
| AUTH-007 | Refresh rotates; old token fails | API | 2 | Yes | PASS |
| AUTH-008 | Refresh reuse revokes whole family | API, SEC | 2, 11 | Yes | PARTIAL (API PASS; SEC sweep pending) |
| AUTH-009 | Logout invalidates refresh token | API | 2 | Yes | PASS |
| AUTH-010 | Session survives reload; single-flight refresh; survives multiple tabs | E2E, WEB | 5, 6 | **Partial (no bootstrap)** | FAIL (E2E reload signs the user out — BUG-039; WEB single-flight refresh and 401→refresh→retry PASS; multi-tab untested) |
| AUTH-011 | Protected route redirects and returns to original page | WEB, E2E | 5, 6 | **Partial (no return path)** | FAIL (E2E: login always lands on `/` — BUG-041; WEB unauthenticated redirect PASS) |
| AUTH-012 | NoSQL operator login payload; mass assignment (`role`, `isAdmin`, `_id`, `passwordHash`) | SEC | 11 | Partial | PARTIAL (mass assignment PASS; NoSQL payload pending SEC-003) |
| AUTH-013 | Expired/tampered/`alg:none`/wrong-secret JWTs → 401 | SEC | 11 | Yes | PASS |
| AUTH-014 | Cookie `HttpOnly`, `Secure` in production, `SameSite` | API, SEC | 2, 11 | Yes | PASS (HttpOnly/SameSite/Path; Secure in production) |
| AUTH-015 | Login/register rate limit and lockout | API, SEC | 2, 11 | Partial (limit, no lockout) | PARTIAL (limit PASS; no lockout — SD-002) |
| AUTH-016 | Access token absent from localStorage/sessionStorage | E2E | 6 | Yes | PASS (token absent from both Web Storage stores; refresh cookie HttpOnly + SameSite=Lax) |
| AUTH-017 | Multi-tab simultaneous refresh behaviour | E2E | 6 | Partial | NOT TESTED — single-flight refresh is web-tested inside one tab; two tabs refreshing at the same instant is not exercised (rotation and reuse detection themselves are covered by AUTH-008) |
| AUTH-018 | Register/login UI, show/hide password, inline validation, design board | WEB, E2E, VIS, A11Y | 5, 6, 9 | Partial | PARTIAL (WEB validation/payloads PASS; E2E register + login happy paths PASS; show/hide password, visual, a11y NOT TESTED) |
| AUTH-019 | Logout UI works and clears session | E2E | 6 | **Missing** | FAIL (BUG-040: no logout control in the app; no app shell/nav) |
| AUTH-020 | Socket handshake auth; token expiry/reconnect while connected; logout while socket open | SOCKET, SEC | 3, 11 | Partial | PARTIAL (no/malformed/expired/wrong-secret token rejected; valid token + snapshot PASS; expiry/logout mid-socket untested) |

### 2.2 User profiles (`5.2`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| PROF-001 | Display name/bio boundaries (160 vs 161); persistence | API, E2E | 2, 6 | Partial (no validation) | FAIL (BUG-008: bio 161 → 500; E2E display name/username/bio edit persists PASS) |
| PROF-002 | Username change uniqueness + concurrent claim race | API, DB | 2, 4 | Partial | PARTIAL (uniqueness 409 PASS incl. E2E UI; short username accepted — BUG-013; race untested) |
| PROF-003 | Avatar upload valid/invalid/oversized | API | 2, 7 | **Missing endpoint/UI** | BLOCKED (SD-003: endpoint missing) |
| PROF-004 | Avatar cropped square; EXIF stripped | API, MEDIA | 7 | **Missing** | BLOCKED (SD-003: endpoint missing) |
| PROF-005 | Privacy settings persist | API, WEB | 2, 5 | Partial (no UI) | PARTIAL (API merge persists; no privacy UI — BUG-042) |
| PROF-006 | Privacy enforcement: presence dot and last seen | API, SOCKET, E2E | 3, 6 | **Missing enforcement** | FAIL (BUG-018: presence/lastSeen broadcast ignores privacy; UI untested) |
| PROF-007 | Privacy enforcement: read receipts reciprocal | SOCKET, E2E | 3, 6 | **Missing enforcement** | FAIL (BUG-023: status broadcast ignores `sendReadReceipts`) |
| PROF-008 | Search partial/case-insensitive; regex chars (`.*`, `(`, `[`); limits/pagination | API, SEC | 2, 11 | Partial (unescaped regex) | FAIL (BUG-009: unescaped regex) |
| PROF-009 | Search/user responses leak no password hash, email, tokens | API, SEC | 2, 11 | Partial | PASS |
| PROF-010 | IDOR: `dave` cannot read/edit private fields; other-user profile view + shared media | API, SEC, E2E | 2, 11, 6 | **Missing profile view** | PARTIAL (public-only API view PASS; no other-user profile UI — BUG-043) |
| PROF-011 | Profile/privacy/avatar UI | E2E, A11Y | 6, 9 | Partial (self edit only) | FAIL (E2E self edit/persist PASS; privacy controls missing — BUG-042; avatar missing — SD-003; other-user profile missing — BUG-043) |

### 2.3 Online status / presence (`5.3`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| PRES-001 | Online on connect | SOCKET | 3 | Yes | PASS (contact receives `presence:update online:true`) |
| PRES-002 | Multiple tabs/devices count as one user | SOCKET, E2E | 3, 6 | Yes | PASS (second tab emits nothing; first disconnect emits nothing) |
| PRES-003 | Offline after ~10 s grace; refresh does not flicker | SOCKET | 3 | Yes | PASS (offline at ~10 s; reconnect inside grace → no flicker) |
| PRES-004 | `lastSeenAt` set on offline; header text | SOCKET, E2E | 3, 6 | Partial (no UI) | PARTIAL (stored + broadcast PASS; no header status text — BUG-045) |
| PRES-005 | Presence snapshot accurate on connect | SOCKET | 3 | Partial (over-broad) | FAIL (BUG-018: snapshot lists every user) |
| PRES-006 | Privacy: `showOnlineStatus`, `showLastSeen` enforced | SOCKET, SEC | 3, 11 | **Missing** | FAIL (BUG-018: hidden user still online + lastSeenAt exposed) |
| PRES-007 | Only contacts receive presence; once per recipient, not per conversation | SOCKET, SEC | 3, 11 | **Missing** | FAIL (BUG-018: global broadcast reaches non-contacts) |
| PRES-008 | Hard-kill client → offline after ping timeout | SOCKET | 3 | Partial | NOT TESTED — a hard kill past the ping timeout is not scripted; the nearest executed evidence is the Phase 11 churn probe, where leaked sockets keep presence online (BUG-084) |
| PRES-009 | Server restart → clients reconnect, presence correct | SOCKET, E2E | 3, 12 | Partial | PARTIAL — PERF-006 (Phase 12): 20 ms restart, both clients reconnect, the banner clears, rooms are rejoined, and messages flow both ways with no duplication; presence snapshot/update after the restart is not asserted ([run 4](./evidence/phase12-perf-e2e-run4.log)) |
| PRES-010 | Presence dots and status text respect privacy in UI | E2E, A11Y | 6, 9 | **Missing** | FAIL (BUG-045: no presence dot or online/last-seen status in the chat UI) |

### 2.4 One-to-one chat (`5.4`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| CHAT-001 | Find-or-create idempotent; 20 parallel requests → one conversation | API, DB | 2, 4 | Yes | PASS (20 concurrent requests → one conversation) |
| CHAT-002 | Chat with self; nonexistent user; invalid ObjectId | API | 2 | Partial | FAIL (BUG-007: malformed id → 500; self/nonexistent logged Q-001/Q-002) |
| CHAT-003 | Send ack contains persisted message; history returns it | SOCKET, API | 3, 2 | Partial (no payload schema) | PARTIAL (persist + ack + broadcast PASS; malformed/unknown id error acks PASS; 5000-char no-space payload untested) |
| CHAT-004 | 4000 chars accepted; 4001/empty/whitespace rejected | SOCKET | 3 | **Missing validation** | FAIL (BUG-019: empty, whitespace-only, 4001 all accepted; 4000 boundary PASS) |
| CHAT-005 | Unicode, emoji, RTL, 5000-char no-space payload | SOCKET, E2E | 3, 6 | Partial | PARTIAL (E2E: Unicode/emoji/RTL preserved end to end; the 4,000-character unbroken word now wraps with zero page overflow — BUG-096 fixed, CHAT-022; no separate 5,000-character socket payload) |
| CHAT-006 | HTML/script rendered as plain text in both browsers | E2E, SEC | 6, 11 | Yes (React text) | PARTIAL (E2E Chromium PASS: payload rendered as text, no script execution; Firefox/WebKit pending) |
| CHAT-007 | Links get `noopener noreferrer nofollow`; `javascript:` not clickable | WEB, SEC | 5, 11 | **Missing** | FAIL (BUG-036: URLs render as inert text; HTML-as-text/XSS PASS; `javascript:` vector not separately exercised) |
| CHAT-008 | Dedupe by `clientId`; replay yields one message | SOCKET, DB | 3, 4 | Partial | FAIL (BUG-026: storage deduped, but replay rebroadcasts `message:new`) |
| CHAT-009 | Optimistic sending/reconcile by `clientId`/failed-retry exactly once | WEB, E2E | 5, 6 | **Missing reconcile/retry** | FAIL (BUG-034: E2E confirms two bubbles after the echo; offline send never marked failed and has no retry) |
| CHAT-010 | 100 rapid sends ordered, no duplicates/gaps | SOCKET | 3 | Partial (no rate limit) | PASS (100/100 acked, unique, ordered; no throttling — BUG-022) |
| CHAT-011 | Cursor pagination order, no duplicates/gaps with live inserts | API, SOCKET | 2, 3 | Yes | PASS (REST order/limit/before; live-insert race not exercised) |
| CHAT-012 | Older messages prepend without scroll jump | E2E | 6 | **Missing (no pagination UI)** | FAIL (BUG-051: only the first page loads; scrolling to the top never fetches older messages) |
| CHAT-013 | Stick-to-bottom; "New messages ↓" pill | E2E | 6 | **Missing** | FAIL (BUG-076: no virtualization and no "New messages ↓" pill; Phase 13 scroll-up recorded 0 pills with scrollTop 0) |
| CHAT-014 | Reconnect resync delivers missed messages once, in order | SOCKET, E2E | 3, 12 | Partial (no client resync) | PARTIAL (server rejoins rooms on reconnect; missed messages retrievable from REST; no client fetch loop yet) |
| CHAT-015 | REST history authorization (anon, `dave`, owner) | API, SEC | 2, 11 | Yes | PASS (anon 401, outsider 403, participant 200) |
| CHAT-016 | Socket send/subscribe authorization (`dave`) | SOCKET, SEC | 3, 11 | Partial | PASS (dave cannot send: error ack; arbitrary room join yields nothing) |
| CHAT-017 | Payload above `maxHttpBufferSize` rejected without crash | SOCKET, SEC | 3, 11 | Yes | PASS (1.1 MB payload rejected; server health 200; fresh socket sends fine) |
| CHAT-018 | Conversation list preview/lastMessage/unread/mute icon | E2E | 6 | Partial | PARTIAL (last-message preview text PASS; direct rows show "Direct chat" and no list time — BUG-044; unread/mute icon NOT TESTED) |
| CHAT-019 | Message grouping (5-min), tails, sender names/colors | WEB, E2E | 5, 6 | Partial | PARTIAL (WEB grouping/colors PASS; E2E group sender name/color FAIL — BUG-048 because sender is unpopulated; true tails NOT TESTED) |
| CHAT-020 | Chat UI end-to-end: select, send, receive other user sees it | WEB, E2E | 5, 6 | Partial | PARTIAL (E2E Chromium PASS: two contexts, select, send, other user sees it; identity/time FAIL — BUG-044) |
| CHAT-021 | Conversation-switch race: a superseded history response never renders | WEB | 5 | Yes | **PASS** — regression `BUG-095 / CHAT-021` (deferred `c2` history resolved after switching to `c1`): the stale response is discarded, the active list is intact. Verified red against the unfixed code. Fixed 2026-10-28 ([red](./evidence/bug-095-red.log), [green](./evidence/bug-095-web.log)) |
| CHAT-022 | A legal 4,000-character unbroken token wraps; the page and message pane never scroll horizontally | E2E | 13, 15 | Yes | **PASS** — regression `BUG-096` at 1440×900: `documentOverflow 0`, `paneOverflow 0`; verified red against the unfixed code (59,596 px). Chaos step 46 now `ok` at 0 px. Fixed 2026-10-28 ([red](./evidence/bug-096-red.log), [green](./evidence/bug-096-targeted.log), [chaos](./evidence/phase13-session-bug096-fix.json)) |

### 2.5 Message timestamps (`5.5`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| TS-001 | Stored UTC in DB | API, DB | 2, 4 | Yes | PARTIAL — `createdAt` round-trips as an ISO-8601 timestamp and ordering is asserted through the REST history test ([messages.test.js](../../backend/tests/api/messages.test.js)); a direct assertion on the stored BSON date/offset was not written (Mongo stores BSON dates as UTC milliseconds) |
| TS-002 | Local display across UTC/New York/Kolkata/Auckland incl DST | WEB, E2E | 5, 6 | Partial | PARTIAL (E2E: two viewers in America/New_York and Asia/Tokyo each see their local time; Kolkata/Auckland and DST NOT TESTED) |
| TS-003 | Date separators across local midnight (Today/Yesterday/full) | WEB, E2E | 5, 6 | Yes | PARTIAL (E2E: Today for same-day and Yesterday for a prior-day message under a shifted clock; older-than-yesterday full date NOT TESTED) |
| TS-004 | List shows time/Yesterday/short date | WEB, E2E | 5, 6 | **Missing** | FAIL (BUG-044: E2E list row shows no last-message time) |
| TS-005 | Hover/long-press full date-time | E2E | 6 | **Missing** | PARTIAL (E2E: message row `title` carries the full date/time on hover in Chromium; long-press NOT TESTED) |
| TS-006 | Wrong client clock does not reorder messages | E2E | 6 | Partial | NOT TESTED — the clock helper shifts the browser clock only for date-separator tests; message ordering is server-timestamped and was not exercised with a wrong client clock |

### 2.6 Typing indicator (`5.6`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| TYP-001 | Start/stop on send, blur, idle; receiver sees quickly | SOCKET, E2E | 3, 6 | Partial (server only) | FAIL (E2E: direct-chat typing never appears — BUG-046; client emits no `typing:*`; server forwarding PASS) |
| TYP-002 | Throttle ≤ ~1 start per 2 s over 10 s typing | SOCKET | 3 | **Missing throttle** | NOT TESTED — the client emits no typing events at all (BUG-046) and the server has no throttling layer; a burst-count probe was not run |
| TYP-003 | Auto-expire ~5 s if stop lost | WEB, E2E | 5, 6 | **Missing** | BLOCKED (BUG-046: no typing is ever emitted or rendered, so there is no indicator to expire) |
| TYP-004 | Group text: one/two/several typers | WEB, E2E | 5, 6 | **Missing** | FAIL (BUG-046: group typing text never renders; no client emission) |
| TYP-005 | Conversation-list preview shows "Typing…" | E2E | 6 | **Missing** | BLOCKED (BUG-046: no typing events; the list preview is also never updated live — BUG-077) |
| TYP-006 | Typing scoped to conversation; never crosses chats | SOCKET, E2E | 3, 6 | Partial | PASS (event scoped to `conv:` room; witness in another chat receives nothing) |
| TYP-007 | Typing events never written to DB | DB | 4 | Yes | PASS (message count unchanged after start/stop) |
| TYP-008 | `dave` cannot emit/receive typing for a conversation | SOCKET, SEC | 3, 11 | Partial (emit blocked) | PASS (non-member emit broadcast to nobody; unknown conversation produces nothing) |
| TYP-009 | UI in light and dark | E2E, A11Y | 6, 9 | **Missing** | BLOCKED (BUG-046: no typing UI exists to render in either mode) |

### 2.7 Read receipts and unread counts (`5.7`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| REC-001 | Sent state on persisted message | API, SOCKET, E2E | 2, 3, 6 | Partial | PARTIAL (E2E: a stored message shows the Sent tick; Delivered/Read ticks are derived from participant pointers but Read never arrives — BUG-047) |
| REC-002 | Delivered when recipient online with chat closed | SOCKET | 3 | Partial (no client emit) | PARTIAL (server pointer + broadcast PASS when client emits; client auto-emit untested) |
| REC-003 | Read only when open, visible, focused, in view | SOCKET, E2E | 3, 6 | **Missing client** | FAIL (E2E: opening the chat never advances the sender's ticks to Read — BUG-047; server read pointer works when emitted) |
| REC-004 | Not read when hidden/unfocused/off-screen/not open | E2E | 6 | **Missing client** | BLOCKED (BUG-047: the client never emits read markers at all, so a "must not mark read" assertion has no behaviour to observe) |
| REC-005 | Unread counts increment/clear, after reload/reconnect | WEB, E2E | 5, 6 | Partial | PARTIAL (Phase 10 NOTIF-001: live increment, per-conversation unread, `(1) ChatSphere` title and clear-on-open PASS; reload restore FAIL — BUG-038; post-reconnect restore not exercised) |
| REC-006 | Read/delivered pointers monotonic | SOCKET, DB | 3, 4 | **Missing** | FAIL (BUG-023: older message overwrites newer pointer) |
| REC-007 | Duplicate read event harmless/idempotent | SOCKET | 3 | Partial | PASS (same message read twice keeps pointer and broadcasts) |
| REC-008 | Forgery: else's conversation / made-up message id rejected | SOCKET, SEC | 3, 11 | Partial (no membership check) | FAIL (BUG-023: non-member forged status broadcast; foreign message id accepted) |
| REC-009 | Read-receipt privacy reciprocal both ways | SOCKET, E2E | 3, 6 | **Missing** | FAIL (BUG-023: `sendReadReceipts:false` still broadcasts status) |
| REC-010 | Group aggregate tick + "Seen by" names/times; removed members gone | SOCKET, E2E | 3, 8 | **Missing** | BLOCKED (BUG-047: no tick ever advances past Sent; there is no "Seen by" view and no group info panel — BUG-049) |
| REC-011 | Marking 500 messages read is batched, not 500 requests | E2E, PERF | 6, 12 | **Missing client** | BLOCKED (BUG-047: the client emits no read markers, so there is no batching behaviour to measure) |
| REC-012 | Tick UI with text/shape, not color only; both modes | E2E, A11Y | 6, 9 | Partial | PARTIAL (E2E Chromium: ticks expose `aria-label` Sent/Delivered/Read; both-modes visual NOT TESTED) |

### 2.8 Group chat (`5.8`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| GRP-001 | Create group name/member boundaries (0,1,2,100), nonexistent/duplicate/self | API | 2 | Partial | PARTIAL (0/1/2 + name PASS; BUG-007/BUG-010 on bad ids; 100 untested) |
| GRP-002 | Creator is admin | API, DB | 2, 4 | Yes | PASS |
| GRP-003 | Admin rename/avatar/add/remove/promote/demote (REST + socket) | API, SOCKET | 2, 3 | Partial (no promote/demote/avatar) | PARTIAL (rename/add/remove PASS; avatar/promote/demote missing — SD-003) |
| GRP-004 | Non-admin attempts rejected | API, SOCKET, SEC | 2, 3, 11 | Partial (PATCH not admin-only) | FAIL (BUG-005: member can rename) |
| GRP-005 | Removed/left user loses history and live events immediately | SOCKET, API | 3, 6 | **Missing room sync** | FAIL (BUG-015: removed member still receives live events; send/type blocked) |
| GRP-006 | Last admin leaves → longest-standing promoted | API | 2 | Yes | PASS |
| GRP-007 | System messages for join/leave/remove/rename/theme with names | API, SOCKET | 2, 3 | Partial (generic text) | PARTIAL (create/rename/remove messages PASS; theme BUG-004; live lifecycle events missing — BUG-016) |
| GRP-008 | Concurrent admin edits; removal mid-typing/upload | SOCKET, DB | 3, 4 | Unknown | NOT TESTED — create/join/username races are covered by the Phase 4 DB suite, but simultaneous admin edits and a removal during an in-flight typing/upload were not scripted |
| GRP-009 | Sender names + per-user colors in group bubbles | E2E | 6 | **Missing** | FAIL (BUG-048: REST/socket return an unpopulated sender id, so names never render) |
| GRP-010 | Member list with presence in info panel | E2E | 6 | **Missing** | FAIL (BUG-049: no group info panel or member list) |
| GRP-011 | Group typing text | E2E | 6 | **Missing** | FAIL (BUG-046: group typing never renders; no client emission) |
| GRP-012 | `dave` cannot read/join/enumerate groups | API, SOCKET, SEC | 2, 3, 11 | Partial | FAIL (BUG-014 REST leave; socket: dave receives no group traffic before being added PASS) |
| GRP-013 | Group UI create/manage/leave | E2E, A11Y | 6, 9 | **Missing** | FAIL (BUG-049: no group creation dialog, info panel, or member management in the UI) |
| GRP-014 | `conversation:created/updated/removed` delivered to members | SOCKET | 3 | **Missing** | FAIL (BUG-016: none of the three events is emitted) |
| GRP-015 | Socket rooms updated on join/leave/removal | SOCKET | 3 | **Missing** | FAIL (BUG-015: added member receives nothing until reconnect) |

### 2.9 Emoji picker (`5.9`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| EMO-001 | Lazy load: no picker request before first open | E2E, PERF | 6, 12 | Yes | PASS (E2E: picker chunk requested only after the first open) |
| EMO-002 | Opens; search; inserts at cursor (middle); focus returns; Esc; keyboard nav; recent | WEB, E2E, A11Y | 5, 6, 9 | Partial | FAIL (E2E: real picker opens and inserts at the cursor PASS; Esc does not close — BUG-052; search/recent/keyboard nav NOT TESTED) |
| EMO-003 | 1–3 emoji only render large; 4+ or mixed do not | WEB, E2E | 5, 6 | **Missing** | FAIL (BUG-035: emoji-only message renders at `text-[15px]`) |
| EMO-004 | ZWJ sequences, skin tones, flags, variation selectors intact; length near 4000 | API, SOCKET, E2E | 3, 6 | Partial | NOT TESTED — multi-code-point sequences (ZWJ/skin tone/flag) were not sent; the near-4,000-character case is covered only through the general long-text checks (BUG-019, BUG-096) |
| EMO-005 | Light/dark; desktop popover; mobile bottom sheet | E2E, VIS | 6, 9 | Partial (auto theme, no sheet) | PARTIAL (desktop popover and insertion PASS; the picker follows the OS instead of the app mode — BUG-064, MODE-009; no mobile bottom sheet) |
| EMO-006 | Emoji picker accessibility (labels, keyboard, focus) | A11Y | 9 | Unknown | NOT TESTED — the axe matrix covers login, chat, and profile only; no dedicated keyboard-navigation/focus test for the picker, and Esc is already FAIL (BUG-052) |

### 2.10 Files, images, photo sharing (`5.10`, `5.11`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| FILE-001 | Upload → `uploadId` → send; ownership enforced | API, SOCKET | 2, 3, 7 | Yes | PASS (BUG-020 fixed 2026-10-26: atomic claim + `INVALID_ATTACHMENT`; `attachments.test.js` 5/5, dave as no-delivery witness) |
| FILE-002 | Attaching someone else's/unknown upload rejected | API, SOCKET, SEC | 2, 3, 7, 11 | Yes | PASS (explicit ownership guard rejects foreign, mixed, and unknown ids with 400 and stores no message) |
| FILE-003 | Reusing already attached upload rejected | API, SOCKET | 2, 3, 7 | Yes | PASS (one-time claim on `attachedTo: null`; replay refused) |
| FILE-004 | Orphan uploads TTL-cleaned | DB | 4, 7 | Partial (deletes attached too) | PARTIAL (Phase 7: 24 h TTL index present; an orphan backdated 25 h matches the monitor's scan predicate; attached uploads also match — BUG-028) |
| FILE-005 | JPEG/PNG/WebP/GIF (animated) <10 MB; exactly 10 MB; 10 MB+1 | API, MEDIA | 2, 7 | Yes | PASS (BUG-056 fixed 2026-10-26: stored GIF keeps both frames, thumbnail static; all format/limit rows pass) |
| FILE-006 | PDF/DOCX/XLSX/PPTX/TXT/CSV/ZIP <25 MB; 25 MB; 25 MB+1 | API, MEDIA | 2, 7 | Partial | PARTIAL (BUG-012 fixed: 25 MB+1 → 413 `FILE_TOO_LARGE`; BUG-006 remains open: plain TXT/CSV still rejected; DOCX/XLSX/PPTX and exactly 25 MB pass) |
| FILE-007 | SVG (incl `<script>`) rejected | API, SEC | 2, 7, 11 | Partial (unknown MIME reject) | PASS |
| FILE-008 | `.exe`, `.js`, `.html`, `.php`, `.sh`, `.bat` rejected | API, SEC | 2, 7, 11 | Partial | PARTIAL (Phase 7: `.js/.html/.php/.sh/.bat` all 400 PASS; a bare `.exe` was not uploaded — the renamed-executable case is FILE-009) |
| FILE-009 | Executable renamed `photo.jpg` rejected by magic bytes | API, SEC | 2, 7, 11 | Yes | PASS (Phase 7 re-confirmed: MZ stub named `photo.jpg` → 400) |
| FILE-010 | Double/no/uppercase extension handled by content | API | 2, 7 | Partial | PASS (Phase 7: `evil.php.jpg`, `noextension`, `PICTURE.PNG` accepted as PNG; PDF named `.png` accepted as PDF) |
| FILE-011 | Zero-byte/corrupt/truncated image | API | 2, 7 | Yes | PASS (BUG-055 fixed 2026-10-26: 400 `INVALID_IMAGE`, generic message, no sharp internals) |
| FILE-012 | Decompression bomb (30000×30000) safely rejected/handled | API, SEC | 2, 7, 11 | Yes | PASS (BUG-055 fixed: 100 MP `limitInputPixels` cap → 400 `INVALID_IMAGE`; server stays healthy) |
| FILE-013 | Filenames: Unicode, 300 chars, traversal, NUL, dots, emoji sanitized | API | 2, 7 | Yes | PASS (BUG-054 fixed 2026-10-26: UTF-8 recovery, NUL rejected 400, RFC 5987 `filename*`, random storage keys) |
| FILE-014 | GPS/EXIF removed; thumbnail; width/height stored | MEDIA, API | 7 | Yes | PASS (EXIF stripped, dimensions stored, thumbnail generated; SD-004 resolved: signed link endpoint issues 1 h URLs) |
| FILE-015 | Signed URL valid; expired 403; tampered 403 | API, SEC | 2, 11 | Yes | PASS (valid/expired/tampered + `GET /api/uploads/:id/link` issuance added 2026-10-26) |
| FILE-016 | `dave`/non-participant gets 403; removed member loses access | API, SEC | 2, 7, 11 | Yes | PASS (BUG-003 fixed; Phase 7: group-member dave gets 200 → removed → 403 immediately, bob still 200) |
| FILE-017 | `nosniff`, `Content-Disposition`, no public static path | API, SEC | 2, 11 | Partial | PASS |
| FILE-018 | Progress bar, cancel, multiple files, drag-drop, paste; offline failure | E2E | 7 | Yes | PARTIAL (BUG-058 fixed: attach menu, pickers, drag/drop, paste, progress, cancel all verified in `composer-media.test.jsx` 4/4 + E2E; offline upload failure still untested) |
| FILE-019 | Lightbox open/next/prev/Esc/download | E2E, A11Y | 7, 9 | Yes | PASS (BUG-059 fixed: unit lightbox test + E2E open/next/prev/Esc/download on Chromium, Firefox, WebKit) |
| FILE-020 | Photos/Files tabs paginate and open | E2E | 7 | Partial | PARTIAL (BUG-060 fixed: tabs and grid verified; cursor endpoint supports `before`/`limit`, but the panel loads one page only — infinite scroll not implemented) |
| FILE-021 | No layout shift (reserved dimensions) | E2E, VIS | 7, 9 | Yes | PARTIAL (image bubbles render `width`/`height` attributes verified in unit test; no visual-regression measurement) |
| FILE-022 | Image/file bubbles render and download correctly | E2E | 7 | Yes | PASS (BUG-059 fixed: image bubble + file card + download link verified in unit and E2E) |
| FILE-023 | Attached uploads survive 24 h (TTL only removes orphans) | DB | 4, 7 | Suspected data loss (R-07) | FAIL (BUG-028: an attached upload backdated 25 h matches the TTL scan predicate) |
| FILE-024 | Upload rate limit and clean errors | API, SEC | 2, 11 | Partial (global only) | PARTIAL (global limiter only) |
| PHOTO-001 | Media API `GET /conversations/:id/media?type=image` paginated | API | 2, 7 | Yes | PASS (SD-003 resolved 2026-10-26: endpoint filters image/audio/file, `before`/`limit`, non-member 403; tested in `media.test.js`) |
| PHOTO-002 | Photos grid in info panel, infinite scroll | E2E | 7 | Partial | PARTIAL (grid and lightbox verified; infinite scroll not implemented) |
| PHOTO-003 | Lightbox next/prev across conversation photos | E2E | 7 | Yes | PASS (lightbox collects conversation photos; next/prev verified in unit + E2E) |
| PHOTO-004 | Download original | E2E | 7 | Yes | PASS (lightbox download link present; unit assertion) |
| PHOTO-005 | Media access authorization | API, SEC | 7, 11 | Yes | PASS (media list rejects non-members 403; signed-link/download path re-verified) |

### 2.11 Audio sharing (`5.11`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| AUD-001 | Record start/stop/cancel; timer; level meter | E2E | 7 | Yes | PASS (BUG-061 fixed: mic control, timer, level meter, cancel/send verified by unit tests and E2E mic flow) |
| AUD-002 | MIME chosen via `isTypeSupported` (WebM Chrome/FF, MP4 Safari) | WEB, E2E | 5, 7 | Partial | PARTIAL (BUG-061 fixed: WebM/Opus selection asserted in unit test; MP4/Safari branch implemented but Playwright WebKit on Windows has no `MediaRecorder` — BLOCKED) |
| AUD-003 | 5-minute cap auto-stops | WEB, E2E | 7 | Yes | PARTIAL (cap implemented and cleanup runs; no timer test reaching 300 s) |
| AUD-004 | Mic permission denied handled with clear message | E2E | 7 | Yes | PASS (unit test asserts the permission-denied toast; E2E mic flow passes) |
| AUD-005 | Very short (<1 s) recording handled | E2E | 7 | Yes | PASS (unit test asserts "Recording is too short" and no upload/send) |
| AUD-006 | MP3/M4A/WAV/OGG/WebM <20 MB; 20 MB+1/wrong types rejected | API, MEDIA | 2, 7 | Yes | PASS (BUG-053 fixed: WebM/Opus and Ogg/Opus accepted; limits and wrong types still rejected) |
| AUD-007 | Corrupted audio shows error, app survives | E2E, API | 7 | Partial | PARTIAL (API rejects corrupted audio cleanly 4xx and stays up; player has no explicit `onerror` message) |
| AUD-008 | Player play/pause/seek/speed 1×/1.5×/2×/duration | E2E | 7 | Yes | PASS (BUG-060 fixed: unit test asserts play, seek slider, 1.5×/2×, duration) |
| AUD-009 | Only one audio plays at a time | E2E | 7 | Yes | PARTIAL (module-level coordinator pauses the previous audio; not covered by a test) |
| AUD-010 | Playback continues in background tab | E2E | 7 | Yes | NOT TESTED — player tests run in a foreground page; tab-background playback throttling was not exercised |
| AUD-011 | Audio tab lists all shared audio | E2E | 7 | Yes | PASS (media endpoint `type=audio` + Audio tab verified in unit/E2E) |
| AUD-012 | Player UI in light/dark; keyboard accessible | E2E, A11Y | 7, 9 | Partial | PARTIAL (native button/range controls use design tokens; no light/dark or axe run on the player) |
| AUD-013 | Duration stored on upload/message | API, DB | 2, 4, 7 | Yes | PASS (BUG-057 fixed: MP3/WAV duration computed, stored on Upload and attachment, returned in 201; MP4/WebM parser untested) |

### 2.12 Chat backgrounds / themes (`5.12`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| THEME-001 | Picker: 4 tiles, live preview, Set applies, close reverts | E2E | 6 | **Missing** | FAIL (BUG-050: no info panel or theme picker) |
| THEME-002 | Updates all participants live and persists after reload | SOCKET, E2E | 3, 6 | **Missing broadcast** | FAIL (BUG-050: theme cannot be selected; no client listener or `data-chat-theme` application) |
| THEME-003 | System message posted on change | API, E2E | 2, 6 | Partial | FAIL (BUG-004: theme change 500; E2E cannot change the theme at all — BUG-050) |
| THEME-004 | Theme scoped to one conversation only | E2E | 6 | Partial | BLOCKED (BUG-050: no picker and no `data-chat-theme`, so there is no scoped theme to observe) |
| THEME-005 | Any direct participant may change; group admins only | API, SOCKET, SEC | 2, 3, 11 | **Missing group restriction** | FAIL (BUG-004/BUG-005) |
| THEME-006 | Invalid theme value rejected | API | 2 | Partial (Mongoose only) | FAIL (BUG-008: invalid theme → 500) |
| THEME-007 | axe contrast AA for 4 backgrounds × 2 modes | A11Y | 9 | **Missing tokens** | BLOCKED (BUG-050: Love/Friendship/Battle tokens and backgrounds do not exist; the axe matrix is expected-fail on the missing attribute) |
| THEME-008 | `prefers-reduced-motion`; no scroll performance impact on 5k messages | E2E, A11Y, PERF | 9, 12 | **Missing** | BLOCKED (BUG-050: no themed rendering to measure; reduced motion itself is separately PASS in A11Y-006) |
| THEME-009 | Themed header/frosted bubbles/patterns visually match board | VIS | 9 | **Missing** | BLOCKED (BUG-050: the 30 non-default baselines cannot be captured — they would be byte-identical copies of Default) |

### 2.13 Notifications (`5.13`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| NOTIF-001 | Unread badges and `(3) ChatSphere` title live/clear | WEB, E2E | 5, 10 | Partial | PARTIAL (WEB+E2E: live increment, `(1) ChatSphere`, per-conversation unread, and clear-on-open PASS; reload restore FAIL — BUG-038) |
| NOTIF-002 | Toast for non-open conversation only | WEB, E2E | 5, 10 | Partial | PASS (WEB+E2E: toast and title only for a closed conversation; no toast, unread, or title change for the open one) |
| NOTIF-003 | No notification for open/muted/own/own-other-tab messages | WEB, E2E | 5, 10 | **Missing (R-17)** | FAIL (open-conversation suppression PASS; own message from another tab increments unread/title and toasts — BUG-037, WEB+E2E; muted conversation still notifies — BUG-078) |
| NOTIF-004 | Permission requested only after gesture (not on load) | E2E, SEC | 10 | **Missing UI** | FAIL (`requestPermission` not called on mount PASS, unit+E2E; there is no "Enable notifications" gesture control, so permission can never be requested — BUG-040) |
| NOTIF-005 | Granted/denied/default; shown only hidden/unfocused | WEB, E2E | 5, 10 | Partial | PARTIAL (granted/denied/default and hidden-vs-visible gating PASS, unit+E2E; a visible but unfocused tab raises nothing — BUG-082) |
| NOTIF-006 | Preview text toggle | E2E | 10 | **Missing** | FAIL (BUG-081: no preview setting exists; the desktop body always contains the message text) |
| NOTIF-007 | Click focuses tab and opens conversation | E2E | 10 | **Missing** | FAIL (BUG-080: the notification has no `onclick`; clicking neither focuses nor opens the chat) |
| NOTIF-008 | Sound after first interaction; toggle persists | WEB, E2E | 5, 10 | Partial | FAIL (BUG-079: no sound is ever played; the `soundEnabled` toggle persists in the store but has no consumer) |
| NOTIF-009 | Mute 1 h/8 h/forever; expiry; persists | E2E, API | 10 | **Missing** | FAIL (BUG-078: `PATCH /conversations/:id` ignores `mutedUntil`, no mute UI, expiry never evaluated; MUTE-001…004 expected fail, MUTE-005 non-member 403 PASS) |
| NOTIF-010 | Missed call → notification + call-log message | E2E | 10 | **Missing** | BLOCKED (calling is unimplemented — BUG-017/BUG-062/BUG-063; neither the notification nor the call-log message can be produced) |
| NOTIF-011 | 100 messages/5 s no freeze; multi-tab duplicate log | E2E, PERF | 10, 12 | Partial | PASS (unit: 100 dispatches < 3 s, unread 100, one toast; E2E: title `(100) ChatSphere`, UI still responsive; two hidden tabs each raised one notification — duplicate-tab observation logged, tabA=1 tabB=1) |
| NOTIF-012 | Web Push subscribe/deliver with tab closed (if approved) | E2E | 10 | **Missing** | NOT TESTED (Web Push was not approved or implemented) |
| NOTIF-013 | Notification/sound/preview settings UI | E2E, A11Y | 10, 9 | **Missing** | FAIL (no Settings screen — BUG-040; no sound toggle wiring — BUG-079; no preview toggle — BUG-081) |

### 2.14 Video and audio calling (`5.14`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| CALL-001 | Invite → incoming → accept → connected; media flows (`connectionState`, `videoWidth`, `bytesReceived`) | E2E, SOCKET | 3, 8 | **Missing calling UI + signaling** | FAIL (Phase 8: 15 expected-fail socket tests + 6 expected-fail E2E; invite/accept unacknowledged and no client — BUG-017, BUG-062) |
| CALL-002 | Audio-only call | SOCKET, E2E | 8 | **Missing** | FAIL (SOCKET expected fail: audio invite/accept — BUG-017; no audio-only UI path) |
| CALL-003 | Decline | E2E, SOCKET | 8 | **Missing** | FAIL (SOCKET decline + declined call log expected fail; E2E decline expected fail — BUG-017, BUG-062, BUG-063) |
| CALL-004 | Caller cancels | SOCKET | 8 | **Missing** | FAIL (SOCKET expected fail: callee ring stop — BUG-017) |
| CALL-005 | 30 s ring timeout → missed | SOCKET | 8 | **Missing** | FAIL (SOCKET expected fail: 30 s timeout → missed log; E2E would add 30 s per run — BUG-017, BUG-063) |
| CALL-006 | Offline callee → missed call log + notification | SOCKET, MANUAL | 8, 10 | **Missing** | FAIL (SOCKET expected fail: offline callee → missed log — BUG-017, BUG-063); notification side untested (Phase 10) |
| CALL-007 | End by either side; duration recorded | SOCKET, E2E | 8 | **Missing** | FAIL (SOCKET end + duration + completed log expected fail; E2E hang-up expected fail — BUG-017, BUG-062, BUG-063) |
| CALL-008 | Busy on second invite | SOCKET | 8 | **Missing** | FAIL (SOCKET expected fail: second invite busy — BUG-017) |
| CALL-009 | Glare (both call simultaneously) deterministic | SOCKET | 8 | **Missing** | FAIL (SOCKET expected fail: simultaneous invites resolve to one call — BUG-017) |
| CALL-010 | Multi-device accept stops other ringing | SOCKET, E2E | 8 | **Missing** | FAIL (SOCKET expected fail: second bob socket ring stops — BUG-017) |
| CALL-011 | Mute/camera toggles change tracks; remote reflects | E2E, MANUAL | 8 | **Missing** | FAIL (E2E expected fail: control state toggles — BUG-062); remote track/visual reflection must be checked manually (M-DEV-01, M-PERM-04) because the app exposes no peer/track handles to tests |
| CALL-012 | Permission denied → audio-only offered, no crash | MANUAL | 8 | **Missing** | BLOCKED (Chromium fake-media flags auto-grant permissions; denial needs real devices — M-PERM-01/02) |
| CALL-013 | Cleanup: tracks `ended`, PC closed, listeners removed; 10 repeat calls | E2E, MANUAL | 8 | **Missing** | FAIL (E2E expected fail: overlay clears and 10 repeats — BUG-062); track `readyState`/PC closure cannot be inspected without app hooks, so the OS camera-light check stays manual (M-STATE-07) |
| CALL-014 | CDP offline: "Reconnecting…", ICE restart recovers | MANUAL | 8 | **Missing** | BLOCKED (Playwright `context.setOffline` blocks HTTP, not WebRTC UDP; loopback ICE never breaks — M-CALL-04) |
| CALL-015 | Long outage ends call cleanly and logs | MANUAL | 8 | **Missing** | BLOCKED (same emulation limit — M-CALL-05) |
| CALL-016 | Signaling security: `dave` forged events/unknown `callId` rejected | SOCKET | 8, 11 | **Missing** | FAIL (SOCKET expected fails: dave accept/end/signal, unknown call id, forged sender, non-member invite, malformed payloads — BUG-017) |
| CALL-017 | ICE config requires auth; short-lived TURN creds; no static secret in bundle | API, SEC | 8, 11 | Partial (static env TURN, long-lived) | PARTIAL (auth + no JWT secrets PASS; bundle grep PASS — no TURN strings/values, [log](./evidence/phase8-bundle-check.log); static long-lived TURN still fails — SD-005) |
| CALL-018 | Call log messages + Calls tab direction/status/callback | SOCKET, E2E | 8 | **Missing** | FAIL (SOCKET call-log expected fails; E2E bubble + Calls history expected fail — BUG-062, BUG-063) |
| CALL-019 | Call screens always dark in both modes | VIS, A11Y | 9 | **Missing** | BLOCKED (no call screens exist to render — BUG-062) |
| CALL-020 | Group video calls if approved | E2E | 15 | **Missing** | NOT APPROVED (optional Phase 15; out of scope) |
| CALL-021 | Manual: real devices across networks/TURN, iOS, echo | MANUAL | 8, 14 | **Missing TURN config** | NOT TESTED (full checklist written: `MANUAL_CHECKLIST.md` §A–E; requires hardware and a TURN provider) |

### 2.15 Light and dark mode (`5.15`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| MODE-001 | Light/Dark/System each work | WEB, E2E | 5, 6, 9 | Partial (no toggle in real UI) | PARTIAL (WEB and E2E: system light/dark, explicit light/dark, and explicit override of the OS PASS; the only missing piece is the UI toggle — BUG-040) |
| MODE-002 | System follows OS live via `colorScheme` change | WEB, E2E | 5, 6, 9 | Yes | PASS (WEB store test + E2E Chromium/Firefox/WebKit: follows a live OS change without reload and stops after an explicit choice) |
| MODE-003 | Choice persists after reload and syncs across tabs | WEB, E2E | 5, 6, 9 | Yes | PASS (WEB store test + E2E: reload persistence and a second-tab sync both pass after the BUG-032 fix) |
| MODE-004 | No flash: earliest paint dark; `data-theme` set pre-bundle | WEB, E2E, VIS | 5, 9 | Yes | PASS (E2E observes `data-theme` before the bundle and a MutationObserver never records a wrong-theme paint; visual baselines begin in the stored mode) |
| MODE-005 | `color-scheme` matches native controls/scrollbars | E2E, VIS | 9 | Yes | PASS (E2E asserts `color-scheme: light`/`dark` on `html` for explicit and system modes; browsers then theme native controls) |
| MODE-006 | Every screen/component both modes; axe; screenshots | E2E, A11Y, VIS | 9 | Partial | PARTIAL (axe: 5 screens pass, 8 expected fails — design-preview light/dark and profile dark BUG-066, chat light/dark BUG-065/BUG-066, three backgrounds BUG-050; visual: 30 baselines created, 30 background images blocked by BUG-050) |
| MODE-007 | Video/audio call screens dark in both modes | VIS | 9 | **Missing screens** | BLOCKED (no call screens exist — BUG-062) |
| MODE-008 | Uploaded images never inverted/tinted | E2E | 9 | Partial | NOT TESTED (no CSS filter is applied to message images, but no upload fixture is driven through the visual pipeline) |
| MODE-009 | Emoji picker follows app mode | E2E | 9 | Partial (`theme="auto"`) | FAIL (app-dark/OS-light leaves the picker light — BUG-064) |
| MODE-010 | Theme toggle reachable in rail and Settings | E2E, A11Y | 6, 9 | **Missing** | FAIL (BUG-040: no app shell, settings, or theme control in the UI) |

### 2.16 MongoDB / Mongoose data layer (`5.16`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| DB-001 | Indexes exactly as specified, including TTLs | DB | 4 | Partial (5 extra indexes) | **PARTIAL** — required indexes/TTLs pass; extras are BUG-027 |
| DB-002 | `explain()` shows index scans on 100k messages/conversation list | DB, PERF | 4, 12 | Yes | **PASS** — 100k messages + 20k conversations; `IXSCAN` on both queries, no `COLLSCAN` |
| DB-003 | Schema validation: required/enums/max lengths/invalid ObjectIds | DB | 4 | Partial (no `Message.text` max) | **PARTIAL** — required/enums/bio/privacy/invalid ids pass; text limit is BUG-019 |
| DB-004 | Concurrent direct-conversation creation → one winner | DB | 4 | Yes | **PASS** — 12 concurrent callers → 1 conversation |
| DB-005 | Concurrent same-`clientId` sends → one message | DB | 4 | Yes | **PASS** — 10 sends → 1 stored; 9 duplicate-key rejects |
| DB-006 | Concurrent username claims → one winner | DB | 4 | Yes | **PASS** — username 12→1, email 8→1 |
| DB-007 | DB outage → clean 503, no crash, auto-recovery, socket error ack | API, SOCKET | 4, 12 | Partial (no 503 mapping) | **PARTIAL** — health 503, one log, socket ack, auto-recovery pass; REST returns raw 500 (BUG-029) |
| DB-008 | Every list query bounded | DB, SEC | 4, 11 | Partial | **FAIL** — history/search bounded; conversation list unbounded (BUG-030) |
| DB-009 | `passwordHash`/token hashes never leave server | API, SEC | 4, 11 | Yes | **PASS** — 3/3 endpoint sweeps, hashed refresh token rotates |
| DB-010 | Upload TTL removes only orphans, not attached files | DB | 4 | **Bug** | **FAIL** — TTL has no orphan filter; attached uploads would expire (BUG-028) |

---

## 3. Cross-cutting coverage

### 3.1 Security (`Testing.md` 6.1)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| SEC-001 | Complete REST authorization table (anon/`dave`/owner) | SEC | 11 | Complete | PASS with 3 expected fails (25 rows: 22 pass; AUTHZ-015 BUG-014, AUTHZ-017 BUG-005, AUTHZ-018 BUG-004; matrix in [SECURITY_AUTHORIZATION_MATRIX.md](./SECURITY_AUTHORIZATION_MATRIX.md)) |
| SEC-002 | Complete socket authorization table | SEC, SOCKET | 3, 11 | Complete | PASS with 4 expected fails (8 tests: send/typing/receipts blocked, forged userId ignored, rooms isolated, rapid churn survived; BUG-023/083/084/085) |
| SEC-003 | NoSQL injection in JSON/query (`?q[$ne]=x`) | SEC | 11 | Complete | PASS for auth/direct/message/search/query-strings (operators rejected or treated literally); 5 expected fails for unvalidated shapes — BUG-007/021/087/088 |
| SEC-004 | XSS sweep in message text, names, bio, group name, filenames, call logs | SEC, E2E | 11 | Complete (call log blocked) | PASS: stored payloads round-trip verbatim and render as text in sender and receiver DOMs (message, group name, file name, profile fields); no `window.__xss` and zero injected `img/script/[onerror]`; receiver sender-name surface blocked by BUG-048 (1 expected fail). Call-log text NOT TESTED — no call-log implementation (BUG-063) |
| SEC-005 | No `dangerouslySetInnerHTML` for user content | SEC | 11 | Yes | PASS (static scan of 30 client source files: 0 sinks) |
| SEC-006 | CORS allowlist, helmet headers, no stack traces/DB messages | SEC | 11 | Complete | PASS for CORS (allowlist + credentials, evil origin denied) and helmet (CSP, nosniff, no x-powered-by). 404/401/malformed-JSON shapes stable; 500 bodies still echo Mongoose validation text — BUG-007/087/088/089 |
| SEC-007 | REST + per-socket rate limits (login/register/uploads/messages/typing) | SEC, SOCKET | 3, 11 | REST complete, socket missing | REST PASS (login/register 20/15min, global 300/15min, `Retry-After`), but 429 bodies are HTML — BUG-086. Socket FAIL: 50/50 message sends and 50/50 typing events accepted — BUG-022 |
| SEC-008 | CSRF: refresh/logout not triggerable cross-origin | SEC | 11 | Complete | PASS (HttpOnly + SameSite=Lax + Path=/api/auth; cross-site preflight gets no CORS grant; GET refresh/logout 404/405; logout revokes refresh) |
| SEC-009 | Upload attack matrix (integrity + access) | SEC | 11 | Complete | PASS: guessing ids (404), owner/participant/non-participant link + signed file checks, traversal filename reduced, magic-byte validation from Phase 7. 1 expected fail: malformed id on the signed route → 500 — BUG-089 |
| SEC-010 | Socket abuse: arbitrary rooms, spoofed userId, malformed/oversized, reconnect churn | SEC, SOCKET | 3, 11 | Complete | PARTIAL (rooms/spoof/oversized PASS; early emits dropped — BUG-085; rapid churn leaks sockets and presence stays online — BUG-084; forged system/call types — BUG-083; malformed payloads — BUG-025; no rate limit — BUG-022) |
| SEC-011 | `npm audit` client + server | SEC | 11 | Complete | PASS (0 info/low/moderate/high/critical in backend and frontend) |
| SEC-012 | Secrets scan repo/history + production build grep | SEC | 11 | Complete | PASS (working tree + 19-commit history + built bundle: no private keys, cloud keys, DB credentials, TURN/VAPID secrets, or tracked `.env`; build contains only the `http://localhost:3001` API fallback) |
| SEC-013 | Token expiry mid-socket, logout with sockets open | SEC | 11 | Complete | PASS/logged: an expired token cannot open a socket; a live socket keeps working after expiry or logout (stateless access JWT, reported as an observation); logout revokes the refresh token |

### 3.2 Accessibility (`6.2`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| A11Y-001 | axe every screen/mode/background; zero serious/critical | A11Y | 9 | Partial | FAIL (Chromium: 5 passes; 8 expected fails — design preview light/dark and profile dark BUG-066, chat light/dark BUG-065/BUG-066, three chat backgrounds BUG-050; details [phase9-axe-run1.log](./evidence/phase9-axe-run1.log), matrix [phase9-axe-run2.log](./evidence/phase9-axe-run2.log)) |
| A11Y-002 | Keyboard-only register/login/chat/attach/record/call/theme | A11Y, E2E | 9 | Partial | PARTIAL (PASS: register→login, start chat and send, composer focus, attach selection, voice-record start/cancel; FAIL: conversation rows BUG-069, attach-menu Escape BUG-070, live announcements BUG-071, lightbox focus BUG-072, theme/call controls BUG-040/BUG-062) |
| A11Y-003 | Focus trap/return/Esc for sheets/dialogs, no traps | A11Y | 9 | Unknown | FAIL (lightbox focus is neither trapped nor returned — BUG-072; attach menu ignores Escape — BUG-070; emoji Esc is BUG-052) |
| A11Y-004 | Labeled icon buttons, live regions, exposed states | A11Y | 9 | Partial | FAIL (all visible icon buttons carry labels and the global toast is `role=status`; open-chat messages have no polite live region — BUG-071) |
| A11Y-005 | Meaning not conveyed by color alone | A11Y | 9 | Partial | NOT TESTED (ticks and presence still need shape/text counterparts; no dedicated test yet) |
| A11Y-006 | `prefers-reduced-motion` honored | A11Y | 9 | Yes | PASS (E2E with `reducedMotion: 'reduce'`: no non-essential transition runs) |
| A11Y-007 | Usable at 200% zoom | A11Y | 9 | Unknown | PASS (720×450 viewport = 200% of 1440×900: no horizontal overflow, login field 270 px) |

### 3.3 Responsive and browsers (`6.3`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| RESP-001 | Core flows at 5 viewports | E2E | 6, 9 | Partial | PASS (Chromium/Firefox/WebKit: register→login→open chat→send/receive at 360×760, 390×844, 768×1024, 1024×768, 1440×900) |
| RESP-002 | Layout matches board: phone bottom bar, tablet 2 columns, laptop 3 columns | E2E, VIS | 6, 9 | **Missing** | FAIL (no rail at any width; phone keeps two columns instead of one pane + bottom bar; laptop 1024 has a permanent info column — BUG-067, BUG-040; baselines capture the current state) |
| RESP-003 | No horizontal scrolling/clipping | E2E | 9 | Unknown | FAIL (360/390: document 604–609 px wide for a 360/390 viewport; header, bubbles, and composer clipped — BUG-067; tablet/laptop/desktop do not overflow) |
| RESP-004 | Composer above keyboard; touch targets ≥44 px | E2E, A11Y | 9 | Unknown | PARTIAL (390×500 viewport: composer bottom stays at the viewport bottom, textarea 201 px — PASS; all 8 visible phone controls measure 32–38 px — BUG-068) |
| RESP-005 | Chromium/Firefox/WebKit core flows; limitations logged | E2E | 6, 9 | **Chromium, Firefox, WebKit (expected fails tagged)** | **PASS with expected fails** (responsive + keyboard specs: Chromium 25 passed, Firefox 24 passed + 1 skipped, WebKit 24 passed + 1 skipped; the skip is the fake-microphone test, Chromium-only) |

### 3.4 Performance and resilience (`6.4`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| PERF-001 | 10,000+ messages: virtualization, fast pages, stable memory | E2E, PERF | 12 | **Missing virtualization** | **PARTIAL** — newest page: 10,000 seeded, first bubble 386–417 ms, 30 bubbles, 263 DOM nodes (PASS). Scrolling for older pages never requests `before=` (BUG-051) and the unit/E2E 10k mounts create 10,000 bubbles / 65,035 nodes (BUG-076); both marked expected-fail. [run 4](./evidence/phase12-perf-e2e-run4.log), [unit](./evidence/phase12-test-all-run1.log) |
| PERF-002 | 100/500 concurrent sockets: p50/p95 latency, errors, CPU/memory | LOAD | 12 | Unknown | **PASS (numbers recorded, no SLO in the spec)** — 100 sockets: p50 720–1,202 ms, p95 805–1,737 ms, connect 1.8–2.1 s, RSS 135–146 MB, CPU 116–176%, 0 errors. 500 sockets: p50 2,344–3,957 ms, p95 3,797–5,958 ms, connect 17.6–29.4 s, RSS 271–284 MB, CPU 118–158%, 0 errors. [run 1](./evidence/phase12-load-run1.log), [run 2](./evidence/phase12-load-run2.log) |
| PERF-003 | 30-minute soak, no memory leak | LOAD | 12 | Unknown | **PASS** — 30 minutes, 50 sockets, 44,482 messages, 0 failures, 31 samples: heap 38.3 → 37.3 MB (−2.7%), RSS 140.3 → 143.3 MB (+2.1%), mean CPU 15.8%, socket count stable at 50. [log](./evidence/phase12-soak.log) |
| PERF-004 | Open/close 200 conversations, 10 calls; heap/listeners/object URLs released; StrictMode duplicates | E2E, PERF | 12 | Unknown | **PARTIAL** — 200 alternating open/close cycles: heap 18.3 → 19.2 MB (+0.8–0.9 MB), object URLs created=1 revoked=1 live=0, 52.9–72.5 s; 3 navigation cycles deliver a live message exactly once (no StrictMode duplicates). The 10-call part is **BLOCKED** by BUG-017/BUG-062/BUG-063 (calling unimplemented). [run 4](./evidence/phase12-perf-e2e-run4.log) |
| PERF-005 | Slow 3G/offline/flapping: no dup/loss; banner correct | E2E | 12 | Partial | **PARTIAL** — banner appears offline and clears online (PASS); 4 flaps keep every message id unique and render the text once (PASS); slow 3G delivers in 0.5–0.7 s (PASS); **FAIL**: messages sent during the outage never appear after reconnect — BUG-091 (expected-fail). [run 4](./evidence/phase12-perf-e2e-run4.log) |
| PERF-006 | Server restart: reconnect, rejoin, resync | E2E | 12 | Partial | **PARTIAL** — restart (20 ms downtime): both clients reconnect, the banner clears, rooms are rejoined and messages flow both ways (PASS). History not missed during the outage is not refetched (BUG-091). Graceful shutdown never completes with connected clients (BUG-092, expected-fail `PERF-006b`). [E2E](./evidence/phase12-perf-e2e-run4.log), [probe 1](./evidence/phase12-perf-006-probe.log), [probe 2](./evidence/phase12-perf-006-probe2.log) |
| PERF-007 | Lazy bundles, bundle size, Lighthouse on main screens | PERF | 12 | Partial | **PARTIAL** — build 18.68 s: initial JS 374.76 kB (116.50 kB gzip) + CSS 26.37 kB (5.98 kB gzip); emoji picker lazy (329.45 kB / 88.20 kB gzip fetched only on open); **lightbox is in the initial chunk — BUG-090**. Production paint on `vite preview`: FP 68 ms, FCP/LCP 308 ms, load 198 ms, 5 requests / 191 kB; login→app 1,002 ms; chat open 118 ms. Lighthouse CLI is not installed and adding it needs approval, so paint/LCP/transfer came from Chromium `PerformanceObserver` instead. [build](./evidence/phase12-build.log), [measure](./evidence/phase12-perf-build.log) |

### 3.5 Logging and configuration (`6.5`)

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| LOG-001 | Logs never contain message text/tokens/passwords/file contents | LOG, SEC | 11 | Partial | NOT TESTED — no log-content assertion exists; observed evidence lines carry ids, codes, and statuses only, but a systematic sweep with a marker message, token, password, and filename was not run |
| LOG-002 | Fail fast with clear message per missing required env var | API, LOG | 2, 11 | Partial (single test for all missing) | NOT TESTED — `backend/src/config/env.js` throws on invalid config, but every suite builds config through `makeTestConfig`; no test spawns the server with one variable missing |
| LOG-003 | Production mode: secure cookies, no debug/verbose errors | LOG, SEC | 11 | Partial | NOT TESTED — the Secure cookie in production is covered by AUTH-014 and error shapes by SEC-006, but no dedicated production-mode run asserts the absence of debug output |

### 3.6 Exploratory and chaos session (Phase 13)

Executed by [tests/exploratory/chaos.spec.js](../../tests/exploratory/chaos.spec.js): 50 numbered steps across three users, rerunnable with `CHAOS_RUN=<name> npm run test:exploratory`. Authoritative run 3 completed all 50 steps with 8 anomalies and 0 step errors; the full log is [EXPLORATORY_SESSION.md](./EXPLORATORY_SESSION.md).

| Test ID | Case | Layer | Phase | Impl | Exec |
|---|---|---|---|---|---|
| EXPL-01…11 | Multi-client baseline; duplicate Enter/double-click/burst sends stored once; whitespace/newline blocked; 4001 and 100,000-character text; HTML/script inert | E2E | 13 | Partial (no text limits) | **PARTIAL** — duplicate protection PASS (1 stored copy each); client blocks whitespace/newline PASS; >4,000 and 100k stored — BUG-019; HTML/script inert PASS |
| EXPL-12…14 | Jumbo emoji, picker caret insert, picker after send | E2E | 13 | Missing jumbo | **FAIL** — 3- and 4-emoji both 15 px (BUG-035); caret insert PASS; picker staying open after send is not graded (spec silent) |
| EXPL-15…19 | Conversation search; New chat with existing/unknown/self/cancelled | E2E, API | 13 | Partial | **FAIL** — search inert (BUG-093); New chat duplicates rows and collides keys (BUG-094, UI 4 vs API 3; 6 vs 4 after self); unknown-user and cancel feedback PASS; self-chat reachable (Q-001) |
| EXPL-20…21 | Profile bio 161 and 1-character username through the UI | E2E | 13 | Missing validation | **FAIL** — bio 161 → 500 with raw Mongoose text (BUG-088); username `a` accepted (BUG-013) |
| EXPL-22…30 | Three-user simultaneous and interleaved sends; slow switch; 30 rapid switches; draft restore; panel/tab stress; 30-message order; zero-width text | E2E | 13 | Partial | **PARTIAL** — group/interleave isolation PASS; ordering 30/30, 0 ws or DOM duplicates PASS; drafts and panel state PASS; slow AC switch renders AC content under an AB header — BUG-095 |
| EXPL-31…41 | Paste, drop, upload progress/cancel, executable/oversize, voice, lightbox, tab closed mid-upload, account switch | E2E | 13 | Yes | **PASS** — all paths behaved; media API 200 with the pasted image; lightbox ArrowRight + Esc; server healthy after the tab closed; bob sees his rows after an in-place account switch |
| EXPL-42…43 | Offline send and banner; three offline flaps while typing | E2E | 13 | Partial | **PARTIAL** — banner shown/cleared and draft preserved PASS; the offline bubble survives but the server has 0 copies after reconnect and nothing is refetched (BUG-034/BUG-091) |
| EXPL-44…49 | Viewport rotation, 200% zoom, unbroken word, scroll-up pill, back/forward, reload | E2E | 13 | Partial | **PARTIAL** — 390/360 overflow 303/333 px (BUG-067), 768/1440 clean; zoom overflow 0; 4,000-char word now 0 px overflow (BUG-096 fixed, CHAT-022); no "New messages" pill (BUG-076); back/forward PASS; reload signs out (BUG-039) |
| EXPL-50 | Console/page errors and failed requests for the whole session | E2E | 13 | — | **PASS** — 0 page errors; 10 console errors and 3 failed requests, every one attributable (6 key warnings from BUG-094, the bio 500, the executable 400, the cancelled upload, two intentional offline polling failures) |
| EXPL-CALL | Switch light/dark mode and chat background mid-call | E2E | 13 | **Missing calling** | **BLOCKED** — no client call UI or persistence (BUG-062/BUG-063); mid-call switching cannot be exercised |

---

## 4. REST authorization table (Phase 2 actual)

Executed in `backend/tests/api/*` against an in-memory test DB. `anon` = no token; `dave` = authenticated outsider; `owner/member` = participant. Expected contract: 401 for anon, 403/404 for outsiders, success for participants.

| Route | anon (actual) | dave (actual) | owner/member (actual) | Impl | Exec |
|---|---|---|---|---|---|
| `POST /api/auth/register` | 201 | 201 (new account) | — | Yes | PASS |
| `POST /api/auth/login` | 200 | 200 | 200 | Yes | PASS |
| `POST /api/auth/refresh` | 401 (no cookie) | 401 | 200 (rotates) | Yes | PASS |
| `POST /api/auth/logout` | 204 | 204 | 204 (revokes token) | Yes | PARTIAL (anon not asserted) |
| `GET /api/auth/me` | 401 | 200 (own) | 200 | Yes | PASS |
| `GET /api/users/search` | 401 | 200 (public fields) | 200 | Yes | PASS |
| `GET /api/users/:id` | 401 | 200 (public fields) | 200 | Yes | PASS |
| `PATCH /api/users/me` | 401 | 200 (own) | 200 | Yes | PASS |
| `POST /api/users/me/avatar` (spec) | — | — | — | **Missing** | BLOCKED (SD-003) |
| `GET /api/conversations` | 401 | 200 (empty) | 200 (own list) | Yes | PASS |
| `POST /api/conversations/direct` | 401 | 201 (own new) | 201/200 | Yes | PASS |
| `POST /api/conversations/group` | 401 | 201 (own new) | 201 | Partial | PASS (bad member ids fail — BUG-007/010) |
| `GET /api/conversations/:id` (spec) | — | — | — | **Missing** | BLOCKED (SD-003) |
| `PATCH /api/conversations/:id` | 401 | 403 | 200 (non-admin too — BUG-005; theme 500 — BUG-004) | Partial | FAIL |
| `POST /api/conversations/:id/members` | 401 | 403 | 200 (admin) | Yes | PASS (unknown conv 500 — BUG-011) |
| `DELETE /api/conversations/:id/members/:userId` | 401 | 403 | 200 (admin) | Yes | PASS |
| `POST /api/conversations/:id/leave` | 401 | **200 (BUG-014)** | 200 (member) | Yes | FAIL |
| `GET /api/conversations/:id/messages` | 401 | 403 | 200 | Yes | PASS |
| `GET /api/conversations/:id/media` (spec) | — | — | — | **Missing** | BLOCKED (SD-003) |
| `POST /api/uploads` | 401 | 201 (own) | 201 | Yes | PASS |
| `GET /api/uploads/:id` (actual) | 401 | 403 (BUG-003 fixed) | 200 (signed) | Yes | PASS |
| `GET /api/files/:id` (spec) | — | — | — | **Missing** | BLOCKED (SD-003) |
| `GET /api/calls/ice-config` | 401 | 200 | 200 | Yes | PASS (static TURN — SD-005) |
| `GET /api/health` | 200 | 200 | 200 | Yes | PASS |

---

## 5. Socket authorization table (Phase 3 actual)

Expected ack contract: `{ ok: true, data } | { ok: false, error }`. Executed in `backend/tests/socket/*` with Alice/Bob as members and Dave as the non-member witness.

| Direction | Event | anon | dave (non-member) | member | Impl | Exec |
|---|---|---|---|---|---|---|
| C→S | `message:send` | connect rejected | `{ok:false,error:'forbidden'}` (raw string) | broadcast + `{ok:true,message}` | Partial | PARTIAL (authz PASS; validation BUG-019/BUG-020, raw errors BUG-021, no limit BUG-022, replay rebroadcast BUG-026) |
| C→S | `message:delivered` | connect rejected | **accepted; forged status broadcast (BUG-023)** | pointer update + broadcast, **no ack** | Partial | FAIL (BUG-023, BUG-024) |
| C→S | `message:read` | connect rejected | **accepted; forged status broadcast (BUG-023)** | pointer update + broadcast, **no ack** | Partial | FAIL (BUG-023, BUG-024) |
| C→S | `typing:start` / `typing:stop` | connect rejected | no broadcast (checked) | broadcast to others, **no ack** | Partial | PARTIAL (authz PASS; BUG-024 no ack) |
| C→S | `conversation:active` | connect rejected | n/a | **no handler; ack null** | **Missing** | FAIL (BUG-016) |
| C→S | `call:invite/accept/decline/cancel/end/signal` | connect rejected | **no handler** | **no handler; acks null** | **Missing** | FAIL (BUG-017) |
| S→C | `message:new` | — | never before joining a group (verified) | yes | Yes | PASS (persisted + broadcast; duplicate on replay BUG-026) |
| S→C | `message:status` | — | not sent to him, but he can trigger one | yes (broadcast to room) | Partial | FAIL (BUG-023) |
| S→C | `typing:update` | — | never | yes | Yes | PASS |
| S→C | `presence:snapshot/update` | — | **receives everyone (BUG-018)** | yes | Partial | FAIL (BUG-018) |
| S→C | `conversation:created/updated/removed` | — | never | **never emitted** | **Missing** | FAIL (BUG-016) |
| S→C | `call:incoming/accepted/declined/busy/ended/signal` | — | never | **never emitted** | **Missing** | FAIL (BUG-017) |

Handshake: no token, malformed token, expired token, and wrong-secret token are all rejected; a valid token connects, receives a presence snapshot, joins server-controlled rooms only, and rejoins rooms after reconnect (AUTH-020, SEC-010).

---

## 6. Execution log

| Date | Layer | Tests | Result | Evidence |
|---|---|---|---|---|
| 2026-10-25 | Backend smoke (pre-existing) | 5 | **PASS** | `cd backend && npm test` output (1 file, 5 tests) |
| 2026-10-25 | Build | 1 | **PASS** | `cd frontend && npm run build` (2 warnings) |
| 2026-10-25 | Lint | 1 | **FAIL** | `cd frontend && npm run lint` (11 errors, incl. `Avatar` undefined) |
| 2026-10-25 | Manual availability | 2 | **PASS** | `/api/health` 200; `/` 200; login screenshot `docs/testing/recon-login.png` |
| 2026-10-25 | Phase 1 backend smoke (API, socket, DB, security, load) | 18 | **PASS** (17 passed + BUG-001 regression) | `npm run test:api`, `test:socket`, `test:db`, `test:security`, `test:load`; [run 1](./evidence/phase1-test-all-run1.log) |
| 2026-10-25 | Phase 1 frontend smoke | 10 | **PASS** | `npm run test:web` (components + theme store) |
| 2026-10-25 | Phase 1 E2E / a11y / visual smoke | 6 | **PASS** | `npm run test:e2e`, `test:a11y`, `test:visual` (login flow, 0 axe violations, 2 screenshot baselines) |
| 2026-10-25 | Full suite twice | 34 × 2 | **PASS** (33 pass + 1 expected fail per run) | [run 1](./evidence/phase1-test-all-run1.log), [run 2](./evidence/phase1-test-all-run2.log) |
| 2026-10-25 | Application defect found | 1 | **FAIL** (BUG-001) | Protected REST routes hang; regression `backend/tests/api/bug-001-auth-hang.test.js` |
| 2026-10-25 | Phase 2 REST feature tests (auth, users, conversations, messages, uploads, calls, authorization) | 101 | **PASS** (78 passed + 23 expected fail; all 23 map to BUG-002…BUG-014) | `cd backend && npm run test:api`; [final log](./evidence/phase2-api-final.log) |
| 2026-10-25 | Phase 2 defect triage before expected-fail conversion | 101 | **FAIL** (22 failed; 13 defects reproduced) | [raw triage log](./evidence/phase2-triage-raw.log) |
| 2026-10-25 | Phase 2 authorization matrix | 15 routes | **PASS** (anonymous → 401, stable shape) | `backend/tests/api/authorization.test.js` |
| 2026-10-25 | Phase 2 login/register rate limit | 2 | **PASS** (21st attempt → 429) | `backend/tests/api/auth-rate-limit.test.js` |
| 2026-10-25 | Phase 2 full suite, clean run 1 | 125 | **PASS** (102 passed + 23 expected fail) | [log](./evidence/phase2-test-all-run1.log) |
| 2026-10-25 | Phase 2 full suite, clean run 2 | 125 | **PASS** (same) | [log](./evidence/phase2-test-all-run2.log) |
| 2026-10-25 | BUG-002 fix: history regression + full suite | 8 | **PASS** (8/8; API 85 passed + 16 expected fail; full 109 + 16) | [regression](./evidence/bug-002-api.log), [full](./evidence/bug-002-full.log) |
| 2026-10-25 | BUG-003 fix: download authz regression + full suite | 18 | **PASS** (16 passed + 2 expected fail; API 88 passed + 15 expected fail; full 112 + 15) | [regression](./evidence/bug-003-api.log), [full](./evidence/bug-003-full.log) |
| 2026-10-25 | Phase 3 socket defect triage before expected-fail conversion | 63 | **FAIL** (25 failed; 11 defects reproduced; BUG-021 observed in ack text) | [raw log](./evidence/phase3-socket-raw2.log) |
| 2026-10-25 | Phase 3 malformed-payload crash probe (child process) | 3 events | **FAIL** (3 unhandled rejections — BUG-025) | Probe output in [raw log](./evidence/phase3-socket-raw2.log) |
| 2026-10-25 | Phase 3 socket feature suite (9 files) | 64 | **PASS** (38 passed + 26 expected fail; all expected fails map to BUG-015…BUG-026) | [final socket log](./evidence/phase3-socket-run1.log) |
| 2026-10-25 | Phase 3 full suite, clean run 1 | 189 | **PASS** (148 passed + 41 expected fail across API, socket, DB, web, security, load, E2E, a11y, visual) | [log](./evidence/phase3-test-all-run1.log) |
| 2026-10-25 | Phase 3 full suite, clean run 2 | 189 | **PASS** (same counts; exit 0) | [log](./evidence/phase3-test-all-run2.log) |
| 2026-10-25 | Phase 3 frontend build / lint | 2 | **PASS** build (1 warning) / **FAIL** lint (11 pre-existing app-source errors, none from test files) | [build](./evidence/phase3-build.log), [lint](./evidence/phase3-lint.log) |
| 2026-10-25 | Phase 4 database suite (indexes, schema, plans, races, outage, limits, leakage; 8 files) | 35 | **PASS** (30 passed + 5 expected fail; BUG-019, BUG-027…BUG-030) | [log](./evidence/phase4-db-raw.log) |
| 2026-10-25 | Phase 4 index/schema probe | 5 models | Evidence (index definitions, enum/length/cast behavior) | [probe log](./evidence/phase4-indexes-schema-probe.log) |
| 2026-10-25 | Phase 4 outage probe (exact response body) | 1 | **FAIL** (500 `INTERNAL_ERROR` / `read ECONNRESET` — BUG-029) | [probe log](./evidence/phase4-outage-response.log) |
| 2026-10-25 | Phase 4 conversation-list limit probe | 1 | **FAIL** (121 conversations, no pagination — BUG-030) | [probe log](./evidence/phase4-conversation-limit-probe.log) |
| 2026-10-25 | Phase 4 full suite, clean run 1 | 222 | **PASS** (176 passed + 46 expected fail; API 88+15, socket 38+26, DB 30+5, web 10, security 3, load 1, E2E 3, a11y 1, visual 2) | [log](./evidence/phase4-test-all-run1.log) |
| 2026-10-25 | Phase 4 full suite, clean run 2 | 222 | **PASS** (same counts; exit 0) | [log](./evidence/phase4-test-all-run2.log) |
| 2026-10-25 | Phase 5 frontend defect triage before expected-fail conversion | 59 | **FAIL** (11 failed; 8 defects reproduced: BUG-031…BUG-038) | [raw log](./evidence/phase5-web-raw1.log) |
| 2026-10-25 | Phase 5 frontend unit/component suite (9 files: theme, theme reload, API refresh, protected route, notifications, auth forms, Chats, chat list, UI smoke) | 59 | **PASS** (48 passed + 11 expected fail; every expected fail maps to BUG-031…BUG-038) | [final log](./evidence/phase5-web-final.log) |
| 2026-10-25 | BUG-031 fix: chat list + composer tests | 20 | **PASS** (13 passed + 7 expected fail; CHAT-020 promoted from `it.fails` to a normal regression) | [log](./evidence/bug-031-web.log) |
| 2026-10-25 | BUG-031 fix: frontend suite | 59 | **PASS** (49 passed + 10 expected fail) | [log](./evidence/bug-031-web.log) |
| 2026-10-25 | BUG-031 fix: full suite, clean run 1 | 271 | **PASS** (215 passed + 56 expected fail; API 88+15, socket 38+26, DB 30+5, web 49+10, security 3, load 1, E2E 3, a11y 1, visual 2; exit 0) | [log](./evidence/bug-031-full-run1.log) |
| 2026-10-25 | BUG-031 fix: full suite, clean run 2 | 271 | **PASS** (same counts; exit 0) | [log](./evidence/bug-031-full-run2.log) |
| 2026-10-25 | BUG-032 fix: theme reload + no-flash tests | 3 | **PASS** (MODE-003 and MODE-004 promoted from `it.fails`) | [log](./evidence/bug-032-web.log) |
| 2026-10-25 | BUG-032 fix: frontend suite | 59 | **PASS** (51 passed + 8 expected fail) | [log](./evidence/bug-032-web.log) |
| 2026-10-25 | BUG-032 fix: full suite, clean run 1 | 271 | **PASS** (217 passed + 54 expected fail; API 88+15, socket 38+26, DB 30+5, web 51+8, security 3, load 1, E2E 3, a11y 1, visual 2; exit 0) | [log](./evidence/bug-032-full-run1.log) |
| 2026-10-25 | BUG-032 fix: full suite, clean run 2 | 271 | **PASS** (same counts; exit 0) | [log](./evidence/bug-032-full-run2.log) |
| 2026-10-25 | BUG-033 fix: message presentation tests | 22 | **PASS** (17 passed + 5 expected fail; TS-002/TS-003 promoted; grouping, sender labels/colors, and ticks added) | [log](./evidence/bug-033-web.log) |
| 2026-10-25 | BUG-033 fix: frontend suite | 62 | **PASS** (56 passed + 6 expected fail) | [log](./evidence/bug-033-web.log) |
| 2026-10-25 | BUG-033 fix: full suite, clean run 1 | 274 | **PASS** (222 passed + 52 expected fail; API 88+15, socket 38+26, DB 30+5, web 56+6, security 3, load 1, E2E 3, a11y 1, visual 2; exit 0) | [log](./evidence/bug-033-full-run1.log) |
| 2026-10-25 | BUG-033 fix: full suite, clean run 2 | 274 | **PASS** (same counts; exit 0) | [log](./evidence/bug-033-full-run2.log) |
| 2026-10-25 | Phase 6 E2E Chromium raw triage (40 two-to-four-user flows) | 40 | **FAIL** (17 passed + 23 failed; 2 test defects fixed, 21 defects/deviation reproduced) | [raw log](./evidence/phase6-e2e-chromium-raw3.log) |
| 2026-10-25 | Phase 6 E2E Chromium final (all suites: auth, profile, chat, group, appearance) | 40 | **PASS** (40 passed = 19 normal + 21 expected fail; exit 0; 5.9 min; no 429s) | [final log](./evidence/phase6-e2e-chromium-final.log) |
| 2026-10-25 | Phase 6 E2E WebKit raw triage (same 40 flows) | 40 | **FAIL** (37 passed + 3 failed; all three test-side: WebKit `sameSite` introspection, 60 s budget on two group tests) | [raw log](./evidence/phase6-e2e-webkit-raw1.log) |
| 2026-10-25 | Phase 6 WebKit triage reruns (the 3 failures, isolated) | 3 × 3 | **PASS** (run 1 reproduced all three; runs 2–3: 3 passed each after the test/config corrections, BUG-048 expected fail) | [rerun 1](./evidence/phase6-e2e-webkit-failures-rerun1.log); [rerun 2](./evidence/phase6-e2e-webkit-failures-rerun2.log); [rerun 3](./evidence/phase6-e2e-webkit-failures-rerun3.log); [probe](./evidence/phase6-webkit-samesite-probe.log) |
| 2026-10-25 | Phase 6 E2E WebKit final after test-side corrections | 40 | **PASS** (40 passed = 19 normal + 21 expected fail; exit 0; 15.0 min) | [final log](./evidence/phase6-e2e-webkit-final.log) |
| 2026-10-25 | Phase 6 full suite run 1 (`test:all`: API 103, socket 64, DB 35, web 62, security 3, load 1, E2E 40, a11y 1, visual 2) | 311 | **PASS** (238 passed + 73 expected fail; exit 0) | [run 1](./evidence/phase6-test-all-run1.log) |
| 2026-10-25 | Phase 6 full suite run 2 | 311 | **PASS** (238 passed + 73 expected fail; exit 0) | [run 2](./evidence/phase6-test-all-run2.log) |
| 2026-10-25 | Phase 7 upload-matrix probe against the real API (images, documents, audio, filenames, serving, media endpoint) | 1 probe | Evidence (every matrix row executed before test conversion) | [probe log](./evidence/phase7-upload-probe.log) |
| 2026-10-25 | Phase 7 backend media API suite (image/document/audio matrices, sniffing, filenames, EXIF, serving) | 28 | **PASS** (17 passed + 11 expected fail: BUG-006/012/053×2/054×2/055×2/056/057, SD-003) | [log](./evidence/phase7-backend.log) |
| 2026-10-25 | Phase 7 socket attachment ownership (dave witness; foreign/mixed/reused/unknown) | 5 | **PASS** (4 passed + 1 expected fail BUG-020) | [log](./evidence/phase7-backend.log) |
| 2026-10-25 | Phase 7 upload TTL (24 h index, orphan vs attached) | 3 | **PASS** (2 passed + 1 expected fail BUG-028) | [log](./evidence/phase7-backend.log) |
| 2026-10-25 | Phase 7 frontend suite (media rendering expected fails added) | 66 | **PASS** (56 passed + 10 expected fail: BUG-034…BUG-038, BUG-039/040 web, BUG-059×3, BUG-060) | [log](./evidence/phase7-web.log) |
| 2026-10-25 | Phase 7 recorder/codec capability probe (Chromium/Firefox/WebKit) | 3 | Evidence (Chromium WebM/Opus+MP4; Firefox WebM/Opus+Ogg/Opus; WebKit no MediaRecorder) | [log](./evidence/phase7-codec-probe.log) |
| 2026-10-25 | Phase 7 media E2E (composer attach, file input, paste upload, mic, shared-media tabs × 3 browsers) | 15 | **PASS with expected fails** (all 15 expected fail; exit 0; 3.8 min) | [log](./evidence/phase7-media-e2e.log) |
| 2026-10-25 | Phase 7 backend full suite | 242 | **PASS** (183 passed + 59 expected fail; exit 0; 65.30 s) | [log](./evidence/phase7-backend.log) |
| 2026-10-25 | Phase 7 full suite run 1 (`test:all`: API 131, socket 69, DB 38, web 66, security 3, load 1, E2E 45, a11y 1, visual 2) | 356 | **PASS** (261 passed + 95 expected fail; exit 0) | [run 1](./evidence/phase7-test-all-run1.log) |
| 2026-10-25 | Phase 7 full suite run 2 | 356 | **PASS** (same counts; exit 0) | [run 2](./evidence/phase7-test-all-run2.log) |
| 2026-10-25 | Phase 7 frontend build / lint | 2 | Build **PASS** (exit 0); lint **FAIL** (10 pre-existing app-source errors, none in test files) | [build](./evidence/phase7-build.log), [lint](./evidence/phase7-lint.log) |
| 2026-10-26 | Phase 9 theme modes (no-flash before bundle, System live follow, explicit override, reload, tab sync, picker, reduced motion) | 7 | **PASS** (6 passed + 1 expected fail BUG-064; 28.0 s) | [log](./evidence/phase9-theme-run1.log) |
| 2026-10-26 | Phase 9 axe matrix (login, register, list, profile, open chat + info panel, 3 backgrounds; light/dark) | 14 | **PASS** (6 passed + 8 expected fail: BUG-050×3, BUG-065, BUG-066×4) | [run 1](./evidence/phase9-axe-run1.log); [run 2](./evidence/phase9-axe-run2.log) |
| 2026-10-26 | Phase 9 visual baselines created (login/chat/profile × light/dark × 5 viewports) | 30 images | **PASS** (created and regenerated after removing the transient toast; **approved 2026-10-26**) | [creation](./evidence/phase9-visual-create.log); [update](./evidence/phase9-visual-update.log); [compare](./evidence/phase9-visual-run1.log) |
| 2026-10-26 | Phase 9 visual comparison within `test:all` | 8 | **PASS** (8/8 against 30 baselines; 46.4–47.0 s) | [run 1](./evidence/phase9-test-all-run1.log); [run 2](./evidence/phase9-test-all-run2.log) |
| 2026-10-26 | Phase 9 responsive + keyboard walkthroughs, Chromium | 25 | **PASS** (25 passed = 12 normal + 13 expected fail: BUG-040/050/062/067×5/068/069/070/071/072) | [log](./evidence/phase9-responsive-keyboard-final.log) |
| 2026-10-26 | Phase 9 responsive + keyboard walkthroughs, Firefox | 25 | **PASS** (24 passed + 1 skipped; skip = Chromium-only fake microphone) | [log](./evidence/phase9-responsive-keyboard-firefox.log) |
| 2026-10-26 | Phase 9 responsive + keyboard walkthroughs, WebKit | 25 | **PASS** (24 passed + 1 skipped; skip = Chromium-only fake microphone) | [log](./evidence/phase9-responsive-keyboard-webkit.log) |
| 2026-10-26 | Phase 9 full suite run 1 (`test:all`: API 135, socket 84, DB 38, web 74, security 3, load 1, E2E 83, a11y 14, visual 8) | 440 | **PASS** (374 passed + 66 expected fail; exit 0) | [run 1](./evidence/phase9-test-all-run1.log) |
| 2026-10-26 | Phase 9 full suite run 2 | 440 | **PASS** (identical per-stage counts; exit 0) | [run 2](./evidence/phase9-test-all-run2.log) |
| 2026-10-26 | Phase 10 backend mute API (`tests/api/notifications.test.js`) | 5 | **PASS** (1 passed + 4 expected fail BUG-078) | [log](./evidence/phase10-api-notifications.log) |
| 2026-10-26 | Phase 10 frontend notification rules + store | 15 | **PASS** (10 passed + 5 expected fail: BUG-078/079/081/082 + pre-existing BUG-038) | [log](./evidence/phase10-web-notifications.log) |
| 2026-10-26 | Phase 10 notification E2E, Chromium, two users (9 flows) | 9 | **PASS** (5 passed + 4 expected fail: BUG-078/080/037/040; duplicate-tab observation `tabA=1 tabB=1`; 1.2 min) | [log](./evidence/phase10-e2e-notifications.log) |
| 2026-10-26 | Phase 10 frontend build / lint | 2 | Build **PASS** (exit 0; one pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` warning); lint **FAIL** (9 pre-existing app-source errors, none in test files) | [build](./evidence/phase10-build.log), [lint](./evidence/phase10-lint.log) |
| 2026-10-26 | Phase 10 full suite run 1 (`test:all`: API 140, socket 84, DB 38, web 83, security 3, load 1, E2E 92, a11y 14, visual 8) | 463 | **PASS** (389 passed + 74 expected fail; exit 0) | [run 1](./evidence/phase10-test-all-run1.log) |
| 2026-10-26 | Phase 10 full suite run 2 | 463 | **PASS** (identical per-stage counts; exit 0) | [run 2](./evidence/phase10-test-all-run2.log) |
| 2026-10-26 | Phase 11 security suite (authorization matrices, injection/XSS sweeps, session, headers, rate limits, socket abuse, supply chain, secrets) | 72 | **PASS** (56 passed + 16 expected fail; BUG-004/005/007/014/021/022/023/048/083…089) | [log](./evidence/phase11-security-run1.log) |
| 2026-10-26 | Phase 11 full suite run 1 (`test:all`) | 540 | **PASS** (450 passed + 90 expected fail; exit 0) | [run 1](./evidence/phase11-test-all-run1.log) |
| 2026-10-26 | Phase 11 full suite run 2 | 540 | **PASS** (identical per-stage counts; exit 0) | [run 2](./evidence/phase11-test-all-run2.log) |
| 2026-10-28 | Phase 12 load suite (100/500 sockets, 30-minute soak, 200 connect/disconnect cycles) | 5 | **PASS** (4 passed + 1 expected fail BUG-092) | [load](./evidence/phase12-load-run1.log), [soak](./evidence/phase12-soak.log) |
| 2026-10-28 | Phase 12 performance E2E (10k history, network chaos, server restart, client leaks) | 10 | **PASS with expected fails** (BUG-051/076/091; PERF-006 restart resync PASS) | [run 4](./evidence/phase12-perf-e2e-run4.log) |
| 2026-10-28 | Phase 12 full suite run 1 (`test:all`) | 556 | **PASS** (464 passed + 92 expected fail; exit 0) | [run 1](./evidence/phase12-test-all-run1.log) |
| 2026-10-28 | Phase 12 full suite run 2 | 556 | **PASS** (identical per-stage counts; exit 0) | [run 2](./evidence/phase12-test-all-run2.log) |
| 2026-10-28 | Phase 13 chaos session, run 1 | 50 steps | **PASS** (session completed; 6 anomalies, 0 step errors; 2.5 min) | [JSON](./evidence/phase13-session-run1.json) |
| 2026-10-28 | Phase 13 chaos session, run 2 | 50 steps | **ABORTED — harness defect** (ambiguous locator; fixed in the harness; not a product result) | [JSON](./evidence/phase13-session-run2.json) |
| 2026-10-28 | Phase 13 chaos session, run 3 (authoritative) | 50 steps | **PASS** (42 ok + 8 anomalies, 0 errors; 2.4 min; filed BUG-093…096) | [JSON](./evidence/phase13-session-run3.json), [log](./evidence/phase13-run3.log) |
| 2026-10-28 | Phase 14 full suite run 1 (same tree) | 556 | **PASS** (464 passed + 92 expected fail; exit 0; identical per-stage counts) | [run 1](./evidence/phase14-test-all-run1.log) |
| 2026-10-28 | Phase 14 full suite run 2 (same tree) | 556 | **PASS** (identical per-stage counts; exit 0) | [run 2](./evidence/phase14-test-all-run2.log) |
| 2026-10-28 | Phase 14 frontend build / lint | 2 | Build **PASS** (exit 0); lint **FAIL** (9 pre-existing app-source errors, none in test files) | [build](./evidence/phase14-build.log), [lint](./evidence/phase14-lint.log) |
| 2026-10-28 | Phase 14 traceability audit, operator guide, platform manual seeds | — | **PASS** (every row executed or explicitly unexecuted with a reason; 14 residuals; `README.md` written; `MANUAL_CHECKLIST.md` §G) | [TRACEABILITY.md](./TRACEABILITY.md), [README.md](./README.md), [MANUAL_CHECKLIST.md](./MANUAL_CHECKLIST.md) |
| 2026-10-28 | BUG-095 fix: regression red first, then fix, then chaos re-run | 26 + 90 + 557 | **PASS** — regression failed against the old code, passes after; frontend 90 (79+11); full `test:all` 557 = 465 + 92, exit 0; chaos 50 steps, 0 errors, 7 anomalies (step 24 passes); build PASS, lint unchanged | [red](./evidence/bug-095-red.log), [web](./evidence/bug-095-web.log), [full](./evidence/bug-095-test-all.log), [chaos](./evidence/phase13-session-bug095-fix.json) |
| 2026-10-28 | BUG-096 fix: regression red first, then fix, then full suite and chaos re-run | 3 + 90 + 107 + 558 | **PASS** — regression failed against the old code (59,596 px), passes after (0 px) alongside the two neighbouring phone tests; frontend 90 (79+11); E2E 107; full `test:all` 558 = 466 + 92, exit 0; chaos 50 steps, 0 errors, 6 anomalies (step 46 passes); build PASS, lint unchanged at 9. Time-of-day test flake fixed (test-only) | [red](./evidence/bug-096-red.log), [targeted](./evidence/bug-096-targeted.log), [full](./evidence/bug-096-test-all.log), [chaos](./evidence/phase13-session-bug096-fix.json), [build](./evidence/bug-096-build.log) |
| — | Upload TTL end-to-end expiry | 0 | PARTIAL (Phase 7) | The monitor's scan predicate is executed against a backdated attached upload (BUG-028); waiting ~60 s for real deletion was not repeated |
| — | Client call state-machine reducer | 0 | BLOCKED | No client call code exists and the socket signaling is missing (BUG-017) |
| — | Time-zone display across UTC/New York/Kolkata/Auckland incl. DST | 0 | PARTIAL / NOT TESTED | Phase 6 rendered local times in America/New_York and Asia/Tokyo; Kolkata, Auckland, and DST transitions remain NOT TESTED |
| — | Client chat and media UI flows | 0 | **PASS with bugs** | Covered by Phases 6–13 E2E (send/receive, media, lightbox, notifications, themes modes); call UI remains BLOCKED (BUG-062) |

---

## 7. Notes and unresolved items

- Feature 15 (calls) still has no implementation beyond `GET /api/calls/ice-config`; every CALL row is an expected fail (BUG-017/BUG-062/BUG-063) until signaling and UI exist.
- Feature 11 (photo sharing) and 10/12 (file, image, and audio UI) now exist after the approved BUG-053…BUG-061 batch. Jumbo emoji (BUG-035), URL linkification (BUG-036), the app shell/settings (BUG-040), chat backgrounds (BUG-050), notification sounds (BUG-079), preview toggle (BUG-081), and click-through (BUG-080) remain missing.
- The app's actual file-serving route is `GET /api/uploads/:id`, not `GET /api/files/:id`; this is a spec deviation to confirm.
- **BUG-001** (S1) is fixed (approved 2026-10-25) and its regression test passes; protected routes now return 401. Verification in your environment is still pending.
- **BUG-002** (S1) is fixed pending verification: history now validates the id, checks existence/membership, and paginates with `before`/`limit`. CHAT-003/011/015 REST tests pass (8/8).
- **BUG-003** (S1) is fixed pending verification: `GET /api/uploads/:id` now requires participation for attached uploads and ownership for unattached ones; outsider access returns 403.
- Phase 2 logged 13 defects (BUG-002…BUG-014), 6 spec deviations (SD-001…SD-006), and 3 open questions (Q-001…Q-003) in [BUGS.md](./BUGS.md); BUG-002 and BUG-003 are the two fixed so far.
- Phase 3 executed the socket suite (9 files, 64 tests, 38 passed + 26 expected fail). Reproduced defects: **BUG-015** (stale rooms on membership change, S1), **BUG-016** (missing `conversation:active` + lifecycle events, S2), **BUG-017** (missing `call:*` signaling, S2), **BUG-018** (presence ignores contacts/privacy, S2), **BUG-019** (message text validation missing, S2), **BUG-020** (valid attachment send always fails, S2), **BUG-021** (raw DB errors in acks, S3), **BUG-022** (no socket rate limit, S2), **BUG-023** (receipt forgery/monotonicity/privacy, S2), **BUG-024** (typing/receipt acks missing, S3), **BUG-025** (malformed payloads → unhandled rejections, S1), **BUG-026** (replay rebroadcast, S3).
- The server-side socket contract is otherwise solid where tested: handshake auth rejects missing/malformed/expired/wrong-secret tokens, rooms are server-controlled, arbitrary client room joins are inert, send authorization and dedupe-by-storage work, typing is scoped and ephemeral, presence grace/multi-tab behavior works, and oversized payloads do not crash the server.
- Client-side socket behavior has since been covered by Phases 6–13: the socket manager and reconnect/rejoin banner (PERF-005/006), live message rendering (Phase 6), media UI (Phase 7), notifications (Phase 10), and the chaos session (Phase 13). Optimistic-send reconciliation and retry remain FAIL (BUG-034); call UI remains unimplemented (BUG-062/BUG-063).
- Phase 4 executed the database suite (8 files, 35 tests, 30 passed + 5 expected fail). Reproduced defects: **BUG-027** (five extra indexes, S3), **BUG-028** (Upload TTL expires attached files, S2/latent S1), **BUG-029** (outage returns raw 500 instead of 503, S2), **BUG-030** (`GET /api/conversations` unbounded, S2). Message-text validation remains BUG-019.
- Phase 5 executed the frontend unit/component suite (9 files, 59 tests, 48 passed + 11 expected fail). Reproduced defects: **BUG-031** (conversation list crashes on any non-empty list — `Avatar` not imported, S1), **BUG-032** (theme preference lost on reload + no-flash script writes raw JSON, S2), **BUG-033** (no timestamps, date separators, grouping, sender labels, or ticks, S2 — fixed and verified 2026-10-25), **BUG-034** (optimistic send never reconciled/deduped/failed/retried, S2), **BUG-035** (emoji-only messages not large, S3), **BUG-036** (URLs not linkified, S3), **BUG-037** (own message from another tab notifies/increments unread, S2), **BUG-038** (unread total not restored to the tab title, S3).
- Frontend behavior that passed: theme resolution for system/light/dark, live OS follow, cross-tab sync, and unrelated-storage-key isolation; single-flight token refresh, 401→refresh→retry, refresh failure clearing the session, and no refresh on a failed login; protected-route redirect; login/register required fields, password boundary, register digit rule (SD-001), success payloads, and server errors; composer Enter-to-send payload, Shift+Enter, whitespace rejection, per-conversation drafts, emoji cursor insertion + focus, and HTML rendered as plain text; unread/total/title updates, open-conversation suppression, desktop notification gating on hidden/enabled, and permission granted/denied persistence.
- **BLOCKED / NOT TESTED in Phase 5 by absence of implementation:** the client call state-machine reducer (no client call code; server signaling is BUG-017). Timestamp, separator, grouping, sender-label, and tick rendering now exist after the BUG-033 fix and are web-tested; cross-time-zone/DST runs remain NOT TESTED.
- After the approved BUG-033 fix, message presentation lives in `frontend/src/features/chats/MessageList.jsx` and `frontend/src/lib/dates.js`: locale `Intl.DateTimeFormat` times with a full date/time `title`, Today/Yesterday/full-date separators, 5-minute same-sender grouping with reduced inner radius, per-user group sender labels from `--sender-1…4`, and sent/delivered/read ticks derived from participant pointers. TS-002/TS-003 are normal regressions, and three presentation tests were added. Post-BUG-033 frontend suite: 62 tests, 56 passed + 6 expected fail; full `test:all` green twice (274 tests: 222 passed + 52 expected fail).
- 79 bugs remain open or partial (78 open + BUG-021 partially fixed); 96 filed. Fixed and verified: BUG-001, BUG-002, BUG-003, BUG-012, BUG-020, BUG-031, BUG-032, BUG-033, and BUG-053…BUG-061 (BUG-031/032/033 and the media batch approved; BUG-002/BUG-003 still pending your verification). Open severity mix: 3 × S1 (BUG-015, BUG-025, BUG-039), 45 × S2, 31 × S3.
- Database behavior that passed: the specified indexes and TTLs exist; pagination and conversation-list queries use `IXSCAN` on 100,000 messages / 20,000 conversations; required fields, enums, bio length, privacy booleans, and invalid ObjectIds are rejected; direct-chat creation, same-`clientId` sends, and username/email claims have exactly one winner under concurrency; an outage is detected, logged once, does not crash the process, gets an error ack on sockets, and recovers automatically; message history and user search are bounded; no `passwordHash`/`tokenHash`/`refreshToken` appears in API responses.
- After the approved BUG-031 fix, the conversation list renders a row per conversation; CHAT-020's regression is a normal test and passes. The fix changed `frontend/src/features/chats/Chats.jsx` (one import) and only test files besides it.
- After the approved BUG-032 fix, a stored theme preference is applied on reload before the bundle runs: the persist `merge` recomputes `resolved`, and the inline no-flash script parses the zustand JSON with a validated fallback. MODE-003/MODE-004 web regressions are normal tests and pass. Post-BUG-032 frontend suite: 59 tests, 51 passed + 8 expected fail; full `test:all` green twice (271 tests: 217 passed + 54 expected fail).
- Phase 6 executed 40 multi-user E2E flows in Chromium (two to four isolated browser contexts). Real-time checks passed for 1:1 delivery (stored once), HTML/script-as-text, Unicode/emoji/RTL, local-time rendering in New York and Tokyo, Today/Yesterday separators, start-chat-by-username, group delivery + "Group created", emoji lazy load + cursor insertion, profile edit/persist, taken-username error, and cross-user profile updates via API. Reproduced defects: **BUG-039** (reload signs the user out), **BUG-040** (no app shell/nav/settings/logout, incl. no theme toggle), **BUG-041** (no return path after login), **BUG-042** (no privacy controls), **BUG-043** (no other-user profile), **BUG-044** (generic direct names/header, no list time), **BUG-045** (no presence UI), **BUG-046** (typing never emitted/rendered, direct and group), **BUG-047** (no delivered/read emission or status listener), **BUG-048** (unpopulated sender so group names never render), **BUG-049** (no group create UI/info panel/member list), **BUG-050** (no theme picker/application/sync), **BUG-051** (no pagination/older-history load), **BUG-052** (Esc does not close the emoji picker). BUG-034/035/036 are reconfirmed end-to-end; avatar upload remains **SD-003**. Post-Phase 6 full `test:all` is green twice (311 tests: 238 passed + 73 expected fail, exit 0).
- Cross-browser: Chromium and WebKit full runs are green with the 21 expected failures; Firefox was green apart from one flaky timezone `page.goto` timeout (3/3 isolated reruns passed). WebKit triage found two test-side issues, not app defects: Playwright WebKit's cookie API reports `sameSite: "None"` for every cookie (a cookie added as Lax reads back as None), so the auth test verifies `SameSite=Lax` on the real refresh `Set-Cookie` header; and multi-context WebKit flows need more than 60 s (group delivery passed at 59.5 s–1.1 m), so the WebKit project timeout is 120 s. The suite remains green without hiding any defect.
- E2E runs use a test-only harness that bypasses the three REST rate-limiter layers; production code is untouched and REST rate limiting remains covered by `test:api`. The bypass asserts exactly three layers were replaced and the harness DB name contains `test`.
- Phase 7 executed the media matrices end to end (probe first, then 36 backend tests, 4 frontend expected fails, and 15 cross-browser E2E expected fails). New defects: **BUG-053** (WebM and Ogg/Opus — the exact formats Chrome and Firefox recorders produce — are rejected, S2), **BUG-054** (non-Latin-1/NUL filenames corrupt the stored name or break the response, S3), **BUG-055** (corrupt/bomb images return raw 500s, S3), **BUG-056** (animated GIF flattened to one frame, S3), **BUG-057** (`duration` never stored, S3), **BUG-058** (no composer attach/file/paste/progress UI, S2), **BUG-059** (no image/file bubbles or lightbox, S2), **BUG-060** (no Photos/Files/Audio tabs or audio player, S2), **BUG-061** (no voice-recording UI, S2). The media endpoint is missing (SD-003), and TXT/CSV plus 25 MB+1 remain BUG-006/BUG-012.
- Media behavior that passed: content sniffing defeats renamed executables and fake extensions; JPEG EXIF (incl. GPS) is stripped and dimensions/thumbnail are stored; the 10 MB and 25 MB boundaries behave (10 MB accepted, 10 MB+1 clean 400, 25 MB accepted); SVG and script/executable types are rejected; uploads are stored under random keys and path traversal is basenamed; signed URLs reject expiry and tampering; `dave` is denied; removed group members lose download access immediately; `nosniff` and `Content-Disposition` are present; corrupted audio fails cleanly; upload TTL semantics are exactly as specified for orphans.
- **BLOCKED in Phase 7:** the Safari recorder/codec path — Playwright WebKit on Windows exposes no `MediaRecorder`. All UI media rows are BLOCKED or expected-fail by the missing composer/list/info-panel UI (BUG-058…BUG-061), not by test harness gaps.
- E2E runs use a test-only harness that bypasses the three REST rate-limiter layers; production code is untouched and REST rate limiting remains covered by `test:api`. The bypass asserts exactly three layers were replaced and the harness DB name contains `test`.
- Phase 9 executed 51 new appearance/accessibility/responsive tests and filed **BUG-064** (emoji picker follows the OS, not the app mode), **BUG-065** (own-message timestamps 1.05:1 in light mode), **BUG-066** (danger button, avatar initials, and dark selected media tab below AA), **BUG-067** (no responsive layout at any breakpoint), **BUG-068** (32–38 px phone touch targets), **BUG-069** (conversation rows are non-focusable `div`s), **BUG-070** (Escape does not close the attach menu), **BUG-071** (no polite live region for incoming messages), **BUG-072** (lightbox focus is never moved, trapped, or restored), **BUG-073** (favicon 404, no logo or `APP_NAME`), **BUG-074** (profile omits joined date), **BUG-075** (list lacks filter tabs, unread badge, mute icon, attachment preview), **BUG-076** (no virtualization or "New messages ↓" pill), and **BUG-077** (list preview/time/order never update on arrival).
- Appearance behavior that passed: the persisted theme is painted before `main.jsx` runs (`data-theme` trace is `dark` from the first mutation), System follows the OS live without reload, explicit light/dark beat a contradictory OS scheme, `localStorage` persistence survives reload, a second tab syncs the choice, `color-scheme` matches, and reduced motion removes transitions/animations.
- Visual baselines: 30 images (login/chat/profile × light/dark × 360×760, 390×844, 768×1024, 1024×768, 1440×900) with only `<time>`, date separators, and the random profile username masked; **approved 2026-10-26 and now the standard**. The chat is opened before seeding so the 3 s "New message" toast is absent by construction; the empty list preview this exposes is BUG-077, recorded rather than masked. The 30 non-default-background baselines are blocked by BUG-050.
- Responsive/keyboard passing behavior: no horizontal overflow at any viewport, phone-width auth forms stay single-column, the 200% zoom form check passes, chat remains usable at phone/laptop widths, auth and start-chat/send are completable from the keyboard with visible focus rings, the attach menu supports keyboard photo selection, and voice recording can be started and cancelled from the keyboard. Firefox and WebKit match Chromium on these 25 tests (24 passed + 1 skipped each).
- **Could not test in Phase 9:** chat-background visuals and axe scans beyond the default background (BUG-050); real OS theme changes (Playwright `emulateMedia` was used); screen readers; on-screen mobile keyboards; 400% reflow; cross-browser pixel comparison and axe (Chromium-only configuration).
- Phase 10 executed 23 new notification tests and filed **BUG-078** (conversation mute has no API, UI, or enforcement; `PATCH` ignores `mutedUntil`), **BUG-079** (no notification sound), **BUG-080** (desktop notification has no click handler), **BUG-081** (previews cannot be turned off), and **BUG-082** (a visible but unfocused tab gets no desktop notification). Reproduced by expected-fail tests at all three layers, with the non-member mute check (403) passing.
- Notification behavior that passed: live unread/title updates with clear-on-open; toast and title only for a closed conversation; desktop notification only while hidden; granted/denied/default permission outcomes at the store level; no permission request on mount; 100 messages arriving at once keep the UI responsive with a single toast node (unit <3 s, E2E title `(100)` and a successful send afterwards); two hidden tabs each raise their own notification for one message (logged observation `tabA=1 tabB=1`, not graded). Mute isolation and non-member denial are correct on the REST authorization path (MUTE-005), and the sender self-echo exists on the socket by design for multi-device sync.
- **Could not test in Phase 10:** missed-call notification (calling unimplemented — BUG-017/BUG-062/BUG-063); Web Push (not approved); real OS permission prompts and notification center (`Notification`/`Audio` stubbed, headless Chromium); unfocused-but-visible end to end (unit-level only, BUG-082); two-tab duplicates are logged, not graded, per 5.13.
- Phase 13 executed a 50-step, three-user chaos session ([EXPLORATORY_SESSION.md](./EXPLORATORY_SESSION.md); harness [chaos.spec.js](../../tests/exploratory/chaos.spec.js)). New defects: **BUG-093** (conversation search is inert, S3), **BUG-094** (`New chat` prepends without dedupe → duplicate rows and React key collisions, S3), **BUG-095** (fast switching renders the previous chat's messages under the new header, S2), **BUG-096** (a 4,000-character unbroken word overflows the page by 59,684 px, S2). Re-confirmed: BUG-013, BUG-019 (100k chars stored), BUG-034/BUG-091 (offline message never reaches the server or resyncs), BUG-035, BUG-039, BUG-067 (303/333 px phone overflow), BUG-076, BUG-088 (bio 161 → 500). Q-001 extended: the New-chat dialog can open a self-chat ("Chat"). No application source was changed; `test:exploratory` is excluded from `test:all`.
- **BLOCKED in Phase 13:** switching light/dark mode and chat backgrounds mid-call — there is no client call UI or call persistence (BUG-062/BUG-063); touch gestures/on-screen keyboards are not reproducible in headless Chromium; browser notification permission/click-through is Phase 10 coverage and was not repeated.
- No application source code is changed without explicit approval (Testing.md 2.3). The test-authoring phases (6, 8–14) changed only test files, harness/config, and testing docs; the only application-source changes since Phase 5 are the approved fix batches (BUG-001…003, BUG-031…033, and BUG-053…BUG-061 with prerequisites BUG-012/BUG-020/SD-003/SD-004).
