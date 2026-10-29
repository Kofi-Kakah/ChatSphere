# Design-board comparison (Phase 9)

Reference: `frontend/public/chatsphere-design-board.png` (13 numbered screens, reusable components, design system, responsive layouts).
App evidence: the 30 approved-pending baselines in [VISUAL_BASELINES.md](./VISUAL_BASELINES.md), the Phase 9 axe log [phase9-axe-run1.log](./evidence/phase9-axe-run1.log), and the source files cited per row.
Reviewed at: 1440×900, 1024×768, 768×1024, 390×844, 360×760 in light and dark.

**How to read the classification**

- **BUG** — deviates from `AGENTS.md`/`Testing.md` and is filed in [BUGS.md](./BUGS.md).
- **SD** — documented deviation/decision in BUGS.md, not counted as a visual defect.
- **OUT** — present on the board but outside the approved specification (social login, splash marketing screen, reactions, followers/posts, video files, notification center). Not a defect; decide at Phase 16 whether to adopt.
- **COSMETIC** — wording, icon style, or exact alignment differs with no functional or accessibility impact.
- **MATCH** — renders as the board intends (allowing for placeholder data).

## Global / design system

| Board element | App today | Class |
|---|---|---|
| ChatSphere logo mark + wordmark on every screen | No logo component or asset; name only in `<title>` | **BUG-073** |
| Browser favicon | `index.html` links `/favicon.svg`; the file does not exist (404, blank tab icon) | **BUG-073** |
| Placeholder app name in one `APP_NAME` constant | No constant; literal `ChatSphere` only in `index.html` | **BUG-073** |
| Side/bottom navigation with Chats, Profile, Settings | No rail, bottom bar, or Settings route | **BUG-040**, **BUG-067** |
| Theme toggle visible in the shell | Theme system works, but there is no toggle outside Settings (which does not exist) | **BUG-040** |
| Light and dark palettes for every screen | Implemented with CSS tokens; both modes verified on login, chat, profile | **MATCH** |
| Inter type scale (board: 32/24/16/14/12) | Inter 400/500/600 with 18/16/15/14/12/11 sizes; no 32/24 display steps | **COSMETIC** (spec's own scale is 12/14/15/16) |
| 4/8/12/16/24/32 spacing rhythm | Tailwind spacing follows the same multiples | **MATCH** |
| ~44 px controls | Phone chat controls measure 32–38 px (search 38, New 38, info 32, attach/mic 36, emoji 37.2, input 38, send 36) | **BUG-068** |
| Primary/danger/neutral contrast | Danger 3.76:1 light, 2.76:1 dark; primary on soft 3.02:1 dark; muted on surface-2 4.44:1 light | **BUG-066** |
| Splash screen with "Get Started" | No splash route | **OUT** |
| Background photograph behind device mockups | Presentation art for the board, not app UI | **OUT** |

## 1–2. Branding, Splash, Login

| Board element | App today | Class |
|---|---|---|
| Splash screen | Absent | **OUT** |
| Logo above the auth card | Absent | **BUG-073** |
| "Welcome Back" + "Sign in to your account" | Heading "Login"; no subtitle | **COSMETIC** |
| Email or username field | Present, placeholder "Email or username" | **MATCH** |
| Password field | Present | **MATCH** |
| "Forgot password?" link | No reset flow exists (not in `AGENTS.md`; no mail infrastructure) | **OUT** |
| Full-width Sign In button | Present ("Sign in") | **MATCH** |
| "Or continue with" Google/Apple | Absent | **OUT** |
| Footer "Don't have an account? Sign Up" | "Create account" link | **MATCH** (wording cosmetic) |
| Card on tinted background | White card, 14 px radius, token bg | **MATCH** |

## 3. Register

| Board element | App today | Class |
|---|---|---|
| "Create Account" heading + tagline | Heading "Register"; no tagline | **COSMETIC** |
| Full name, email, username, password | Same four fields (order: username, email, display name, password) | **MATCH** (order cosmetic) |
| Inline validation | Present; username rule requires two digits instead of the 3–20 `a-z 0-9 _` policy | **SD-001** |
| Social sign-up buttons | Absent | **OUT** |
| Footer "Already have an account? Sign In" | "Sign in" link | **MATCH** |

## 4. Profile

| Board element | App today | Class |
|---|---|---|
| Avatar with camera/edit affordance | Avatar renders; no upload or crop entry point (no `POST /users/me/avatar`) | **SD-003** |
| Display name and handle | Both editable; handle shown as an input rather than read-only text | **COSMETIC** |
| Bio | Editable, single-line input instead of a textarea with a 160-char counter | **COSMETIC** |
| Joined date | Not rendered anywhere | **BUG-074** |
| Posts / Contacts / Followers stats | Absent | **OUT** |
| Edit Profile row | The form itself is the editor | **MATCH** |
| Settings row | No Settings screen | **BUG-040** |
| Privacy row | No privacy controls (show online/last seen, read receipts) | **BUG-042** |
| Help & Support | Absent | **OUT** |
| Log Out row | No logout control anywhere | **BUG-040** |
| Bottom navigation (Chats/Calls/Groups/Profile) | Absent | **BUG-067** (nav), **BUG-063** (Calls) |

## 5. Chat list

| Board element | App today | Class |
|---|---|---|
| Search conversations | Present | **MATCH** |
| New chat action | "New" button opens a username prompt | **MATCH** (style cosmetic) |
| New group action | No group creation UI | **BUG-049** |
| All / Unread / Groups tabs | Absent | **BUG-075** |
| Row avatar with photo | Initials avatar; photo upload unavailable | **SD-003** |
| Row name | "Direct chat" for every direct conversation; real names only in groups | **BUG-044** |
| Presence dot | Never rendered | **BUG-045** |
| "Typing…" preview | Never rendered | **BUG-046** |
| Type icon (photo/audio/file) in preview | Preview renders `lastMessage.text` only; attachments with no caption show an empty preview | **BUG-075** |
| Row preview text | Present, but only from the initial fetch; it never updates when a message arrives (an empty conversation stays preview-less after live messages) | **BUG-077** |
| Last-message time / Yesterday / date | Absent | **BUG-044** |
| Unread badge | Unread counts are tracked in the store but no badge renders | **BUG-075** |
| Mute icon | Absent | **BUG-075** |
| Bottom navigation with unread Chats indicator | Absent | **BUG-067** |
| Dark list palette | Present and token-driven | **MATCH** |

## 6. One-to-one chat

| Board element | App today | Class |
|---|---|---|
| Header avatar + name | Name is "Chat"; no avatar | **BUG-044** |
| Header "online" / "last seen" | No status line | **BUG-045** |
| Video and phone call buttons | No call UI or WebRTC | **BUG-062** |
| Info button | Present; the panel shows shared media only (no profile details, theme picker, or mute) | **BUG-050**, **BUG-075** |
| Tap header to open the other user's profile | Not possible | **BUG-043** |
| Date chip / separators | Today/Yesterday/date separators render | **MATCH** |
| Bubble shape, radius, own/incoming alignment | 16 px radius, right/left, grouped within 5 min with a tail on the last | **MATCH** |
| Timestamp inside the bubble, bottom right | Timestamp row sits outside the bubble; own timestamps use the white tick color (1.05:1 in light) | **BUG-065** |
| Sent/delivered/read ticks | Ticks render, but the client never advances them | **BUG-047** |
| Wallpaper / theme behind messages | Flat `--bg`; no per-chat background | **BUG-050** |
| Emoji, attach, mic, send controls | All present; emoji is a text glyph, not an outline icon | **MATCH** (glyph cosmetic) |
| "New messages ↓" pill | Absent | **BUG-076** |
| Older-history loading on scroll | Not paginated | **BUG-051** |
| Emoji reactions on bubbles | Absent | **OUT** |

## 7. Group chat

| Board element | App today | Class |
|---|---|---|
| Group creation with name/avatar/members | No creation UI | **BUG-049** |
| Header back button, group name, member count | Name renders; no member count, no back button | **BUG-049**, **BUG-067** |
| Sender name and per-user color on incoming bubbles | Not rendered | **BUG-048** |
| "Seen by" summary | No read state | **BUG-047** |
| Group info panel with member list | Absent | **BUG-049** |
| Group typing text ("Ama is typing…") | Absent | **BUG-046** |
| System messages (joins/leaves/renames/theme) | Not rendered for the client | **BUG-049** (creation/membership); theme changes blocked by **BUG-050** |

## 8–9. Video and audio call screens

| Board element | App today | Class |
|---|---|---|
| Always-dark full-screen call overlay | Absent | **BUG-062** |
| Remote video filling the screen, local preview corner | Absent | **BUG-062** |
| Call header (name, duration) and participant thumbnails | Absent | **BUG-062** |
| Control bar: mic, camera, screen share, chat, reactions, end | Absent | **BUG-062** |
| Audio-call screen (avatar, calling…, mute/keypad/speaker/end) | Absent | **BUG-062** (audio-only fallback is part of 5.14) |
| Call-log entries and Calls history | Absent | **BUG-063** |
| Group mesh call with 4 participants | Absent | **OUT** (optional Phase 15, not approved) |

## 10. Media sharing

| Board element | App today | Class |
|---|---|---|
| Photos / Files segmented control | Both tabs exist; shared-media data loads | **MATCH** |
| Video tab | No video messages (out of scope per `AGENTS.md` 5.10 and the BUG-053 note) | **OUT** (replaced by the Audio tab) |
| Audio tab | Present (Phase 11) | **MATCH** (board has no audio tab; spec requires it) |
| 3-column thumbnail grid opening a lightbox | Grid renders; lightbox opens but does not manage focus | **BUG-072** |
| "Send" button in the picker | The composer performs the send | **COSMETIC** (board-only affordance) |

## 11. Emoji picker

| Board element | App today | Class |
|---|---|---|
| Search, categories, recents | Provided by `emoji-picker-react` | **MATCH** |
| Picker follows the app's light/dark mode | Picker follows the OS (`theme="auto"`) even when the app overrides it | **BUG-064** |
| Esc closes the picker | Escape leaves it open | **BUG-052** |
| Large 1–3 emoji messages | Normal text size | **BUG-035** |

## 12. Notifications

| Board element | App today | Class |
|---|---|---|
| Full notification-center screen with grouped cards | No notification screen; toasts and the Notification API are the approved model | **OUT** (screen), toasts MATCH |
| Unread indicators in the tab title | Implemented, but the count is lost on reload | **BUG-038** |
| Own messages in another tab must not notify | They increment unread and toast | **BUG-037** |
| Missed-call notification | Blocked by calls | **BUG-062**, **BUG-063** |

## 13. Chat backgrounds

| Board element | App today | Class |
|---|---|---|
| Background picker with Love / Friendship / Battle previews | No picker, no `data-chat-theme`, no theme styles | **BUG-050** |
| "Set Background" applies to the conversation for everyone | No real-time theme update or system message | **BUG-050** |
| 8 theme × mode combinations at AA contrast | Unreachable (themes do not exist) | **BLOCKED** by **BUG-050** |

## Reusable components

| Board element | App today | Class |
|---|---|---|
| Chat item (avatar, name, preview, time, badge) | Name + preview only | **BUG-044**, **BUG-075** |
| Message bubble (text, time, ticks, tail) | Matches except the timestamp treatment | **BUG-065** |
| Input field ("Type a message…", emoji, attach, mic) | Present | **MATCH** |
| Avatar with online badge | Avatar present; presence dot absent | **BUG-045** |
| Status badge (Online/Offline) | Not rendered | **BUG-045** |
| File preview card (icon, name, size) | Implemented in the message list | **MATCH** |
| Call controls and reactions | Absent | **BUG-062**; reactions **OUT** |
| Notification card | Toast matches the card's role; desktop notification implemented | **MATCH** |
| Buttons: primary, secondary, ghost, icon, send | All variants exist | **MATCH** |

## Responsive layouts

| Board layout | App today | Class |
|---|---|---|
| Phone 360×760: single column, bottom navigation | Two columns: list shrinks to 174 px, chat starts at x = 174 and the document is 604 px wide (horizontal scroll), composer and bubbles clipped; no bottom bar or back button | **BUG-067** |
| Tablet 768×1024: list + chat, side navigation | List 337 px + chat; no side navigation | **BUG-067** |
| Laptop 1024×768: list + chat + info | List 307 + chat 431 + permanent 286 px info; no rail | **BUG-067** |
| Desktop 1440: four panes | List 340 + chat 780 + info 320; no 72 px rail | **BUG-067**, **BUG-040** |
| Touch targets ≥44 px on phones | 8/8 measured controls are 32–38 px | **BUG-068** |
| Composer above an emulated keyboard (390×500) | Composer bottom stays at the viewport bottom; textarea 201 px visible | **MATCH** |
| 200% zoom / reflow | No horizontal scroll; login field 270 px | **MATCH** |

## Dark mode differences

| Area | Result | Class |
|---|---|---|
| Login, register, chat list, chat, profile | Correct token swap; `color-scheme: dark` set | **MATCH** |
| Emoji picker | Stays on the OS palette | **BUG-064** |
| Design-preview screen | Dark primary/soft pairing and danger fail AA | **BUG-066** |
| Chat backgrounds | Not implemented | **BUG-050** |
| Video/audio call screens (always dark) | Not implemented | **BUG-062** |

## Summary of new findings from this comparison

Five deviations were not covered by an existing bug and are now filed:

- **BUG-073** — missing brand assets (favicon 404, no logo, no `APP_NAME`).
- **BUG-074** — profile omits the joined date.
- **BUG-075** — conversation list lacks filter tabs, unread badge, mute icon, and attachment-type preview.
- **BUG-076** — message list is not virtualized and has no "New messages ↓" pill.
- **BUG-077** — the conversation list never updates its preview, time, or order when a message arrives.

Everything else maps to BUG-037/038/040/042/043/044/045/046/047/048/049/050/051/052/058/059/062/063/064/065/066/067/068/072, SD-001/SD-003, or is board-only content outside the approved specification.
