# Security authorization matrix (Phase 11)

Source: `backend/tests/security/authorization-matrix.test.js` (REST) and
`backend/tests/security/socket-authorization.test.js` (Socket.IO).
Evidence: `docs/testing/evidence/phase11-security-run1.log`.

Actors:

- **anonymous** — no access token, no cookie.
- **dave** — authenticated, not a participant of the target conversation.
- **member / owner** — alice (owner of the direct chat and group) or bob where the
  case needs a non-admin member.
- Socket tests use a third client (dave or eve) as the "must not receive" witness.

Legend: **OK** = behaves as expected, **BUG** = expected-fail test pinned to a filed bug.

## REST routes

| ID | Route | anonymous | dave (non-member) | member / owner | Verdict |
|---|---|---|---|---|---|
| AUTHZ-001 | `GET /api/health` | 200 | 200 | 200 | OK (public) |
| AUTHZ-002 | `POST /api/auth/register` | 201 | 201 | 201 | OK (public) |
| AUTHZ-003 | `POST /api/auth/login` | 401 | 200 | 200 | OK (public; bad credentials 401) |
| AUTHZ-004 | `POST /api/auth/refresh` | 401 | 200 | 200 | OK (cookie-scoped) |
| AUTHZ-005 | `POST /api/auth/logout` | 204 | 204 | 204 | OK (idempotent) |
| AUTHZ-006 | `GET /api/auth/me` | 401 | 200 | 200 | OK (self-scoped) |
| AUTHZ-007 | `GET /api/users/search?q=` | 401 | 200 | 200 | OK (self-scoped) |
| AUTHZ-008 | `GET /api/users/:id` | 401 | 200 | 200 | OK (public-to-authenticated profile) |
| AUTHZ-009 | `PATCH /api/users/me` | 401 | 200 | 200 | OK (self-scoped) |
| AUTHZ-010 | `GET /api/conversations` | 401 | 200 | 200 | OK (self-scoped list) |
| AUTHZ-011 | `POST /api/conversations/direct` | 401 | 201 | 201 | OK (any user may start a direct chat) |
| AUTHZ-012 | `POST /api/conversations/group` | 401 | 201 | 201 | OK (creator becomes admin) |
| AUTHZ-013 | `POST /api/conversations/:id/members` | 401 | 403 | 200 | OK (admin only) |
| AUTHZ-014 | `DELETE /api/conversations/:id/members/:userId` | 401 | 403 | 200 | OK (admin only) |
| AUTHZ-015 | `POST /api/conversations/:id/leave` | 401 | **200** | 200 | BUG-014 (non-member leave is a silent no-op instead of 403) |
| AUTHZ-016 | `PATCH /api/conversations/:id` (direct, participant) | 401 | 403 | 200 | OK |
| AUTHZ-017 | `PATCH /api/conversations/:id` (group, non-admin member) | 401 | 403 | **200** | BUG-005 (any member can rename the group; expected 403) |
| AUTHZ-018 | `PATCH /api/conversations/:id` `{theme}` | 401 | 403 | **500** | BUG-004 (theme update crashes; expected 200) |
| AUTHZ-019 | `GET /api/conversations/:id/messages` | 401 | 403 | 200 | OK |
| AUTHZ-020 | `GET /api/conversations/:id/media` | 401 | 403 | 200 | OK |
| AUTHZ-021 | `POST /api/uploads` | 401 | 201 | 201 | OK (upload is owner-scoped by token) |
| AUTHZ-022 | `GET /api/uploads/:id/link` | 401 | 403 | 200 | OK |
| AUTHZ-023 | `GET /api/uploads/:id?exp&sig` | 401 | 403 | 200 | OK (signature alone is not enough) |
| AUTHZ-024 | `GET /api/calls/ice-config` | 401 | 200 | 200 | OK |

Upload-specific probes (`backend/tests/security/upload-attacks.test.js`):

| ID | Case | Result |
|---|---|---|
| UPLOAD-SEC-001 | Random well-formed ObjectId, link and correctly signed file URL | 404 / 404, no oracle |
| UPLOAD-SEC-002 | Unattached upload link: owner vs stranger | 200 / 403 |
| UPLOAD-SEC-003 | Attached upload: participant vs non-participant (link and signed file) | 200 / 403 / 403 |
| UPLOAD-SEC-004 | `../../evil.zip` filename | stored as `evil.zip`, key `file/…`, no traversal |
| UPLOAD-SEC-005 | Malformed id on `/link` | 400 |
| UPLOAD-SEC-006 | Malformed id on the signed file route | **500 with CastError text** — BUG-089 |

## Socket events

| ID | Event / attack | Expected | Result | Verdict |
|---|---|---|---|---|
| SOCK-AUTHZ-001 | dave sends `message:send` into alice↔bob | ack `ok:false`, no message, no `message:new`, pointers unchanged | as expected | OK |
| SOCK-AUTHZ-001 | dave emits `typing:start` / `typing:stop` with a forged `userId` | no `typing:update` reaches alice/bob | as expected | OK |
| SOCK-AUTHZ-001 | dave emits `message:delivered` / `message:read` | alice/bob pointers unchanged | as expected | OK |
| SOCK-AUTHZ-001b | dave forges `message:delivered`/`message:read`; server rebroadcasts `message:status` into the room | no forged `message:status` | forged broadcasts are delivered to alice and bob | BUG-023 |
| SOCK-AUTHZ-002 | `message:send` with forged `userId` / `sender` | stored sender is the authenticated user; eve's read pointer stays null | as expected | OK |
| SOCK-AUTHZ-003 | dave emits `join`, `conversation:join`, `room:join` for alice↔bob | ignored; dave receives nothing | as expected | OK |
| SOCK-AUTHZ-004 | 40 rapid connect/disconnect cycles by dave | established sockets keep working; dave can reconnect and send | as expected | OK |
| SOCK-AUTHZ-005 | After rapid cycles, the user disconnects for good | `presence:update {online:false}` within the 10 s grace | never goes offline (stale socket retained) | BUG-084 |
| SOCK-AUTHZ-006 | Emit `message:send` immediately after `connect` | acknowledged | all 5 attempts time out; event dropped | BUG-085 |
| SOCK-AUTHZ-007 | `message:send` with `type:'system'` and `type:'call'` | rejected, nothing persisted | both accepted and persisted | BUG-083 |
| SOCKET-RATE-001 | 50 parallel `message:send` | ≤ 20 accepted | 50 accepted | BUG-022 |
| SOCKET-RATE-002 | 50 `typing:start` events | ≤ 20 delivered | 50 delivered | BUG-022 |
| SOCKET-RATE-003 | Another user sends while a flood runs | server stays responsive | 14–26 ms round trip | OK |
| — | Oversized payload (> `maxHttpBufferSize`) and malformed payloads | transport close / clean error, server survives | covered by SEC-010 `backend/tests/socket/messages.test.js`; malformed handlers still produce unhandled rejections (BUG-025) | BUG-025 |

## Notes

- `AUTHZ-006/007/009/010` and `AUTHZ-024` intentionally return 200 to dave: the route is
  self-scoped or public to authenticated users, so the matrix asserts self-scoping rather
  than 403. `AUTHZ-021` likewise allows any authenticated user to upload; ownership is
  enforced when the upload is attached or fetched.
- New S1 (security hole / data exposure / crash) findings in this phase: **none**.
  All findings are S2/S3 and are filed in `BUGS.md`.
