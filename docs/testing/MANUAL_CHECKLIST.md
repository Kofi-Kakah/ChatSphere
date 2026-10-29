# ChatSphere Manual Checklist — calling, device, and platform behavior

Items in this file cannot be covered honestly by automation in this repository. They must be run by a person on real hardware before launch. Automated coverage for the same areas lives in `backend/tests/socket/calls.test.js`, `tests/e2e/call-flows.spec.js`, and the media suites; see `TRACEABILITY.md` for the mapping. Sections A–F are the call/device matrix written in Phase 8; Section G holds the platform and human checks added in Phase 14 from the `Testing.md` §11 seeds.

**Do not write credentials, TURN secrets, or tokens in this file.** Record only pass/fail, build/commit, environment, and evidence paths.

## Environment record (fill in before starting)

| Field | Value |
|---|---|
| Build / commit | |
| Backend URL | |
| Client URL | |
| TURN provider / region | |
| Tester + date | |
| Devices and browsers | |

## A. Calls between real devices and networks (CALL-021)

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| M-CALL-01 | Cross-network 1:1 video call with TURN | Device A on Wi-Fi, device B on mobile data (different carriers if possible). A calls B, B accepts, talk for 60 s. | Both directions carry audio and video for the whole call. `chrome://webrtc-internals` (or Safari Web Inspector) shows at least one **relay** candidate selected on each side, proving TURN is used. | |
| M-CALL-02 | Cross-network audio-only | Repeat M-CALL-01 with the camera denied/off. | Audio flows both ways; no video panels break the layout. | |
| M-CALL-03 | TURN credentials are short-lived | Complete a call, wait past the credential TTL, start another call. | The second call still connects and the ICE endpoint returns fresh credentials (not a stale static pair). This closes SD-005. | |
| M-CALL-04 | Mobile data → Wi-Fi handoff | During an active call, switch device B from mobile data to Wi-Fi. | "Reconnecting…" appears briefly; the call recovers via ICE restart; if it cannot recover, it ends cleanly and logs the call. | |
| M-CALL-05 | Long network outage | Disable B's network for 30+ s during a call, then restore it. | The call ends cleanly (no frozen UI, no camera light left on) and a call-log entry is written. | |

## B. Real cameras, microphones, and browsers (CALL-021)

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| M-DEV-01 | Chrome desktop | Start a call using the real camera and microphone. Toggle mute and camera off/on. | Tracks start/stop, remote side sees the mute/camera state, no echo or feedback loop. | |
| M-DEV-02 | Safari on macOS | Repeat M-DEV-01. | Same behavior; Safari's recording/calling codec path works; no permission crashes. | |
| M-DEV-03 | Firefox desktop | Repeat M-DEV-01. | Same behavior, including device selection and permission prompts. | |
| M-DEV-04 | Android Chrome | Join a call, rotate the device, background the browser briefly, then return. | Audio continues where the platform allows it; the call screen and controls adapt to portrait/landscape; returning restores the call or ends it cleanly. | |
| M-DEV-05 | iOS Safari | Join a video call; lock the screen mid-call; unlock. Switch between earpiece/speaker/Bluetooth. | Audio routes correctly; the call and its controls survive the lock/unlock cycle where iOS permits; failures are reported to the user, never silent. | |

## C. Permissions and controls (CALL-011, CALL-012)

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| M-PERM-01 | Camera denied | Deny camera permission and attempt a video call. | The app offers/continues with audio only, explains what is missing, and does not crash. | |
| M-PERM-02 | Microphone denied | Deny microphone permission and attempt a call. | The call cannot proceed; a clear message explains how to grant permission; no stuck "calling" state. | |
| M-PERM-03 | Recover after granting | Grant permission in browser settings, retry. | The call connects without a reload or a stuck overlay. | |
| M-PERM-04 | Mute and camera truthfulness | Mute, speak loudly; turn the camera off and check the remote view. | The remote side hears nothing while muted and sees the camera-off state; local button state matches the track state. | |

## D. Ringing, state machine, and history (CALL-003…CALL-010, CALL-018)

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| M-STATE-01 | Ring timeout with the real clock | Call an idle user who does not answer; wait 30 s. | Ringing stops on both sides at ~30 s; caller sees "Missed call"; a missed-call log entry and notification exist. | |
| M-STATE-02 | Decline | Callee declines. | Caller sees "Declined" promptly; decline is logged with no duration. | |
| M-STATE-03 | Caller cancels before answer | Callee sees the incoming screen, then the caller hangs up before acceptance. | Callee's ring stops; caller sees a cancelled/missed entry; UI returns to chat. | |
| M-STATE-04 | Busy | Call a user already in a call from a third account. | New caller is told the user is busy; the active call is not disturbed. | |
| M-STATE-05 | Glare | Both users call each other at the same time. | Exactly one call proceeds (deterministic rule); the other side sees a busy/declined state; no stuck overlay on either device; both can call again afterward. | |
| M-STATE-06 | Multi-device ringing | Same account signed in on two devices; another user calls. Accept on device 1. | Device 2 stops ringing immediately and shows the call as answered elsewhere. | |
| M-STATE-07 | Cleanup / camera light | End calls 10 times in a row, alternating who hangs up. | OS camera/mic indicators turn off after every call; no growth in stray "Reconnecting" banners; the 10th call connects normally. | |
| M-STATE-08 | Call history | Make one completed, one declined, and one missed call. Open the Calls tab. | Each entry shows the correct direction, status, peer, and duration; call-back starts a new call to the right person. | |
| M-STATE-09 | Call while chatting | Receive a call while typing/sending in another conversation. | The incoming screen appears without losing the draft; after the call, the conversation and draft are intact. | |

## E. Audio quality, ringtone, and accessibility (Testing.md 6.2, 6.4)

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| M-AUD-01 | Echo and quality | Call on speaker with two devices in the same room; then with headphones. | No painful echo/feedback; echo cancellation works; plugging in headphones mid-call switches output without dropping the call. | |
| M-AUD-02 | Ringtone and autoplay | Call a user who has interacted with the page (gesture made) and one who has not. | Ringtone is audible per the browser's autoplay rules; the app never plays sound before a gesture; mute in the OS/Do Not Disturb behaves sanely. | |
| M-A11Y-01 | Keyboard-only call | Using only the keyboard, start a call, accept an incoming call, toggle mute/camera, and end it. | Every control is reachable with a visible focus ring; focus is trapped in the call overlay and restored to the chat afterward; Esc does not accidentally end a call without confirmation semantics. | |
| M-A11Y-02 | Screen reader | With VoiceOver (macOS/iOS) or NVDA (Windows), receive and answer a call. | The incoming call is announced, controls are labeled ("Accept call", "Decline call", "Mute", "Camera", "End call"), and mute/camera states are announced. | |
| M-A11Y-03 | Always-dark call screens | Toggle Light/Dark/System and open a call screen in each. | Call screens remain dark in both modes, with readable contrast and no theme flash; the rest of the app still follows the chosen mode. | |
| M-RESP-01 | Small screens | Use 360×760 and 390×844 devices; rotate during a call. | Controls remain reachable (≥44px), the local preview does not cover the remote video, and nothing is clipped. | |

## F. Out of scope / blocked

| ID | Item | Status |
|---|---|---|
| M-GRP-01 | Group video calls (mesh, up to 4, join/leave mid-call) | **Not approved and not implemented.** Do not test until the optional Phase 15 is approved. |
| M-WEBKIT-REC | WebKit voice-recording automation | Playwright WebKit on Windows has no `MediaRecorder`; record manually on Safari hardware (see M-DEV-05). |

## G. Platform, device, and human checks outside calling (Testing.md 11)

Added in Phase 14 from the manual-checklist seeds. **None of these has been executed** — they need real hardware, a real OS, or a person. Automated coverage of the same areas is noted where it exists.

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| M-PLAT-01 | iOS Safari voice message | On an iPhone, record and send a voice message (Safari tab and, if available, an installed web app). | The recorder picks a supported container (MP4/AAC), the bubble plays it back, and the duration is correct. Automated coverage stops at the WebM/Opus branch (AUD-002 is PARTIAL/BLOCKED on WebKit). |
| M-PLAT-02 | Locked-screen audio playback | Play a voice message, lock the screen, wait 30 s, unlock. | Playback follows the platform policy and the UI is never left stuck in a "playing" state. |
| M-PLAT-03 | iOS notifications | Grant notifications on iOS, background or close the app, send a message from another device. | A notification appears only when the app is hidden or closed; tapping it focuses the app. If the platform cannot support it, the user is told clearly instead of failing silently (AGENTS gotcha 10). |
| M-PLAT-04 | Do Not Disturb | Enable OS DND, send a message with the tab hidden, then disable DND and repeat. | No banner or sound is delivered during DND and both resume afterwards. |
| M-PLAT-05 | On-screen keyboard | On a real phone, focus the composer and type with the keyboard open. | The composer stays above the keyboard, the last message remains visible, and there is no layout jump after sending. |
| M-RESP-02 | Touch targets and long-press | Tap send, attach, mic, conversation rows; long-press a message. | Targets are ≥44 px, long-press reveals the full date/time, and no interaction depends on hover. |
| M-A11Y-04 | Screen reader over chat flows | VoiceOver or NVDA: register, sign in, open a chat, send and receive, attach an image. | Controls are announced by role and name; incoming messages are announced politely; ticks/unread are conveyed by text or shape, not color alone. |
| M-VIS-01 | Design-board review | Compare every screen in light and dark at 1440, 1024, 768, and 390 px against the design board. | Every difference is either fixed or accepted in writing; the approved 30 baselines match what a person sees. |
| M-THEME-01 | Chat-background readability by eye | Once BUG-050 is fixed: apply each background in both modes and read a conversation. | Text stays readable at phone size and in bright light; any failure is filed with a screenshot. |

## Result log

| Date | ID | Build | Pass/Fail | Notes + evidence path |
|---|---|---|---|---|
| | | | | |
