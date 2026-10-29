# ChatSphere Bug Log

Findings appear here only after reproduction. Fixes are applied only after explicit approval, one bug at a time (`Testing.md` 2.3).

**Severity:** S1 security/data/crash/core flow broken · S2 feature not as specified · S3 edge-case or poor experience · S4 cosmetic.

---

### BUG-001: Every protected REST route hangs — `requireAuth` factory is registered unwrapped
**Severity:** S1
**Feature:** Authentication / all protected REST routes     **Found in test:** `backend/tests/api/bug-001-auth-hang.test.js` (tagged BUG-001 regression)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest + Supertest against in-memory MongoDB
**Steps to reproduce:**
1. Start the backend with a test database (or any database).
2. Send `GET /api/conversations` with no `Authorization` header (also reproduces with a valid Bearer token).
3. Observe that the request never receives a response; it hangs until the client times out.
**Expected:** `401` with `{ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }` for a missing/invalid token; the handler runs for a valid token.
**Actual:** No response. With the harness's 300 s hook timeout, the API smoke test stalled indefinitely.
**Evidence:** [BUG-001 regression test](../../backend/tests/api/bug-001-auth-hang.test.js); first observed in `npm run test:api` run of 2026-10-25 16:14 UTC (test 3 never completed). Health, register, and login endpoints (unprotected) respond normally.
**Suspected cause:** `backend/src/middleware/auth.js:4` defines `requireAuth` as a factory that *returns* middleware, but every route registers it directly, e.g. `backend/src/routes/conversations.js:9`, `backend/src/routes/auth.js:11`, `backend/src/routes/users.js:7`, `backend/src/routes/upload.js:6`, `backend/src/routes/calls.js:6`. Express calls the factory with `(req, res, next)`; the factory returns the real middleware and never calls `next()`, so the request is abandoned. No route uses `requireAuth()`.
**Suggested fix:** Export a plain middleware that reads `req.app.locals.config` (or change every registration to `requireAuth(config)`), then update the regression test to assert the 401 shape. Confirm with `npm run test:api` and a live `curl -i http://localhost:3001/api/conversations`.
**Status:** Fixed — awaiting your verification (fix approved 2026-10-25). `requireAuth` is now a plain Express middleware; regression tests assert 401 without a token, 401 with a malformed token, and 200 with a valid token. Evidence: [bug-001-fix.log](./evidence/bug-001-fix.log).

---

## Phase 2 findings (reproduced 2026-10-25)

Cycle: write the test, run it, observe the failure, then mark it `it.fails` with the bug ID so the suite stays green while the defect is open. Raw failures before triage: [phase2-triage-raw.log](./evidence/phase2-triage-raw.log). Final Phase 2 API run: 78 passed, 23 expected fail (one expected fail per reproduced defect assertion set).

### BUG-002: `GET /api/conversations/:id/messages` returns 500 for every authenticated request
**Severity:** S1
**Feature:** One-to-one chat history / cursor pagination     **Found in test:** CHAT-003, CHAT-011, CHAT-015 (`backend/tests/api/messages.test.js`)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest + Supertest, in-memory MongoDB
**Steps to reproduce:**
1. Seed a direct conversation between Alice and Bob with 35 messages.
2. Call `GET /api/conversations/<id>/messages` as Alice (participant) or Dave (non-participant), with or without `?before=&limit=`.
3. Observe 500 `INTERNAL_ERROR` every time. Unauthenticated calls correctly return 401.
**Expected:** 200 with the newest page in chronological order (participant), 403 for a non-participant, 404 for an unknown conversation, 400 for a malformed id, and working `before`/`limit` pagination.
**Actual:** 500 for all authenticated calls. Pagination is never applied and there is no membership or existence check.
**Evidence:** [phase2-triage-raw.log](./evidence/phase2-triage-raw.log) — 7 failing message tests; regression tests in `messages.test.js` tagged BUG-002.
**Suspected cause:** `backend/src/routes/conversations.js:77` calls `conv.getMessages(req.params.id, before, Number(limit) || 30)` where `before` and `limit` are undeclared, throwing `ReferenceError` inside the async handler. The handler also never loads the conversation to check membership.
**Suggested fix:** Validate the id, load the conversation, require `req.userId` to be a participant, read `req.query.before`/`req.query.limit`, map a malformed cursor to 400, and return `{ messages }` in ascending order.
**Status:** Fixed — awaiting your verification (approved 2026-10-25). `getMessages` now validates the conversation id, enforces existence (404) and membership (403), validates `before` (400), and applies a default/clamped page size (30, max 100); the route passes `req.userId` and `req.query`. All 7 expected-fail history tests were promoted and now pass (8/8). Evidence: [bug-002-api.log](./evidence/bug-002-api.log), [bug-002-full.log](./evidence/bug-002-full.log).

### BUG-003: File download skips the participant check — any authenticated user with a signed URL can read another chat's upload
**Severity:** S1
**Feature:** Private uploads / signed URLs     **Found in test:** FILE-016 (`backend/tests/api/uploads.test.js`)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest + Supertest
**Steps to reproduce:**
1. Alice uploads `valid.png` and attaches it to a message in the Alice–Bob conversation.
2. Build a valid HMAC signature for `GET /api/uploads/<id>?exp=<future>&sig=<hmac>` using the server's access-token secret (in production this URL would be issued to Alice).
3. Request that URL as Dave, who has no conversation with Alice and is not a participant of the message.
4. Observe 200 with the image bytes.
**Expected:** 403 for any caller who is not a participant of the conversation the upload is attached to.
**Actual:** 200; only the signature is verified.
**Evidence:** Regression test FILE-016 is tagged BUG-003 and fails with `expected 200 to be 403`.
**Suspected cause:** `backend/src/controllers/upload.controller.js:92` — the participant check is explicitly skipped (`// participant check skipped for brevity; require auth`). The route only verifies the HMAC signature and the bearer token.
**Suggested fix:** Resolve `Upload.attachedTo` → `Message.conversation` → participant, and deny with 403 unless the caller is a participant (define owner access for unattached uploads). Cover removed members in Phase 11.
**Status:** Fixed — awaiting your verification (approved 2026-10-25). `serveFile` now resolves the message that references the upload and requires the caller to be a participant of its conversation (403 otherwise); unattached uploads are owner-only. Added participant-download and owner-preview tests alongside the promoted BUG-003 test (upload suite 16 passed + 2 expected fail). Evidence: [bug-003-api.log](./evidence/bug-003-api.log), [bug-003-full.log](./evidence/bug-003-full.log).

### BUG-004: Changing a chat theme returns 500 — `convService` is not defined
**Severity:** S2
**Feature:** Chat background themes (REST part)     **Found in test:** THEME-003, THEME-005 (`backend/tests/api/conversations.test.js`)
**Steps to reproduce:**
1. Create a direct conversation between Alice and Bob.
2. As Alice, `PATCH /api/conversations/<id>` with `{ "theme": "love" }`.
3. Observe 500 `INTERNAL_ERROR`.
**Expected:** 200, the theme persisted, and a system message posted to the conversation.
**Actual:** 500. The theme is saved before the crash (non-atomic partial write); no system message is created.
**Evidence:** Regression test THEME-003/005 is tagged BUG-004.
**Suspected cause:** `backend/src/routes/conversations.js:68` calls `convService.createMessage(...)`, but the service is imported as `conv` (`conversations.js:3`), so the handler throws `ReferenceError: convService is not defined`.
**Suggested fix:** Use `conv.createMessage`, validate the theme value first, and save + system message in one service operation.
**Status:** Open — waiting for approval.

### BUG-005: A non-admin group member can rename the group
**Severity:** S2
**Feature:** Group administration / authorization     **Found in test:** GRP-004 (`backend/tests/api/conversations.test.js`)
**Steps to reproduce:**
1. Alice creates a group with Bob and Dave (Alice is admin, Bob is a member).
2. As Bob, `PATCH /api/conversations/<id>` with `{ "name": "Taken Over" }`.
3. Observe 200 and the name changed.
**Expected:** 403 for non-admin members on group edits (rename/avatar/theme); direct chats remain editable by either participant.
**Actual:** 200; any member can rename the group.
**Evidence:** Regression test GRP-004 is tagged BUG-005.
**Suspected cause:** `backend/src/routes/conversations.js:60-61` checks only that the caller is a participant. No role/admin check is applied for group conversations.
**Suggested fix:** In the service layer, require `role === 'admin'` when `conversation.type === 'group'`; keep participant-level access for direct chats. Cover avatar/theme with the same check.
**Status:** Open — waiting for approval.

### BUG-006: TXT (and CSV) uploads are always rejected as an unknown type
**Severity:** S2
**Feature:** File messages — allowed document types     **Found in test:** FILE-006 (`backend/tests/api/uploads.test.js`)
**Steps to reproduce:**
1. Upload `tests/assets/valid.txt` (UTF-8 text, no BOM) to `POST /api/uploads`.
2. Observe 400 `BAD_REQUEST` with message `Unknown type`.
**Expected:** 201 with `mimeType: text/plain` (TXT and CSV are explicitly allowed, max 25 MB).
**Actual:** 400. `file-type` cannot detect plain text/csv without a BOM, so the magic-byte stage rejects both allowed types before the size checks.
**Evidence:** Regression test FILE-006 TXT is tagged BUG-006.
**Suspected cause:** `backend/src/controllers/upload.controller.js:43-49` requires `fileTypeFromBuffer` to return a MIME; `text/plain` and `text/csv` are in `ALLOWED_FILES` but are not detectable by magic bytes.
**Suggested fix:** Add a narrow text fallback: if detection is empty, require the declared category to be text, validate that the buffer is well-formed UTF-8 with no NUL/control bytes, then accept only `text/plain`/`text/csv`. Never trust the extension alone.
**Status:** Open — waiting for approval.

### BUG-007: Malformed ObjectIds produce 500 instead of 4xx across several routes
**Severity:** S3
**Feature:** Input validation     **Found in test:** PROF-010 (user lookup), PATCH conversation id, group create with invalid member ids
**Steps to reproduce:**
1. `GET /api/users/not-an-object-id` as an authenticated user.
2. `PATCH /api/conversations/not-an-object-id`.
3. `POST /api/conversations/group` with `memberIds: ["not-an-id", <valid id>]`.
4. Observe 500 `INTERNAL_ERROR` for each.
**Expected:** 400 validation error (or 404) with a stable error shape.
**Actual:** 500; Mongoose `CastError` reaches the central handler unmapped.
**Evidence:** Three regression tests tagged BUG-007.
**Suspected cause:** `backend/src/routes/users.js:18`, `backend/src/routes/conversations.js:58`, and `backend/src/services/conversation.service.js:55` pass raw ids to Mongoose without `mongoose.isValidObjectId`; `backend/src/middleware/error-handler.js` does not map `CastError`.
**Suggested fix:** Validate ids at the route boundary (middleware or zod) and map `CastError` to 400 as a safety net.
**Status:** Open — waiting for approval.

### BUG-008: Mongoose `ValidationError` is returned as 500 instead of 400
**Severity:** S3
**Feature:** Profile validation / conversation theme validation     **Found in test:** PROF-001 (bio 161 chars), THEME-006 (theme `neon`)
**Steps to reproduce:**
1. `PATCH /api/users/me` with `bio: "x" repeated 161 times`.
2. `PATCH /api/conversations/<id>` with `theme: "neon"`.
3. Observe 500 `INTERNAL_ERROR` for both.
**Expected:** 400 `VALIDATION_ERROR` (the schema correctly rejects the values, but the HTTP mapping is wrong).
**Actual:** 500; the error handler only special-cases `ZodError`.
**Evidence:** Regression tests tagged BUG-008.
**Suspected cause:** `backend/src/middleware/error-handler.js:22-26` maps only `ZodError`; Mongoose `ValidationError` falls through to the generic 500 branch.
**Suggested fix:** Map `error.name === 'ValidationError'` to 400 `VALIDATION_ERROR` with field details, and add route-level zod schemas for profile/theme updates.
**Status:** Open — waiting for approval.

### BUG-009: User search treats input as a regular expression — enumeration and 500 on invalid patterns
**Severity:** S3
**Feature:** User search     **Found in test:** PROF-008 (`backend/tests/api/users.test.js`)
**Steps to reproduce:**
1. `GET /api/users/search?q=.*` as any authenticated user.
2. Observe 20 users returned (the pattern matches every username).
3. `GET /api/users/search?q=(`.
4. Observe 500 `INTERNAL_ERROR`.
**Expected:** metacharacters are matched literally (`.*` finds no username), and invalid patterns cannot crash the endpoint.
**Actual:** injection works; unbalanced regex crashes the request.
**Evidence:** Two regression tests tagged BUG-009.
**Suspected cause:** `backend/src/routes/users.js:11` passes the raw query to `$regex` without escaping (`{ $regex: q, $options: 'i' }`).
**Suggested fix:** Escape user input before `$regex` or use a text index; bound the query length.
**Status:** Open — waiting for approval.

### BUG-010: Group creation accepts duplicate member ids and creates duplicate participants
**Severity:** S3
**Feature:** Group chat     **Found in test:** GRP-001
**Steps to reproduce:**
1. As Alice, `POST /api/conversations/group` with `{ name: "Duplicates", memberIds: [bobId, bobId] }`.
2. Observe 201 and three participant entries, two of them Bob.
**Expected:** duplicates are removed (or rejected with 400); each user appears once.
**Actual:** duplicate participant entries are persisted, which would break member counts and per-user read pointers.
**Evidence:** Regression test GRP-001 duplicates is tagged BUG-010.
**Suspected cause:** `backend/src/services/conversation.service.js:53-58` maps `[creatorId, ...memberIds]` without deduplication or creator exclusion.
**Suggested fix:** dedupe with a `Set`, reject/exclude the creator, and validate all ids.
**Status:** Open — waiting for approval.

### BUG-011: Membership operations on an unknown conversation return 500 instead of 404
**Severity:** S3
**Feature:** Group administration     **Found in test:** GRP-003/012 (`backend/tests/api/conversations.test.js`)
**Steps to reproduce:**
1. `POST /api/conversations/<random-object-id>/members` with a valid body as an authenticated user.
2. Observe 500 `INTERNAL_ERROR`.
**Expected:** 404 `NOT_FOUND`.
**Actual:** 500; the service throws `Error('not found')` without a status, and the central handler defaults to 500. The same pattern exists in remove-member and leave.
**Evidence:** Regression test for add-members is tagged BUG-011.
**Suspected cause:** `backend/src/services/conversation.service.js:72`, `:87`, `:98` throw bare errors without `status`/`code`.
**Suggested fix:** Attach 404/`NOT_FOUND` in the service (or a shared `NotFoundError`) and let the error handler map it.
**Status:** Open — waiting for approval.

### BUG-012: An upload above 25 MB returns 500 instead of a clean 4xx
**Severity:** S3
**Feature:** Upload limits     **Found in test:** FILE-006 (`backend/tests/api/uploads.test.js`)
**Steps to reproduce:**
1. `POST /api/uploads` with a 25 MB + 1 byte file field named `file`.
2. Observe 500 `INTERNAL_ERROR` with logged code `LIMIT_FILE_SIZE`.
**Expected:** 413 (or 400) with a clear "file too large" message.
**Actual:** 500; Multer aborts before the controller and the error is not mapped.
**Evidence:** Regression test tagged BUG-012; raw log shows `{"event":"request_failed","status":500,"code":"LIMIT_FILE_SIZE"}`.
**Suspected cause:** `backend/src/app.js` / `backend/src/middleware/error-handler.js` have no `MulterError` handling; `backend/src/controllers/upload.controller.js:34` sets the 25 MB multer limit.
**Suggested fix:** Add Multer error handling (route-level or in the central handler): `LIMIT_FILE_SIZE` → 413 with `FILE_TOO_LARGE`; other limits → 400.
**Fix (2026-10-26, incidental):** the multer callback wrapper added for BUG-054 maps `LIMIT_FILE_SIZE` to 413 `FILE_TOO_LARGE` and other parse errors to 400 `INVALID_UPLOAD`. The regression test now asserts 413 `FILE_TOO_LARGE`. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).
**Status:** Fixed — approved and verified 2026-10-26.

### BUG-013: Profile update accepts an invalid username (1 character, no charset validation)
**Severity:** S3
**Feature:** Profiles — username rules     **Found in test:** PROF-002
**Steps to reproduce:**
1. `PATCH /api/users/me` with `{ "username": "x" }`.
2. Observe 200; the username is persisted as `x`.
**Expected:** 400 validation error; usernames must be 3–20 characters matching `a-z 0-9 _` (and unique).
**Actual:** 200; only uniqueness is checked. The model has no `minlength` or `match`.
**Evidence:** Regression test PROF-002 invalid username is tagged BUG-013. Phase 13 UI confirmation (EXPL-021): the profile form accepted `a` (PATCH 200, message "Saved") and persisted it until the harness restored it ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** `backend/src/routes/users.js:24-39` destructures and saves `username` without validation; `backend/src/models/User.js:14` only sets `lowercase`/`trim`.
**Suggested fix:** Add a zod schema for `PATCH /users/me` (username `^[a-z0-9_]{3,20}$`, displayName 1–50, bio ≤160, privacy booleans) plus the same pattern in the model. This also resolves BUG-008's 500 for profile input.
**Status:** Open — waiting for approval.

### BUG-014: A non-member can call "leave" on a group and receives the conversation data
**Severity:** S3
**Feature:** Group membership authorization     **Found in test:** GRP-012 (`backend/tests/api/conversations.test.js`)
**Steps to reproduce:**
1. Alice creates a group with Bob and Dave.
2. As Frank (not a participant), `POST /api/conversations/<id>/leave`.
3. Observe 200 with the full conversation document.
**Expected:** 403 (or 404) for a non-member; no conversation data returned.
**Actual:** 200 with the conversation, because `leaveGroup` returns early when the caller is not a participant.
**Evidence:** Regression test tagged BUG-014 (expected fail).
**Suspected cause:** `backend/src/services/conversation.service.js:99-100` returns the conversation unchanged when `idx === -1`, and the route responds 200.
**Suggested fix:** Distinguish "not a participant" (403/404) from a successful leave in the service; never return group data to non-members.
**Status:** Open — waiting for approval.

---

## Phase 3 findings (reproduced 2026-10-25)

Cycle: write the socket test, run it, observe the failure, then mark it `it.fails` with the bug ID so the suite stays green while the defect is open. Raw failures before triage: [phase3-socket-raw2.log](./evidence/phase3-socket-raw2.log). Final Phase 3 socket run: 64 tests — 38 passed + 26 expected fail, every expected fail mapped to BUG-015…BUG-026 ([phase3-socket-run1.log](./evidence/phase3-socket-run1.log)).

### BUG-015: Socket rooms are fixed at connect — removed members keep receiving and new members receive nothing
**Severity:** S1
**Feature:** Group membership / real-time authorization     **Found in test:** GRP-005, GRP-015 (`backend/tests/socket/groups.test.js`)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest + `socket.io-client` against an in-memory MongoDB
**Steps to reproduce:**
1. Alice creates a group with Bob and Carol; Alice, Bob, Carol, and Dave all connect sockets.
2. As Alice, `DELETE /api/conversations/<id>/members/<bobId>`.
3. Alice sends a message; Carol receives `message:new` and Bob **also still receives it**.
4. As Alice, `POST /api/conversations/<id>/members` with Dave; Alice sends a message; Dave receives nothing until he reconnects.
**Expected:** a removed member loses live events immediately; a newly added member starts receiving them without reconnecting.
**Actual:** removed Bob still receives `message:new`; added Dave receives no `message:new` (2 s timeout).
**Evidence:** Expected-fail tests tagged BUG-015. Raw log shows `expected true to be false` (removed member received) and `expected null not to be null` (added member did not). Bob can no longer send or type, so the REST membership check is working; only room membership is stale.
**Suspected cause:** `backend/src/sockets/index.js:32-33` joins `conv:{id}` rooms once at connection and never updates them; the REST membership routes in `backend/src/routes/conversations.js` never notify Socket.IO. Sockets also keep a second connection to the old room until reconnect.
**Suggested fix:** centralize room updates in the conversation service or call a `syncRoomMembership(conversationId)` helper from add/remove/leave: make each affected user's live sockets join or leave `conv:{id}`, then broadcast `conversation:updated`/`conversation:removed`.

**Status:** Open — waiting for approval.

### BUG-016: `conversation:active` and the `conversation:created/updated/removed` lifecycle events are unimplemented
**Severity:** S2
**Feature:** Socket event contract / group and conversation lifecycle     **Found in test:** SOCK-ACTIVE (`events.test.js`), GRP-014 (`groups.test.js`)
**Steps to reproduce:**
1. Connect Alice and Bob; emit `conversation:active` with a valid conversation id and an ack callback → no ack after 800 ms.
2. Create/rename a group or leave a group over REST while a member's socket is connected → no `conversation:created`, `conversation:updated`, or `conversation:removed` event arrives (1.5 s window).
**Expected:** per the spec's socket table, `conversation:active` is accepted and acknowledged, and members are told about created/updated/removed conversations in real time.
**Actual:** `conversation:active` ack is `null`; no lifecycle events are emitted by any REST route.
**Evidence:** Four expected-fail tests tagged BUG-016; raw log shows `expected null not to be null` for the active ack and the event waits.
**Suspected cause:** `backend/src/sockets/index.js:53-95` registers only `message:*` and `typing:*`; there is no `conversation:active` handler, and `backend/src/routes/conversations.js` never calls `io`.
**Suggested fix:** add a validated, acked `conversation:active` handler; emit lifecycle events from the conversation service/controller after create, group edit, member add/remove, and leave; keep the active-conversation marker per socket for notification suppression (Phase 13).

**Status:** Open — waiting for approval.

### BUG-017: All `call:*` socket signaling is missing
**Severity:** S2
**Feature:** Video calling — signaling     **Found in test:** CALL-001…CALL-010, CALL-016 (`backend/tests/socket/events.test.js`, `backend/tests/socket/calls.test.js`)
**Steps to reproduce:**
1. Connect Alice and Bob.
2. Alice emits `call:invite` with a `callId`, valid `conversationId`, and `mode: 'video'` → no ack after 1.2 s and Bob receives no `call:incoming`.
3. Emit `call:accept`, `call:decline`, `call:cancel`, `call:end`, and `call:signal` → no acks after 600 ms each.
**Expected:** invite reaches the callee, and every call event is acknowledged; the complete call state machine (incoming/accepted/declined/busy/ended/signal) is available.
**Actual:** every ack is `null`; no call events exist.
**Evidence:** 17 expected-fail tests: the two original ack probes in `backend/tests/socket/events.test.js` plus 15 in `backend/tests/socket/calls.test.js` (invite/incoming with a dave witness, audio-only, decline, cancel, 30 s timeout→missed, offline missed log, end + duration, busy, glare, multi-device ring stop, dave-forged accept/end/signal, unknown call id, forged sender fields, non-member invite, malformed payloads). The Phase 8 E2E spec adds six expected-fail client tests (BUG-062). See [phase8-calls-socket-run1.log](./evidence/phase8-calls-socket-run1.log) and [phase8-calls-e2e-run1.log](./evidence/phase8-calls-e2e-run1.log). This blocks all WebRTC work (Phase 14); only `GET /api/calls/ice-config` exists.
**Suspected cause:** no `call:*` handlers in `backend/src/sockets/index.js`; the client never emits call events.
**Suggested fix:** implement the `call:*` handlers with zod validation, membership checks, busy/timeout state, and the server-to-client events from the spec table; use the same access-token-authenticated socket. Generate call-log messages through the shared message service once BUG-063 is fixed.

**Status:** Open — expanded Phase 8 coverage; waiting for approval.

### BUG-018: Presence ignores contacts and privacy — global fan-out, over-broad snapshot, `lastSeenAt` leaked
**Severity:** S2
**Feature:** Online status / last seen     **Found in test:** PRES-005, PRES-006, PRES-007 (`backend/tests/socket/presence.test.js`)
**Steps to reproduce:**
1. Alice and Bob share a direct chat; Dave shares no conversation with Bob. Dave connects → Bob receives Dave's `presence:update { online: true }`.
2. Connect Alice → her `presence:snapshot` lists every user in the database, not just her contacts.
3. Set Gina's `privacy.showOnlineStatus` and `privacy.showLastSeen` to `false`. Connect/disconnect Gina while Bob, who shares a chat with her, is connected. Bob still receives online/offline updates **including `lastSeenAt`**, and the snapshot still reports her online/last-seen values.
**Expected:** presence is emitted only to users who share a conversation, once per recipient, and `showOnlineStatus`/`showLastSeen` (with the reciprocal rule) are enforced.
**Actual:** presence is broadcast globally, the snapshot includes all users, and privacy flags are ignored. The hidden-user snapshot entry still shows `online: true` and a `lastSeenAt`.
**Evidence:** Three expected-fail tests tagged BUG-018. The privacy test waits for the 10 s grace, so its raw duration is ~10.5 s.
**Suspected cause:** `backend/src/sockets/index.js:40-46` queries `User.find({})` and maps every other user; `:50` uses `socket.broadcast.emit` and `:106` uses `io.emit`; neither checks privacy. No shared-conversation lookup exists on the socket path.
**Suggested fix:** compute the user's contacts once per connection (participants of their conversations), emit presence per contact via the `user:{id}` rooms only, filter/withhold `online` and `lastSeenAt` according to each user's privacy settings, and apply the reciprocal last-seen rule in both snapshot and updates.

**Status:** Open — waiting for approval.

### BUG-019: Socket `message:send` accepts empty, whitespace-only, and over-4000-character text
**Severity:** S2
**Feature:** One-to-one chat — message validation     **Found in test:** CHAT-004 (`backend/tests/socket/messages.test.js`)
**Steps to reproduce:**
1. Emit `message:send` with `{ type: 'text', text: '' }` → ack `ok: true`; a persisted empty message is created.
2. Repeat with `'   \n\t  '` → ack `ok: true`.
3. Repeat with 4001 characters → ack `ok: true` and the message is stored; 4000 characters is also accepted (boundary).
**Expected:** empty and whitespace-only text are rejected, 4000 is the maximum accepted length, and 4001 is rejected.
**Actual:** the only value check that fires is the `Message` model's type enum; text has no trim/min/max check, so empty strings and 4001 characters are persisted.
**Evidence:** Three expected-fail tests tagged BUG-019; the 4000-character boundary test passes and is stored intact. Phase 13 (EXPL-010): a 100,000-character paste typed into the real composer was accepted and stored in ~3 s with the socket still connected ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** `backend/src/sockets/index.js:56-63` passes `text: text || ''` to `convService.createMessage` with no schema; `backend/src/models/Message.js` has no `minlength`/`maxlength` for text.
**Suggested fix:** add a zod `message:send` schema (conversationId ObjectId, clientId required, type enum, trimmed text 1–4000 for text messages, uploadIds bounds) plus model-level `maxlength: 4000`, and reject before persistence.

**Status:** Open — waiting for approval.

### BUG-020: Sending a message with a valid attachment always fails — `attachedTo: 'pending'` cast error
**Severity:** S2
**Feature:** File and image messages     **Found in test:** FILE-001 (`backend/tests/socket/messages.test.js`)
**Steps to reproduce:**
1. Create an `Upload` owned by Alice with `attachedTo: null`.
2. Alice emits `message:send` with `type: 'image'` and that `uploadIds` value.
3. Observe ack `{ ok: false, error: "Cast to ObjectId failed for value \"pending\" (type string) at path \"attachedTo\" for model \"Upload\"" }`; no message is stored and the upload stays unattached.
**Expected:** the message is persisted with the attachment, broadcast to the other member, and the upload's `attachedTo` is set to the new message id.
**Actual:** every valid attachment send is rejected. (Foreign/already-attached/unknown uploads are rejected too, but for the same cast reason, not the intended ownership check.)
**Evidence:** Expected-fail test FILE-001 tagged BUG-020; raw log line shows the ack error above. `FILE-002`/`FILE-003` tests pass only because the cast aborts before `Message.create`; each asserts no message was created. Phase 7 re-check (2026-10-25): `backend/tests/socket/attachments.test.js` repeats all three cases — the explicit ownership/one-time-attach guard is still absent, so FILE-002/FILE-003 must be re-verified after the fix rather than trusted.
**Suspected cause:** `backend/src/services/conversation.service.js:57` runs `Upload.updateMany(..., { attachedTo: 'pending' })`; `attachedTo` is an ObjectId ref, so Mongoose casts the string `'pending'` and throws before `Message.create`.
**Suggested fix:** create the message first (or reserve with `null`), then `Upload.updateMany({ _id: { $in: ids }, owner: sender, attachedTo: null }, { attachedTo: message._id })`; verify the modified count equals the requested count and roll back on mismatch (transaction or delete the message).

**Fix (2026-10-26):** `createMessage()` now pre-generates the message `_id`, atomically claims uploads with `{ owner: sender, attachedTo: null }`, compares `modifiedCount`, releases the claim if `Message.create` fails, and throws 400 `INVALID_ATTACHMENT` for foreign, already-attached, unknown, or malformed ids. `attachments.test.js` 5/5 and `messages.test.js` BUG-020/FILE-002/FILE-003 pass; the claim is verified to be released when message creation fails. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-021: Socket error acks return raw Mongoose/database messages
**Severity:** S3
**Feature:** Socket error contract / information disclosure     **Found in test:** SEC-010 (`backend/tests/socket/messages.test.js`)
**Steps to reproduce:**
1. Emit `message:send` with an image referencing another user's upload.
2. Observe the ack: `{ ok: false, error: "Cast to ObjectId failed for value \"pending\" (type string) at path \"attachedTo\" for model \"Upload\"" }`.
**Expected:** a stable, documented error shape/code with no model names, paths, or database internals.
**Actual:** the raw `e.message` is sent to the client; the same pattern exposes `bad id` and `forbidden` as unstructured strings, and a `ValidationError` can surface from `conv.save()` on receipt events.
**Evidence:** Expected-fail test tagged BUG-021; raw log shows the CastError text in the ack.
**Suspected cause:** `backend/src/sockets/index.js:67` `ack?.({ ok: false, error: e.message })`.
**Suggested fix:** map errors to `{ ok: false, error: { code, message } }` with stable codes (`VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`), log the raw error server-side without payload content, and never send stack/model text.

**Fix (2026-10-26, partial):** the reported reproduction no longer leaks database text: the attachment guard throws `Invalid attachment`, and the ack is now `{ ok: false, error: 'Invalid attachment' }`. The SEC-010 regression test is promoted and asserts the stable string. The broader structured `{ code, message }` contract across every socket error path is still open (no failing test yet).

**Status:** Partially fixed — reported disclosure path verified 2026-10-26; structured error-code contract remains open.

### BUG-022: No per-socket rate limiting — 50 rapid `message:send` events are all accepted
**Severity:** S2
**Feature:** Socket abuse resistance     **Found in test:** SEC-010 (`backend/tests/socket/messages.test.js`)
**Steps to reproduce:**
1. Connect Alice to the conversation socket and fire 50 `message:send` events in parallel.
2. Observe 50 `{ ok: true }` acks within 3 s; zero are rejected as rate-limited.
**Expected:** a burst above the per-socket message budget is rejected with a rate-limit error ack, and normal sending still works.
**Actual:** no throttling exists; the server persists and broadcasts every event as fast as it can.
**Evidence:** Expected-fail test tagged BUG-022; raw log shows `expected 0 to be greater than 0` (no rejected acks). A separate 100-sequential-send test passes, showing the server handles load but never pushes back.
**Suspected cause:** no rate limiter on socket events in `backend/src/sockets/index.js`.
**Suggested fix:** add a per-socket, per-event token bucket (messages, typing, receipts separately), ack `{ ok: false, error: { code: 'RATE_LIMITED' } }`, and log the throttle without message content.

**Status:** Open — waiting for approval.

### BUG-023: Receipt handlers accept forged, non-monotonic, and cross-conversation updates and ignore read-receipt privacy
**Severity:** S2
**Feature:** Read receipts     **Found in test:** REC-006, REC-008, REC-009 (`backend/tests/socket/receipts.test.js`)
**Steps to reproduce:**
1. With Alice and Bob in one chat and Alice and Dave in another, Dave emits `message:read` for the Alice–Bob chat with Bob's message id. Alice receives a `message:status` with `userId: dave` (Bob's pointer is untouched, but a forged status is broadcast to the room).
2. Bob reads the newest message (m3), then emits `message:read`/`message:delivered` for an older message (m1) → the stored pointer moves backwards to m1 and a status is broadcast.
3. Bob emits `message:read` with a message id from another conversation → the pointer is overwritten with that foreign id.
4. Set Bob's `privacy.sendReadReceipts` to `false`, then have him read a message → Alice still receives his `message:status`.
**Expected:** a non-member's receipt is rejected with no broadcast; pointers only move forward; a message id must belong to the named conversation; a user with read receipts off (and the reciprocal counterpart) sees/sends no receipt status.
**Actual:** all four update/broadcast paths execute. Receipt events are not acknowledged either (BUG-024).
**Evidence:** Five expected-fail tests tagged BUG-023; raw logs show `expected '…62' to be '…64'` for both pointers and `expected true to be false` for the forged membership and privacy broadcasts.
**Suspected cause:** `backend/src/sockets/index.js:82-95` finds the conversation by id, finds a participant by user id, writes the supplied `messageId` with no validation, monotonic comparison, message/conversation check, or privacy check, then broadcasts to the whole room regardless of whether the caller was a participant.
**Suggested fix:** validate both ids; require membership and that the message belongs to the conversation; compare against the existing pointer (ordered by message id/createdAt) and only advance; consult `sendReadReceipts` on the reader and the reciprocal rule on the viewer; ack the event; broadcast only to participants.

**Status:** Open — waiting for approval.

### BUG-024: `typing:start`/`typing:stop` and receipt events are never acknowledged
**Severity:** S3
**Feature:** Socket acknowledgement contract     **Found in test:** ACK (`backend/tests/socket/typing.test.js`, `backend/tests/socket/receipts.test.js`)
**Steps to reproduce:**
1. Emit `typing:start`, `typing:stop`, `message:delivered`, or `message:read` with a callback.
2. Observe no callback within 600–800 ms; the ack resolves as `null`.
**Expected:** every client event is acknowledged with `{ ok: true, data }` or `{ ok: false, error }` as required by the socket contract.
**Actual:** none of these four events has an ack path.
**Evidence:** Two expected-fail tests tagged BUG-024. The underlying events do work (typing broadcasts and receipt pointers update; those happy-path tests pass).
**Suspected cause:** `backend/src/sockets/index.js:71-95` declares handlers without an ack parameter and never calls one; the error/early-return paths are silent too.
**Suggested fix:** accept an ack in every handler and call it on success and failure; keep the existing broadcast semantics.

**Status:** Open — waiting for approval.

### BUG-025: Malformed socket payloads cause unhandled promise rejections (server crash risk)
**Severity:** S1
**Feature:** Socket robustness / availability     **Found in test:** SEC-010 (`backend/tests/socket/malformed.test.js`, child-process probe `tests/harness/socket-unhandled-probe.mjs`)
**Steps to reproduce:**
1. Start a server and connect Alice/Bob.
2. Emit `typing:start` with `conversationId: 'not-an-object-id'`.
3. Emit `message:delivered` and `message:read` with `messageId: 'not-an-object-id'`.
4. Observe `unhandledRejection` events (captured by the probe): three in total — `Cast to ObjectId failed … model "Conversation"`, `Conversation validation failed: participants.1.lastDeliveredMessage…`, and `…lastReadMessage…`.
**Expected:** malformed payloads are validated and rejected cleanly (error ack), with no unhandled rejections.
**Actual:** three unhandled rejections. Under Node's default `--unhandled-rejections=throw`, this terminates the process, so any authenticated user can crash the real-time service.
**Evidence:** Probe output is embedded in the raw log: `{"unhandledRejections":["Cast to ObjectId failed for value \"not-an-object-id\" …","Conversation validation failed: participants.1.lastDeliveredMessage …","Conversation validation failed: participants.1.lastReadMessage …"]}`. `malformed.test.js` runs the probe in an isolated child process so Vitest's own rejection handler does not mask or fail on it; the test is tagged BUG-025.
**Suspected cause:** `backend/src/sockets/index.js:71-95` has no try/catch or zod validation; `Conversation.findById('not-an-object-id')` rejects, and the `conv.save()` path rejects with a `ValidationError`; both promise chains are unhandled. `message:send` is protected by its try/catch but not by payload validation.
**Suggested fix:** validate every socket payload with zod before use, wrap every async handler in try/catch (or an `asyncHandler` wrapper) that acknowledges errors, and add a process-level rejection logger plus a graceful shutdown policy. Verify with the probe after the fix.

**Status:** Open — waiting for approval.

### BUG-026: A replayed `clientId` is deduped in the database but rebroadcast as a duplicate `message:new`
**Severity:** S3
**Feature:** Idempotent message send     **Found in test:** CHAT-008 (`backend/tests/socket/messages.test.js`)
**Steps to reproduce:**
1. Alice sends a message with `clientId: X`; Bob receives `message:new`.
2. Alice re-emits the identical payload (same `clientId` X).
3. Observe ack `ok: true` with the same message, but Bob receives a second `message:new` for it.
**Expected:** a replay creates exactly one stored message and produces no second broadcast.
**Actual:** storage dedupes correctly but the broadcast is unconditional.
**Evidence:** Expected-fail test tagged BUG-026; the storage half passes (`countDocuments === 1`).
**Suspected cause:** `backend/src/sockets/index.js:60-65` computes `existing` but emits `message:new` outside the `if (existing) … else …` branch.
**Suggested fix:** emit only when a new message was created; on replay, return the existing message in the ack without broadcasting.

**Status:** Open — waiting for approval.

---

## Phase 4 findings (reproduced 2026-10-25)

Cycle: write the database test, run it, observe the failure, then mark it `it.fails` with the bug ID so the suite stays green while the defect is open. Full Phase 4 database run: 35 tests — 30 passed + 5 expected fail ([phase4-db-raw.log](./evidence/phase4-db-raw.log)). Index definitions and schema behavior: [phase4-indexes-schema-probe.log](./evidence/phase4-indexes-schema-probe.log).

### BUG-027: Five indexes beyond the specification are created (mostly redundant single-field indexes)
**Severity:** S3
**Feature:** Database indexes     **Found in test:** DB-001 (`backend/tests/db/indexes.test.js`)
**Environment:** Node 22.23.1, Windows 10, commit `57302b2`, Vitest + `mongodb-memory-server`
**Steps to reproduce:**
1. Start a test database and run `Model.createIndexes()` for `User`, `Conversation`, `Message`, `RefreshToken`, and `Upload`.
2. Compare `collection.indexes()` with the index list in `Testing.md` 5.16 and `AGENTS.md` 6.1.
3. Observe five extra indexes: `messages.conversation_1`, `conversations.lastMessageAt_1`, `refresh_tokens.user_1`, `refresh_tokens.familyId_1`, `uploads.owner_1`.
**Expected:** the index set matches the specification exactly (plus the mandatory `_id_`): only the pagination, dedupe, conversation-list, `directKey`, `username`/`email`, and TTL indexes.
**Actual:** five extra indexes are created. `messages.conversation_1` is a prefix of the compound `{conversation: 1, _id: -1}` index and adds write cost without serving the pagination query.
**Evidence:** Expected-fail test DB-001; full `getIndexes()` output in [phase4-indexes-schema-probe.log](./evidence/phase4-indexes-schema-probe.log).
**Suspected cause:** `index: true` declarations on `Message.conversation`, `Conversation.lastMessageAt`, `RefreshToken.user`, `RefreshToken.familyId`, and `Upload.owner`.
**Suggested fix:** remove the redundant single-field declarations (or document the measured need for each); keep the compound and TTL indexes the spec requires.

**Status:** Open — waiting for approval.

### BUG-028: The Upload TTL deletes attached uploads after 24 hours
**Severity:** S2 (latent S1: it becomes data loss for every attachment once BUG-020 is fixed)
**Feature:** Uploads / media persistence     **Found in test:** DB-010 (`backend/tests/db/indexes.test.js`)
**Environment:** Node 22.23.1, Windows 10, commit `57302b2`, Vitest + `mongodb-memory-server`
**Steps to reproduce:**
1. Inspect the `uploads` indexes: `createdAt_1` has `expireAfterSeconds: 86400` and no `partialFilterExpression`.
2. Create an upload and attach it to a message (`attachedTo` set).
3. After 24 hours the TTL monitor deletes the document because its `createdAt` is old — there is no `attachedTo` condition.
**Expected:** only orphaned uploads (`attachedTo: null`) expire after 24 hours; uploads referenced by a message survive indefinitely (`AGENTS.md` 6.1: "TTL cleanup of orphan uploads after 24h").
**Actual:** the TTL applies to every upload, so an attachment older than 24 hours loses its `Upload` document; message attachments store only the upload id, so the file can no longer be authorized or served.
**Evidence:** Expected-fail test DB-010 asserting an orphan-only partial filter; current index definition in [phase4-indexes-schema-probe.log](./evidence/phase4-indexes-schema-probe.log). End-to-end expiry was not awaited in the suite because MongoDB's TTL monitor runs every ~60 s; the unfiltered index semantics are the evidence. Attachment sending currently fails for another reason (BUG-020), so the data loss is latent today. Phase 7 re-check (2026-10-25): `backend/tests/db/media-ttl.test.js` backdates an attached upload past 24 h with the native driver and confirms it matches the TTL monitor's scan predicate (`{ createdAt: { $lt: cutoff } }`) while attached — expected-fail FILE-023 tagged BUG-028 in [phase7-backend.log](./evidence/phase7-backend.log).
**Suspected cause:** `backend/src/models/Upload.js:28` declares `uploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 })` without restricting the index to orphans.
**Suggested fix:** add `partialFilterExpression: { attachedTo: null }` to the TTL index (verify it is supported by the deployed MongoDB), or replace TTL with a scheduled cleanup that queries `{ attachedTo: null, createdAt: { $lt: now - 24h } }`. Verify that attached uploads survive while orphans are removed.

**Status:** Open — waiting for approval.

### BUG-029: A database outage returns a raw 500 instead of a clean 503
**Severity:** S2
**Feature:** Error handling / resilience     **Found in test:** DB-007 (`backend/tests/db/outage.test.js`)
**Environment:** Node 22.23.1, Windows 10, commit `57302b2`, Vitest + Supertest, TCP proxy in front of `mongodb-memory-server`
**Steps to reproduce:**
1. Start the API, sign in, and confirm `GET /api/conversations` returns 200.
2. Cut the TCP proxy between the server and MongoDB; wait until `mongoose.connection.readyState` is 0.
3. `GET /api/conversations` with a valid access token.
**Expected:** `503` with a stable code such as `SERVICE_UNAVAILABLE` and no driver internals (`Testing.md` 5.16: "returns a clean 503").
**Actual:** `500` with `{"error":{"code":"INTERNAL_ERROR","message":"read ECONNRESET"}}`. The server does not crash, `/api/health` reports 503, the failure is logged once, socket `message:send` receives an error ack, and the API/socket recover automatically after the database returns — those clauses pass.
**Evidence:** [phase4-outage-response.log](./evidence/phase4-outage-response.log) (exact response body) and [phase4-db-raw.log](./evidence/phase4-db-raw.log) (logged `status:500, code:INTERNAL_ERROR`).
**Suspected cause:** `backend/src/middleware/error-handler.js` only special-cases `ZodError` and errors with a `status`; `MongoServerSelectionError`/`MongoNetworkError` have neither, so they fall through to status 500 and their `message` is sent to the client.
**Suggested fix:** map driver connectivity errors (`MongoNetworkError`, `MongoServerSelectionError`, timeout errors) to `503 SERVICE_UNAVAILABLE` with a generic message, log the failure once, and keep the driver text server-side. Add a regression test that cuts the proxy.

**Status:** Open — waiting for approval.

### BUG-030: `GET /api/conversations` is unbounded and unpaginated
**Severity:** S2
**Feature:** Conversation list     **Found in test:** DB-008 (`backend/tests/db/query-limits.test.js`)
**Environment:** Node 22.23.1, Windows 10, commit `57302b2`, Vitest + Supertest
**Steps to reproduce:**
1. Create 121 conversations for one user (120 groups + 1 direct).
2. `GET /api/conversations` with that user's token.
3. Observe `conversations.length === 121` and a response body with a single key, `conversations` — no limit, cursor, or `hasMore`.
**Expected:** every list query is bounded (`Testing.md` 5.16). A page of at most 100 (consistent with the message-history cap) plus pagination metadata for the rest.
**Actual:** every conversation the user belongs to is loaded and serialized in one response. Message history and user search are correctly bounded (30/100 and 20), so this is the outlier.
**Evidence:** [phase4-conversation-limit-probe.log](./evidence/phase4-conversation-limit-probe.log); expected-fail test DB-008.
**Suspected cause:** `backend/src/services/conversation.service.js:49-51` runs `Conversation.find({ 'participants.user': userId }).sort(...).lean()` with no `.limit()`; `backend/src/routes/conversations.js:10-15` returns the whole array.
**Suggested fix:** add cursor pagination on `{ lastMessageAt, _id }` with a documented page cap and `nextCursor`, and return only the fields the list needs. Keep the socket room-join query separate if it needs every conversation id.

**Status:** Open — waiting for approval.

---

## Phase 5 findings (reproduced 2026-10-25)

Cycle: write the test, run it, observe the failure, then mark it `it.fails` with the bug ID so the suite stays green while the defect is open. Raw failures before triage: [phase5-web-raw1.log](./evidence/phase5-web-raw1.log). Final Phase 5 frontend run: 59 tests — 48 passed + 11 expected fail, every expected fail mapped to BUG-031…BUG-038 ([phase5-web-final.log](./evidence/phase5-web-final.log)).

### BUG-031: The conversation list crashes for every non-empty chat list — `Avatar` is not imported
**Severity:** S1
**Feature:** Conversation list / app shell     **Found in test:** CHAT-020 (`frontend/src/features/chats/chat-list.test.jsx`)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest 5 + jsdom + React Testing Library
**Steps to reproduce:**
1. Sign in and let `GET /api/conversations` return at least one conversation.
2. Render the `Chats` screen (the `/chats` route).
3. Observe React throw `ReferenceError: Avatar is not defined` while rendering the first row; the whole screen unmounts into the error boundary/blank page. An empty conversation list renders fine because the map never runs.
**Expected:** a row per conversation with avatar, name, and last-message preview.
**Actual:** the entire Chats tree crashes as soon as one conversation exists, so one-to-one and group chat cannot be used at all.
**Evidence:** [phase5-web-raw1.log](./evidence/phase5-web-raw1.log) shows the unhandled `ReferenceError` and the failing row test; [phase5-web-final.log](./evidence/phase5-web-final.log) records the expected-fail regression.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:114` renders `<Avatar …>` but the component is never imported (`Chats.jsx:1-6` imports only Button/Input/Toast).
**Suggested fix:** `import Avatar from '../../components/ui/Avatar.jsx'`, then promote the expected-fail test and re-run the web suite.

**Status:** Fixed — **approved and verified 2026-10-25**. Added the missing `import Avatar from '../../components/ui/Avatar.jsx'` in `Chats.jsx`; promoted CHAT-020 from `it.fails` to a normal regression (removed the test-only error boundary) and deleted the temporary `globalThis.Avatar` stub from `chats.test.jsx`. Frontend suite at the time: 59 tests, 49 passed + 10 expected fail; post-fix full `test:all`: 271 tests, 215 passed + 56 expected fail, green twice. Evidence: [bug-031-web.log](./evidence/bug-031-web.log), [bug-031-full-run1.log](./evidence/bug-031-full-run1.log), [bug-031-full-run2.log](./evidence/bug-031-full-run2.log), [bug-031-lint.log](./evidence/bug-031-lint.log), [bug-031-build.log](./evidence/bug-031-build.log).

### BUG-032: The saved theme is lost on reload, and the no-flash script writes raw JSON into `data-theme`
**Severity:** S2
**Feature:** Light/dark mode persistence and no-flash bootstrap     **Found in test:** MODE-003, MODE-004 (`frontend/src/store/theme.reload.test.js`)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest 5 + jsdom
**Steps to reproduce:**
1. Choose Dark, then reload. `localStorage["chatsphere-theme"]` contains `{"state":{"preference":"dark"},"version":0}`.
2. On reload, read the store: `preference` is `dark` but `resolved` is `light` (the initial system value), and initialization applies `light`; the app renders light until the user toggles again.
3. Execute the inline script in `index.html` with the same storage: `data-theme` becomes the raw JSON string (or the literal `system`), not `dark`.
**Expected:** the persisted preference is applied before first paint with no flash, and `resolved` is derived from it (`MODE-002…004`).
**Actual:** a flash of the system theme on every reload after choosing a non-system theme; the no-flash script sets an invalid `data-theme` value.
**Evidence:** Two expected-fail tests tagged BUG-032 in [phase5-web-final.log](./evidence/phase5-web-final.log); the pre-tag failure is in [phase5-web-raw1.log](./evidence/phase5-web-raw1.log).
**Suspected cause:** `frontend/src/store/theme.js:33` persists only `preference`, and nothing recomputes `resolved` after zustand rehydrates; the module-level init at `theme.js:38-40` applies the initial `resolveTheme('system')` value. `frontend/index.html:11-17` treats the whole stored JSON blob as a preference string instead of parsing `state.preference`.
**Suggested fix:** apply the theme in `onRehydrateStorage` (or a `merge` that recomputes `resolved`) before React mounts; parse the stored JSON in the inline script with a safe fallback; keep the explicit choice when it is `light`/`dark`/`system` and set `color-scheme` alongside `data-theme`.

**Status:** Fixed — **approved and verified 2026-10-25**. The persist `merge` now recomputes `resolved` from the stored `preference` before the module-level init applies it, and the inline script parses the zustand JSON (raw-value fallback), accepts only `light`/`dark`/`system`, and sets `data-theme` before the bundle runs; `color-scheme` was already driven by `[data-theme]` in `index.css`. Both expected-fail tests were promoted and pass (MODE-003, MODE-004). Frontend suite at the time: 59 tests, 51 passed + 8 expected fail; full `test:all`: 271 tests, 217 passed + 54 expected fail, green twice. Evidence: [bug-032-web.log](./evidence/bug-032-web.log), [bug-032-full-run1.log](./evidence/bug-032-full-run1.log), [bug-032-full-run2.log](./evidence/bug-032-full-run2.log), [bug-032-lint.log](./evidence/bug-032-lint.log), [bug-032-build.log](./evidence/bug-032-build.log).

### BUG-033: Message bubbles have no timestamps, date separators, grouping, sender names, or delivery/read ticks
**Severity:** S2
**Feature:** Message list presentation / timestamps     **Found in test:** TS-002, TS-003 (`frontend/src/features/chats/chats.test.jsx`)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest 5 + jsdom
**Steps to reproduce:**
1. Seed a conversation with messages from two different days (the test uses today and yesterday).
2. Open the conversation.
3. Observe each bubble contains only the message text: no `HH:mm` time, no "Today"/"Yesterday" separator, no 5-minute grouping, no per-user sender name/color in groups, and no sent/delivered/read ticks.
**Expected:** every bubble shows its local time (full date/time on hover), date separators split the list, messages from the same sender within 5 minutes are grouped, and outgoing bubbles show delivery/read state (`TS-002`, `TS-003`, `CHAT-019`, `REC-001`/`REC-012`).
**Actual:** a bare sequence of text-only divs. Timestamps and separators are absent (both assertions fail); grouping, sender labels, and ticks have no markup at all, so they cannot be asserted separately and are folded into this defect.
**Evidence:** Two expected-fail tests tagged BUG-033 in [phase5-web-final.log](./evidence/phase5-web-final.log).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:127-132` maps messages to one `<div>` per message containing only `{m.text}`; no date helper, grouping, or status component exists.
**Suggested fix:** render through a message-row component: format dates with `date-fns` in the user's zone, insert separators, group consecutive messages by sender within 5 minutes, render sender labels for groups, and derive ticks from the conversation's delivered/read pointers. Add tests for grouping and ticks when the markup exists.

**Status:** Fixed — **approved and verified 2026-10-25**. Extracted the message area into `frontend/src/features/chats/MessageList.jsx`: every bubble renders a `<time>` with a locale-aware `HH:mm` and a full date/time `title`; Today/Yesterday/full-date separators use `Intl.DateTimeFormat` via the new `frontend/src/lib/dates.js` (chosen over `date-fns`, which is not installed); consecutive messages from the same sender within 5 minutes on the same local day are grouped (reduced inner radius, `data-grouped`); group chats show a per-user sender label colored from new `--sender-1…4` tokens; outgoing bubbles derive sent/delivered/read ticks from the conversation's `lastDeliveredMessage`/`lastReadMessage` pointers with labeled `Check`/`CheckCheck` icons. TS-002 and TS-003 were promoted, and three tests were added (5-minute grouping, group sender labels/colors, tick states). Frontend suite at the time: 62 tests, 56 passed + 6 expected fail; full `test:all`: 274 tests, 222 passed + 52 expected fail, green twice; build passes with the pre-existing dynamic-import warning. Evidence: [bug-033-web.log](./evidence/bug-033-web.log), [bug-033-full-run1.log](./evidence/bug-033-full-run1.log), [bug-033-full-run2.log](./evidence/bug-033-full-run2.log), [bug-033-lint.log](./evidence/bug-033-lint.log), [bug-033-build.log](./evidence/bug-033-build.log).

### BUG-034: Optimistic sends are never reconciled, deduped, failed, or retried
**Severity:** S2
**Feature:** Sending messages / optimistic UI     **Found in test:** CHAT-009 (`frontend/src/features/chats/chats.test.jsx`, two tests)
**Environment:** Node 24.18.0, Windows 10, commit `57302b2`, Vitest 5 + jsdom
**Steps to reproduce:**
1. Open a chat, type `hello world`, press Enter. The bubble appears immediately with a `clientId`.
2. Deliver the server copy (`message:new` with the same `clientId` and server `_id`); observe two identical bubbles because the optimistic entry is never replaced.
3. Repeat with the socket disconnected: the message is appended, `emit` is skipped silently, and it stays in a "normal" state forever — no "failed" text and no retry control.
**Expected:** the server copy replaces the optimistic entry by `clientId` (exactly one bubble), and a send that cannot be acknowledged is marked failed with a retry affordance (`CHAT-009`).
**Actual:** duplicates on every successful send, and no failure state/retry when offline. The ack callback passed to `message:send` is empty.
**Evidence:** Two expected-fail tests tagged BUG-034 in [phase5-web-final.log](./evidence/phase5-web-final.log). Phase 13 (EXPL-042) confirms it end to end: with the context offline the bubble was appended (count 1); after reconnecting, `GET /conversations/:id/messages` still contained **0** copies — no failed state, no retry, no resend ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:72-84` appends `{_id: clientId, pending: true}` and ignores the ack; `Chats.jsx:22-39` appends every `message:new` without comparing `clientId`; the `ws.connected` check at `:79` drops the send without a failure branch.
**Suggested fix:** keep pending messages in a `clientId` map, replace on ack or echo, mark failed when offline/ack error/timeout, and render a retry action that re-emits with the same `clientId`.

**Status:** Open — waiting for approval.

### BUG-035: Emoji-only messages render at normal text size
**Severity:** S3
**Feature:** Emoji picker / message rendering     **Found in test:** EMO-003 (`frontend/src/features/chats/chats.test.jsx`)
**Steps to reproduce:**
1. Send a message containing only one to three emoji (e.g. `😀`).
2. Observe the bubble uses the same `text-[15px]` size as body text.
**Expected:** messages made of only 1–3 emoji render large (`EMO-003`; the test accepts `text-2xl`/`3xl`/`4xl`).
**Actual:** normal body size; no jumbo treatment.
**Evidence:** Expected-fail test tagged BUG-035 in [phase5-web-final.log](./evidence/phase5-web-final.log). Phase 13 (EXPL-012) measured computed sizes in the live app: `😀😀😀` → **15 px**, `😀😀😀😀` → **15 px** (both body size) ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:129` hard-codes `text-[15px]` for every bubble.
**Suggested fix:** detect emoji-only content (1–3 graphemes, no other characters) and apply a large-size class to the bubble/body.

**Status:** Open — waiting for approval.

### BUG-036: URLs in messages are not rendered as safe links
**Severity:** S3
**Feature:** Message text / link safety     **Found in test:** CHAT-007 (`frontend/src/features/chats/chats.test.jsx`)
**Steps to reproduce:**
1. Receive or load a message containing `see https://example.test/page now`.
2. Observe no `<a>` element; the URL is inert text.
**Expected:** links are auto-detected and rendered with `rel="noopener noreferrer nofollow"` (and a safe target), while all other text stays plain (`CHAT-007`).
**Actual:** no linkification at all. (The XSS half of this area passes: HTML such as `<img onerror=…>` is rendered as text and never executed.)
**Evidence:** Expected-fail test tagged BUG-036 in [phase5-web-final.log](./evidence/phase5-web-final.log).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:130` renders `{m.text}` directly with no link tokenizer.
**Suggested fix:** split plain text into text/URL tokens with a conservative URL regex, render URL tokens as anchors with `rel="noopener noreferrer nofollow"`, and never use `dangerouslySetInnerHTML`.

**Status:** Open — waiting for approval.

### BUG-037: A message from the current user in another tab increments unread and shows a toast
**Severity:** S2
**Feature:** Notifications / multi-tab behavior     **Found in test:** NOTIF-003 (`frontend/src/features/chats/chats.test.jsx`)
**Steps to reproduce:**
1. Sign in as the same user in two tabs; both sockets are connected to the same conversation room.
2. Send `sent from my phone` from tab B; the server emits `message:new` to the whole `conv:{id}` room, including the sender's sockets.
3. In tab A, where another conversation is open, observe unread `c2 = 1`, the tab title `(1) ChatSphere`, and a "New message" toast for your own message.
**Expected:** own messages never trigger notifications, unread counts, sounds, or desktop notifications, regardless of which tab sent them (`NOTIF-003`).
**Actual:** your own message is treated as incoming in every other tab of the same user (and would be in the sending tab too if the chat were closed).
**Evidence:** Expected-fail test tagged BUG-037 in [phase5-web-final.log](./evidence/phase5-web-final.log).
**Suspected cause:** `backend/src/sockets/index.js:65` broadcasts to the full room (correct for multi-device sync), but the client handler at `frontend/src/features/chats/Chats.jsx:25-34` never compares the message sender with the signed-in user before incrementing unread/notifying.
**Suggested fix:** keep the room-wide echo for syncing other tabs/devices, but in the client store compare `m.message.sender` (id or object) with the auth user and skip unread/toast/title/sound/desktop; still append/dedupe the message when its conversation is open.

**Status:** Open — waiting for approval.

### BUG-038: The unread count is not restored to the tab title on reload
**Severity:** S3
**Feature:** Unread badges / tab title     **Found in test:** NOTIF-001 (`frontend/src/store/notifications.test.js`)
**Steps to reproduce:**
1. Accumulate two unread messages (`unread: { c1: 2 }`, `totalUnread: 2`); the title shows `(2) ChatSphere`.
2. Reload the app; zustand rehydrates the persisted unread counts.
3. Observe the title is the default `ChatSphere` until the next notification event recomputes it, even though the conversation row badge shows 2.
**Expected:** the persisted total is reflected in the tab title as soon as the store hydrates (`NOTIF-001`).
**Actual:** the title is only written inside `setUnread`, so hydration bypasses it.
**Evidence:** Expected-fail test tagged BUG-038 in [phase5-web-final.log](./evidence/phase5-web-final.log).
**Suspected cause:** `frontend/src/store/notifications.js:11-16` sets `document.title` only in the action; there is no post-hydration or subscription hook (the unused `get` in the factory confirms the omission).
**Suggested fix:** apply the title from `onRehydrateStorage` and keep it in sync through a store subscription (or an app-shell effect) so any unread change, including hydration and clearing, updates the title; restore the plain app name on logout.

**Status:** Open — waiting for approval.

---

## Phase 6 findings (reproduced 2026-10-25)

Cycle: write the flow, run it against the real app, reproduce the failure, then tag the test with the matching BUG ID (`test.fail(...)`) so the suite is green while the defect is open. Raw pre-triage failures: [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) (40 tests: 17 passed + 23 failed). Two of those 23 were test defects and were corrected before the final run: the timestamp test asserted the full-date `title` on the `<time>` element while the app puts it on the message row, and the group test matched "Group created" in both the list preview and the bubble (Playwright strict mode). The remaining 21 map to BUG-034…BUG-036 and BUG-039…BUG-052; the avatar-upload flow maps to existing deviation SD-003. Final Chromium run: [phase6-e2e-chromium-final.log](./evidence/phase6-e2e-chromium-final.log) — 40 tests, exit 0 (19 unconditional passes + 21 expected failures; Playwright reports expected failures as passes in the summary while still showing `x` per test). WebKit triage: the raw run had 37 passed + 3 failed; all three were test-side — Playwright WebKit's cookie API reports `sameSite: "None"` for every cookie (even one added as Lax), and two multi-context group tests exceeded the 60 s budget (the BUG-048 test also spent time in expected-fail teardown). The test now checks the refresh `Set-Cookie` header on WebKit and the WebKit project timeout is 120 s; the final WebKit run passed 40/40 (19 normal + 21 expected fail, exit 0) in [phase6-e2e-webkit-final.log](./evidence/phase6-e2e-webkit-final.log). Post-Phase 6 full `test:all` is green twice (311 tests: 238 passed + 73 expected fail, exit 0).

E2E harness note: the app hard-codes 20 auth requests per 15 minutes per IP, which a 40-test multi-user suite cannot fit behind one loopback address. [backend/tests/harness/e2e-server.js](../../backend/tests/harness/e2e-server.js) therefore replaces exactly three REST limiter layers (global `/api`, login, register) with pass-through handlers and throws unless exactly three are found. This affects the E2E harness only; rate limiting remains covered by the backend API/socket suites.

### BUG-039: A full page reload signs the user out
**Severity:** S1
**Feature:** Authentication / session restore     **Found in test:** `tests/e2e/auth-flows.spec.js` — "restores the signed-in session after a full page reload"
**Environment:** Node 24.18.0, Windows 10, Playwright 1.64.1 (Chromium), live Vite + Express + in-memory MongoDB harness
**Steps to reproduce:**
1. Register a user and sign in through the UI; confirm the chat screen is shown.
2. Reload the page (F5).
3. Observe the app redirect to `/login`.
**Expected:** the app silently refreshes the access token with the HttpOnly refresh cookie and stays on the same route (`Testing.md` 5.1: "session survives reload").
**Actual:** the access token lives only in memory, nothing calls `/api/auth/refresh` on boot, and the protected route redirects to `/login` (`Received string: "http://127.0.0.1:5175/login"`).
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 3; expected-fail test tagged BUG-039 in the final log. Phase 13 (EXPL-049) reproduced it at the end of a 50-step session: a plain reload landed on the login form ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** `frontend/src/store/auth.js:3-8` is a plain memory store, `frontend/src/App.jsx:20-24` only reacts to an existing token, and `frontend/src/app/ProtectedRoute.jsx:5-6` redirects as soon as `accessToken` is null. The refresh endpoint exists and rotates tokens.
**Suggested fix:** bootstrap auth on mount — call `/auth/refresh` once (single-flight across tabs), `setAuth` on success, and render a boot shell while unresolved; redirect only after a confirmed 401. Keeps the route for BUG-041's return path.

**Status:** Open — waiting for approval.

### BUG-040: There is no app shell — no navigation, Settings screen, theme toggle, or logout
**Severity:** S2
**Feature:** App shell / navigation     **Found in test:** `tests/e2e/auth-flows.spec.js` — "exposes navigation, profile access, a theme control, and logout"
**Steps to reproduce:**
1. Sign in.
2. Look for Chats/Profile/Settings navigation, a light/dark toggle, and a logout control.
3. Observe all four counts are zero.
**Expected:** the 72 px rail from `AGENTS.md` 4.2 with nav, theme toggle, current-user avatar/presence, and logout.
**Actual:** the app renders only the conversation list and chat pane (`Received: chatsLink: 0, profileLink: 0, settingsLink: 0, logout: 0`). `/profile` is reachable only by typing the URL; there is no Settings screen and no UI path to log out.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 4; expected-fail test tagged BUG-040 in the final log.
**Suspected cause:** `frontend/src/App.jsx:29-37` registers bare routes with no shared shell; `frontend/src/features/chats/Chats.jsx:108-130` is a two-column list+chat layout with no rail. The auth store has `clear()`, but no component calls `POST /auth/logout`.
**Suggested fix:** add the rail (Chats, Profile, Settings, theme toggle, avatar with presence, logout) as a layout route around protected screens; wire logout to `POST /auth/logout` plus `clear()` and socket teardown.

**Status:** Open — waiting for approval.

### BUG-041: After login the user always lands on `/`, losing the requested route
**Severity:** S2
**Feature:** Authentication / protected-route redirect     **Found in test:** `tests/e2e/auth-flows.spec.js` — "returns to the requested protected route after login"
**Steps to reproduce:**
1. Signed out, open `/profile`.
2. Observe the redirect to `/login` (correct).
3. Sign in with valid credentials.
4. Observe the URL is `/`, not `/profile`.
**Expected:** return to the route the user originally requested (`Testing.md` 5.1).
**Actual:** `Received string: "http://127.0.0.1:5175/"`.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 5; expected-fail test tagged BUG-041 in the final log.
**Suspected cause:** `frontend/src/app/ProtectedRoute.jsx:6` discards the current location when redirecting, and `frontend/src/features/auth/Login.jsx:27` hard-codes `navigate('/')`.
**Suggested fix:** pass `state={{ from: location }}` on the redirect and navigate to `from.pathname` after login, falling back to `/` only when absent or loop-prone.

**Status:** Open — waiting for approval.

### BUG-042: The profile form has no privacy controls
**Severity:** S2
**Feature:** User profiles / privacy settings     **Found in test:** `tests/e2e/profile-flows.spec.js` — "offers privacy controls for online status, last seen, and read receipts"
**Steps to reproduce:**
1. Sign in and open `/profile`.
2. Look for controls labeled show online status, show last seen, and read receipts.
3. Observe none exist (`Received: showOnlineStatus: 0, showLastSeen: 0, sendReadReceipts: 0`).
**Expected:** three toggles persisted through `PATCH /api/users/me` (`Testing.md` 5.2, including the reciprocal rules).
**Actual:** only display name, username, and bio are editable.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 21; expected-fail test tagged BUG-042 in the final log.
**Suspected cause:** `frontend/src/features/profile/Profile.jsx:28-40` renders three inputs and never touches `user.privacy`, although the backend accepts a `privacy` object (`backend/src/routes/users.js`).
**Suggested fix:** add three labeled toggles bound to `form.privacy`, include them in the PATCH body, and surface the reciprocal behavior in the UI copy.

**Status:** Open — waiting for approval.

### BUG-043: Another user's profile cannot be opened from a chat, and no other-user profile screen exists
**Severity:** S2
**Feature:** User profiles / chat header     **Found in test:** `tests/e2e/profile-flows.spec.js` — "opens another user profile from a direct chat"
**Steps to reproduce:**
1. Sign in as Alice with a direct conversation with Bob.
2. Open the conversation and inspect the header for a profile link or info control.
3. Observe zero links and zero profile buttons (`headerUserLink: 0, headerProfileButton: 0`). Only `/profile` (self) is routed.
**Expected:** view the other participant's name, avatar, bio, and shared media from the chat (`Testing.md` 5.2).
**Actual:** no entry point and no screen; `GET /api/users/:id` exists but is unused by the client.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 23; expected-fail test tagged BUG-043 in the final log.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:128-130` renders a static header; the only profile route is `/profile` for the signed-in user in `frontend/src/App.jsx:34`.
**Suggested fix:** make the header identity open a user profile route (`/users/:id`) that loads `GET /api/users/:id`; include shared media once the media endpoint exists (SD-003).

**Status:** Open — waiting for approval.

### BUG-044: Direct conversations show "Direct chat"/"Chat" and the conversation row has no time
**Severity:** S2
**Feature:** Conversation list / chat header     **Found in test:** `tests/e2e/chat-flows.spec.js` — "shows direct-chat identity and last-message time in the list and header"
**Steps to reproduce:**
1. Create a direct conversation between Alice and Bob and send a message.
2. Sign in as Alice and look at the row for Bob.
3. Observe the row title is "Direct chat" (not Bob), the header is "Chat", and no time is shown in the row; hover gives nothing.
**Expected:** the other participant's name/avatar in the row and header, and the last-message time for today, "Yesterday", or a short date (`Testing.md` 5.4/5.5).
**Actual:** `listHasName: false, listHasTime: false, headerHasName: false` (list preview is rendered). Direct conversations have no `name`; the client falls back to generic labels and the row markup has no time element.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 11; expected-fail test tagged BUG-044 in the final log. (Part of the raw failure was a test timing flaw — reading the list before it loaded; the test now waits for the preview. The observed assertions above come from the loaded list.)
**Suspected cause:** `backend/src/services/conversation.service.js:26-28` returns conversations without populating participants, and `frontend/src/features/chats/Chats.jsx:118-122` falls back to `c.name || 'Direct chat'` / `c.lastMessage?.text`; the header at `Chats.jsx:129` uses `active.name || 'Chat'`; neither includes a time.
**Suggested fix:** populate the other participant (or resolve via participants) for direct conversations, render their display name/avatar in the row and header, and show `formatListTime(lastMessageAt)` in the row with the full date on hover.

**Status:** Open — waiting for approval.

### BUG-045: The client ignores presence — no online dots and no "last seen" text
**Severity:** S2
**Feature:** Online status     **Found in test:** `tests/e2e/chat-flows.spec.js` — "shows online status for a contact who shares a conversation"
**Steps to reproduce:**
1. Sign in as Alice and Bob in separate contexts with a direct conversation.
2. Open the conversation as Alice while Bob is connected.
3. Observe the header text is just "Chat" (`Received string: "Chat"`); no status line or presence dot is rendered anywhere.
**Expected:** "online" or "last seen …" in the header and a green dot on avatars (`Testing.md` 5.3), respecting privacy.
**Actual:** the socket layer dispatches `presence` CustomEvents (`frontend/src/lib/socket.js:23-24`) but no component listens; avatars never receive a presence prop.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 9; expected-fail test tagged BUG-045 in the final log. Backend presence itself has open defects (BUG-018: global fan-out, over-broad snapshot, privacy ignored).
**Suspected cause:** no presence store/selector and no UI consumption; `Chats.jsx:128-130` renders a static header.
**Suggested fix:** consume `presence:snapshot`/`presence:update`, store per-user presence, render dots and header status, honor `showOnlineStatus`/`showLastSeen`; fix BUG-018 server-side at the same time.

**Status:** Open — waiting for approval.

### BUG-046: Typing indicators are neither emitted nor displayed
**Severity:** S2
**Feature:** Typing indicator     **Found in test:** `tests/e2e/chat-flows.spec.js` — "shows typing to the other user while composing"; `tests/e2e/group-flows.spec.js` — "shows group typing text with the sender name"
**Steps to reproduce:**
1. Sign in as Alice and Bob with a direct conversation, both with the chat open.
2. Type into Alice's composer without sending.
3. Observe Bob's header stays "Chat" (direct test) or the group name (group test). Alice's client never emits `typing:start`.
**Expected:** the other user sees "typing…", groups see "Ama is typing…"/"Ama and Kofi are typing…"/"Several people are typing…", the list preview shows it, and it auto-expires (`Testing.md` 5.6).
**Actual:** no typing events are sent, and the dispatched `typing:update` event has no consumer (`frontend/src/lib/socket.js:26`).
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failures 8 and 20; both expected-fail tests tagged BUG-046 in the final log.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:137-147` handles input only to set text; `Chats.jsx:128-130` has a static header; no typing store exists.
**Suggested fix:** emit throttled `typing:start` (≈2 s) and `typing:stop` on send/blur/idle; maintain per-conversation typers with ≈5 s auto-expiry; render direct/group strings in the header and "Typing…" in the row preview.

**Status:** Open — waiting for approval.

### BUG-047: The client never sends delivered/read receipts, so ticks never advance
**Severity:** S2
**Feature:** Read receipts     **Found in test:** `tests/e2e/chat-flows.spec.js` — "advances ticks from Sent to Read when the recipient opens the chat"
**Steps to reproduce:**
1. Alice sends a message while Bob's chat is closed; Alice sees a Sent tick.
2. Bob opens the chat and views the message.
3. Wait; Alice's tick remains Sent. No `message:delivered` or `message:read` is emitted by Bob's client, and Alice's client never handles `message:status`.
**Expected:** delivered when the recipient client receives it, read when the open, visible, focused conversation views it; ticks update in real time (`Testing.md` 5.7).
**Actual:** no receipt events are emitted and no status listener exists; `MessageList` derives ticks from conversation pointers that never change.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 10 (the original assertion targeted the optimistic bubble; the test was corrected to inspect all copies, so the remaining failure is the Read transition); expected-fail test tagged BUG-047 in the final log.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:26-43` handles only `message:new`; no `message:delivered`/`message:read` emissions and no `message:status` update path. Server handlers exist (`backend/src/sockets/index.js:82-90`) and have their own security defects (BUG-023).
**Suggested fix:** emit `message:delivered` on receipt when the conversation is open or on open; emit debounced `message:read` only when visible, focused, and scrolled into view; handle `message:status` to update the conversation pointers; keep BUG-023's validation/privacy work in scope.

**Status:** Open — waiting for approval.

### BUG-048: Group bubbles never show the sender's name or color
**Severity:** S2
**Feature:** Group chat / message rendering     **Found in test:** `tests/e2e/group-flows.spec.js` — "shows the sender name and per-user color on group bubbles"
**Steps to reproduce:**
1. Create a group with Alice, Bob, and Carol; open it as Bob.
2. Send a message as Alice.
3. Observe the bubble has no `[data-sender-name]` element (`Received: 0`).
**Expected:** incoming group bubbles show the sender display name in a stable per-user color (`Testing.md` 5.8).
**Actual:** `MessageList` only renders a sender label when `message.sender` is an object (`MessageList.jsx:17-20,78`), but message history and socket payloads carry the sender as an ObjectId string/JSON string (`backend/src/services/conversation.service.js:47` returns `.lean()` without `populate`).
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 17; expected-fail test tagged BUG-048 in the final log.
**Suspected cause:** unpopulated `sender` on the wire; the client has no participant lookup fallback.
**Suggested fix:** populate `sender` with `displayName username` in history and socket broadcasts (or resolve ids against `conversation.participants`), then keep the existing color hashing; add tests for all senders.

**Status:** Open — waiting for approval.

### BUG-049: There is no group creation UI, group info panel, or member list
**Severity:** S2
**Feature:** Group chat     **Found in test:** `tests/e2e/group-flows.spec.js` — "creates a group through the UI with a name and at least two members"; "shows group details and the member list in an info panel"
**Steps to reproduce:**
1. Sign in and look for a "New group" action; observe zero matching buttons.
2. Open any group conversation and look for an info/details toggle in the header; observe zero.
3. No member list or group details exist anywhere.
**Expected:** create a group with a name and ≥2 members; info panel with member list and presence (`Testing.md` 5.8).
**Actual:** only a single "New" button that opens a `window.prompt` for a direct-chat username; the header is a static name.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failures 18 and 19; both expected-fail tests tagged BUG-049 in the final log.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:108-130`; the backend group endpoints and roles already exist.
**Suggested fix:** add a group creation dialog with member search (≥2 members), an info panel toggle in the header, and a member list with roles/presence; reuse the existing socket/list patterns.

**Status:** Open — waiting for approval.

### BUG-050: Chat background themes have no picker and are never applied or synced
**Severity:** S2
**Feature:** Chat backgrounds (Love, Friendship, Battle, Default)     **Found in test:** `tests/e2e/appearance-flows.spec.js` — "opens a chat theme picker from the info panel"; "applies a chat background for both participants in real time"
**Steps to reproduce:**
1. Open a direct conversation.
2. Look for the info panel or a theme/background control; observe none (`header info toggle: 0`; the theme control is not found).
3. No element anywhere carries `data-chat-theme`, and the conversation's `theme` is never read or applied.
**Expected:** a picker with Default, Love, Friendship, and Battle, live preview, apply/persist, and real-time sync for all participants plus a system message (`Testing.md` 5.12/`AGENTS.md` 4.4).
**Actual:** no theme UI and no theme rendering. The backend stores `Conversation.theme` and `PATCH /api/conversations/:id` posts "Theme changed to …", but the client never uses it; `conversation:updated` is also unimplemented (BUG-016).
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failures 1 and 2; both expected-fail tests tagged BUG-050 in the final log.
**Suspected cause:** no info panel; `Chats.jsx` never sets `data-chat-theme` on the chat pane; no theme store or socket consumer.
**Suggested fix:** add the info panel/theme picker, set `data-chat-theme` on the chat pane with the 8 light/dark token sets, PATCH the theme, and sync via `conversation:updated` (after BUG-016) or the system message; verify WCAG AA for all 8 combinations.

**Status:** Open — waiting for approval.

### BUG-051: Message history is not paginated — older messages never load on scroll
**Severity:** S2
**Feature:** One-to-one chat / cursor pagination     **Found in test:** `tests/e2e/chat-flows.spec.js` — "loads older history when the message list is scrolled to the top"
**Steps to reproduce:**
1. Seed 35 messages in a direct conversation (API `limit=100` returns all 35).
2. Open the chat: exactly 30 bubbles render; `history 00` is absent.
3. Scroll the message pane to the top; `history 00` never appears and no `before=` request is made.
**Expected:** the newest page renders first, and scrolling up loads older pages with the scroll anchor preserved (`Testing.md` 5.4).
**Actual:** the client fetches `/messages` once with default 30 and has no scroll listener or cursor; the API supports `before` and `limit`.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 12; expected-fail test tagged BUG-051 in the final log.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:49,60` loads a single page; `Chats.jsx:131-133` is a plain scroll container with no top-reached handler.
**Suggested fix:** track `before` from the oldest loaded message id, load older pages near the top, preserve `scrollHeight`/`scrollTop` after prepend (or use a virtualized reverse list), and stop at the end.

**Status:** Open — waiting for approval.

### BUG-052: Escape does not close the emoji picker
**Severity:** S3
**Feature:** Emoji picker     **Found in test:** `tests/e2e/chat-flows.spec.js` — "closes the emoji picker on Escape"
**Steps to reproduce:**
1. Open a conversation and click the 🙂 button; the picker appears.
2. Focus its search box and press Escape.
3. Observe the picker remains visible.
**Expected:** Escape closes the picker and returns focus to the composer (`Testing.md` 5.9).
**Actual:** `Received: visible`; no key handler exists.
**Evidence:** [phase6-e2e-chromium-raw3.log](./evidence/phase6-e2e-chromium-raw3.log) failure 13; expected-fail test tagged BUG-052 in the final log.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:150-156` renders the picker without an Escape/outside-click handler; `emoji-picker-react` does not close itself on Escape.
**Suggested fix:** close on Escape and outside click while open, restore focus to the emoji button or composer, and add the same behavior on the mobile bottom-sheet variant.

**Status:** Open — waiting for approval.

---

## Phase 7 findings (reproduced 2026-10-25)

Cycle: probe every matrix row through the real `POST /api/uploads` endpoint first ([phase7-upload-probe.log](./evidence/phase7-upload-probe.log)), then encode the results as tests and tag each reproduced failure with its BUG ID (`it.fails` / `test.fail`). Backend media run: [phase7-backend.log](./evidence/phase7-backend.log) — 33 files, 242 tests, 183 passed + 59 expected fail, exit 0. Media E2E on Chromium, Firefox, and WebKit: [phase7-media-e2e.log](./evidence/phase7-media-e2e.log) — 15 tests, all expected fail, exit 0. Browser recorder/codec capabilities: [phase7-codec-probe.log](./evidence/phase7-codec-probe.log).

Three matrix rows map to existing findings rather than new bugs: TXT/CSV rejection is BUG-006, the 25 MB+1 server error is BUG-012, and the missing media endpoint behind the shared-media tabs is SD-003. FILE-021 (no layout shift for images) and every UI-dependent media row are BLOCKED by the missing composer/list UI (BUG-058…BUG-061). The WebKit recorder/codec path is BLOCKED: Playwright's WebKit build on Windows exposes no `MediaRecorder`, so the Safari branch cannot be exercised here.

### BUG-053: Chrome/Firefox voice-recording formats are rejected — WebM and Ogg/Opus uploads fail
**Severity:** S2
**Feature:** Audio sharing / voice messages     **Found in test:** AUD-006 (`backend/tests/api/media.test.js`) — "WebM audio (Chrome MediaRecorder output) is accepted"; "Ogg/Opus audio is accepted"
**Environment:** Node 24.18.0, Windows 10, Vitest + Supertest + `mongodb-memory-server`
**Steps to reproduce:**
1. Produce a WebM/Opus recording (Chromium `MediaRecorder` default) and an Ogg/Opus file (Firefox default); [phase7-codec-probe.log](./evidence/phase7-codec-probe.log) confirms both browsers report `isTypeSupported` true for exactly these.
2. `POST /api/uploads` with each file as `file`.
3. Observe both return 400 `{ code: 'BAD_REQUEST', message: 'Unsupported type' }`.
**Expected:** WebM audio and Ogg/Opus are accepted and playable; `Testing.md` 5.11 allows MP3, M4A, WAV, OGG, and WebM audio, and the reported recordings are exactly these formats.
**Actual:** every recording produced by the two supported desktop recorders is rejected. Magic-byte detection returns `video/webm` for WebM and `audio/ogg; codecs=opus` for Ogg/Opus, while the allowlist contains only `audio/webm` and `audio/ogg`; the only Ogg accepted is Vorbis (probe: `ogg vorbis 201`, `ogg opus 400`, `webm audio 400`).
**Evidence:** [phase7-upload-probe.log](./evidence/phase7-upload-probe.log) lines "ogg opus 400" and "webm audio 400"; expected-fail tests AUD-006 tagged BUG-053 in [phase7-backend.log](./evidence/phase7-backend.log).
**Suspected cause:** `backend/src/controllers/upload.controller.js:25-32` exact-matches MIME strings against the detector output; parameters (`; codecs=opus`) and the `video/` container classification are not normalized.
**Suggested fix:** strip MIME parameters and map the WebM container to the WebM audio allowlist entry before the check; keep an explicit codec allowlist if needed. Add fixtures for WebM/Opus and Ogg/Opus to the accepted matrix and verify playback of an actual browser recording.

**Fix (2026-10-26):** `normalizeMime()` in `backend/src/controllers/upload.controller.js` strips parameters (`audio/ogg; codecs=opus` → `audio/ogg`) and maps the `video/webm` container to `audio/webm` before the allowlist check. AUD-006 now passes for both WebM/Opus and Ogg/Opus, and the stored `mimeType` is the normalized audio type. Limitation: a WebM that contains video tracks is also classified as audio by container; video-file messages remain out of scope. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log) (backend `media.test.js`, 31 pass + 1 expected fail).

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-054: Non-Latin-1 filenames corrupt the stored name and break downloads; a NUL name returns 500
**Severity:** S3
**Feature:** Uploads / filenames     **Found in test:** FILE-013 (`backend/tests/api/media.test.js`) — "an emoji filename downloads with a valid HTTP response"; "a NUL filename is rejected with a 4xx, not a server error"
**Steps to reproduce:**
1. Upload `résumé.png`: 201, but the stored `originalName` is `rÃ©sumÃ©.png` (mojibake); download works because the header is accidentally valid Latin-1.
2. Upload `😀.png`: 201 with `originalName: "ð.png"`, then `GET` the download URL — the HTTP client aborts with `Parse Error: Invalid header value char` because the response header contains non-Latin-1 bytes.
3. Upload a filename containing NUL (`a\0b.png`): 500 `INTERNAL_ERROR` "Malformed part header".
**Expected:** filenames are sanitized and decoded correctly, files are stored under random names, and downloads succeed for Unicode names; control characters are rejected with a clear 4xx (`Testing.md` 5.10 filename matrix row).
**Actual:** storage keys are random and path traversal is basenamed correctly (`../../etc/passwd.png` → `passwd.png`), but the display name is mis-decoded and echoed raw into `Content-Disposition`; emoji names produce an invalid response header, and NUL names surface a library 500.
**Evidence:** [phase7-upload-probe.log](./evidence/phase7-upload-probe.log) ("stored filename unicode", "download filename emoji", "UPLOAD filename NUL"); expected-fail tests FILE-013 tagged BUG-054 in [phase7-backend.log](./evidence/phase7-backend.log).
**Suspected cause:** multer/busboy decodes `originalname` as Latin-1; `backend/src/controllers/upload.controller.js:75` stores it verbatim and `:100` writes it into `Content-Disposition` without encoding; no filename validation rejects NUL/control characters before busboy parses the part header.
**Suggested fix:** re-decode the multipart filename to UTF-8 (or use a parser that does), sanitize control characters and length, store a display name separately from the random storage key, and emit `Content-Disposition` with an ASCII fallback plus RFC 5987 `filename*=UTF-8''…`; return 400 for malformed filenames.

**Fix (2026-10-26):** uploads now recover the UTF-8 name from multer's Latin-1 decode (guarded against `\uFFFD` replacement characters), reject NUL/control characters, strip paths, cap at 255 characters, and emit RFC 5987 `filename*` only for non-ASCII names (plain `filename=` otherwise). Malformed multipart parts are mapped to 400 `INVALID_UPLOAD` instead of surfacing busboy's 500. FILE-013 now passes for `résumé.png`, emoji names, traversal, and NUL names. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-055: Invalid or decompression-bomb images return a raw 500 instead of a clear 4xx
**Severity:** S3
**Feature:** Image validation / error handling     **Found in test:** FILE-011, FILE-012 (`backend/tests/api/media.test.js`)
**Steps to reproduce:**
1. Upload a PNG whose IHDR declares 30000×30000 but has no pixel data.
2. Observe 500 `{ code: 'INTERNAL_ERROR', message: 'Input image exceeds pixel limit' }`.
3. Upload a truncated PNG; observe 500 `{ code: 'INTERNAL_ERROR', message: 'Input buffer has corrupt header:' }`.
**Expected:** the client gets a clear 4xx ("image is too large" or "image is corrupt"), and no library internals leak. The server must not allocate gigapixel buffers; `Testing.md` 5.10 requires a clear error for corrupt/truncated images and safe handling of the bomb.
**Actual:** both are 500s carrying raw `sharp` messages; the server stays up (health still 200), so the safety outcome is acceptable but the contract and disclosure are not. The response text includes the image library's internal error.
**Evidence:** [phase7-upload-probe.log](./evidence/phase7-upload-probe.log) (decompression bomb, truncated png, health after bomb); expected-fail tests FILE-011/012 tagged BUG-055 in [phase7-backend.log](./evidence/phase7-backend.log).
**Suspected cause:** `backend/src/controllers/upload.controller.js:58-64` lets `sharp.metadata()`/`toBuffer()` throw, and the central error handler maps unknown errors to 500 and returns `e.message`.
**Suggested fix:** after `metadata()`, reject dimensions above a pixel cap (and missing dimensions) with 400 before decoding; catch processing errors and map them to 400 `INVALID_IMAGE` with a generic message, logging the raw error server-side only.

**Fix (2026-10-26):** every sharp call now runs with `limitInputPixels: 100_000_000`; dimension checks reject oversized or missing dimensions and processing failures are mapped to 400 `INVALID_IMAGE` with the generic message "Invalid image". FILE-011/FILE-012 now return 400 with no `sharp` internals, and the bomb does not affect health. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-056: An animated GIF is flattened to one frame when stored
**Severity:** S3
**Feature:** Image messages / photo sharing     **Found in test:** FILE-005 (`backend/tests/api/media.test.js`) — "a stored animated GIF keeps all of its frames"
**Steps to reproduce:**
1. Upload a two-frame animated GIF.
2. Read the stored file and its thumbnail with `sharp(...).metadata()` (pages).
3. Observe source pages 2, stored pages 1.
**Expected:** the stored image preserves the animation (GIF is allowed and animated GIFs are listed in the file matrix); only the thumbnail may be static.
**Actual:** the stored copy and thumbnail are both the first frame, so an uploaded animation silently becomes a still image.
**Evidence:** [phase7-upload-probe.log](./evidence/phase7-upload-probe.log) ("gif stored pages: sourcePages 2, storedPages 1"); expected-fail test FILE-005 tagged BUG-056 in [phase7-backend.log](./evidence/phase7-backend.log).
**Suspected cause:** `backend/src/controllers/upload.controller.js:61` re-encodes with `sharp(buffer).rotate().toBuffer()`, which processes only page 1 unless `{ animated: true }` is set.
**Suggested fix:** for GIF (and future animated WebP), preserve the original bytes after validation or re-encode with `{ animated: true }` plus a frame-count/size guard; keep the thumbnail static.

**Fix (2026-10-26):** GIFs are re-encoded with `sharp(buffer, { animated: true }).gif({ delay, loop })` preserving frame delays and loop, guarded by `MAX_ANIMATED_FRAMES = 500`; the thumbnail is generated from the first page only. FILE-005 now confirms the stored copy keeps both frames while the thumbnail stays static. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-057: Audio uploads never store a duration
**Severity:** S3
**Feature:** Audio sharing / metadata     **Found in test:** AUD-013 (`backend/tests/api/media.test.js`)
**Steps to reproduce:**
1. Upload valid MP3, M4A, WAV, and Ogg files.
2. Read the created `Upload` documents.
3. Observe `duration` is `null` for all of them (the probe and the test matrix show `width`/`height` null and no duration).
**Expected:** audio uploads carry a duration so the player can render it before loading the file and so shared-media rows can show it (`Testing.md` 5.11; `AGENTS.md` 6.1 lists `duration` on uploads/attachments).
**Actual:** `duration` is never computed for any format; it defaults to `null`.
**Evidence:** expected-fail test AUD-013 tagged BUG-057 in [phase7-backend.log](./evidence/phase7-backend.log); [phase7-upload-probe.log](./evidence/phase7-upload-probe.log) shows accepted audio responses with no duration.
**Suspected cause:** `backend/src/controllers/upload.controller.js:70-79` omits `duration` from `Upload.create`, and no audio metadata parser is used.
**Suggested fix:** probe audio metadata server-side (for example `music-metadata`) for accepted audio types, enforce the 5-minute voice-message cap there, and store `duration` on the upload/attachment.

**Fix (2026-10-26):** added `backend/src/utils/audioDuration.js`, a dependency-free parser for MP3, WAV, Ogg (Vorbis and Opus), MP4/M4A, and WebM. The controller stores the rounded `duration` on `Upload`, returns it in the 201 response, and copies it onto message attachments. AUD-013 now passes for MP3 and WAV fixtures; MP4/WebM duration parsing has no fixture-based assertion yet because the synthetic fixtures carry no duration metadata. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26 (MP3/WAV duration fixtures; MP4/WebM parser paths untested).

### BUG-058: The composer has no attach, photo/file, drag-and-drop, or paste upload flow
**Severity:** S2
**Feature:** File and image messages     **Found in test:** FILE-015, FILE-017, PHOTO-001 (`tests/e2e/media-flows.spec.js`; expected-fail)
**Steps to reproduce:**
1. Sign in, open a direct conversation.
2. Look for attach/photo/file controls: none; `input[type="file"]` count is 0.
3. Paste a PNG into the composer; no `POST /api/uploads` request starts within 3 s.
4. There is no upload progress bar, cancel action, or preview chip because no upload can be initiated.
**Expected:** attach menu (Photo, File), file picker, drag-and-drop and paste for images, preview chip with remove, upload progress with cancel — all over REST with `uploadIds` sent over the socket (`Testing.md` 5.10).
**Actual:** the composer is an emoji button, a textarea, and Send (`frontend/src/features/chats/Chats.jsx:133-149`); no attach UI, no file input, no paste/drop handler, no upload client.
**Evidence:** [phase7-media-e2e.log](./evidence/phase7-media-e2e.log) — three expected-fail tests tagged BUG-058 across Chromium, Firefox, and WebKit.
**Suspected cause:** the composer was never extended beyond text; the upload endpoint exists but nothing calls it (and it issues no signed URL — SD-004).
**Suggested fix:** implement the upload client (multipart POST with progress via XHR/fetch stream, cancel via AbortController), the attach menu and drag/paste handlers, then send `type: 'image' | 'file'` with `uploadIds`; add the preview chip and progress/cancel UI. Coordinate with SD-004 so returned URLs can be rendered.

**Fix (2026-10-26):** the composer now has an attach menu (Photo, File), hidden pickers, drag-and-drop and paste handlers, preview chips with remove/cancel, a live progress bar (`role="progressbar"`), and XHR uploads through `uploadFile()` with `AbortController`. Ready uploads are sent over the socket as `uploadIds` with the derived `image`/`file`/`audio` type. Unit evidence: `composer-media.test.jsx` 4/4 (upload+progress+send, cancel aborts and revokes, paste, whitespace-during-upload) in [test-all-fix-run1.log](./evidence/test-all-fix-run1.log); E2E FILE-015/FILE-017/PHOTO-001 pass on Chromium, Firefox, and WebKit in the same run.

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-059: The message list renders text only — no image bubbles, file cards, or lightbox
**Severity:** S2
**Feature:** Image/file messages, lightbox     **Found in test:** FILE-018, FILE-019, FILE-020, FILE-022 (`frontend/src/features/chats/media.test.jsx`; expected-fail)
**Steps to reproduce:**
1. Render an `image` message whose attachment has width/height and empty text.
2. Observe no `<img>`; the bubble renders empty text (`MessageList.jsx:118` renders only `message.text`).
3. Render a `file` message; no filename and no download link appear.
4. Clicking an image is impossible, so there is no lightbox, next/previous, Esc, or download.
**Expected:** image bubbles reserve width/height (no layout shift), click opens a keyboard-operable lightbox with next/previous/download and Esc; file bubbles show icon, name, size, and download (`Testing.md` 5.10).
**Actual:** attachments are ignored entirely, so every non-text message renders an empty or text-only bubble.
**Evidence:** four expected-fail tests tagged BUG-059 in [phase7-backend.log](./evidence/phase7-backend.log) (web suite) and the full web run logged in [docs/testing/TEST_RESULTS.md](./TEST_RESULTS.md).
**Suspected cause:** `frontend/src/features/chats/MessageList.jsx:118` has no branch for `type` or `attachments`; no media components exist.
**Suggested fix:** add memoized image/file bubbles with fixed dimensions from the attachment, lazy-load the lightbox (dialog, arrow keys, Esc, download), and resolve media URLs once SD-004 is fixed. Keep text rendering plain.

**Fix (2026-10-26):** `MediaBubbles.jsx` adds image bubbles (width/height attributes, local preview while pending), file cards (icon, name, download), and a keyboard-operable lightbox (Previous/Next/Download, Esc, arrow keys). Media bytes are fetched with the bearer token via `apiBlob()` and cached by upload id in `media.js`, with object URLs revoked on unmount. `media.test.jsx` 4/4 covers image/file rendering, lightbox navigation, and Esc/Download, and FILE-018/019/020/022 E2E pass on all three engines. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-060: There are no Photos/Files/Audio tabs and no audio player
**Severity:** S2
**Feature:** Shared media / audio player     **Found in test:** PHOTO-002, PHOTO-003, AUD-008…AUD-012 (`frontend/src/features/chats/media.test.jsx`, `tests/e2e/media-flows.spec.js`; expected-fail)
**Steps to reproduce:**
1. Open a conversation; there is no info panel or info toggle (also BUG-040/BUG-049).
2. Look for Photos, Files, or Audio tabs: none exist.
3. Render an `audio` message: no player, play button, seek bar, speed controls, or duration appears.
4. `GET /api/conversations/:id/media` returns 404, so even a UI could not paginate the tabs (SD-003).
**Expected:** the info panel exposes Photos, Files, and Audio tabs with pagination and open-in-lightbox behavior; audio bubbles have play/pause, a seekable progress bar/waveform, duration, and 1×/1.5×/2× speed, with only one audio playing at a time (`Testing.md` 5.10/5.11).
**Actual:** no info panel, no tabs, no media endpoint, and no player component; audio messages render as empty text bubbles.
**Evidence:** [phase7-media-e2e.log](./evidence/phase7-media-e2e.log) — expected-fail E2E tagged BUG-060; expected-fail web test tagged BUG-060 (AUD-008).
**Suspected cause:** the info panel was never built (BUG-040/BUG-049), the media REST route is absent (SD-003), and `MessageList` has no audio branch (BUG-059).
**Suggested fix:** add the media list endpoint with cursor pagination and participant checks, build the tabbed info panel with infinite scroll, and add a single shared audio player with a global "only one playing" coordinator and speed control.

**Fix (2026-10-26):** added `GET /api/conversations/:id/media?type=image|audio|file&before=&limit=` (membership-checked aggregation over message attachments) and `MediaPanel.jsx` with Photos/Files/Audio tabs, photo grid + lightbox, file download rows, audio rows, and empty states. `AudioAttachment` provides play/pause, a seekable range input, duration, and 1×/1.5×/2× speed with a module-level coordinator so only one audio plays at a time. PHOTO-002/PHOTO-003 and AUD-008…AUD-012 pass in unit and E2E coverage. Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26.

### BUG-061: There is no voice-message recording UI
**Severity:** S2
**Feature:** Voice messages     **Found in test:** AUD-001…AUD-005 (`tests/e2e/media-flows.spec.js`; expected-fail)
**Steps to reproduce:**
1. Open a direct conversation and look for a mic/record control: zero matching buttons.
2. No recording bar, timer, level meter, cancel, or send exists; no `MediaRecorder` or `getUserMedia` call occurs anywhere in the client.
3. Permission-denial handling, the 5-minute cap, and the under-1-second rule are therefore unreachable.
**Expected:** hold/tap the mic to record with `MediaRecorder`, select a supported MIME via `isTypeSupported`, show a timer and live level meter with cancel/send, cap at 5 minutes, handle denied permission with a clear message, and discard recordings under 1 s (`Testing.md` 5.11).
**Actual:** the composer has only emoji, text, and Send. Additionally, the server rejects the formats Chrome and Firefox recorders produce (BUG-053), so the flow would still fail end-to-end once the UI exists.
**Evidence:** [phase7-media-e2e.log](./evidence/phase7-media-e2e.log) — expected-fail test tagged BUG-061 on all three browsers.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:133-149` never added a mic control or recorder module.
**Suggested fix:** add the recorder module (feature-detected MIME, level meter via `AnalyserNode`, timer, cancel/send), upload via the BUG-058 pipeline, and fix BUG-053 before claiming voice messages work. Test with fake media devices on Chromium/Firefox; note WebKit automation lacks `MediaRecorder`.

**Fix (2026-10-26):** the composer now has a mic control and recording bar with an elapsed timer, live `AnalyserNode` level meter, Cancel, and Send. `MediaRecorder` MIME is feature-detected (`audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` → `audio/ogg;codecs=opus`); tracks, timers, RAF, and `AudioContext` are cleaned up; recordings under 1 s are discarded; the cap is 300 s; permission denial and unsupported browsers show clear toasts. On stop the clip uploads through the BUG-058 pipeline and sends `type: 'audio'` with the upload id. `recording.test.jsx` 4/4 covers the timer→upload→send path, the <1 s rejection, denied permission, and unsupported-browser handling; AUD-001…AUD-005 E2E pass on Chromium and Firefox, while Playwright WebKit on Windows still exposes no `MediaRecorder` (BLOCKED, as before). Evidence: [test-all-fix-run1.log](./evidence/test-all-fix-run1.log).

**Status:** Fixed — approved and verified 2026-10-26 (WebKit automation path remains BLOCKED).

---

## Phase 8 findings (reproduced 2026-10-26)

### BUG-062: The client has no calling feature — no call control, screens, state machine, or WebRTC
**Severity:** S2
**Feature:** Video and audio calling     **Found in test:** CALL-UI, CALL-001, CALL-003, CALL-011, CALL-013, CALL-018 (`tests/e2e/call-flows.spec.js`; expected-fail, Chromium with fake media)
**Environment:** Chromium (Playwright 1.64.1, fake camera/microphone), 1440×900, light and dark, 2026-10-26
**Steps to reproduce:**
1. Open a direct conversation. The chat header contains only the peer name and an **Info** button; there is no video-call control anywhere in the app.
2. There is no incoming-call screen, no accept/decline, no active-call overlay, no local preview, and no mute/camera/end controls.
3. There is no call state machine, no `RTCPeerConnection`, no `getUserMedia` for calls, and no client-side `call:*` socket events. A callee cannot be rung, so accept, decline, busy, glare, multi-device stop, cleanup, duration, and call history are all unreachable.
4. The rail has no Calls entry or history view.
**Expected:** per `Testing.md` 5.14 (and `AGENTS.md` 5.14): a header call button, incoming screen with accept/decline and ringtone, an always-dark overlay with remote video and a floating local preview, mute/camera/end controls, 30 s ring timeout, busy/glare handling, ICE restart messaging, full track cleanup, call-log messages, and a Calls history with direction, status, and call-back.
**Actual:** no calling UI or client logic exists. The only call-related client behavior is the untouched ICE endpoint (server-side).
**Evidence:** [phase8-calls-e2e-run1.log](./evidence/phase8-calls-e2e-run1.log) — six expected-fail E2E tests (and runs 2 and 3); all fail at the missing header call control. Screenshots/traces are produced under `test-results/` on each run.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:413-427` has only the name and Info button; there is no `frontend/src/features/calls` directory and no `call:*` handling in `frontend/src/lib/socket.js`.
**Suggested fix:** add a call manager (single peer connection, state machine, cleanup on unmount/logout), outgoing and incoming screens in the always-dark overlay, track-enabled mute/camera toggles, ICE restart with a "Reconnecting…" state, and the Calls history view fed by call-log messages (BUG-063). Wire the `call:*` events after BUG-017 is implemented.

**Status:** Open — waiting for approval.

### BUG-063: Call outcomes are never persisted and there is no Calls history
**Severity:** S2
**Feature:** Call log and Calls tab     **Found in test:** CALL-005, CALL-006, CALL-007, CALL-018 (`backend/tests/socket/calls.test.js`, `tests/e2e/call-flows.spec.js`; expected-fail)
**Steps to reproduce:**
1. Complete, decline, or miss a call (once signaling exists) and query `Message` for the conversation: no `type: 'call'` document is written and no `message:new` call bubble appears.
2. Inspect the `Message` schema: there is no `callInfo` field at all, so mode, status, and duration cannot be stored even manually.
3. Look for a Calls tab or a call-history route: none exists, and there is no REST endpoint that returns call history.
**Expected:** every outcome (completed with duration, declined, missed) writes a call-log message with `callInfo { mode, status, durationSec }` (per `AGENTS.md` 6.1 and `Testing.md` 5.14), renders the bubble ("Video call · 12:34", "Missed video call", "Declined"), and appears in a Calls history with direction, status, and call-back.
**Actual:** no call-log persistence, no `callInfo` field, no history UI or endpoint. The socket tests tagged BUG-063 fail on the missing call-log document after their signaling assertions; the E2E test fails on the missing bubble and Calls nav.
**Evidence:** [phase8-calls-socket-run1.log](./evidence/phase8-calls-socket-run1.log) (15 expected fails, four tagged BUG-063); [phase8-calls-e2e-run1.log](./evidence/phase8-calls-e2e-run1.log).
**Suspected cause:** `backend/src/models/Message.js:16-26` has no `callInfo`; no call service exists to write the log, and the client has no history view (BUG-062).
**Suggested fix:** add `callInfo` to the `Message` schema, write the call-log message from the call service on end/decline/timeout/offline, broadcast `message:new`, and build the Calls tab (or list filter) showing direction/status/duration with a call-back action.

**Status:** Open — waiting for approval.

---

### BUG-064: The emoji picker follows the OS, not the app's light/dark mode

**Severity:** S3
**Feature:** Emoji picker / light and dark mode (5.9, 5.15)     **Found in test:** `tests/e2e/theme-modes.spec.js` — "the emoji picker follows the app mode, not the OS" (expected-fail)
**Steps to reproduce:**
1. Keep the OS in light mode, then choose Dark in the app (or set `chatsphere-theme` to `dark`).
2. Open a chat and click the 🙂 composer button.
3. Inspect the picker element (`.EmojiPickerReact`): it does not carry `epr-dark-theme` and renders with the light palette.
**Expected:** the picker follows the current app mode (`AGENTS.md` 5.9 and 4.5; `Testing.md` 5.15), including when the app mode is an explicit choice that differs from the OS.
**Actual:** the picker stays light because `Chats.jsx` passes `theme="auto"`, which resolves against `prefers-color-scheme` rather than the app's `resolved` theme.
**Evidence:** [phase9-theme-run1.log](./evidence/phase9-theme-run1.log) (6 normal passes, 1 expected fail).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:562` — `<EmojiPicker ... theme="auto" />`; the component never reads `useThemeStore().resolved`.
**Suggested fix:** pass `theme={resolved}` from the theme store (`'dark'` or `'light'`) and update it when the OS/app mode changes; add a regression test for app-dark/OS-light and app-light/OS-dark.

**Status:** Open — waiting for approval.

---

### BUG-065: Own-message timestamps are near-invisible in light mode

**Severity:** S2
**Feature:** Message timestamps / light mode (5.5, 5.15, 6.2)     **Found in test:** `tests/a11y/screens.spec.js` — "the open chat with its info panel passes axe in light" (expected-fail)
**Steps to reproduce:**
1. Open a direct chat in light mode and send a message.
2. Look at the timestamp row under your own bubble (for example "02:30 PM").
3. Run axe on the chat screen: `color-contrast` (serious), 1.05:1 (`#fcfcfd` text on `#f5f6fa` background).
**Expected:** timestamps and tick states are readable at WCAG AA (4.5:1) in both modes; own and incoming messages are treated the same.
**Actual:** the timestamp row sits *outside* the bubble and inherits `text-[var(--tick-sent)]` (`rgba(255,255,255,0.65)`) for own messages, so it renders as near-white text on the light app background. Incoming timestamps use `--text-muted` and are readable.
**Evidence:** [phase9-axe-run1.log](./evidence/phase9-axe-run1.log) (`chat-light — color-contrast (serious): 3 node(s)`, including two `<time>` nodes at 1.05:1).
**Suspected cause:** `frontend/src/features/chats/MessageList.jsx:153-159` applies the on-bubble tick color to the out-of-bubble timestamp row.
**Suggested fix:** move the timestamp inside the bubble and keep the white tick palette, or style own timestamps with `--text-muted` on the app background; verify both modes with axe and add a contrast regression test.

**Status:** Open — waiting for approval.

---

### BUG-066: Several design tokens fail WCAG AA contrast

**Severity:** S3
**Feature:** Design tokens / accessibility (4.3, 6.2)     **Found in test:** `tests/a11y/screens.spec.js` — design-preview (light/dark), profile-dark, and chat-dark (all expected-fail)
**Steps to reproduce:**
1. Run axe on `/design-preview` in light and dark, on `/profile` in dark, and on an open chat in dark.
2. Observe `color-contrast` (serious) violations:
   - Danger button: white on `#ef4444` = **3.76:1** (light); white on `#f87171` = **2.76:1** (dark).
   - Dark avatar initials and the selected media tab: `#5b5bf0` on `#1e2347` = **3.02:1**.
   - Light date separator: `#667085` on `#f0f2f7` = **4.44:1**.
**Expected:** every text/background pair in both modes meets WCAG AA 4.5:1 (`AGENTS.md` 4.3, `Testing.md` 6.2).
**Actual:** four token pairs fall below 4.5:1; all are serious axe violations.
**Evidence:** [phase9-axe-run1.log](./evidence/phase9-axe-run1.log).
**Suspected cause:** the starting token values in `frontend/src/index.css` (danger, primary-soft pairing, text-muted on surface-2) were not contrast-checked against every surface they are used on.
**Suggested fix:** darken the light danger color (or use dark text), darken the dark-theme danger, raise the dark primary-on-primary-soft contrast (or use a lighter primary for text), and use `--text`/`--text-subtle`-adjusted values for the date separator; add axe checks per screen to prevent regressions.

**Status:** Open — waiting for approval.

---

### BUG-067: There is no responsive layout — no rail, bottom bar, single-pane phone flow, or info overlay

**Severity:** S2
**Feature:** Responsive layouts (6.3, `AGENTS.md` 4.6)     **Found in test:** `tests/e2e/responsive-flows.spec.js` — "no viewport scrolls horizontally or clips the chat composer", "phone layout uses one pane with a bottom bar and back navigation", "tablet layout keeps the side rail and two content columns", "laptop layout uses the rail, list, and chat without a permanent fourth column", "desktop layout shows all four panes" (all expected-fail)
**Environment:** Chromium (Playwright 1.64.1), 2026-10-26, seeded direct chat
**Steps to reproduce:**
1. Open a chat at 360×760 or 390×844. The document is **604 px wide** in a 360/390 px viewport: the list shrinks to 174 px, the chat pane runs from x=174 to x=604, and the header and composer are clipped off-screen. There is no bottom bar and no back button; the conversation list stays visible beside the chat.
2. Open a chat at 768×1024: the layout is list (337 px) + chat (431 px) with **no side rail**.
3. Open a chat at 1024×768: no rail, and the info panel is a permanent fourth column (286 px) instead of an overlay; the chat is squeezed to 431 px.
4. Open a chat at 1440×900: list (340) + chat (780) + info (320) are present, but the 72 px rail is still missing.
**Expected:** `AGENTS.md` 4.6 / `Testing.md` 6.3 — ≥1280 px: rail + list + chat + info; 768–1279 px: rail + list + chat with the info panel as an overlay; <768 px: one pane at a time, list → chat with a back button, rail replaced by a bottom bar, no horizontal scrolling, nothing clipped.
**Actual:** the single `h-full flex` row renders a fixed 340 px list and a flexible chat pane at every width; no rail or bottom bar exists, the list never hides on phones, and the info panel's `hidden lg:flex` turns into a permanent 320 px (shrunk) column at 1024 px. Phone widths overflow horizontally by 214–244 px.
**Evidence:** [phase9-responsive-raw.log](./evidence/phase9-responsive-raw.log) (`[clipping]`, `[phone]`, `[tablet]`, `[laptop]`, `[desktop]` metrics); phone screenshot [chat-light-phone-390x844-chromium-win32.png](../../tests/visual/screens.spec.js-snapshots/chat-light-phone-390x844-chromium-win32.png). Phase 13 (EXPL-044) rotated a live group chat through four sizes: overflow was **303 px at 390×844** and **333 px at 360×760**, while 768 and 1440 stayed at 0 — consistent with the missing phone layout ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:394-573` — no responsive classes or conditional panes; `App.jsx:29-37` has no shared shell (also BUG-040); missing `min-w-0` on flex children lets the chat's min-content width drive the 604 px document width.
**Suggested fix:** add the 72 px rail (`BUG-040`), hide the list and show a back button plus bottom bar below 768 px, keep rail + list + chat at 768–1279 px with an overlay info sheet, show four panes at ≥1280 px, add `min-w-0`/`overflow-x-hidden`, and cover all five viewports with the new responsive tests.

**Status:** Open — waiting for approval.

---

### BUG-068: Composer and header touch targets are smaller than 44 px on phones

**Severity:** S2
**Feature:** Responsive touch targets (6.3)     **Found in test:** `tests/e2e/responsive-flows.spec.js` — "phone touch targets are at least 44px" (expected-fail)
**Steps to reproduce:**
1. Open a chat at 390×844.
2. Measure every visible button, link, input, and textarea: all eight controls are below 44 px in at least one dimension — Search (70.6×38), New (62.2×38), Chat info (49.2×32), Attach file (36×36), Record voice message (36×36), 🙂 (35.2×37), message textarea (201×38), Send (66.3×36).
**Expected:** touch targets at least 44×44 px (`Testing.md` 6.3).
**Actual:** every composer and header control is 32–38 px tall, below the 44 px minimum.
**Evidence:** [phase9-responsive-raw.log](./evidence/phase9-responsive-raw.log) (`[touch] 8 targets, 8 below 44px`).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:396-540` uses `text-sm` + `py-1.5`/`py-2` and `px-2 py-2` icon buttons; `Input.jsx:4` uses `py-2`; `Button.jsx:2` uses `px-4 py-2`.
**Suggested fix:** give interactive controls a minimum 44×44 px hit area (`min-h-11 min-w-11` or equivalent padding on touch widths), keeping the visual size while expanding the target if needed; re-run the touch-target test at 360/390 px.

**Status:** Open — waiting for approval.

---

### BUG-069: Conversation rows cannot be reached or opened from the keyboard

**Severity:** S2
**Feature:** Keyboard accessibility (6.2)     **Found in test:** `tests/e2e/keyboard-flows.spec.js` — "conversation rows are reachable and operable from the keyboard" (expected-fail)
**Steps to reproduce:**
1. Sign in with at least one existing conversation.
2. Press Tab repeatedly. Focus cycles Search → New → Attach file → Record voice message → 🙂 → message textarea → Send → body; it never lands on the "Direct chat" row (25 tabs recorded).
3. Inspect the row: it is a `<div>` with `tabIndex = -1` and no `role`.
**Expected:** rows participate in the tab order, expose button/link semantics (including the conversation name, preview, and unread state), and open on Enter/Space (`Testing.md` 6.2).
**Actual:** rows are mouse-only clickable `div`s, so a keyboard user can open a chat only through the "New" prompt, and cannot switch between existing conversations.
**Evidence:** [phase9-keyboard-raw.log](./evidence/phase9-keyboard-raw.log) (`[keyboard:rows] semantics={"tabIndex":-1,"role":null,"tag":"div"}` and the 25-stop tab trace).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:403` — `<div onClick={...} className="... cursor-pointer">` with no `tabIndex`, `role`, or key handler.
**Suggested fix:** render each row as a `<button>` or add `role="button"`, `tabIndex={0}`, an accessible name, `aria-current`/selected state, and Enter/Space handling; verify the focus ring and that the row opens the conversation.

**Status:** Open — waiting for approval.

---

### BUG-070: Escape does not close the attach menu

**Severity:** S3
**Feature:** Composer attach menu / keyboard accessibility (6.2)     **Found in test:** `tests/e2e/keyboard-flows.spec.js` — "the attach menu closes on Escape" (expected-fail)
**Steps to reproduce:**
1. Open a chat and focus the attach button with Tab.
2. Press Enter to open the Photo/File menu.
3. Press Escape. The menu remains visible (still visible after 10 s; the only ways to dismiss it are selecting an item or clicking the attach button again).
**Expected:** Escape closes the menu and returns focus to the attach button; menus/dialogs must close on Esc (`Testing.md` 6.2).
**Actual:** the menu has no key handler and no outside-click dismissal; focus stays on the attach button while the menu remains open.
**Evidence:** [phase9-keyboard-escape.log](./evidence/phase9-keyboard-escape.log) (`23 × locator resolved … unexpected value "visible"`).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:498-517` — the `role="menu"` div only closes through its item `onClick` handlers and the trigger toggle; no `onKeyDown`/`Escape` handling.
**Suggested fix:** handle Esc on the menu/trigger, close and return focus to the trigger, and add outside-click dismissal; keep arrow/Home/End navigation if the menu adopts full menu semantics.

**Status:** Open — waiting for approval.

---

### BUG-071: Incoming messages in the open chat are not announced in a live region

**Severity:** S2
**Feature:** Screen-reader semantics (6.2)     **Found in test:** `tests/e2e/keyboard-flows.spec.js` — "incoming messages are announced in a polite live region" (expected-fail)
**Steps to reproduce:**
1. Open a direct chat as Alice and keep the tab focused.
2. Send a message from Bob over the socket. The bubble appears.
3. Inspect the DOM for live regions: the only `aria-live`/`role="status"` element is the global toast showing "New message"; no live region contains Bob's message text.
**Expected:** `aria-live="polite"` for new messages (`Testing.md` 6.2, `AGENTS.md` 7), with sender and text announced when the open chat receives a message.
**Actual:** message bubbles are rendered into the static message list with no live region; toasts are raised only for conversations that are **not** open, so a screen-reader user gets no announcement for messages in the chat they are reading.
**Evidence:** [phase9-keyboard-raw.log](./evidence/phase9-keyboard-raw.log) (`[keyboard:live] {"regions":[{"ariaLive":"polite","role":"status","text":"New message"}],"announced":false}`).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:62-79` appends to `messages`; `MessageList.jsx:78-175` has no live region, and `Toast.jsx:17` is the only polite region.
**Suggested fix:** add a visually hidden `aria-live="polite"` log (or an `aria-live` wrapper around new incoming bubbles) that announces sender + truncated text only while the conversation is open and visible; avoid announcing the user's own sends or historical loads.

**Status:** Open — waiting for approval.

---

### BUG-072: The image lightbox does not move focus in, trap it, or return it

**Severity:** S2
**Feature:** Lightbox focus management (6.2)     **Found in test:** `tests/e2e/keyboard-flows.spec.js` — "the image lightbox traps focus and returns it to the trigger" (expected-fail)
**Steps to reproduce:**
1. Open a chat with an image message and click the image (trigger is the "Open focus.png" button).
2. Inspect `document.activeElement`: it is still the image trigger behind the overlay — focus never enters the `role="dialog"` (`insideAfterOpen=false`).
3. Press Tab six times: focus reaches two controls inside the dialog, then escapes to the composer textarea (`[true,true,false,false,false,false]`), continuing to tab behind the overlay.
4. Press Escape: the dialog closes, but focus remains on the composer textarea (`afterClose=TEXTAREA`) instead of returning to the image trigger.
**Expected:** opening a dialog moves focus into it, Tab/Shift+Tab stay inside, Escape closes it, and focus returns to the trigger (`Testing.md` 6.2).
**Actual:** the lightbox only listens for Escape/arrows on `window`; it has no initial focus, no focus trap, no `tabIndex`, and no focus restoration.
**Evidence:** [phase9-keyboard-raw.log](./evidence/phase9-keyboard-raw.log) (`[keyboard:lightbox] insideAfterOpen=false tabStopsInside=[true,true,false,false,false,false] afterClose=TEXTAREA`).
**Suspected cause:** `frontend/src/features/chats/MediaBubbles.jsx:164-230` — `Lightbox` renders the dialog without a ref, autofocus, or Tab handling; `onClose` only clears the index.
**Suggested fix:** focus the close button (or the dialog) on open, trap Tab within the dialog, restore focus to the triggering image button on close, and keep the Escape/arrow handlers scoped to the dialog.

**Status:** Open — waiting for approval.

---

### BUG-073: Brand assets are missing — the favicon 404s and there is no logo or `APP_NAME` constant

**Severity:** S3
**Feature:** Branding / design system (`AGENTS.md` 4.1)     **Found in test:** design-board comparison (Phase 9)
**Steps to reproduce:**
1. Load any route and open the browser devtools Network tab: `GET /favicon.svg` returns 404 because `index.html` links it but `frontend/public/` contains only the design-board PNG.
2. Look for a logo mark or wordmark on login, register, profile, or the chat shell: none exists; the product name appears only in the `<title>`.
3. Search the client for `APP_NAME`: no constant exists, although `AGENTS.md` 4.1 requires the placeholder name in a single constant.
**Expected:** the design board shows a logo mark plus the "ChatSphere" wordmark on the splash, login, register, and shell; `AGENTS.md` 4.1 asks for a single `APP_NAME` constant.
**Actual:** no brand component or asset ships, and the tab icon is broken.
**Evidence:** [chatsphere-design-board.png](../../frontend/public/chatsphere-design-board.png) (logo in every header); `frontend/index.html:5-7`; `ls frontend/public` (only the PNG); visual baselines in [VISUAL_BASELINES.md](./VISUAL_BASELINES.md).
**Suspected cause:** `frontend/index.html:5` references `/favicon.svg` which was never added; no shared `Logo` or `APP_NAME` module was created in Phase 2.
**Suggested fix:** add the favicon (original, matching the board), a `Logo` component, and an `APP_NAME` constant used by the title, auth screens, and shell.

**Status:** Open — waiting for approval.

---

### BUG-074: The profile screen omits the required joined date

**Severity:** S3
**Feature:** User profiles (`AGENTS.md` 5.2)     **Found in test:** design-board comparison (Phase 9)
**Steps to reproduce:**
1. Sign in and open `/profile`.
2. Inspect the card: it contains the avatar, display name, username, bio, and Save — nothing else.
3. The design board's profile shows a joined/member context; `AGENTS.md` 5.2 lists the joined date as a profile field.
**Expected:** the profile displays the account's joined date (for example "Joined October 2026") alongside the editable fields.
**Actual:** no joined date is rendered, and the API response is not used for it.
**Evidence:** `frontend/src/features/profile/Profile.jsx:30-39` (three inputs and a Save button); [profile baselines](./VISUAL_BASELINES.md) show the same card in both modes.
**Suspected cause:** the Phase 4 profile form was built with only the editable fields; `createdAt` is never read.
**Suggested fix:** render `user.createdAt` formatted with the shared date helper (for example `format(fullDate)`), localized, with a readable label; keep the "joined" text at AA contrast in both modes.

**Status:** Open — waiting for approval.

---

### BUG-075: The conversation list lacks the filter tabs, unread badge, mute indicator, and attachment-type preview

**Severity:** S3
**Feature:** Conversation list (`AGENTS.md` 4.2, 5.13)     **Found in test:** design-board comparison (Phase 9)
**Steps to reproduce:**
1. Sign in with at least two conversations (one unread, one with an image or file as its last message) and view the list pane.
2. Observe the pane: search box and "New" button, then rows containing only the name and last-message preview.
3. There are no All/Unread/Groups tabs, no unread count badge, no mute glyph, no attachment-type icon in the preview, and no last-message time (the time is tracked separately as BUG-044).
**Expected:** `AGENTS.md` 4.2: search, filter tabs (All, Unread, Groups), a type icon for image/audio/file previews, and per-row time, unread badge, and mute icon; `5.13` requires unread badges on conversation rows.
**Actual:** the notification store records unread counts but no row renders them; tabs, type icons, and mute controls do not exist, and an attachment without a caption produces an empty preview.
**Evidence:** `frontend/src/features/chats/Chats.jsx:396-411` (rows render name + `lastMessage.text` only); `useNotificationStore.incrementUnread` is called at `Chats.jsx:69` and cleared at `185` with no consumer.
**Suspected cause:** the list pane was implemented as a flat list before the notification and mute features; the store wiring was added later without UI.
**Suggested fix:** add the three tabs with counts, an unread badge and mute glyph per row, and the mute picker (1 h / 8 h / until unmute) once the notification settings land; keep the tab strip keyboard-operable and labeled.

**Status:** Open — waiting for approval.

---

### BUG-076: The message list is not virtualized and has no "New messages ↓" pill

**Severity:** S2
**Feature:** Message list performance (`AGENTS.md` 4.2, 7)     **Found in test:** design-board comparison (Phase 9)
**Steps to reproduce:**
1. Open a conversation and scroll: every message is rendered at once by a single `messages.map` — `react-virtuoso` is not installed.
2. Scroll up while a new message arrives: there is no "New messages ↓" affordance; the new message is appended off-screen with no indicator.
**Expected:** `AGENTS.md` 4.2 and the tech decisions require a virtualized list (`react-virtuoso`) that stays responsive with 10,000+ messages, and a "New messages ↓" pill when the user has scrolled up.
**Actual:** the list renders all loaded messages and provides no scroll affordance.
**Evidence:** `frontend/src/features/chats/MessageList.jsx:79-166` (`messages.map` over the whole array); `frontend/package.json:19-20` has no `react-virtuoso`; no "New messages" string in `frontend/src`. Phase 13 (EXPL-047) scrolled to the top, received five messages, and found `scrollTop=0px` with **0** "New messages" pills ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** the Phase 6 list was built without the virtualization decision, and the pagination work (BUG-051) never introduced a scroll anchor or pill.
**Suggested fix:** adopt `react-virtuoso` with `firstItemIndex`/`alignToBottom`, keep the scroll anchor when prepending older pages, and show a jump-to-latest pill when unread messages arrive off-screen.

**Status:** Open — waiting for approval.

---

### BUG-077: The conversation list never updates its preview, time, or order when a message arrives

**Severity:** S2
**Feature:** Conversation list real-time updates (`AGENTS.md` 4.2, 5.4, 5.13)     **Found in test:** design-board comparison (Phase 9 baselines)
**Steps to reproduce:**
1. Sign in as Alice with a conversation that has no messages yet; keep the chat closed and have Bob send a message.
2. Look at Alice's list row: there is no preview, no time, and no reordering — the row only changes after a reload (which currently signs the user out, BUG-039).
3. The same happens for Alice's own messages: open the conversation, send text, and the row still shows the old preview while the bubble appears.
**Expected:** the list preview (text or attachment type), the last-message time, and the ordering update live for every `message:new`, and the row belongs at the top (`AGENTS.md` 4.2/5.4).
**Actual:** `message:new` only appends to the open conversation's messages; `conversations` is set once on mount and when a conversation is created. The Phase 9 chat baselines show a conversation with two messages but an empty preview line.
**Evidence:** `frontend/src/features/chats/Chats.jsx:58-79` (the handler never calls `setConversations` for an incoming message), `:59` (one fetch on mount), `:198` (only a new conversation is prepended); [chat baseline](../../tests/visual/screens.spec.js-snapshots/chat-light-desktop-1440x900-chromium-win32.png).
**Suspected cause:** the optimistic/socket path was implemented for the open thread only; the list was never given a `lastMessage` reducer or an ordering update.
**Suggested fix:** in the `message:new` handler, update the matching conversation's `lastMessage`/`lastMessageAt`, move it to the front, and derive the preview/type icon; also update it from the send ack so own messages reflect immediately.

**Status:** Open — waiting for approval.

---



- **SD-001 — Username policy.** Registration requires at least two digits and has no charset restriction; the spec requires 3–20 characters matching `a-z 0-9 _`. Uppercase input is accepted and lowercased. (`backend/src/validation/auth.js:4`, `backend/src/models/User.js:14`).
- **SD-002 — No account lockout.** Repeated failed logins are only limited by the shared 20 requests/15 min limiter; the spec asks for a short lockout after repeated failures (AUTH-015 partially implemented).
- **SD-003 — Missing REST endpoints.** `GET /conversations/:id/media` was implemented on 2026-10-26 (`type=image|audio|file`, cursor pagination, participant check) as part of BUG-060. Still missing: `GET /conversations/:id`, `POST /users/me/avatar` (avatar upload is absent), and admin promote/demote routes. Profile view has no shared-media data.
- **SD-004 — Signed upload URLs.** Resolved on 2026-10-26 for client playback/download as part of the BUG-058/059 fixes: `GET /api/uploads/:id/link` issues a signed, 1-hour URL to the owner or a conversation participant, and the client fetches media with the bearer token. `POST /api/uploads` still returns metadata only (no URL), which is now consistent with the documented flow.
- **SD-005 — TURN credentials are static.** `GET /api/calls/ice-config` returns long-lived credentials read from `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` env vars; the spec requires short-lived TURN credentials generated server-side.
- **SD-006 — Duplicate registration reveals account existence.** `POST /auth/register` returns 409 when an email/username already exists; the spec says register errors must not reveal whether an email exists.

## Phase 10 findings (reproduced 2026-10-26)

### BUG-078: Conversation mute is not implemented — the field exists but no API, UI, or enforcement does

**Severity:** S2
**Feature:** Per-conversation mute (5.13)     **Found in test:** MUTE-001…MUTE-004 (`backend/tests/api/notifications.test.js`), MUTE-101 (`frontend/src/features/chats/notification-rules.test.jsx`), "a mute control exists for the open conversation" (`tests/e2e/notification-flows.spec.js`; all expected-fail)
**Environment:** API + web unit + Chromium E2E, 2026-10-26
**Steps to reproduce:**
1. `PATCH /api/conversations/:id` with `{ "mutedUntil": "<now + 1h ISO>" }` as a member: the response is 200 but `participants[].mutedUntil` is still `null` and the database value is `null`.
2. Repeat with `null` (unmute) and with `"not-a-date"`: both return 200; the invalid timestamp is silently ignored instead of rejected with 400.
3. Open a conversation in the app and look for a mute action (row menu, header, or info panel): none exists, so a user cannot mute for 1 hour, 8 hours, or until unmuted.
4. Even if the field were written, the incoming-message handler in `Chats.jsx` never checks it, so a muted conversation would still raise unread, title, toast, and desktop notifications.
**Expected:** per `Testing.md` 5.13, a member can mute a conversation for 1 hour, 8 hours, or until unmuted; the choice persists per participant and expires on the clock; while muted no toast, unread count, title change, sound, or desktop notification is produced, and notifications resume after expiry.
**Actual:** the route ignores `mutedUntil` (`const { name, avatarUrl, theme } = req.body`), the client has no mute control, and `message:new` handling never consults the participant mute. MUTE-005 (non-member gets 403) passes, proving authorization is not the gap — the feature itself is missing.
**Evidence:** `backend/src/routes/conversations.js:62-71`; `backend/src/models/Conversation.js:10` (model field only); `frontend/src/features/chats/Chats.jsx:62-79`; `docs/testing/evidence/phase10-api-notifications.log`, `phase10-web-notifications.log`, `phase10-e2e-notifications.log`.
**Suspected cause:** `mutedUntil` was added to the schema early but no route, store action, UI, or notification guard was ever built around it.
**Suggested fix:** accept `mutedUntil` (ISO date or `null`) in `PATCH /conversations/:id` with zod validation and per-participant write; expose mute in the conversation row menu and info panel (1 h / 8 h / until unmuted); include `mutedUntil` in the conversation payloads; in the client, skip unread/title/toast/desktop/sound when the participant's mute is in the future, and re-evaluate by clock so expiry resumes notifications.

**Status:** Open — waiting for approval.

---

### BUG-079: Incoming messages never play a notification sound

**Severity:** S2
**Feature:** Notification sounds (5.13)     **Found in test:** SOUND-101 (`frontend/src/features/chats/notification-rules.test.jsx`; expected-fail). SOUND-102 passes only because nothing ever plays.
**Steps to reproduce:**
1. Sign in, click anywhere (user gesture), and keep the conversation closed.
2. Have another user send a message: the toast and title update, but no sound is heard, and no `Audio` object is constructed (`Audio` is stubbed in the unit test and never called).
3. Look for a sound toggle in Settings: there is no Settings screen; the store's `soundEnabled` flag exists but no code reads it.
**Expected:** a soft sound for incoming messages, toggleable and persisted, enabled only after the first user interaction per browser autoplay rules (5.13).
**Actual:** there is no notification-sound code path. The only `AudioContext` in the app is the voice-recording level meter (`Chats.jsx:345-363`), unrelated to notifications.
**Evidence:** `frontend/src/store/notifications.js` (`soundEnabled` has no consumer); `frontend/src/features/chats/Chats.jsx:62-79`; `docs/testing/evidence/phase10-web-notifications.log`.
**Suspected cause:** sound settings were modeled in the store during Phase 5, but the Phase 13 notification work has not been built; no audio asset exists.
**Suggested fix:** add a short notification sound asset, unlock playback on the first user gesture, play it from the `message:new` handler only when `soundEnabled` and the conversation is not open/muted, and add the sound toggle to Settings.

**Status:** Open — waiting for approval.

---

### BUG-080: Clicking a desktop notification does not focus the app or open the conversation

**Severity:** S2
**Feature:** Browser notifications (5.13)     **Found in test:** "clicking a desktop notification focuses the app and opens the conversation" (`tests/e2e/notification-flows.spec.js`; expected-fail, Chromium)
**Steps to reproduce:**
1. With desktop notifications enabled, hide the tab and have the peer send a message.
2. A notification appears with title "New message" and the text preview, but `notification.onclick` is `null`.
3. Clicking it does nothing: the tab is not focused and the conversation is not opened.
**Expected:** per `Testing.md` 5.13, clicking a notification focuses the window and opens the right conversation (and clears its unread count).
**Actual:** `new Notification('New message', { body })` is constructed without keeping the conversation id and without an `onclick` handler.
**Evidence:** `frontend/src/features/chats/Chats.jsx:75-77`; `docs/testing/evidence/phase10-e2e-notifications.log`.
**Suspected cause:** the notification was implemented as a fire-and-forget call; there is no navigation hook to select a conversation from outside the list click path.
**Suggested fix:** set `notification.onclick` to focus `window`, select the referenced conversation (shared selection helper usable by list and notification), clear its unread count, and close the notification.

**Status:** Open — waiting for approval.

---

### BUG-081: Desktop notification previews cannot be turned off

**Severity:** S3
**Feature:** Notification previews (5.13)     **Found in test:** PREVIEW-101 (`frontend/src/features/chats/notification-rules.test.jsx`; expected-fail)
**Steps to reproduce:**
1. Enable desktop notifications and hide the tab.
2. Receive a message: the notification body always contains the message text.
3. Look for a "show preview" setting: none exists, and there is no `previewEnabled` state; setting one in the store has no effect.
**Expected:** message previews in browser notifications can be switched off in settings; with previews off, the notification shows the sender/title only.
**Actual:** the body is always `m.message.text || 'Attachment'` and no preview toggle exists.
**Evidence:** `frontend/src/features/chats/Chats.jsx:76`; `frontend/src/store/notifications.js` (no preview field); `docs/testing/evidence/phase10-web-notifications.log`.
**Suspected cause:** the desktop-notification path predates the settings work and was never parameterized.
**Suggested fix:** add a persisted `previewEnabled` defaulting to on, add the toggle to Settings, and pass the body only when enabled (sender name/title otherwise).

**Status:** Open — waiting for approval.

---

### BUG-082: Desktop notifications are skipped in a visible but unfocused tab

**Severity:** S2
**Feature:** Browser notifications (5.13)     **Found in test:** FOCUS-101 (`frontend/src/features/chats/notification-rules.test.jsx`; expected-fail)
**Steps to reproduce:**
1. Enable desktop notifications and keep the chat tab visible but put another application or window in front, so the tab never fires `visibilitychange`.
2. Receive a message while `document.hidden === false` and `document.hasFocus() === false`.
3. Nothing appears: the desktop-notification branch requires `document.hidden`, so a visible-but-unfocused tab is treated like a focused one.
**Expected:** per `Testing.md` 5.13, the browser notification is shown when the tab is hidden **or** unfocused.
**Actual:** the guard is `desktopEnabled && document.hidden && 'Notification' in window`; `document.hasFocus()` is never consulted.
**Evidence:** `frontend/src/features/chats/Chats.jsx:75`; `docs/testing/evidence/phase10-web-notifications.log`.
**Suspected cause:** the condition was written for the hidden-tab case only, and focus state was never wired in.
**Suggested fix:** show the notification when `document.hidden || !document.hasFocus()`, re-evaluating focus at message time (no listener needed), while still suppressing it for the open, muted, or own-message cases.

**Status:** Open — waiting for approval.

---

### BUG-083: Any participant can forge `system` and `call` message types

**Severity:** S2
**Feature:** Message types / group system notices (5.8, 6.3)     **Found in test:** SOCK-AUTHZ-007 (`backend/tests/security/socket-authorization.test.js`; expected-fail)
**Steps to reproduce:**
1. Sign in as a participant of a direct or group conversation and connect a socket.
2. Emit `message:send` with `type: 'system'`, `text: 'Alice changed the theme to Love'` (and again with `type: 'call'`).
3. Both acks return `{ ok: true }` and the messages are stored and broadcast.
**Expected:** only the server creates `system` and `call` entries (theme changes, joins/leaves, call logs); a client may send only `text`/`image`/`audio`/`file` with its own uploads, per 6.3 and the system-message rules in 4.4/5.8.
**Actual:** the socket handler passes `type` straight to `conversation.createMessage`; `system=true call=true` and both documents persist.
**Evidence:** `backend/src/sockets/index.js:54-68` (no type whitelist); `docs/testing/evidence/phase11-security-run1.log` (`[authz] forged types: system=true call=true`).
**Suspected cause:** the service trusts the caller's `type` because system/call messages share the same creation path; no sender-role check exists.
**Suggested fix:** whitelist user-sendable types in zod and in `createMessage`; reject `system`/`call` from sockets; create those types only inside server actions (theme change, membership change, call lifecycle) with an internal flag.

**Status:** Open — waiting for approval.

---

### BUG-084: Rapid connect/disconnect cycles leak sockets, so presence never goes offline

**Severity:** S2
**Feature:** Presence and privacy (5.2, 5.3)     **Found in test:** SOCK-AUTHZ-005 (`backend/tests/security/socket-authorization.test.js`; expected-fail)
**Steps to reproduce:**
1. Sign in as eve and let alice (who shares a conversation with eve) connect.
2. Connect and immediately disconnect 40 sockets as eve, then open and close one clean socket.
3. Wait 12 s (past the 10 s grace period): alice never receives `presence:update { userId: eve, online: false }`; eve remains "online" indefinitely.
**Expected:** after the last socket is gone for 10 s, `lastSeenAt` is stored and contacts receive an offline update (5.3). Stale sockets must not accumulate.
**Actual:** `socketsByUser.get(userId)` keeps one dead socket per rapid cycle. The `disconnect` handler runs before the async connection handler adds the socket, so it finds no set and returns; the handler then adds the already-closed socket, which never emits `disconnect` again. The set never empties, presence stays online, and memory grows per cycle.
**Evidence:** `backend/src/sockets/index.js:26-37` (awaits before bookkeeping) and `:97-112` (disconnect only deletes known sockets); `docs/testing/evidence/phase11-security-run1.log` (`[authz] eve offline presence after rapid cycles: false`).
**Suspected cause:** socket bookkeeping happens after two `await`s, so connect/disconnect can interleave; there is no `socket.connected` check before insertion and no reconciliation of stale entries.
**Suggested fix:** add the socket to `socketsByUser` synchronously before any `await` (and remove it in `disconnect`), or re-check `socket.connected` after the awaits and abort/clean up when false; optionally prune disconnected sockets on a timer.

**Status:** Open — waiting for approval.

---

### BUG-085: Events emitted immediately after `connect` are silently dropped

**Severity:** S3
**Feature:** Socket reliability (6.3)     **Found in test:** SOCK-AUTHZ-006 (`backend/tests/security/socket-authorization.test.js`; expected-fail)
**Steps to reproduce:**
1. Connect a socket and emit `message:send` in the same tick as the `connect` callback (websocket transport).
2. Repeat 5 times: every attempt times out at 1.5 s and no ack arrives; the message is not created.
3. With the polling transport the same probe usually succeeds, so the failure depends on transport and DB latency.
**Expected:** every socket event is handled or rejected with an ack (6.3); a client that sends during startup must not lose data silently.
**Actual:** `io.on('connection')` awaits `Conversation.find` and `User.find` before registering the event handlers (`socket.on(...)`), so packets that arrive in that window have no listener and are discarded. A caller using acknowledgements sees only a timeout.
**Evidence:** `backend/src/sockets/index.js:26-53`; `docs/testing/evidence/phase11-security-run1.log` (`early emit 0-4 dropped: operation has timed out`).
**Suspected cause:** handlers are registered after async room/presence work rather than at the top of the connection callback.
**Suggested fix:** register all `socket.on` handlers synchronously first, then perform room joins and the presence snapshot; handlers already re-read membership from the DB, so they do not need the joins to exist yet.

**Status:** Open — waiting for approval.

---

### BUG-086: REST rate-limit rejections return HTML with an empty body

**Severity:** S3
**Feature:** REST rate limiting (6.2, 7)     **Found in test:** RATE-001 / RATE-002 (`backend/tests/security/rate-limits.test.js`)
**Steps to reproduce:**
1. Attempt login 21 times within 15 minutes.
2. The 21st response is 429 with `Content-Type: text/html; charset=utf-8`, `Retry-After: 900`, and an empty body.
3. The same happens to `POST /api/uploads` once the global 300-request budget is exhausted.
**Expected:** every API error uses the standard JSON shape (`{ error: { code, message } }`, 7 "Errors"), so clients can show a meaningful message.
**Actual:** express-rate-limit's default handler sends plain text/HTML `{}`-looking output; the client `api()` helper falls back to the generic "request failed" and the UI cannot tell the user to retry later.
**Evidence:** `docs/testing/evidence/phase11-security-run1.log` (`contentType=text/html; charset=utf-8 body={}`).
**Suspected cause:** no custom `handler`/`message` is configured on the three `rateLimit()` instances in `backend/src/app.js`.
**Suggested fix:** give each limiter a JSON handler that emits `{ error: { code: 'RATE_LIMITED', message } }` with `Retry-After`, and have the client surface that message.

**Status:** Open — waiting for approval.

---

### BUG-087: Array- and object-valued inputs reach unguarded code and return 500s

**Severity:** S3
**Feature:** Input validation (6.2, 7)     **Found in test:** INJ-006 / INJ-007 (`backend/tests/security/injection.test.js`; expected-fail)
**Steps to reproduce:**
1. `GET /api/users/search?q=alice&q=bob` → 500 `(req.query.q || "").trim is not a function`.
2. `POST /api/conversations/:id/members` with `{ "userIds": { "$ne": null } }` → 500 `userIds is not iterable`.
**Expected:** a 4xx validation error with a stable code; no internal TypeError text.
**Actual:** Express's query parser returns an array for repeated keys and the routes call string/iterable methods directly; the central error handler echoes `error.message` for 500s (same root as BUG-007/021).
**Evidence:** `backend/src/routes/users.js` (search), `backend/src/routes/conversations.js` (members); `docs/testing/evidence/phase11-security-run1.log` (`[inj] search array q -> 500 …`, `[inj] members operator userIds -> 500 …`).
**Suspected cause:** only `/auth/register` and `/auth/login` use zod; the other routes trust `req.body`/`req.query` shapes.
**Suggested fix:** add zod schemas for these routes (coerce/limit string inputs, require arrays of ObjectIds) and stop echoing messages for 5xx responses (return a generic message).

**Status:** Open — waiting for approval.

---

### BUG-088: Profile updates accept Mongo operator objects; two fields return 500s and `username` runs an operator query

**Severity:** S3
**Feature:** User profiles (5.2), NoSQL injection hardening (6.1)     **Found in test:** INJ-009 (`backend/tests/security/injection.test.js`; expected-fail)
**Steps to reproduce:**
1. `PATCH /api/users/me` with `{ "displayName": { "$ne": null } }` → 500 `User validation failed: displayName: Cast to string failed … model "User"`.
2. Same with `{ "bio": { "$gt": "" } }` → 500 with the Mongoose cast text.
3. `{ "username": { "$regex": ".*" } }` → 409 "Username taken", proving the object reaches `findOne({ username: <operator> })`.
4. `{ "privacy": { "$ne": null } }` → 200; the malformed object is accepted (privacy falls back to defaults) instead of being rejected.
**Expected:** all four payloads → 400 with a stable validation error; no operator object is used in a query or assigned to a document.
**Actual:** the route passes `req.body` fields straight into `findOne`/`Object.assign`, so operators are interpreted by Mongoose and error text leaks model names and paths.
**Evidence:** `backend/src/routes/users.js` (`PATCH /me`), `docs/testing/evidence/phase11-security-run1.log` (`[inj] profile …`). Phase 13 (EXPL-020) shows the same root with a *string* input: a 161-character bio from the profile form → `PATCH /users/me` 500 and the raw Mongoose text `User validation failed: bio: Path 'bio' (…, length 161) is longer than the maximum allowed length (160)` is rendered in the form ([phase13-run3.log](./evidence/phase13-run3.log)); the API probe recorded the same response body ([phase13-api-probe.log](./evidence/phase13-api-probe.log)).
**Suspected cause:** no zod schema on profile updates; authorization is self-scoped, which limits impact but does not validate input.
**Suggested fix:** validate `displayName` (1–50), `username` (3–20, `a-z0-9_`), `bio` (≤160), and `privacy` booleans with zod; build the update from explicitly picked fields; return 400 on any non-string/non-boolean value.

**Status:** Open — waiting for approval.

---

### BUG-089: A malformed upload id on the signed file route returns 500 with a CastError

**Severity:** S3
**Feature:** File serving (6.2, 7)     **Found in test:** UPLOAD-SEC-006 (`backend/tests/security/upload-attacks.test.js`; expected-fail)
**Steps to reproduce:**
1. Obtain a correctly signed URL for any upload id, then change the id segment to `not-an-id` (the signature check runs first, so sign `not-an-id` with the test secret).
2. `GET /api/uploads/not-an-id?exp=…&sig=…` → 500 `{"error":{"code":"INTERNAL_ERROR","message":"Cast to ObjectId failed for value \"not-an-id\" … model \"Upload\""}}`.
3. The sibling `/api/uploads/:id/link` route correctly returns 400 "Invalid upload id".
**Expected:** 400 `BAD_REQUEST` with no internal text, matching the link route.
**Actual:** `serveFile` never validates the id before `Upload.findById`, so Mongoose throws a CastError that the error handler echoes.
**Evidence:** `backend/src/controllers/upload.controller.js:173-191`; `docs/testing/evidence/phase11-security-run1.log` (`[upsec] malformed id file -> 500 …`).
**Suspected cause:** validation exists only in `issueLink`, not in `serveFile`.
**Suggested fix:** add the same `mongoose.isValidObjectId(id)` guard to `serveFile` before the signature/DB work and return 400; keep 5xx bodies generic.

**Status:** Open — waiting for approval.

---

## Phase 12 findings (reproduced 2026-10-27)

### BUG-090: The image lightbox is bundled into the first-paint chunk instead of being lazy-loaded

**Severity:** S3
**Feature:** Bundle performance (`Testing.md` 6.4, 7; `AGENTS.md` 7 "lazy-loaded emoji picker and lightbox")     **Found in test:** PERF-007 (`tests/perf/measure.mjs` plus the production build chunk scan; no automated test yet — the chunk check is a build step)
**Steps to reproduce:**
1. `cd frontend && VITE_API_BASE_URL=http://127.0.0.1:3101/api npm run build`.
2. `grep -l "Close image viewer" dist/assets/*.js` → matches `index-DRbG85mL.js` (374.76 kB, 116.50 kB gzip), the only script `index.html` loads.
3. Load `/login` in Chromium against `vite preview`: the only JS chunk requested is `index-DRbG85mL.js`.
**Expected:** the lightbox code is a separate lazy chunk, fetched when an image is opened, like the emoji picker.
**Actual:** the emoji picker is split correctly (`esm-C78Ba_xb.js`, 329.45 kB / 88.20 kB gzip, requested only when the picker opens), but `MessageList` imports `Lightbox` statically, so every page load pays for the lightbox.
**Evidence:** [phase12-build.log](./evidence/phase12-build.log); [phase12-perf-build.log](./evidence/phase12-perf-build.log) (`jsChunks:["index-DRbG85mL.js"]`, `emojiChunks:["esm-C78Ba_xb.js"]`).
**Suspected cause:** `frontend/src/features/chats/MessageList.jsx:3` and `MediaPanel.jsx:5` statically import `Lightbox` from `MediaBubbles.jsx`.
**Suggested fix:** move `Lightbox` into its own module and load it with `React.lazy` behind the existing `useState` open flag (or `lazy(() => import('./MediaBubbles.jsx'))` for the whole module), then re-run the build and confirm `Close image viewer` is no longer in the index chunk.

**Status:** Open — waiting for approval.

---

### BUG-091: A reconnect never fetches the messages missed while the client was offline

**Severity:** S2
**Feature:** Real-time reliability / reconnect resync (`Testing.md` 6.4; `AGENTS.md` 5.4)     **Found in test:** PERF-005b (`tests/e2e/performance.spec.js:208`; expected-fail)
**Steps to reproduce:**
1. Alice opens the "Perf History" conversation; both clients are connected.
2. Take Alice offline with CDP (`Network.emulateNetworkConditions` offline) and force the engine closed.
3. Bob sends three messages; every `message:send` ack is `{ ok: true }`.
4. Bring Alice back online: the "Reconnecting…" banner clears and `window.__socket.connected` is true.
5. Bob sends a fourth (live) message: it appears in Alice's list. The three missed messages never appear, and no history request is made after reconnect.
**Expected:** after a reconnect the client rejoins its rooms and fetches every message newer than the last one it saw (`AGENTS.md` 5.4, `Testing.md` 6.4 "reconnect resyncs missed messages").
**Actual:** the socket `connect` handler only flips the status banner. `Chats` fetches history in the `active` effect, which does not re-run on reconnect, so anything sent during the outage is invisible until the user switches conversations.
**Evidence:** [phase12-perf-e2e-run4.log](./evidence/phase12-perf-e2e-run4.log) (`x 7 … PERF-005b`, expected fail; the live message is asserted first and passes), [phase12-perf-e2e-run2.log](./evidence/phase12-perf-e2e-run2.log) (same result before harness changes). Phase 13 (EXPL-042) repeated it through the UI: a bubble sent while offline survived the reconnect locally, but the server had 0 copies and no history request ran ([phase13-run3.log](./evidence/phase13-run3.log)).
**Suspected cause:** `frontend/src/lib/socket.js:17-18` sets `status` only; `frontend/src/features/chats/Chats.jsx:81-87` loads history only when `active` changes. The history endpoint also supports only `before=`, not "since" (BUG-051).
**Suggested fix:** on socket `connect`, if a conversation is active, fetch the newest page (or add an `after=<messageId>` cursor server-side) and merge by `_id` without duplicates or scroll jumps.

**Status:** Open — waiting for approval.

---

### BUG-092: Shutdown never completes while a socket client is connected

**Severity:** S3
**Feature:** Server restart / graceful shutdown (`Testing.md` 6.4)     **Found in test:** PERF-006b (`backend/tests/load/shutdown.test.js`; expected-fail)
**Steps to reproduce:**
1. Start the app the way `src/index.js` does (`createServer(createApp(config))` + `attachSocketIO`).
2. Connect one Socket.IO client over WebSocket.
3. Invoke the shutdown shape used by `src/index.js:24`: `server.close(callback)`.
4. The callback does not run within 10 s; the same close with no clients finishes in 1 ms.
**Expected:** `SIGTERM` finishes promptly even with live clients (the process manager must not have to `SIGKILL` it).
**Actual:** `shutdown` calls only `server.close()` and never closes Socket.IO or its connections, so open clients keep the HTTP server open. In the E2E restart harness, the equivalent `io.close()` with two browser clients took **62,055 ms** ([phase12-perf-006-probe.log](./evidence/phase12-perf-006-probe.log)); after the harness additionally called `server.closeAllConnections()`, the restart dropped to **14 ms** ([phase12-perf-006-probe2.log](./evidence/phase12-perf-006-probe2.log)).
**Evidence:** `backend/tests/load/shutdown.test.js` logs `[perf-006b] idle close -> closed in 1 ms` and `[perf-006b] close with 1 socket -> timeout in 10005 ms`.
**Suspected cause:** `backend/src/index.js:22-28` — `shutdown` has no reference to the Socket.IO server (the return value of `attachSocketIO` is discarded) and no connection termination.
**Suggested fix:** keep the `io` instance from `attachSocketIO`, call `await new Promise((resolve) => io.close(resolve))` and `server.closeAllConnections?.()` before `disconnectDatabase()`, with a short timeout as a backstop; then remove the `it.fails` marker.

**Status:** Open — waiting for approval.

---

## Phase 13 findings (reproduced 2026-10-28)

Session: 50 scripted chaotic steps across three users; run 1 and run 3 both completed with 0 step errors ([EXPLORATORY_SESSION.md](./EXPLORATORY_SESSION.md)). Only new defects are filed below; every other anomaly mapped to an existing bug and its evidence was extended.

### BUG-093: The conversation search box is inert — typing never filters the list

**Severity:** S3
**Feature:** Conversation list — search (`AGENTS.md` 4.2)     **Found in test:** EXPL-015 (`tests/exploratory/chaos.spec.js`, steps 15 in run 1 and run 3)
**Steps to reproduce:**
1. Sign in as a user with three conversations.
2. Type `zzz-no-match` into the Search box above the conversation list.
3. Observe all three rows remain; the list does not change, and no empty state appears. Clearing the box also changes nothing.
**Expected:** the list filters to matching conversations (and shows a friendly empty state when nothing matches).
**Actual:** the input is uncontrolled and has no handler; it is decorative.
**Evidence:** [phase13-run1.log](./evidence/phase13-run1.log) and [phase13-run3.log](./evidence/phase13-run3.log) (`15 conversation search filters the list: anomaly — typing a non-matching query left all 3 rows visible`); [phase13-session-run3.json](./evidence/phase13-session-run3.json).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:398` — `<Input placeholder="Search" className="flex-1" />` with no `value`/`onChange`; the rows render straight from `conversations` (line 402).
**Suggested fix:** keep a query in state, filter `conversations` by name and `lastMessage.text` (case-insensitive), and render an empty state when the filter matches nothing.

**Status:** Open — waiting for approval.

---

### BUG-094: "New chat" prepends without deduplication — duplicate rows and React key collisions

**Severity:** S3
**Feature:** Conversation list / starting a 1:1 chat (`AGENTS.md` 5.4)     **Found in test:** EXPL-016 and EXPL-019 (`tests/exploratory/chaos.spec.js`, steps 16 and 19 in runs 1–3)
**Steps to reproduce:**
1. Have three conversations; note the list shows 3 rows and `GET /api/conversations` returns 3.
2. Click **New**, enter the username of a contact you already chat with, accept.
3. Observe 4 rows in the list (the same conversation twice, both with the same `_id` and last-message preview) while the API still returns 3.
4. In the same session, click **New** and enter your own username: the header opens "Chat" and the list grows to 6 rows for 4 server conversations — three rows for the same "Chaos AB" conversation.
5. The browser console logs `Encountered two children with the same key, <conversationId>` (6 times across the two steps).
**Expected:** opening an existing direct chat selects it without adding a row; each row keeps a unique key; the UI row count matches the API.
**Actual:** `startChat` unconditionally prepends the returned conversation, so repeats duplicate the row; React then sees duplicate keys and may duplicate or omit rows on later updates.
**Evidence:** [phase13-run1.log](./evidence/phase13-run1.log), [phase13-run3.log](./evidence/phase13-run3.log) (`16 … rows 3 -> 4 in the UI, while the API still returns 3 conversations`; `19 … rows=6 … api conversations=4`), [phase13-session-run3.json](./evidence/phase13-session-run3.json) (`events`), and [phase13/](./evidence/phase13) screenshots.
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:198` — `setConversations((prev) => [c, ...prev])` after `POST /conversations/direct`; nothing checks whether `c._id` is already present (the mount fetch at line 59 and `startChat` are the only writers).
**Suggested fix:** upsert by `_id` (`prev.some((x) => x._id === c._id) ? prev.map(...) : [c, ...prev]`), or refetch `/conversations` after the POST and let the server order the list; keep `key={c._id}` meaningful by guaranteeing uniqueness.

**Status:** Open — waiting for approval.

---

### BUG-095: Fast conversation switching renders the previous chat's messages under the new header

**Severity:** S2
**Feature:** One-to-one chat — history loading (`AGENTS.md` 5.4)     **Found in test:** EXPL-024 (`tests/exploratory/chaos.spec.js`, step 24 in run 1 and run 3)
**Steps to reproduce:**
1. Open "Chaos AB" (11 bubbles on screen) as Alice.
2. Delay `GET /conversations/<AC>/messages` by 900 ms with an intercepted route.
3. Click "Chaos AC", then click "Chaos AB" again 100 ms later.
4. Wait 2.5 s: the header says "Chaos AB", but the message pane holds 1 bubble containing "Chaos AC"'s only message; the 11 AB bubbles are gone.
**Expected:** the visible messages always belong to the active conversation, and a superseded request never writes into the list.
**Actual:** `openConv` awaits its own history request and calls `setMessages` with no check that the caller is still active; the second history fetch (from the `active` effect) can be overtaken, so AC's response lands last under an AB header.
**Evidence:** [phase13-run1.log](./evidence/phase13-run1.log) and [phase13-run3.log](./evidence/phase13-run3.log) (`24 stale history after a slow conversation switch: anomaly — stale history: header=Chaos AB, bubbles 11 -> 1, AC messages on screen=1`).
**Suspected cause:** `frontend/src/features/chats/Chats.jsx:182-188` (`openConv` `await api(...)` then `setMessages`) and `frontend/src/features/chats/Chats.jsx:81-87` (a second fetch on `active`, also without cancellation); `openConv` is called from row clicks without any generation token.
**Suggested fix:** single source of truth for loading — remove the fetch from `openConv` or guard both with a request generation/`AbortController` and apply the result only when `conversationId === activeRef.current?._id`; clear messages when `active` changes.

**Fix (2026-10-28, approved):** history loading now has a single source of truth. `openConv` only sets `active`; the `active` effect clears `messages`, fetches history, and applies the result only while its own run is still current (a `cancelled` flag set by the effect cleanup). A superseded or unmounted request can no longer write into the visible list, and switching chats never shows the previous chat's bubbles.
**Regression:** `frontend/src/features/chats/chats.test.jsx` — `BUG-095 / CHAT-021: a superseded history response never replaces the active conversation` (a deferred `c2` response is resolved after switching to `c1`). Verified red against the unfixed code ([log](./evidence/bug-095-red.log)) and green after the fix ([log](./evidence/bug-095-web.log)).
**Status:** Fixed 2026-10-28 — awaiting your verification.

---

### BUG-096: A single unbroken 4,000-character word breaks the page layout horizontally

**Severity:** S2
**Feature:** Message rendering / responsive layout (`Testing.md` 6.3; `AGENTS.md` 4.6)     **Found in test:** EXPL-046 (`tests/exploratory/chaos.spec.js`, step 46 in run 1 and run 3)
**Steps to reproduce:**
1. Open a direct chat at 1440×900 and send `'W'.repeat(4000)` (a legal 4,000-character message).
2. Measure `document.documentElement.scrollWidth - window.innerWidth`.
3. Run 3: **59,684 px** of horizontal document overflow; run 1 (with the 100,000-character message from step 10 still present): **842,282 px**. The message pane itself also scrolls horizontally, and the sidebar/composer are pushed off screen.
**Expected:** long tokens wrap inside the bubble; the page never scrolls horizontally (`AGENTS.md` 5.4 accepts 4,000 characters, so this is valid input).
**Actual:** the bubble is capped with `max-w-[60%]`, but the text node has no `overflow-wrap`/`break-words`, and its `w-fit` flex container does not shrink (`min-w-0` missing), so the intrinsic width of the token expands the whole row/main column.
**Evidence:** [phase13-run1.log](./evidence/phase13-run1.log), [phase13-run3.log](./evidence/phase13-run3.log) (`46 long unbroken word does not overflow the page: anomaly — document overflows by 59684px`), [phase13-session-run3.json](./evidence/phase13-session-run3.json).
**Suspected cause:** `frontend/src/features/chats/MessageList.jsx:150` — `{message.text}` inside the bubble without a break class (bubble at lines 128-135 only sets `rounded`/colors/`text-[15px]`); the row is `flex w-fit max-w-[60%]` (line 114) and `main` is a plain `flex-1` (line 413 in `Chats.jsx`).
**Suggested fix:** add `break-words` (`overflow-wrap: anywhere`) to the text node (and to attachment names), add `min-w-0` to the flex row/scroller, and keep `overflow-x: hidden` on the message pane as a backstop; then re-run step 46 and the 390 px viewport check.

**Fix (2026-10-28, approved within the BUG-096 fix):** the text node now wraps with `overflow-wrap: anywhere` (`frontend/src/features/chats/MessageList.jsx:150`), the bubble is constrained to its row (`min-w-0 max-w-full`), and the message row may shrink (`min-w-0`). `anywhere` — unlike `break-word` — also reduces the element's min-content width, so the flex column no longer grows with the token and the page stops overflowing without hiding anything. Attachment names already truncated. No `overflow-x: hidden` backstop was added, so the fix is structural rather than hidden overflow; the chat column was deliberately left untouched because a `min-w-0` there squeezed the phone layout and broke unrelated passing tests.

**Regression:** `tests/e2e/responsive-flows.spec.js` — `wraps a 4,000-character unbroken token without horizontal page overflow [BUG-096]`: sends `'W'.repeat(4000)` through the composer at 1440×900 and asserts both `document.documentElement.scrollWidth - window.innerWidth` and the message pane's `scrollWidth - clientWidth` are `<= 0`. Verified red against the unfixed code (59,596 px document overflow, [log](./evidence/bug-096-red.log)) and green after (both 0 px, [log](./evidence/bug-096-green.log)).

**Status:** Fixed 2026-10-28 — awaiting your verification.

---

## Open questions (spec is silent; observed behavior recorded, not graded)

- **Q-001 — Self-chat.** `POST /conversations/direct` with the caller's own id succeeds and creates a direct conversation with the caller listed twice. No product rule covers this. Phase 13 shows the same path is reachable from the UI: **New** → your own username opens a chat named "Chat" and creates a self conversation (EXPL-019: header "Chat", `self chats=1`; [phase13-run3.log](./evidence/phase13-run3.log)). Should the dialog refuse self-chats, and should the API return 400?
- **Q-002 — Chat with a nonexistent user.** `POST /conversations/direct` accepts any well-formed ObjectId and creates a conversation with a dangling participant. Should this be a 404?
- **Q-003 — Privacy settings visibility.** `GET /users/:id` returns another user's `privacy` object (`showOnlineStatus`, `showLastSeen`, `sendReadReceipts`). The spec lists name/avatar/bio/shared media for profile view; should privacy preferences be public?
