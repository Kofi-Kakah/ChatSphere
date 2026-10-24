# Project Progress

Last updated: 2026-10-24

## Phase checklist

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0. Discovery and plan | Approved | 2026-10-24 | User approved Phase 0 plan, including Vitest. Existing repo is a Vite + React JavaScript starter. MongoDB URI will be read from `MONGODB_URI` at runtime; `.env` remains unopened. |
| 1. Backend foundation | Approved | 2026-10-24 | Server skeleton, zod env validation, Mongoose connection, helmet/cors/rate-limit, error handler, health route, logger, vitest + mongodb-memory-server + supertest tests all passing. |
| 2. Frontend foundation, design system, and light/dark mode | Approved | 2026-10-24 | Vite client shell, Tailwind v4 tokens (light/dark), Inter font, no-flash theme script, zustand persisted Light/Dark/System with tab + OS sync, base UI components, app shell with mock data, /design-preview route. Build passes. |
| 3. Authentication | Approved | 2026-10-24 | User/RefreshToken models, JWT access + rotating refresh cookie, register/login/refresh (rotation + reuse detection)/logout/me, zod validation, rate limiting, bcrypt cost 12, client auth store, single-flight refresh api client, login/register forms, protected routes. Build passes; server tests pass. |
| 4. User profiles | Approved | 2026-10-24 | StorageProvider (local), Upload model, multer upload pipeline with magic-byte validation, sharp EXIF strip + thumbnail, signed URLs, user search, profile view/edit, privacy settings, avatar upload, client profile page. Server tests pass; client build passes. |
| 5. Real-time foundation and presence | Awaiting approval | 2026-10-24 | Raw WebSocket server with handshake JWT auth, multi-tab presence counting, 10s grace before offline, lastSeenAt, presence snapshot/update, client socket manager with reconnect/backoff, connection banner. Server tests pass; client build passes. |
| 3. Authentication | Not started | — | — |
| 4. User profiles | Not started | — | — |
| 5. Real-time foundation and presence | Not started | — | Raw `ws` selected; custom rooms, acknowledgements, rate limits, authentication, and reconnect behavior will need implementation in place of Socket.IO features. |
| 6. One-to-one chat core | Not started | — | — |
| 7. Typing indicators, read receipts, and unread counts | Not started | — | — |
| 8. Group chat | Not started | — | — |
| 9. Emoji picker and composer polish | Not started | — | — |
| 10. File and image messages and photo sharing | Not started | — | Cloudflare R2 selected for production object storage. Video-file messages are also approved. |
| 11. Audio sharing | Not started | — | — |
| 12. Chat background themes | Not started | — | — |
| 13. Notifications | Not started | — | Web Push approved. |
| 14. Video calling | Not started | — | ExpressTURN selected as TURN provider. |
| 15. Group video calls (optional) | Not started | — | Approved by user in Phase 0. |
| 16. Polish, security, QA, and handoff | Not started | — | — |

## Phase 0 decisions and plan

- Client: React + Vite, JavaScript ES modules.
- Realtime: raw browser/server WebSocket (`ws`) at the user's request, replacing the default Socket.IO plan. The application protocol must implement server-controlled conversation membership, acknowledgements, reconnect/resync, validation, and per-event rate limits.
- Product name: ChatSphere.
- Visual direction: use the image the user supplied in chat as the primary reference. It emphasizes charcoal/slate panels, soft gray message surfaces, pale typography, and purple, cyan, and green accents. The existing `public/chatsphere-design-board.png` is an additional reference, with the supplied image taking priority.
- Database: use `MONGODB_URI` from the server process environment, connect with Mongoose, and never display or inspect secret values. The existing `.env` remains unopened; if its variable uses another name, the user can map it to `MONGODB_URI` without sharing the value.
- Chat initiation: users may start conversations by username; existing contacts may also be used.
- Optional scope: Web Push, group video calls (up to the Phase 15 design), and video-file messages approved.
- Production object storage: Cloudflare R2 through its S3-compatible API.
- TURN: ExpressTURN. Server endpoint will mint short-lived credentials from server-side secret configuration; do not expose a static shared secret to the client.
- Test framework: Vitest, approved by the user.
- Repository findings: root-level Vite project; React 19.3.1, Vite 8.3.5, Tailwind CSS 4.3.3. `mongoose@9.11.4` exists in the installed node_modules tree but is not declared in package.json. No server, client/server split, tests, or `docs/PROGRESS.md` existed at discovery.
- Phase 0 plan: after approval, implement only Phase 1 (backend foundation), then report and stop at its approval gate. No feature code is authorized by this Phase 0 plan approval.
