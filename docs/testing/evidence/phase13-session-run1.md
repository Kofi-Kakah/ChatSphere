# Phase 13 chaos session — run 1

Steps: 50 | anomalies: 6 | errors: 0

01. **three clients connect and list their conversations** — ok: 3/2/2 rows
02. **open Chaos AB on alice and bob** — ok: both headers show Chaos AB
03. **baseline message is delivered to the other user** — ok: delivered exactly once to bob
04. **double Enter on one draft** — ok: stored 1 copy
05. **double-click the Send button** — ok: stored 1 copy
06. **ten Enter presses on one draft** — ok: stored 1 copy
07. **whitespace-only message is blocked by the client** — ok: no bubble added
08. **newline-only message is blocked by the client** — ok: no bubble added
09. **4001-character message has no client limit** — ok: accepted (BUG-019: server accepts over-4000 text)
10. **100,000-character paste** — ok: 3121 ms, socket={"connected":true,"id":"xUTeJgNp-4zmpccxAAAA"}, stored=1
11. **HTML and script payload renders as text** — ok: inert in bob DOM
12. **three-emoji and four-emoji sizing** — anomaly: jumbo sizing {"three":15,"four":15}
13. **emoji picker inserts at the caret** — ok: inserted at caret
14. **emoji picker after send** — ok: picker stays open after send
15. **conversation search filters the list** — anomaly: typing a non-matching query left all 3 rows visible
16. **New chat with an existing contact does not duplicate the row** — anomaly: rows 3 -> 4
17. **New chat with an unknown username** — ok: dialogs: [{"type":"prompt","message":"Username to chat with:"},{"type":"alert","message":"not found"}]
18. **New chat cancelled with an empty prompt** — ok: no change
19. **New chat with your own username** — ok: dialogs=["Username to chat with:"] header="Chat" rows=6
20. **profile: 161-character bio** — ok: message: User validation failed: bio: Path `bio` (`zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz...`, length 161) is longer than the maximum allowed length (160).
21. **profile: one-character username** — anomaly: one-character username accepted; message "Saved"
22. **group: three users send at the same time** — ok: all three messages visible to all three users
23. **three-user interleave does not cross conversations** — ok: direct and group messages stayed in their own chats
24. **stale history after a slow conversation switch** — anomaly: stale history: header=Chaos AB, bubbles 11 -> 1, AC messages on screen=1
25. **rapid conversation switching (30 clicks)** — ok: 30 clicks in 7118 ms, header Chaos Group
26. **draft survives switching away and back** — ok: draft restored
27. **info panel toggles 20 times quickly** — ok: aria-pressed=true
28. **media tabs switch 12 times** — ok: selected tab Audio
29. **send 30 messages quickly and check order** — ok: all 30 present in order (41 bubbles)
30. **long unbroken word does not overflow the page** — anomaly: document overflows by 842282px
31. **zero-width and control-looking characters** — ok: rendered
32. **paste an image, send it, and confirm delivery** — ok: pasted image uploaded and delivered to bob
33. **drop a file on the composer** — ok: drop created a chip
34. **send while an upload is still in progress** — ok: blocked with a toast, nothing sent
35. **cancel an in-flight upload** — ok: chip removed
36. **upload a rejected executable** — ok: chip text: "executable.exe"
37. **upload an oversized file** — ok: rejected client-side, toast=true
38. **voice recording start, stop, and send** — ok: voice message delivered to bob
39. **voice recording cancelled** — ok: recording bar closed, nothing sent
40. **lightbox opens and navigates from the Photos tab** — ok: no photo tiles to open
41. **close a tab in the middle of an upload** — ok: server healthy (200) after the tab closed
42. **switch account in one browser** — ok: bob sees 2 rows after login on the same tab
43. **offline send leaves a pending bubble and shows the banner** — ok: banner shown/cleared; offline bubble count 1, server copies after reconnect 0 (BUG-034/BUG-091 tracking)
44. **3 offline flaps while typing preserve the draft** — ok: draft intact
45. **viewport rotation mid-conversation** — ok: horizontal overflow: [{"width":390,"overflow":60528},{"width":768,"overflow":60150},{"width":1440,"overflow":59690},{"width":360,"overflow":60558}] (BUG-067)
46. **200% zoom** — ok: composer 60420px wide, overflow 60198px
47. **scroll up while messages arrive** — ok: scrollTop=0px, new-message pill count=0 (BUG-076 if absent)
48. **browser back and forward** — ok: back/forward stayed inside http://127.0.0.1:5175
49. **keyboard tab order in the composer** — ok: reload logged the user out (BUG-039), session ends keyboard check
50. **console, page errors, and failed requests** — ok: {"console":9,"requestfailed":2}

## Browser events
- [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae21144e67b8c1a4e00947c
- [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae21144e67b8c1a4e00947c
- [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae21144e67b8c1a4e00947c
- [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae21144e67b8c1a4e00947c
- [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae21144e67b8c1a4e00947c
- [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae21144e67b8c1a4e00947c
- [a] console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)
- [a] requestfailed: POST http://127.0.0.1:3101/api/uploads net::ERR_ABORTED
- [a] console: Failed to load resource: the server responded with a status of 400 (Bad Request)
- [a] requestfailed: GET http://127.0.0.1:3101/socket.io/?EIO=4&transport=polling&t=9blqr8gx net::ERR_INTERNET_DISCONNECTED
- [a] console: Failed to load resource: net::ERR_INTERNET_DISCONNECTED