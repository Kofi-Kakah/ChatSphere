# AGENTS.md: Real-Time Chat Application

You are a senior full-stack engineer and product designer building this project **one phase at a time**, with my approval required between phases. Read this whole file before doing anything. On every new session, re-read this file and `docs/PROGRESS.md`, then resume at the current phase. **Never assume approval.**

---

## 1. Mission

Build a real-time chat application. The React frontend talks to the backend over **WebSockets** for everything live, and over REST for auth, uploads, and history.

**Features (all required):**

1. Register and login (with logout and session refresh)
2. User profiles (avatar, display name, username, bio, privacy settings)
3. One-to-one chat
4. Group chat
5. Online status (and last seen)
6. Typing indicator
7. Message timestamps
8. Read receipts
9. Emoji picker
10. File and image messages
11. Photo sharing (images with preview, plus a shared photos gallery per chat)
12. Audio sharing (voice messages and audio files, with a player)
13. Notifications
14. Chat background appearance themes per conversation: **Love, Friendship, Battle** (plus a Default)
15. Video calling
16. **Light and dark mode** across the entire app, including every chat theme
17. MongoDB as the database, accessed through Mongoose

**Stack:** React.js (frontend), Node.js + Express (backend), WebSockets, MongoDB + Mongoose.

---

## 2. Non-negotiable working rules

### 2.1 Step-by-step with approval gates
- Work through the phases in Section 8 **in order**. Do **only** the current phase.
- When a phase is finished, post the **Phase Report** (Section 9) and then **STOP**. Do not write any code for the next phase.
- You may continue only after I reply with an explicit approval such as "Approved" or "Go to Phase N". Questions, feedback, or "looks good, but..." are **not** approval. Apply my feedback, re-report, and wait again.
- Never skip, merge, or reorder phases. Never "get ahead" because it seems efficient.
- If a phase turns out too large, split it and tell me, but still stop at each boundary.

### 2.2 Scope discipline
- Build only what this file specifies. No extra features, libraries, or pages without asking first.
- If something is ambiguous or blocked, **ask me**. Do not guess on product decisions.

### 2.3 Progress tracking
- Maintain `docs/PROGRESS.md`: a checklist of all phases with status (Not started / In progress / Awaiting approval / Approved), date, and notes on decisions or deviations. Update it at the end of every phase.

### 2.4 Git and commands
- Do **not** run `git commit`, `git push`, or any destructive command (`rm -rf`, dropping collections or databases) unless I explicitly ask.
- You may run install, lint, test, build, and dev-server commands.

### 2.5 Secrets and security
- **Never read, print, log, or commit** `.env*` files or secret values. Ask me for the *names* of the variables and I will fill in the values.
- Maintain `.env.example` (server and client) with placeholders only.
- Never log message contents, tokens, or passwords.

### 2.6 Verify against current docs
APIs for React, Socket.IO, Mongoose, WebRTC, and the UI libraries change. Before using a library, check its **official current documentation** for the installed version instead of relying on memory. If you cannot access the docs, say so and ask me.

### 2.7 Tests
- Each phase adds automated tests for its core logic, and all tests must pass before you post the Phase Report.
- Backend: Vitest or Jest + Supertest + `socket.io-client` + `mongodb-memory-server`. Frontend: Vitest + React Testing Library. Confirm the choice in Phase 0.

---

## 3. Tech decisions

Confirm these in Phase 0. If I object to one, use my choice.

| Area | Decision |
|---|---|
| Frontend | React.js with Vite, React Router, **JavaScript** (ES modules). Ask me in Phase 0 if I want TypeScript instead. |
| Styling | Tailwind CSS with design tokens as CSS variables (Section 4.3), so light and dark mode and chat themes are a variable swap |
| Client state | Zustand for app state (auth, socket status, presence, typing, UI); TanStack Query for REST data; socket events update both |
| Message list | `react-virtuoso` (virtualized, reverse infinite scroll, stick-to-bottom) |
| Icons | `lucide-react` |
| Emoji | `emoji-picker-react` (supports light and dark theme), lazy-loaded |
| Real-time transport | **Socket.IO** (runs over WebSocket, with rooms, acknowledgements, and auto-reconnect built in). If I insist on the raw `ws` library, ask me before reimplementing those pieces. |
| Backend | Node.js + Express 5, ES modules, `helmet`, `cors` (strict origin allowlist), `express-rate-limit`, `zod` for validation |
| Database | MongoDB + Mongoose |
| Auth | Short-lived JWT access token (kept in memory on the client) + rotating refresh token in an `httpOnly`, `Secure`, `SameSite` cookie; passwords hashed with `bcryptjs` (cost 12) or `argon2` |
| Uploads | `multer` (memory or temp storage) → validation → `StorageProvider` interface. Local disk for development, structured so S3-compatible storage can replace it later. `sharp` for image thumbnails and metadata stripping; `file-type` for magic-byte checks. |
| Video calls | **WebRTC**, with signaling over the same Socket.IO connection. STUN for development; **TURN is required for production** (configured through env, credentials generated server-side and time-limited). |
| Dates | `date-fns` |

Use two top-level folders, `client/` and `server/`, each with its own `package.json`, unless the repo already has a different layout (inspect first and follow it).

---

## 4. Design system

I have no reference image. Follow this direction. In Phase 0, ask me if I have inspiration or brand colors; if I provide any, they override the values below.

### 4.1 Visual direction
Clean, modern, rounded, friendly messaging UI. Generous spacing, soft borders, subtle shadows, clear hierarchy. Do not copy any existing messenger's branding. Use a placeholder app name in a single constant (`APP_NAME`) until I choose one.

### 4.2 Layout (desktop ≥1280px)

```
┌──────┬────────────────┬─────────────────────────────────┬──────────────┐
│ Rail │ Conversations  │ Chat pane                       │ Info panel   │
│ 72px │ ~340px         │ header / messages / composer    │ ~320px       │
│      │ search + list  │                                 │ (toggleable) │
└──────┴────────────────┴─────────────────────────────────┴──────────────┘
```

1. **Rail (72px):** app logo, nav (Chats, Profile, Settings), the light/dark toggle, and the current user's avatar with a presence dot.
2. **Conversation list (~340px):** search box, filter tabs (All, Unread, Groups), "New chat" and "New group" actions. Each row: avatar with presence dot, name, last-message preview (prefixed "You:" for own messages; a type icon for image, audio, file; replaced by animated "typing…" while someone types), time, unread badge, mute icon.
3. **Chat pane:**
   - **Header:** avatar, name, status line ("online", "last seen today at 14:02", "typing…", or "N members" for groups), a **video call** button, and an info-panel toggle.
   - **Messages:** virtualized list with date separators, grouped bubbles, and a "New messages ↓" pill when the user has scrolled up.
   - **Composer:** emoji button, attach menu (Photo, File), auto-growing textarea, and a mic button that turns into a send button when text is present. Recording replaces the composer with a recording bar.
4. **Info panel (~320px):** profile or group details, **shared media tabs (Photos, Audio, Files)**, the member list (groups), the **chat theme picker**, and the mute toggle.
5. **Bubbles:** radius ~16px; outgoing aligned right in the primary or chat-theme color; incoming aligned left. Messages from the same sender within 5 minutes are grouped (tail only on the last). Each bubble shows its timestamp and delivery or read ticks at the bottom right. In groups, incoming bubbles show the sender name in a per-user color.
6. **Video call screen:** full-screen overlay, **always dark in both modes**, remote video fills the screen, local preview floats in a corner, with a control bar (mic, camera, end).

### 4.3 Design tokens (CSS variables; starting values, verify contrast)

Define every color as a CSS variable on `:root` (light) and `[data-theme="dark"]`. **Components must use tokens only, never hard-coded colors.**

| Token | Light | Dark |
|---|---|---|
| `--bg` (app background) | `#F5F6FA` | `#0B0F19` |
| `--surface` | `#FFFFFF` | `#111827` |
| `--surface-2` | `#F0F2F7` | `#1B2333` |
| `--border` | `#E4E7EC` | `#263041` |
| `--text` | `#101828` | `#F2F4F7` |
| `--text-muted` | `#667085` | `#98A2B3` |
| `--text-subtle` | `#98A2B3` | `#667085` |
| `--primary` | `#4F46E5` | starts near `#5B5BF0` (white text on it must pass 4.5:1) |
| `--primary-soft` | `#EEF2FF` | `#1E2347` |
| `--link-and-focus` | `#4F46E5` | a lighter tint (e.g. `#A5B4FC`) for text links and focus rings on dark surfaces |
| `--bubble-in` / text | `#FFFFFF` + 1px border / `--text` | `#1F2937` / `--text` |
| `--bubble-out` / text | `#4F46E5` / `#FFFFFF` | `#5B54F0` / `#FFFFFF` |
| `--tick-sent` / `--tick-read` (on outgoing bubble) | white at 65% / `#7DD3FC` | same |
| `--online` | `#22C55E` | `#22C55E` |
| `--danger` / `--warning` / `--success` | `#EF4444` / `#F59E0B` / `#16A34A` | slightly lighter variants that pass contrast |

- **Radii:** inputs and buttons 10px, cards and panels 14px, bubbles 16px, avatars full round.
- **Type:** Inter (via the project's font setup). Sizes 12 (meta), 14 (body), 15 (message text), 16 (headings). Weights 400, 500, 600.
- **Motion:** 150 to 200ms ease for hovers and panels. **Respect `prefers-reduced-motion`** by disabling non-essential animation.
- **Icons:** 20px, 1.5px stroke.

### 4.4 Chat themes: Love, Friendship, Battle

A theme is stored **per conversation**, visible to all participants, and changeable by any participant (direct chats) or admins (groups). Each theme overrides tokens **only inside the chat pane**, using `data-chat-theme="love|friendship|battle|default"`, and has its own **light and dark** variants.

| Theme | Mood | Light chat background | Dark chat background | Outgoing bubble | Accent | Pattern (original art, SVG or CSS) |
|---|---|---|---|---|---|---|
| Default | Neutral | `--bg` | `--bg` | `--bubble-out` | `--primary` | none |
| **Love** | Romantic, warm | gradient `#FFE4EC` → `#FFD1DC` | gradient `#2A0F1C` → `#1A0A12` | `#BE185D` (dark: `#9D174D`) | rose `#E11D6A` | soft hearts, pattern opacity ≤ 12% |
| **Friendship** | Cheerful, bright | gradient `#FFF7D6` → `#D9F5EE` | gradient `#0F1F1D` → `#1A1A0F` | `#0F766E` | amber `#F59E0B` | stars and confetti dots, opacity ≤ 12% |
| **Battle** | Intense, competitive | gradient `#E5E7EB` → `#CBD5E1` | gradient `#0A0A0F` → `#1A0B0B` | `#B91C1C` (dark: `#991B1B`) | orange `#F97316` | sharp angular shapes and crossed-blade motifs, opacity ≤ 12% |

Rules:
- Patterns are **original inline SVG or CSS**, never copyrighted images. Bubbles stay **opaque** so text remains readable over any pattern.
- Check **WCAG AA contrast (4.5:1)** for text on every combination: 4 themes × 2 modes = 8 combinations. Adjust the starting values if one fails.
- Optional ambient touch: a brief, subtle animation (e.g. a few floating hearts) when the theme is applied, never continuous, and disabled under `prefers-reduced-motion`.
- Changing the theme posts a **system message** ("Ama changed the theme to Love") and updates every participant in real time.

### 4.5 Light and dark mode requirements
- Three options: **Light, Dark, System** (default System, following `prefers-color-scheme` and updating live when the OS setting changes).
- The choice persists on this device (`localStorage`) and syncs across open tabs.
- **No flash of the wrong theme on load:** apply the theme with a small inline script in `index.html` before React renders.
- Set the CSS `color-scheme` property so native controls and scrollbars match the mode.
- Toggle lives in the rail and in Settings. Everything must support both modes: forms, dialogs, toasts, the emoji picker (pass its theme prop), skeletons, the media viewer, the info panel, and every chat theme. The video call screen is always dark by design.
- Do not invert or tint user-uploaded images.

### 4.6 Responsive behavior
- **≥1280px:** four panes as above.
- **768 to 1279px:** rail + list + chat; the info panel opens as an overlay sheet.
- **<768px:** single pane at a time. List screen → chat screen with a back button; the rail becomes a bottom bar; the info panel and pickers open as full-screen sheets. The composer stays above the on-screen keyboard.

### 4.7 States
Every data view needs **loading** (skeletons shaped like the content), **empty** (friendly with a call to action), and **error** (message with retry) states. Also show a **connection banner** ("Reconnecting…") whenever the socket is down.

---

## 5. Feature specifications

### 5.1 Register and login
- Register: username (unique, 3 to 20 chars, `a-z 0-9 _`), email (unique), display name, password (min 8 chars; reject the most common passwords). Login with email or username + password.
- Inline validation, clear error messages that do **not** reveal whether an email exists.
- Logout invalidates the refresh token. Refresh tokens **rotate** on each use, with reuse detection (reuse revokes the whole token family).
- The client refreshes the access token silently, using a **single in-flight refresh** shared by all tabs and requests.
- Rate-limit login and register; add a short lockout after repeated failures.
- Protected routes redirect to login and return the user to where they were.

### 5.2 User profiles
- Fields: avatar (upload, cropped square), display name, username (changeable with the uniqueness check), bio (max 160), joined date.
- **Privacy settings:** show online status and last seen (on/off), send read receipts (on/off). Reciprocal rule: if I hide my last seen, I can't see others'. If I turn off read receipts, I can't see others' read receipts either (typing indicators and delivery are unaffected).
- View another user's profile from chats (name, avatar, bio, shared media with me). Search users by username to start a chat.

### 5.3 Online status
- A user is **online** if they have at least one active socket (multiple tabs and devices count as one user). When the last socket disconnects, wait a **10-second grace period** before going offline (avoids flicker on refresh), then store `lastSeenAt`.
- Show a green dot on avatars and "online" or "last seen ..." in headers, respecting privacy settings.
- Send presence only to users who share a conversation with that user. Emit once per recipient, not once per shared conversation.
- On connect, the client receives a presence snapshot for its contacts.

### 5.4 One-to-one chat
- Starting a chat with a user finds the existing direct conversation or creates it **atomically** (a unique `directKey` index prevents duplicates even under concurrent requests).
- Send text messages (max 4000 chars). Newest messages load first with **cursor pagination**; scrolling up loads older ones without jumping the scroll position.
- **Optimistic send:** the message appears immediately as "sending" with a client-generated `clientId`, is reconciled with the server copy on ack, and shows a "failed, tap to retry" state if it fails. Server dedupes by `(conversation, sender, clientId)`.
- **Reconnection:** after a reconnect, the client rejoins its rooms and fetches messages it missed since the last one it saw.

### 5.5 Message timestamps
- Stored in UTC, shown in the user's local time zone. Each bubble shows `HH:mm` (locale-aware); hovering or long-pressing shows the full date and time.
- Date separators in the list: "Today", "Yesterday", then a full date.
- The conversation list shows the time for today, "Yesterday", or a short date.

### 5.6 Typing indicator
- Ephemeral socket events, never stored. Emit `typing:start` at most once every ~2 seconds while typing and `typing:stop` on send, blur, or ~3 seconds idle. The receiver auto-expires the indicator after ~5 seconds in case a stop is lost.
- Direct chats show "typing…". Groups show "Ama is typing…", "Ama and Kofi are typing…", or "Several people are typing…". The conversation list preview also shows it.

### 5.7 Read receipts
- States for my outgoing messages: **sent** (single tick, stored on the server), **delivered** (double tick, the recipient's client received it), **read** (double tick in `--tick-read`, the recipient viewed it).
- Store per participant `lastDeliveredMessage` and `lastReadMessage` on the conversation, **not** per-message arrays. Message status is derived from those pointers.
- A message is marked read only when the conversation is open, the tab is visible and focused, and the message has scrolled into view. Marking read clears the unread badge.
- In groups: show a single tick state for the group's aggregate, and "Seen by" (names and times) in a message's details view. Respect each user's read-receipt privacy setting.

### 5.8 Group chat
- Create a group: name, optional avatar, and 2 or more members. Creator is **admin**.
- Admins can rename, change the avatar, add and remove members, and promote or demote admins. Any member can leave (if the last admin leaves, promote the longest-standing member).
- System messages for joins, leaves, removals, renames, and theme changes. Removed users lose access to the history and live events immediately.
- Member list in the info panel, with presence dots.

### 5.9 Emoji picker
- Opens from the composer button as a popover (a bottom sheet on mobile), lazy-loaded so it doesn't bloat the initial bundle. It follows the current light or dark mode, inserts at the cursor position, includes search and recently used, and closes on Esc.
- Messages containing only 1 to 3 emojis render large.

### 5.10 File and image messages, and photo sharing
- Attach from the composer (file picker, plus drag-and-drop and paste for images). Show a preview chip with a remove button, an upload **progress bar**, and cancel.
- **Upload flow (never send file bytes over the socket):** client uploads via REST `POST /api/uploads` → server validates and stores → returns an `uploadId` → client sends `message:send` with `uploadIds`. The server only accepts uploads owned by the sender and not already attached.
- **Images:** allowed JPEG, PNG, WebP, GIF, max 10 MB. **SVG is not allowed** (script risk). Strip EXIF metadata (including GPS) and generate a thumbnail; store width and height so the layout doesn't shift. Click opens a **lightbox** with next and previous across the conversation's photos and a download button.
- **Files:** allowed PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, ZIP, max 25 MB. Render as a card with an icon, name, size, and download.
- **Photo sharing:** the info panel's **Photos tab** shows a grid of every image shared in the conversation (infinite scroll, opens the lightbox); the **Files tab** lists documents.
- Block executable and script types. Never trust the client-supplied MIME type or extension: sniff the magic bytes.

### 5.11 Audio sharing
- **Voice messages:** hold or tap the mic to record with `MediaRecorder`. Show a recording bar with a timer and a live level meter, with cancel and send. Max 5 minutes. Pick a supported MIME type via `MediaRecorder.isTypeSupported` (WebM/Opus on Chrome and Firefox, MP4/AAC on Safari). Handle microphone permission denial with a clear message.
- **Audio files:** allowed MP3, M4A, WAV, OGG, WebM audio, max 20 MB.
- **Player in the bubble:** play and pause, a seekable progress bar with a waveform (or progress bar fallback), duration, and playback speed (1x, 1.5x, 2x). Only one audio plays at a time.
- The info panel's **Audio tab** lists all audio shared in the conversation.

### 5.12 Chat background themes
See Section 4.4. Picker in the info panel shows live previews of Default, Love, Friendship, and Battle in the current light or dark mode. Selecting one updates immediately for everyone in the conversation and persists.

### 5.13 Notifications
- **In-app:** unread badges on conversation rows, a total unread count in the browser tab title (`(3) AppName`), and toast notifications for messages in conversations that are not currently open. Suppress notifications for the conversation the user is actively viewing.
- **Browser notifications:** use the Notification API when the tab is hidden or unfocused. Ask permission **only after a user gesture** (a clear "Enable notifications" button, not on page load). Show the sender and a preview (previews can be turned off in settings).
- **Sounds:** a soft sound for incoming messages (toggleable). Respect browser autoplay rules (sound is enabled only after the first user interaction).
- **Per-conversation mute** (1 hour, 8 hours, until I unmute) and global settings (sound, preview, desktop notifications).
- **Missed calls** create a notification and a call-log message.
- Web Push for fully closed tabs (service worker + VAPID) is **out of scope unless I approve it in Phase 0**.

### 5.14 Video calling
- **1:1 calls** from the chat header of a direct conversation. WebRTC peer connection, with signaling over Socket.IO (`call:*` events).
- Flow: caller taps call → callee gets an **incoming call screen** (accept or decline, with a ringtone) → on accept, offer/answer/ICE exchange → connected. A ring times out after 30 seconds → "Missed call".
- Controls: mute mic, camera on and off, end call, call duration timer, and local preview. Handle denied camera or mic permissions (offer to continue with audio only).
- A user can be in only **one call at a time** (the callee receives `busy` otherwise). If the callee has several devices, accepting on one stops ringing on the others. Offline callee → missed call.
- Connection resilience: detect ICE failure and attempt an ICE restart; show "Reconnecting…" and end the call cleanly if it cannot recover.
- Cleanup: stop **all** media tracks on end so the camera light turns off; close the peer connection; remove listeners.
- **Call log message** in the chat when a call ends ("Video call · 12:34", "Missed video call", "Declined").
- ICE servers come from a **server endpoint** (`GET /api/calls/ice-config`) returning STUN plus short-lived TURN credentials. Never hard-code TURN secrets in the client.
- `getUserMedia` needs HTTPS (localhost is exempt). Note this in the README.
- **Group video calls are out of scope unless I approve the optional Phase 15** (a mesh of up to 4 participants).

---

## 6. Data model and contracts

### 6.1 Mongoose models

| Model | Key fields |
|---|---|
| `User` | `username` (unique, lowercase), `email` (unique), `passwordHash` (`select: false`), `displayName`, `avatarUrl`, `bio`, `lastSeenAt`, `privacy { showOnlineStatus, showLastSeen, sendReadReceipts }`, timestamps |
| `RefreshToken` | `user`, `tokenHash`, `familyId`, `expiresAt` (TTL index), `revokedAt`, `userAgent`, `ip` |
| `Conversation` | `type` (`direct` \| `group`), `participants[] { user, role (admin/member), joinedAt, lastDeliveredMessage, lastReadMessage, mutedUntil }`, `directKey` (unique, sparse, sorted `idA_idB`), `name`, `avatarUrl`, `createdBy`, `theme` (`default` \| `love` \| `friendship` \| `battle`), `lastMessage` (denormalized preview: id, sender, type, text snippet, createdAt), `lastMessageAt` |
| `Message` | `conversation`, `sender`, `type` (`text` \| `image` \| `audio` \| `file` \| `system` \| `call`), `text`, `attachments[] { upload ref, mimeType, size, originalName, width, height, duration }`, `callInfo { mode, status, durationSec }`, `clientId`, timestamps |
| `Upload` | `owner`, `storageKey`, `mimeType`, `size`, `originalName`, `width`, `height`, `duration`, `thumbnailKey`, `attachedTo` (message, set once), `createdAt` (TTL cleanup of orphan uploads after 24h) |

**Indexes:** `Message {conversation: 1, _id: -1}`; unique `Message {conversation, sender, clientId}` (partial, where `clientId` exists); `Conversation {"participants.user": 1, lastMessageAt: -1}`; unique sparse `Conversation.directKey`; `User.username` and `User.email` unique.
Use `.lean()` for read paths. Validate every id as a valid ObjectId before querying.

### 6.2 REST API (all under `/api`, JSON, zod-validated)
- **Auth:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- **Users:** `GET /users/search?q=`, `GET /users/:id`, `PATCH /users/me`, `POST /users/me/avatar`
- **Conversations:** `GET /conversations`, `POST /conversations/direct`, `POST /conversations/group`, `GET /conversations/:id`, `PATCH /conversations/:id` (name, avatar, theme), `POST /conversations/:id/members`, `DELETE /conversations/:id/members/:userId`, `POST /conversations/:id/leave`
- **Messages:** `GET /conversations/:id/messages?before=<id>&limit=30`; `GET /conversations/:id/media?type=image|audio|file&before=<id>`
- **Uploads:** `POST /uploads`, and `GET /files/:id` serving files through **signed, expiring URLs** (HMAC, ~1 hour) with `X-Content-Type-Options: nosniff` and correct `Content-Disposition`. Uploaded files are never served from a public static folder, and access requires being a participant of the conversation.
- **Calls:** `GET /calls/ice-config`

### 6.3 Socket events
Socket authenticates with the access token in the handshake `auth` payload (**never** in the URL query). The **server** decides which rooms a socket joins (`user:{id}` and `conv:{id}` for each of the user's conversations); the client never names rooms. Every client event is **zod-validated, membership-checked, rate-limited, and acknowledged** with `{ ok: true, data } | { ok: false, error }`. Keep `maxHttpBufferSize` small (files go over REST).

| Direction | Event | Payload |
|---|---|---|
| C → S | `message:send` | `{ conversationId, clientId, type, text?, uploadIds? }` → ack `{ message }` |
| C → S | `message:delivered` | `{ conversationId, messageId }` |
| C → S | `message:read` | `{ conversationId, messageId }` (everything up to and including it) |
| C → S | `typing:start` / `typing:stop` | `{ conversationId }` |
| C → S | `conversation:active` | `{ conversationId \| null }` (which chat is open, to suppress notifications) |
| C → S | `call:invite` / `call:accept` / `call:decline` / `call:cancel` / `call:end` | `{ callId, conversationId, mode? }` |
| C → S | `call:signal` | `{ callId, kind: offer \| answer \| candidate, data }` |
| S → C | `message:new` | `{ message }` |
| S → C | `message:status` | `{ conversationId, userId, lastDeliveredMessage?, lastReadMessage? }` |
| S → C | `typing:update` | `{ conversationId, userId, isTyping }` |
| S → C | `presence:snapshot` / `presence:update` | `{ users: [...] }` / `{ userId, online, lastSeenAt? }` |
| S → C | `conversation:created` / `conversation:updated` / `conversation:removed` | `{ conversation }` / `{ conversationId }` |
| S → C | `call:incoming` / `call:accepted` / `call:declined` / `call:busy` / `call:ended` / `call:signal` | call payloads |

---

## 7. Architecture and code conventions

- **Server structure:** `src/config`, `src/models`, `src/routes`, `src/controllers`, `src/services` (business logic, shared by REST and sockets), `src/sockets` (one handler file per concern: presence, messages, typing, receipts, calls), `src/middleware`, `src/validation` (zod schemas), `src/utils`, `src/storage` (`StorageProvider` + local implementation).
- **Client structure:** `src/app` (router, providers), `src/features/{auth,profile,chats,groups,media,calls,notifications,theme}`, `src/components` (shared UI), `src/hooks`, `src/lib` (api client, socket manager, date helpers), `src/store`.
- **One socket manager** on the client: a single connection created after login and destroyed on logout. It registers handlers **once** (clean up listeners in effects; this matters under React StrictMode) and writes into the stores and the query cache.
- **Business logic lives in services**, called by both REST controllers and socket handlers. No logic duplicated between them.
- **Errors:** a central Express error handler; stable error codes; never leak stack traces or raw database errors.
- **Security checklist:** `helmet`, strict CORS (allowlist origin, credentials on), rate limits on REST and per-socket on events, input validation everywhere, NoSQL-injection safe queries (validated types, no raw user objects in filters), React renders message text as **plain text** (never `dangerouslySetInnerHTML`; links auto-detected safely with `rel="noopener noreferrer nofollow"`), authorization checked on **every** REST route and socket event.
- **Accessibility:** semantic HTML, labeled controls, visible focus, keyboard-operable everything (including call controls, emoji picker, and the lightbox), `aria-live="polite"` for new messages and toasts, no meaning conveyed by color alone (ticks and states also have text or icon shape), WCAG AA contrast in both modes and all chat themes.
- **Performance:** virtualized message list, lazy-loaded emoji picker and lightbox, image thumbnails with fixed dimensions, memoized message rows, batched read marking (debounced), no per-keystroke re-render of the whole list.
- Keep components small and clearly named. No dead code. Comments only where the *why* isn't obvious.

---

## 8. Phases

Every phase ends with the Phase Report (Section 9) and a **STOP**.

### Phase 0: Discovery and plan (no feature code)
- Inspect the repo (existing structure, versions, package manager). Verify current docs for Socket.IO, Mongoose, WebRTC, `react-virtuoso`, and the emoji picker.
- Create `docs/PROGRESS.md`.
- **Ask me:** (1) JavaScript or TypeScript for the client; (2) confirm Socket.IO over raw `ws`; (3) app name and any brand colors or design inspiration; (4) MongoDB: local or Atlas, and how I'll provide the connection string; (5) whether I want Web Push (Section 5.13), group video calls (Phase 15), or video-file messages; (6) whether chats may be started with any user by username (default) or require contact requests; (7) where files should live in production (local disk vs S3-compatible); (8) a TURN provider choice, or "decide later"; (9) anything unclear in this file.
- **Done when:** I approve your written plan.

### Phase 1: Backend foundation
- Server skeleton, config and env validation (fail fast on missing variables), MongoDB connection, logging, security middleware, central error handler, health route, `.env.example`, and the test setup.
- **Done when:** the server starts, `/api/health` responds, tests pass.

### Phase 2: Frontend foundation, design system, and light/dark mode
- Vite + React app, router, providers, Tailwind, **design tokens for light and dark** (Section 4.3), Inter font, **the theme system with Light/Dark/System, no-flash script, tab sync** (Section 4.5), base UI components (Button, Input, Avatar with presence dot, Badge, Dialog, Popover, Toast, Skeleton, Tooltip), and the app shell layout (rail, list pane, chat pane, info panel) with mock data.
- A temporary `/design-preview` page showing every component in both modes.
- **Done when:** the shell and components look right in both modes at 1440, 1024, 768, and 390px, and the toggle behaves correctly (including System).

### Phase 3: Authentication
- `User` and `RefreshToken` models, register, login, refresh with rotation and reuse detection, logout, `/auth/me`, rate limiting. Client: forms with validation, silent refresh (single-flight), protected routes, auth store.
- **Done when:** register, login, logout, and refresh all work, and refresh survives page reload and multiple tabs.

### Phase 4: User profiles
- Profile view and edit, avatar upload (with the upload pipeline basics: validation, EXIF stripping, `StorageProvider` local implementation), privacy settings, and user search.
- **Done when:** profile edits persist, avatars display, and search finds users.

### Phase 5: Real-time foundation and presence
- Socket.IO server with handshake auth and server-controlled rooms, the client socket manager, reconnection with token refresh, the connection banner, presence (multi-tab counting, 10s grace, `lastSeenAt`, privacy rules, snapshot on connect).
- **Done when:** two users see each other go online and offline correctly, including with multiple tabs and after a network drop.

### Phase 6: One-to-one chat core
- `Conversation` and `Message` models and indexes, find-or-create direct chat (race-safe), the conversation list, sending and receiving text, cursor pagination with scroll preservation, optimistic send with `clientId` reconcile and retry, timestamps and date separators, reconnect resync.
- **Done when:** two users chat in real time, history paginates, and failed sends can be retried.

### Phase 7: Typing indicators, read receipts, and unread counts
- Typing events (throttled, auto-expiring), per-participant delivered and read pointers, tick states, the "mark read" rules from Section 5.7, unread badges, the reciprocal privacy rules.
- **Done when:** typing, ticks, and unread counts behave correctly with the chat open, closed, and in a background tab.

### Phase 8: Group chat
- Create group, roles, member management, leave, system messages, the group info panel, sender names and colors in bubbles, group typing text, and "Seen by".
- **Done when:** all group operations work in real time and removed members lose access immediately.

### Phase 9: Emoji picker and composer polish
- Lazy-loaded, theme-aware emoji picker, insert at cursor, jumbo emoji rendering, auto-growing textarea, Enter to send and Shift+Enter for a new line, and draft persistence per conversation.
- **Done when:** the picker works in both modes on desktop and mobile.

### Phase 10: File and image messages and photo sharing
- The full upload pipeline from Section 5.10: validation with magic bytes, thumbnails, signed URLs, progress, cancel, drag-and-drop and paste, image and file bubbles, the lightbox, and the shared **Photos** and **Files** tabs.
- **Done when:** images and files send and receive, invalid types and oversized files are rejected clearly, and private files can't be fetched by non-participants.

### Phase 11: Audio sharing
- Voice recording, audio file upload, the in-bubble player (speed, seeking, one-at-a-time), the **Audio** tab, and Safari and Chrome codec handling.
- **Done when:** voice messages and audio files work across Chrome and Safari, and permission denial is handled.

### Phase 12: Chat background themes
- Theme field and API, the picker with live previews, the Love, Friendship, and Battle variants in light and dark, real-time sync, the system message, and the contrast check for all 8 combinations.
- **Done when:** themes apply instantly for both participants, persist, and pass the contrast check.

### Phase 13: Notifications
- In-app unread and title badge, toasts, the Notification API flow (permission on gesture), sounds with autoplay rules, mute options, and settings.
- **Done when:** notifications fire only when appropriate (not for the open chat, muted chats, or the sender's own messages).

### Phase 14: Video calling
- Signaling events, the call state machine, the ICE config endpoint, incoming and active call screens, controls, busy and timeout handling, ICE restart, cleanup, and call-log messages.
- **Done when:** two real devices can complete a call (including across different networks if a TURN server is configured), and a declined, missed, and ended call each log correctly.

### Phase 15 (optional, only if I approved it in Phase 0): Group video calls
- Mesh calls for up to 4 participants with a grid layout, join and leave mid-call.

### Phase 16: Polish, security, QA, and handoff
- Loading, empty, and error states everywhere; responsive pass at 1440, 1024, 768, and 390px; accessibility pass (keyboard, focus, screen-reader labels, contrast in both modes and all themes); performance pass with a long conversation (10,000+ messages); a security review against the Section 7 checklist; the full test suite.
- Write `README.md` (setup, env vars, scripts, HTTPS and TURN notes, deployment guide).
- **Done when:** the Section 11 checklist is complete and I approve.

---

## 9. Phase Report (post this at the end of every phase, then STOP)

```
## Phase N complete: <name>

**What I built:** (short bullets)
**Files added or changed:** (list)
**How to verify:** (exact steps for me to try, including how to test with two users or two browsers)
**Checks run:** lint / tests / build: pass or fail (with output if failing)
**Light and dark mode check:** (UI phases) what I verified in each mode
**Decisions and deviations:** (anything I should know about)
**Needs from you:** (env values, accounts, questions)

Reply "Approved" to proceed to Phase N+1, or tell me what to change.
```

---

## 10. Known gotchas (read before coding)

1. **React StrictMode** runs effects twice in development: register socket listeners once and clean them up, or messages will duplicate.
2. Compare Mongo ids as strings (`String(id)` or `.equals`), never with `===` on ObjectIds.
3. Creating a direct conversation is a race: rely on the unique `directKey` index and handle the duplicate-key error by fetching the existing one.
4. Reconcile optimistic messages by `clientId`, never by array position, and keep ordering stable when the server copy arrives.
5. Prepending older messages must preserve the scroll anchor (use Virtuoso's prepend support).
6. Refresh-token rotation breaks with multiple tabs unless refresh is **single-flight** (one shared in-flight request).
7. Cookie and CORS setup: CORS needs `credentials: true` and an explicit origin (not `*`); the client needs `withCredentials`; the socket needs the same.
8. `getUserMedia` and `MediaRecorder` need a secure context; Safari lacks WebM recording (feature-detect the MIME type).
9. Browsers block audio until a user interaction, so notification sounds and ringtones must be unlocked by a prior click.
10. iOS Safari supports the Notification API only for installed web apps; show a helpful message instead of failing silently.
11. WebRTC across different networks needs TURN. Calls that work on one Wi-Fi network but fail across networks mean TURN is missing or misconfigured.
12. Always stop media tracks and close peer connections on call end, or the camera light stays on.
13. Revoke object URLs (`URL.revokeObjectURL`) for local previews to avoid memory leaks.
14. SVG uploads can carry scripts, so they stay disallowed. Strip EXIF from photos (it can contain GPS).
15. Don't mark messages read while the tab is hidden or the message is off-screen.
16. Apply the saved theme before first paint, or users see a flash of the wrong mode.

---

## 11. Final checklist (Phase 16)

- [ ] All 17 items in Section 1 work end to end
- [ ] Light, dark, and system modes work everywhere, including all 4 chat themes (8 combinations) with AA contrast
- [ ] No flash of wrong theme on load; the choice persists and syncs across tabs
- [ ] Messages, typing, presence, and read receipts are correct with multiple tabs and devices
- [ ] Reconnect resyncs missed messages and rejoins rooms
- [ ] Uploads are validated by content, private, signed, and unreachable by non-participants
- [ ] Authorization is enforced on every REST route and socket event (tested with a non-member)
- [ ] Video calls connect across networks, clean up media, and log correctly
- [ ] No secrets in the repo or client bundle; `.env.example` is current
- [ ] Keyboard-only use works for chatting, attaching, recording, and calling
- [ ] Loading, empty, error, and offline states exist on every data view
- [ ] Lint, tests, and production build pass with no warnings
- [ ] `README.md` and `docs/PROGRESS.md` are complete and accurate