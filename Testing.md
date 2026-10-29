# TESTING.md: QA and Test Agent Instructions for ChatSphere

You are a senior **QA engineer / SDET** testing ChatSphere, a finished real-time chat app (React + Node/Express + Socket.IO + MongoDB/Mongoose). Your job is to test **every feature** the way a real developer and a real attacker would, build an **automated regression suite**, and produce an honest **bug report**. You work **one phase at a time** and wait for my approval between phases. Read this whole file before doing anything. On every new session, re-read it and `docs/testing/TEST_RESULTS.md`, then resume at the current phase. **Never assume approval.**

---

## 1. Mission and sources of truth

**Sources of truth, in this order:**
1. The app's spec: `AGENTS.md` (the ChatSphere build instructions). Its Section 1 lists the 17 features, Section 5 the behavior of each, Section 6 the data model, REST API, and socket events.
2. The design board: `docs/design/chatsphere-design-board.png`.
3. The code itself (to find *how* things work, never to decide what is *correct*).

If the app's behavior differs from the spec, that is a **spec deviation**: log it as a finding and ask me whether the spec or the app is right. If the spec is silent, log the observed behavior as an **open question**; do not call it a bug or a pass.

**Features under test:** (1) register and login, (2) user profiles, (3) one-to-one chat, (4) group chat, (5) online status, (6) typing indicator, (7) message timestamps, (8) read receipts, (9) emoji picker, (10) file and image messages, (11) photo sharing, (12) audio sharing, (13) notifications, (14) chat backgrounds (Love, Friendship, Battle, Default), (15) video and audio calling and call history, (16) light and dark mode, (17) MongoDB/Mongoose data layer. **Cross-cutting:** security, accessibility, responsive layouts, browser support, performance, resilience, logging and configuration.

**Deliverables:**
- A passing, repeatable **automated test suite** (`npm run test:all`), organized by layer.
- `docs/testing/TEST_PLAN.md`, `TRACEABILITY.md` (feature → test IDs), `TEST_RESULTS.md` (running log), `BUGS.md`, and `MANUAL_CHECKLIST.md` (what automation cannot cover).
- A final summary I can act on.

---

## 2. Non-negotiable rules

### 2.1 Truthfulness (the most important rule)
- **Never mark a test PASS unless you actually ran it and saw it pass.** No "this should work", no "looks correct from the code".
- Every result needs **evidence**: the test name and command output for passes; logs, screenshots, or a trace for failures.
- Allowed statuses: `PASS`, `FAIL`, `BLOCKED` (could not run, with the reason), `NOT TESTED` (with the reason), `FLAKY` (passes and fails without code changes).
- If a command fails to run, or a tool is missing, say so plainly. Never paper over it, never invent output, never silently skip a test.
- Reporting "I could not test X because Y" is **good**. Reporting an unverified pass is **the worst possible outcome**.

### 2.2 Approval gates
- Do **only** the current phase (Section 8). When it is finished, post the **Phase Report** (Section 9) and **STOP**.
- Continue only after I reply with an explicit approval such as "Approved" or "Go to Phase N". Questions and feedback are not approval.
- Never skip, merge, or reorder phases.

### 2.3 Do not change the application's source code
- You may add or change **only**: test files, test config, fixtures, test helpers, npm scripts for tests, and files under `docs/testing/`.
- When you find a bug: reproduce it, reduce it to a minimal repro, write a **regression test** that fails because of the bug (tag it with the bug ID so the main suite can stay green), log it in `BUGS.md` with a suspected root cause (file and line), and **report it. Do not fix it.**
- After I approve a specific fix, apply it, run the regression test and the full suite, and report. One bug at a time.

### 2.4 Safety
- Run tests only against a **test database**: `mongodb-memory-server`, or a dedicated database whose name contains `test`. Before any destructive operation, **assert the database name contains "test" and abort if not.** Never point tests at real data.
- **Never read, print, log, or commit `.env*` files or secret values.** Ask me for the *names* of variables the tests need; use a separate `.env.test` that I fill in.
- No real emails, SMS, or push notifications, and no calls to third-party services. Use a local or public STUN only.
- Every test creates **unique data** (random suffixes) and **cleans up after itself**, so tests are safe to run in parallel and re-run.
- No `git commit`, `git push`, or destructive commands unless I ask. Installing test-only dev dependencies is allowed **after I approve the list in Phase 0**.

### 2.5 Test quality
- **No arbitrary sleeps.** Wait for events, conditions, or network idle. Use controlled clocks (`page.clock` in Playwright, fake timers in Vitest) for timeouts, grace periods, and TTLs.
- A failing test is re-run 3 times. If results differ, label it `FLAKY`, quarantine it, and report it. Do not hide it.
- **Test the tests:** for the 10 highest-risk tests (auth, authorization, read receipts, uploads, signed URLs, call cleanup), prove they can fail by running them against a deliberately broken **copy** of the code in a temp directory. Never edit the real source for this.
- Verify current docs for each tool (Playwright, Vitest, Supertest, socket.io-client, axe) before using it, rather than trusting memory.

---

## 3. Test strategy and tooling

Confirm this in Phase 0. If I object, use my choice.

| Layer | Tool | What it covers |
|---|---|---|
| Backend unit and integration | Vitest or Jest + Supertest + `mongodb-memory-server` | Services, validation, REST endpoints, models, indexes |
| Socket and real-time | `socket.io-client` inside the same runner | Handshake auth, rooms, every socket event, multi-client scenarios, reconnect |
| Frontend unit and component | Vitest + React Testing Library | Forms, message list logic, optimistic send, theme system, composer, emoji picker |
| End-to-end | **Playwright** with multiple isolated browser contexts (one per user) | Full user flows across 2 to 4 simultaneous users |
| Accessibility | `@axe-core/playwright` | Contrast and ARIA across screens, modes, and themes |
| Visual regression | Playwright screenshots | Light/dark × backgrounds × viewports vs. approved baselines and the design board |
| Security | Custom Supertest and socket attack tests, `npm audit`, a secrets scanner (gitleaks or similar), optional OWASP ZAP baseline if Docker is available | Section 6.1 |
| Load and soak | k6 or Artillery (Socket.IO) | Concurrent sockets, message throughput, memory growth |
| Media inspection | `exiftool` or `sharp` metadata, `file-type` | EXIF stripping, magic-byte checks |

**Fixture users** (created by a helper, unique per run): `alice` (primary), `bob`, `carol`, `dave` (an **outsider** who shares no conversation with anyone, used for every authorization test), `erin` (privacy settings all off).

**Harness requirements:**
- `loginAs(user)` sets the session through the API so most E2E tests skip the login UI (the login UI itself is tested separately).
- Playwright **projects**: Chromium, Firefox, WebKit. **Viewports:** 360×760, 390×844, 768×1024, 1024×768, 1440×900.
- **Fake media** for Chromium: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` (and `--use-file-for-fake-audio-capture` for known audio).
- **Network control** through CDP (offline, slow 3G, flapping). **Timezones** via `timezoneId`. **Color scheme** via `colorScheme` / `emulateMedia`. **Notifications** via `grantPermissions` and a stubbed `Notification`.
- Test assets in `tests/assets/`: valid and invalid files from Section 5.8.

---

## 4. Technique checklist (apply to every feature)

Think like a developer **and** an attacker:
- **Happy path**, then **negative paths** (bad input, missing fields, wrong types, wrong state).
- **Boundary values:** min, max, max±1, empty, whitespace-only, very long, Unicode, emoji, RTL text, null bytes.
- **State transitions:** every legal and illegal move (e.g. call: ringing → accepted / declined / timed out / canceled).
- **Authorization:** run every REST route and every socket event as (a) anonymous, (b) the wrong user (`dave`), (c) the right user. Try other people's IDs (IDOR).
- **Concurrency and races:** parallel requests, duplicate sends, two admins acting at once, double clicks.
- **Idempotency and replay:** repeat the same request or event and confirm nothing duplicates.
- **Real-time:** at least two clients, plus a third that must **not** receive the event.
- **Failure and recovery:** disconnect, reconnect, offline, server restart, database down.
- **Both modes and all backgrounds:** verify UI in light and dark where relevant.
- **Error guessing:** the strange things real users do (paste 1 MB of text, mash Send, close the tab mid-upload).

---

## 5. Feature test catalog (minimum required cases)

Expand each bullet into a formal test case with an ID (e.g. `AUTH-001`), steps, expected result, actual result, status, and evidence. The catalog is a **minimum**; add more when you spot gaps.

### 5.1 Register and login
- **Happy:** register → 201, user stored, password stored only as a bcrypt or argon2 hash and **never** present in any response; login by email and by username (case-insensitive); logout invalidates the refresh token; refresh rotates (old token then fails); session survives reload; protected route redirects to login and returns to the original page.
- **Validation:** username 3 to 20 chars of `a-z 0-9 _` (test 2, 3, 20, 21 chars, uppercase, spaces, emoji, homoglyphs); duplicate email and username (case variations); password 7 vs 8 chars, common passwords; missing and extra fields; leading and trailing whitespace; 10,000-char inputs.
- **Injection and mass assignment:** login with `{"email":{"$gt":""},"password":{"$gt":""}}` must be rejected; try to register with `role`, `isAdmin`, `_id`, `passwordHash` in the body and confirm they are ignored.
- **Security:** error messages and timing do not reveal whether an account exists; rate limit and lockout trigger after repeated failures; cookie has `HttpOnly`, `Secure` (in production mode), and `SameSite`; **access token is not in `localStorage`/`sessionStorage`**; expired, tampered, `alg:none`, and wrong-secret JWTs get 401; **refresh-token reuse revokes the whole token family**; password never appears in logs.
- **Multi-tab:** two tabs refreshing at once cause exactly one refresh request (single-flight). Log what happens in tab B when tab A logs out (spec is silent: open question).
- **UI:** show/hide password; inline validation messages; screens match the design board (screens 2 and 3).

### 5.2 User profiles
- Edit display name, bio (160 vs 161 chars), username (uniqueness, including a **race** where two users claim the same name at once); avatar upload (valid, invalid, oversized, EXIF stripped, cropped square); changes visible to others in real time or after reload (log which).
- **Privacy:** hide online status → others see no presence dot or "online"; hide last seen → no "last seen"; **reciprocal rules** (if I hide last seen I can't see others'; if I disable read receipts I can't see others' read ticks, but typing and delivery still work). Test every combination of two users.
- **Search:** partial and case-insensitive; special regex characters (`.*`, `(`, `[`) don't error or cause slow queries; limit and pagination; does not return password hashes or emails if not intended.
- **IDOR:** `dave` cannot edit or read private fields of `alice` by calling endpoints with her ID.

### 5.3 Online status (presence)
- Online on connect; **multiple tabs/devices count as one user**; closing one tab keeps the user online; closing all tabs goes offline after the **~10 s grace** (not before about 9 s, not much after 10 s; use a controlled clock); a page refresh does not flicker offline.
- `lastSeenAt` updates on offline; presence snapshot on connect is accurate.
- **Privacy:** respects `showOnlineStatus` and `showLastSeen`.
- **Isolation:** `dave` (no shared conversation) receives **zero** presence events for alice. Presence is sent once per recipient, not once per shared conversation (count the events).
- **Recovery:** hard-kill a client (no clean disconnect) and confirm the server marks the user offline after the ping timeout; restart the server and confirm clients reconnect and presence is correct.

### 5.4 One-to-one chat
- **Creation:** find-or-create is idempotent; **20 parallel create requests produce exactly one conversation** (`directKey` unique index); chat with self (log observed behavior); with a nonexistent user; with an invalid ObjectId.
- **Send:** ack contains the saved message; 4000 chars accepted, **4001 rejected**; empty and whitespace-only rejected; Unicode, emoji, RTL, 5000 chars with no spaces (layout does not break); **HTML and script payloads render as plain text** (`<img src=x onerror=...>`, `<script>`); links get `rel="noopener noreferrer nofollow"` and `javascript:` links are not clickable.
- **Optimistic UI:** message shows as "sending", reconciles by `clientId`, shows "failed, tap to retry" on failure (force a failure by dropping the socket), retry works and produces **exactly one** message; replaying the same `clientId` yields one message.
- **Ordering:** 100 rapid sends arrive in order, no duplicates, no gaps.
- **Pagination:** cursor pagination returns correct order with no duplicates or gaps even while new messages arrive; scroll position is preserved when older messages prepend; "New messages ↓" pill appears when scrolled up; the list sticks to the bottom when already at the bottom.
- **Reconnect resync:** disconnect the receiver, send 5 messages, reconnect: all 5 arrive **once**, in order.
- **Authorization:** `dave` cannot fetch history, send, or subscribe to the conversation's events (REST and socket); invalid and nonexistent conversation IDs fail cleanly; payload above `maxHttpBufferSize` is rejected without crashing the server.

### 5.5 Message timestamps
- Stored in UTC (verify in the DB); displayed in the viewer's local time. Run key tests in at least `UTC`, `America/New_York`, `Asia/Kolkata` (+5:30), and `Pacific/Auckland`, **including a DST change**.
- Date separators ("Today", "Yesterday", full date) are correct **across local midnight** (use a controlled clock). The conversation list shows time / "Yesterday" / short date correctly. Hover or long-press shows the full date and time.
- A client with a wrong system clock still sees server-ordered messages.

### 5.6 Typing indicator
- A types → B sees "typing…" quickly; it clears on send, on blur, and after ~3 s idle. **Throttle:** while A types for 10 s, no more than about one `typing:start` per 2 s is emitted (count events).
- **Auto-expiry:** kill A's connection without `typing:stop`; B's indicator disappears after ~5 s.
- Groups: one, two, and three or more typers produce the right text ("Ama is typing…", "Ama and Kofi are typing…", "Several people are typing…").
- The conversation-list preview shows "Typing…" in the accent color. Typing in conversation X never shows in conversation Y. Typing events are **never written to the database**. `dave` cannot send or receive typing events for a conversation he is not in.

### 5.7 Read receipts and unread counts
- **States:** sent → delivered (recipient online, chat closed) → read (chat open, tab visible and focused, message scrolled into view). Test each transition explicitly.
- **Not read when it shouldn't be:** tab hidden, window unfocused, message off-screen, conversation not open.
- **Unread counts:** increment per message, clear on read, correct after reload, correct with several unread conversations, correct after reconnect.
- **Pointers are monotonic:** a `message:read` for an older message after a newer one does not move the pointer back. Marking read twice is harmless.
- **Forgery:** a read or delivered event for a message in a conversation the user is not in, or with a made-up ID, is rejected.
- **Privacy:** `sendReadReceipts` off for either side suppresses blue ticks both ways (Section 5.2).
- **Groups:** aggregate tick and "Seen by" list (names and times) are right with 3+ members; removed members disappear from "Seen by".
- **Performance:** marking 500 unread messages read produces a small number of requests (batched), not 500.

### 5.8 Group chat
- **Create:** name required; boundaries on member count (the spec says 2 or more members plus the creator; test 0, 1, 2, and 100); nonexistent and duplicate members; adding self.
- **Roles:** only admins can rename, change avatar, add or remove members, and promote or demote. A non-admin attempting each (REST **and** socket) is rejected.
- **Membership changes:** removed or leaving user **stops receiving live events immediately and gets 403 on history**; last admin leaves → the longest-standing member is promoted; system messages for join, leave, remove, rename, and background change.
- **Concurrency:** two admins edit at once; removing a user while they are typing or uploading.
- Sender names and per-user colors in bubbles; member list with presence; group typing text; "Seen by".
- **Authorization:** `dave` cannot read, join, or enumerate any group.

### 5.9 Emoji picker
- Opens from the composer, loads **lazily** (no picker network request before first open: assert it), search works, **inserts at the cursor position (middle of text, not just the end)**, focus returns to the composer, **Esc** closes, keyboard navigation works, recently used persists.
- Messages of only 1 to 3 emoji render large; 4 emoji or mixed text do not.
- **Hard cases:** ZWJ sequences (👨‍👩‍👧‍👦), skin tones (👍🏽), flags (🇱🇷), variation selectors. They are stored and rendered intact. **Length limit counts correctly near 4000** (UTF-16 vs code points: a message of 2000 family emoji).
- Works in light and dark, as a popover on desktop and a bottom sheet on mobile.

### 5.10 Files, images, and photo sharing
**Upload flow:** upload via `POST /api/uploads` → `uploadId` → `message:send`. Attaching **someone else's** `uploadId` is rejected; re-using an already attached `uploadId` is rejected; orphaned uploads are cleaned up by the TTL; progress bar, cancel, multiple files at once, drag-and-drop, and paste all work; sending offline fails gracefully.

**File matrix (must test every row):**

| Case | Expected |
|---|---|
| JPEG, PNG, WebP, GIF (animated too) under 10 MB | Accepted, thumbnail made, width and height stored |
| Image of exactly 10 MB and 10 MB + 1 byte | Accepted / rejected with a clear message |
| PDF, DOCX, XLSX, PPTX, TXT, CSV, ZIP under 25 MB; 25 MB and 25 MB + 1 byte | Accepted / rejected |
| **SVG** (including one containing `<script>`) | **Rejected** |
| `.exe`, `.js`, `.html`, `.php`, `.sh`, `.bat` | Rejected |
| An executable renamed `photo.jpg` (wrong magic bytes) | **Rejected** (content sniffing, not extension) |
| Double extension `evil.php.jpg`, no extension, uppercase extension | Handled by content, not name |
| Zero-byte file; corrupted image; truncated PNG | Clear error, no crash |
| Decompression bomb (e.g. 30000×30000 px PNG of one color) | Rejected or safely handled, server stays up |
| Filenames: Unicode, 300 chars, `../../etc/passwd`, `a\0b.png`, leading dots, emoji | Sanitized; no path traversal; stored under a random name |
| Photo with GPS EXIF data | **GPS and other EXIF removed** from the stored file (verify with `exiftool`) |

**Serving and access:**
- Files are served through **signed, expiring URLs**: a valid URL works; an **expired** URL gives 403 (use a controlled clock); a **tampered signature** gives 403; `dave` gets 403; a **removed group member's** old URL stops working after expiry (log timing). Check `X-Content-Type-Options: nosniff` and `Content-Disposition`. Uploads are not reachable from any public static path.
- **Lightbox:** open, next/previous across the conversation's photos, close with Esc, download. **Photos and Files tabs** list items, paginate, and open correctly. No layout shift when images load (width and height reserved).

### 5.11 Audio sharing
- **Voice messages** (Chromium with a fake mic; WebKit for the Safari codec path): start, stop, and cancel; recording timer and level meter move; sending works; the recorded MIME type is one `isTypeSupported` allows; **5-minute cap** auto-stops (controlled clock); **permission denied** shows a clear message and the app keeps working; a very short recording (under 1 s) is handled.
- **Audio files:** MP3, M4A, WAV, OGG, WebM under 20 MB accepted; 20 MB + 1 byte and wrong types rejected; corrupted audio shows an error and does not break the chat.
- **Player:** play, pause, seek, speed (1x, 1.5x, 2x), duration shown, **only one audio plays at a time**, playback continues when the tab is in the background, works in light and dark. The **Audio tab** lists everything shared.

### 5.12 Chat backgrounds (Love, Friendship, Battle, Default)
- The **Chat background** sheet shows four tiles; highlighting one **previews live** behind the sheet; **Set background** applies it; closing without confirming **reverts**.
- Applying it updates **both** users (or all group members) in real time, persists after reload, posts a **system message**, and does not affect other conversations.
- **Authorization:** the spec says any participant in direct chats and admins in groups: verify, including a non-admin attempt at the API. An invalid theme value (`"evil"`) is rejected.
- Renders correctly in **light and dark**, with the themed header and frosted bubbles. **axe color-contrast passes for all 8 combinations** (4 backgrounds × 2 modes). `prefers-reduced-motion` disables the ambient animation. Backgrounds do not hurt scroll performance on a 5,000-message conversation.

### 5.13 Notifications
- **Unread badge** and **tab title count** `(3) ChatSphere` update live and clear on read.
- **Toast** (Notification Card) appears for messages in a conversation that is not open. **No notification** for: the open conversation, a muted conversation, the user's own messages, other tabs of the same user for their own sends.
- **Browser Notification API:** permission is requested **only after a user gesture** (assert `Notification.requestPermission` is **not** called on page load); cover granted, denied, and default; shown only when the tab is hidden or unfocused; preview text can be turned off; clicking focuses the tab and opens the right conversation.
- **Sound:** plays only after a first user interaction (autoplay rule); toggle persists.
- **Mute:** 1 hour, 8 hours, until unmuted. Expiry works (controlled clock); setting persists.
- **Missed call** creates a notification and a call-log message.
- **Floods and duplicates:** 100 messages in 5 s do not freeze the UI; with two tabs open for the same user, log whether notifications duplicate. If Web Push was approved, test subscribe, unsubscribe, and delivery with the tab closed.

### 5.14 Video and audio calling (and call history)
**Automated (Chromium with fake media; two contexts):**
- **Happy path:** invite → incoming screen → accept → connected. Prove media flows: `RTCPeerConnection.connectionState === "connected"`, remote `<video>` has `videoWidth > 0`, and `getStats()` shows `bytesReceived` increasing. Audio-only call works the same without video.
- **State machine:** decline; cancel by caller; **30 s ring timeout → missed** (controlled clock); callee offline → missed call, call-log message and notification; end by either side; call duration is recorded.
- **Busy:** a second invite to a user already in a call gets `busy`. **Glare:** both users call each other simultaneously and the result is deterministic and sane. **Multi-device:** accepting on one device stops ringing on the other.
- **Controls:** mute and camera toggles actually change `track.enabled` and the remote side reflects it.
- **Permissions denied:** the app offers audio-only and does not crash.
- **Cleanup (critical):** after end, **all local tracks have `readyState === "ended"`**, the peer connection is closed, no leftover listeners, and a new call works afterward (repeat 10 times and check for leaks).
- **Resilience:** go offline for a few seconds with CDP: "Reconnecting…" appears and ICE restart recovers; a long outage ends the call cleanly and logs it.
- **Signaling security:** `dave` sending `call:signal`, `call:end`, or `call:accept` for alice and bob's `callId` is rejected; forged sender fields are ignored; unknown `callId` is rejected; `GET /api/calls/ice-config` requires auth and returns short-lived credentials; **no static TURN secret appears in the client bundle** (grep the build).
- **Call log and Calls tab:** each outcome (completed, missed, declined) logs correctly with duration; the history list shows direction and status, and call-back works.
- **Not automatable** (go to `MANUAL_CHECKLIST.md`): calls across different networks through TURN, real cameras and microphones, iOS Safari, and echo quality.
- If group video calls were approved: join and leave mid-call, 4 participants, a grid that adapts.

### 5.15 Light and dark mode
- Light, Dark, and System each work. **System follows the OS live** (change `colorScheme` at runtime and confirm the UI updates without reload).
- The choice **persists** after reload and **syncs across tabs**.
- **No flash of the wrong theme:** capture the earliest paint (before React hydrates) in dark mode and confirm the page is never light; also check `document.documentElement` carries the theme before the app bundle runs. `color-scheme` is set so native controls and scrollbars match.
- Every screen and component in both modes: screenshot comparison against baselines, plus axe contrast. **Video and audio call screens stay dark in both modes.** User-uploaded images are never inverted or tinted. The emoji picker follows the mode.

### 5.16 MongoDB and Mongoose data layer
- **Indexes exist exactly as specified** (compare `getIndexes()` to the spec): `Message {conversation, _id}`, the partial unique `{conversation, sender, clientId}`, `Conversation {participants.user, lastMessageAt}`, the unique sparse `directKey`, unique `User.username` and `User.email`, the **TTL indexes** on `RefreshToken` and `Upload`.
- **Query plans:** `explain()` on message pagination and the conversation list shows an index scan, not a collection scan, on a dataset of 100,000 messages.
- **Validation at the schema level:** required fields, enums (`type`, `theme`, `visibility`-like fields), max lengths, invalid ObjectIds.
- **Race conditions at the database level:** concurrent direct-conversation creation, concurrent sends with the same `clientId`, concurrent username claims: exactly one winner each.
- **Failure:** stop the database during use: the server does not crash, returns a clean 503, logs once, and **recovers automatically** when the database returns. Sockets get an error ack, not a hang.
- No unbounded queries (every list has a limit). No sensitive fields (`passwordHash`, token hashes) ever leave the server.

---

## 6. Cross-cutting catalogs

### 6.1 Security
- **Authentication and sessions:** Section 5.1 plus JWT tampering, token expiry mid-socket-session (what happens to the live connection? log it), logout while sockets are open.
- **Authorization (IDOR):** for **every** REST route and **every** socket event, run as anonymous, `dave`, and the owner. Build a table (route/event × role × expected × actual).
- **Injection:** NoSQL operators in every JSON field and query string (`?q[$ne]=x`); XSS payloads in message text, display name, username, bio, group name, file names, and call-log text, checked in the DOM in both the sender's and receiver's browsers; confirm no `dangerouslySetInnerHTML` renders user content.
- **CORS and headers:** only the allowed origin works with credentials; `helmet` headers are present; error responses never include stack traces or database messages.
- **Rate limits:** REST (login, register, uploads) and **per-socket event** limits (flood `message:send` and `typing:start`); the server stays responsive and the limit is communicated clearly.
- **CSRF:** the refresh and logout endpoints cannot be triggered from another origin.
- **Uploads:** every row of Section 5.10, plus attempts to read files by guessing IDs.
- **Socket abuse:** join arbitrary room names (`conv:<other id>`), spoof `userId` in payloads, send malformed and oversized payloads, rapidly connect and disconnect. None may leak data or crash the server.
- **Supply chain and secrets:** `npm audit` for client and server, a secrets scan of the repo and git history, and a grep of the **production build** for secrets, tokens, and TURN credentials.

### 6.2 Accessibility
- Run axe on every screen in light and dark and on each chat background; **zero serious or critical violations** (log the rest).
- **Keyboard-only walkthrough** of: register, login, start a chat, send, attach, record, react to a call, change the background, change the theme. Visible focus everywhere; sheets and dialogs trap focus and return it; Esc closes them; no keyboard traps.
- Screen-reader semantics: labeled icon buttons (call controls, send, attach, mic), `aria-live="polite"` for new messages and toasts, state exposed (muted, recording, online). Meaning is never color-only (ticks and presence also have text or shape).
- `prefers-reduced-motion` honored. Text remains usable at 200% zoom.

### 6.3 Responsive layouts and browsers
- Run the core E2E flows at 360×760, 390×844, 768×1024, 1024×768, and 1440×900. Check the layout against the board: bottom bar on phone, side rail with two columns on tablet, three columns on laptop. No horizontal scrolling, nothing clipped, the composer stays above the on-screen keyboard (emulate it), touch targets at least 44px.
- Chromium, Firefox, and WebKit for the core flows. Note limitations honestly (e.g. WebKit codecs).

### 6.4 Performance and resilience
- **Long history:** a conversation with 10,000+ messages scrolls smoothly (virtualization works: the DOM stays small), loads older pages quickly, and uses stable memory.
- **Load test:** 100, then 500 concurrent sockets sending messages: report latency (p50, p95), error rate, and server CPU and memory. The server must not leak memory over a 30-minute soak.
- **Client leaks:** open and close conversations 200 times and call 10 times, then compare heap size. Listeners and object URLs are released (no duplicated messages after navigation: the React StrictMode listener bug).
- **Network:** slow 3G, offline → online, flapping connection: no duplicate or lost messages, "Reconnecting…" banner appears and disappears correctly.
- **Server restart** while users are chatting: clients reconnect, rejoin rooms, resync missed messages.
- **Bundle:** the emoji picker and lightbox are lazy-loaded; report bundle size and a Lighthouse run for the main screens.

### 6.5 Logging and configuration
- Logs never contain message text, tokens, passwords, or file contents.
- The server **fails fast** with a clear message when a required environment variable is missing (test by removing each required variable in a temp run).
- Production-mode behavior: secure cookies, no debug routes, no verbose errors.

---

## 7. Bug reporting

Add every finding to `docs/testing/BUGS.md` in this format:

```
### BUG-007: <short title>
**Severity:** S1 | S2 | S3 | S4
**Feature:** <e.g. Read receipts>     **Found in test:** <test ID>
**Environment:** <browser, viewport, mode, OS, commit>
**Steps to reproduce:** 1. ... 2. ... 3. ...
**Expected:** ...   **Actual:** ...
**Evidence:** <log, screenshot, trace path, regression test name>
**Suspected cause:** <file:line and why>
**Suggested fix:** ...
**Status:** Open | Awaiting approval | Fixed | Verified
```

**Severity:** **S1** security hole, data loss or exposure, crash, or a core flow completely broken. **S2** a feature does not work as specified. **S3** works but incorrectly in edge cases, or a poor experience. **S4** cosmetic, or a deviation from the design board with no functional effect.

**Other findings** are logged separately: **spec deviations** (app differs from the spec) and **open questions** (spec is silent). Do not guess; ask me.

---

## 8. Phases

Every phase ends with the Phase Report (Section 9) and a **STOP**.

### Phase 0: Reconnaissance and test plan (no tests yet)
- Read this file, `AGENTS.md`, the design board, the repo, `package.json` files, and any existing tests. Run the app locally and confirm it starts. Inspect the code to map features to files, routes, and socket handlers.
- Write `TEST_PLAN.md` and `TRACEABILITY.md`: a matrix of every feature in Section 5 and every cross-cutting item in Section 6 against the test layer and the planned test IDs.
- **Ask me:** (1) approval for the test dependency list; (2) how I want to provide the test database (memory server, or a connection string for a `*_test` database); (3) which optional features were built (Web Push, group video calls, video files, the Section 4.9 items); (4) the exact commands that start the client and server; (5) any known bugs I already want to skip.
- **Done when:** I approve the plan.

### Phase 1: Test infrastructure
- Install the approved tools. Configure the runners, the test database lifecycle (with the "database name contains test" guard), factories for fixture users, helpers (`loginAs`, multi-client socket helper, multi-context Playwright helper, controlled clocks, fake media, network throttling), the `tests/assets/` file set (including malicious and corrupt files), and npm scripts: `test:api`, `test:socket`, `test:web`, `test:e2e`, `test:a11y`, `test:visual`, `test:security`, `test:load`, `test:all`.
- A smoke test per layer that proves the harness works.
- **Done when:** all smoke tests pass on a clean run, twice in a row.

### Phase 2: Backend REST tests
- Authentication, profiles, conversations, messages, uploads, and the ICE-config endpoint: Sections 5.1, 5.2, 5.4 (REST parts), 5.8 (REST parts), 5.10 (upload validation), and the authorization table for REST.
- **Done when:** every REST route has happy, negative, and authorization tests, with results logged.

### Phase 3: Socket and real-time tests
- Handshake auth, server-controlled rooms, every event in the spec's socket table (ack shapes, validation, membership checks, rate limits), message send and dedupe, delivery and read pointers, typing, presence (multi-tab, grace period, privacy), reconnect resync, and the socket authorization table. Always use a third client (`dave`) as the "must not receive" witness.
- **Done when:** every socket event has happy, negative, and unauthorized tests.

### Phase 4: Database integrity and race conditions
- Section 5.16: indexes, query plans on 100,000 messages, schema validation, and the concurrency tests, plus database outage and recovery.
- **Done when:** all index and race tests are logged.

### Phase 5: Frontend unit and component tests
- Forms and validation, theme system (modes, persistence, tab sync), message list logic (grouping, date separators, optimistic send, retry), composer, emoji insertion at the cursor, notification logic, call state machine reducer, and timestamp formatting across time zones.
- **Done when:** the client logic has tests and they pass.

### Phase 6: End-to-end feature flows (multi-user)
- Playwright flows for Sections 5.1 to 5.9 and 5.12 with two to four users in separate contexts: register and login, profile and privacy, 1:1 chat, groups, presence, typing, timestamps, read receipts, emoji, and chat backgrounds. Always include the real-time "other user sees it" check.
- **Done when:** all flows pass on Chromium, and the Firefox and WebKit results are logged.

### Phase 7: Media tests
- Sections 5.10 and 5.11 in full: the file matrix, signed URL expiry and tampering, EXIF stripping, the lightbox, Photos, Files and Audio tabs, voice recording with fake devices, the player, and codec handling on WebKit.
- **Done when:** every row of the file matrix has a result.

### Phase 8: Calling tests
- Section 5.14: all automated call tests with fake media, state machine, cleanup, resilience, signaling security, and the Calls tab. Write the call items that cannot be automated into `MANUAL_CHECKLIST.md`.
- **Done when:** the automated call suite is stable (passes 3 times in a row) and the manual checklist is written.

### Phase 9: Appearance, accessibility, and responsive tests
- Sections 5.15, 6.2, and 6.3: light/dark/system behavior and the no-flash check, visual regression baselines for light and dark × 4 backgrounds × 5 viewports on key screens, axe on every screen, keyboard-only walkthroughs, and comparison against the design board (list every visual difference).
- **Done when:** baselines are created (and shown to me for approval before they become the standard), and every violation is logged.

### Phase 10: Notifications tests
- Section 5.13 in full, including permission-on-gesture, suppression rules, mute expiry, sound unlock, click-through, and floods.
- **Done when:** every rule has a result.

### Phase 11: Security testing
- Section 6.1 in full: the complete authorization table, injection and XSS payload sweeps, upload attacks, socket abuse, rate limits, CSRF, headers, `npm audit`, secrets scan, and build grep.
- **Done when:** the authorization table is complete and all S1 findings are reported **immediately** (do not wait for the end of the phase).

### Phase 12: Performance and resilience
- Section 6.4: long history, load test at 100 and 500 sockets, soak test, client leak checks, network chaos, server restart, bundle and Lighthouse numbers.
- **Done when:** the numbers are in `TEST_RESULTS.md` with the method used.

### Phase 13: Exploratory and chaos session
- Spend a timeboxed session (about 60 steps) trying to break the app by hand and by script: mash buttons, interleave actions across 3 users, paste huge content, switch modes and backgrounds mid-call, rotate the viewport, close tabs mid-upload, change accounts in one browser, and so on. Log every anomaly as a finding.
- **Done when:** the session log is written and findings are filed.

### Phase 14: Final report and regression suite
- Complete `TRACEABILITY.md`: **every feature row has at least one executed test with a recorded result.** Run `test:all` from a clean checkout twice. List the open bugs by severity, the spec deviations, the open questions, every `NOT TESTED` and `BLOCKED` item with its reason, and the flaky tests.
- Write `docs/testing/README.md`: how to run each layer, how to add tests, and how to update visual baselines.
- **Done when:** I approve the report. Then I will decide which bugs to fix, and you apply the approved fixes one at a time (Section 2.3).

---

## 9. Phase Report (post at the end of every phase, then STOP)

```
## Phase N complete: <name>

**Tests written / run:** <counts per layer> (PASS x, FAIL y, FLAKY z, BLOCKED b, NOT TESTED n)
**New findings:** <BUG-IDs with severity and one line each; spec deviations; open questions>
**Coverage vs. matrix:** <features/rows covered this phase, rows still uncovered>
**Evidence:** <where logs, screenshots, traces are>
**Could not test (and why):** ...
**Commands to reproduce:** <exact commands>
**Needs from you:** <decisions, env values, approvals>

Reply "Approved" to proceed to Phase N+1, or tell me what to change.
```

---

## 10. Exit criteria

- [ ] Every feature in Section 1 has executed tests covering happy path, negative cases, authorization, and real-time behavior with a witness client
- [ ] `TRACEABILITY.md` has no empty rows; every gap is explained as `NOT TESTED` or `BLOCKED` with a reason
- [ ] The authorization table (REST routes and socket events × anonymous, `dave`, owner) is complete
- [ ] All S1 and S2 findings are reported with reproduction steps and a failing regression test
- [ ] `npm run test:all` passes from a clean checkout twice in a row, with flaky tests quarantined and listed
- [ ] The 10 highest-risk tests were proven able to fail
- [ ] Light and dark mode, all 4 backgrounds, and the 5 viewports have visual baselines and axe results
- [ ] Load and soak numbers and the manual checklist are written
- [ ] No test touched real data, real secrets, or a non-test database
- [ ] No application source file was changed without my approval

---

## 11. Manual checklist seeds (write the full version in Phase 8 and Phase 14)

Automation cannot honestly cover these. List them in `MANUAL_CHECKLIST.md` for a human to run before launch:
- Video and audio calls between **two real devices on different networks** (confirms TURN works), including mobile data to Wi-Fi.
- Real camera and microphone on Chrome, Safari (macOS and iOS), Firefox, and an Android phone.
- iOS Safari voice recording codec, audio playback with the screen locked, and notifications behavior (installed web app only).
- Browser notification and sound behavior with the OS in Do Not Disturb.
- Echo and audio quality during calls; behavior when plugging in headphones mid-call.
- Real keyboard-overlay behavior of the composer on phones.
- A screen-reader pass (VoiceOver and NVDA) over the main flows.
- A final visual review of every screen against the design board by a person.