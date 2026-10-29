# Visual baselines (Phase 9)

**Status: approved 2026-10-26.** These are the standard appearance baselines for ChatSphere. A UI change that alters any of these images must be intentional and the baseline regenerated with review; an unintended diff is a regression.

Spec: `tests/visual/screens.spec.js`
Snapshots: `tests/visual/screens.spec.js-snapshots/`
Evidence: [phase9-visual-create.log](./evidence/phase9-visual-create.log), [phase9-visual-run1.log](./evidence/phase9-visual-run1.log), [phase9-visual-update.log](./evidence/phase9-visual-update.log)

## Method

- Playwright 1.64.1, Chromium only (the Firefox/WebKit projects run `tests/e2e/**` only, so cross-browser pixel comparison is not attempted).
- Every screenshot is a full-page capture with `maxDiffPixelRatio: 0.01` and `animations: 'disabled'`.
- Each run registers fresh users (`ava*` / `avb*` prefixes), creates one direct conversation, opens it, then seeds two text messages through the socket and waits for `document.fonts.ready` plus all images before capture.
- The chat is opened **before** seeding. Seeding first raised a 3 s "New message" toast for a not-yet-active conversation, which was captured over the composer (visible in the first generation at phone sizes). Opening first removed the transient overlay deterministically instead of masking it. One consequence is intentional: the row's preview stays empty in the images because the list is not updated live when a message arrives — [BUG-077](./BUGS.md). That is recorded, not masked.

## Coverage: 30 baselines

`<screen>-<mode>-<viewport>-chromium-win32.png` in `tests/visual/screens.spec.js-snapshots/`.

| Screen | Modes | Viewports | Files |
|---|---|---|---|
| `login` | light, dark | 360×760, 390×844, 768×1024, 1024×768, 1440×900 | 10 |
| `chat` | light, dark | 360×760, 390×844, 768×1024, 1024×768, 1440×900 | 10 |
| `profile` | light, dark | 360×760, 390×844, 768×1024, 1024×768, 1440×900 | 10 |

Two older smoke baselines from Phase 1 (`tests/visual/login.spec.js`: light 1440×900, dark 390×844) remain and are still compared; they are a subset of the `login` coverage above.

## Masks (volatile pixels)

- `chat`: every `<time>` element (bubble timestamps) and every `[role="separator"]` (date separators). They are masked with the default magenta block. Clock values and the number of separators depend on the run time.
- `profile`: the username input (a random `vis*` username per run).
- `login`: no mask. The page renders no clock, random data, or animation.

Seeded text, avatar initials, and the conversation name are deterministic and are compared.

## What these baselines deliberately record

A baseline captures **current** rendering, not the intended design. The approved design board differs from most screens (see [DESIGN_BOARD_COMPARISON.md](./DESIGN_BOARD_COMPARISON.md)); the differences below are already filed bugs and are visible in the images:

| Baseline | Visible state | Bug |
|---|---|---|
| all `chat` | no 72 px rail; conversation pane and chat only (login/profile have no shell either) | BUG-040, BUG-067 |
| `chat-*-360x760`, `chat-*-390x844` | two columns squeezed into the phone width: chat pane starts at x = 174 px and is cut at the document edge; bubbles clipped; no back button, no bottom bar | BUG-067 |
| `chat-*-1024x768` | permanent 286 px info column (no rail, no overlay) | BUG-067 |
| `chat-*` | header is `Chat` + `Info`; no avatar, presence line, video-call or call control | BUG-044, BUG-045, BUG-062 |
| `chat-*` | bubbles show only text; own timestamps project outside the bubble in a near-white tick color (1.05:1 in light) | BUG-065 |
| `chat-*` | conversation shown with two messages has an empty preview line in the list (no live preview/order update) | BUG-077 |
| `profile-*` | no privacy controls, no stats, no account-menu rows, no bottom navigation | BUG-042 |

When those bugs are fixed, the affected baselines must be regenerated and re-approved; a green visual run against today's images means "unchanged", not "correct".

## Blocked coverage: chat backgrounds (40 baselines)

The phase requires light and dark × 4 backgrounds (Default, Love, Friendship, Battle) × 5 viewports = 40 images. Only the 10 Default-theme chat baselines exist. The picker, the `data-chat-theme` attribute, and per-theme tokens do not exist in the app ([BUG-050](./BUGS.md)), so Love/Friendship/Battle snapshots would be byte-identical copies of Default. They are reported as **BLOCKED**, not created: blessing duplicates would assert that the themes render identically, which is the bug itself. The **30** non-default images (3 backgrounds × 2 modes × 5 viewports) are outstanding.

The axe suite takes the same position for backgrounds: the Love/Friendship/Battle axe tests are expected-fail on the missing attribute (BUG-050).

## Update procedure

From the repo root:

```bash
npx playwright test --config tests/playwright.config.js --project=chromium tests/visual --update-snapshots=all
npx playwright test --config tests/playwright.config.js --project=chromium tests/visual
```

- `--update-snapshots=all` rewrites all 30 images; use `=changed` to rewrite only diffs, `=missing` to add new viewports.
- Regenerate only after an intentional, reviewed UI change. Review the new images against [DESIGN_BOARD_COMPARISON.md](./DESIGN_BOARD_COMPARISON.md) and the bug list before committing.
- Never update to silence a diff caused by an unexplained layout shift; file a bug instead.
- Baselines are tied to the Windows/Chromium font stack (`-chromium-win32` suffix). Running on Linux or macOS writes a different suffix and the suite reports missing baselines by design.

## Review checklist (for approval)

- [ ] 30 files exist and open cleanly in `tests/visual/screens.spec.js-snapshots/`
- [ ] Light/dark pairs use the token palettes and the same layout
- [ ] Phone images show the current clipping (BUG-067) rather than a hidden workaround
- [ ] Masks cover only timestamps, date separators, and the random username
- [ ] No toast, caret, scrollbar thumb, or hover/focus artifact is captured
- [ ] The 4 chat backgrounds are understood to be blocked by BUG-050
