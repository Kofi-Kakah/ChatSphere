# Phase 13 chaos session — run2

Steps: 50 | anomalies: 7 | errors: 9

01. **three clients connect and list their conversations** — ok: 3/2/2 rows
02. **open Chaos AB on alice and bob** — ok: both headers show Chaos AB
03. **baseline message is delivered to the other user** — ok: delivered exactly once to bob
04. **double Enter on one draft** — ok: stored 1 copy
05. **double-click the Send button** — ok: stored 1 copy
06. **ten Enter presses on one draft** — ok: stored 1 copy
07. **whitespace-only message is blocked by the client** — ok: no bubble added
08. **newline-only message is blocked by the client** — ok: no bubble added
09. **4001-character message has no client limit** — ok: accepted (BUG-019: server accepts over-4000 text)
10. **100,000-character paste** — ok: 2951 ms, socket={"connected":true,"id":"R1fFzT18ukPqKCAsAAAA"}, stored=1
11. **HTML and script payload renders as text** — ok: inert in bob DOM
12. **three-emoji and four-emoji sizing** — anomaly: jumbo sizing {"three":15,"four":15}
13. **emoji picker inserts at the caret** — ok: inserted at caret
14. **emoji picker after send** — ok: picker stays open after send
15. **conversation search filters the list** — anomaly: typing a non-matching query left all 3 rows visible
16. **New chat with an existing contact does not duplicate the row** — anomaly: rows 3 -> 4 in the UI, while the API still returns 3 conversations
17. **New chat with an unknown username** — ok: dialogs: [{"type":"prompt","message":"Username to chat with:"},{"type":"alert","message":"not found"}]
18. **New chat cancelled with an empty prompt** — ok: no change
19. **New chat with your own username** — anomaly: dialogs=["Username to chat with:"] header="Chat" rows=6 (["CA","C","CA","CG","CA","CA"]), api conversations=4, self chats=1
20. **profile: 161-character bio** — anomaly: PATCH /users/me -> 500 with raw validation text: User validation failed: bio: Path `bio` (`zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz...`, length 161) is longer than the maximum all
21. **profile: one-character username** — anomaly: one-character username accepted (200); message "Saved"
22. **group: three users send at the same time** — ok: all three messages visible to all three users
23. **three-user interleave does not cross conversations** — ok: direct and group messages stayed in their own chats
24. **stale history after a slow conversation switch** — anomaly: stale history: header=Chaos AB, bubbles 11 -> 1, AC messages on screen=1
25. **rapid conversation switching (30 clicks)** — ok: 30 clicks in 7750 ms, header Chaos Group
26. **draft survives switching away and back** — ok: draft restored
27. **info panel toggles 20 times quickly** — ok: aria-pressed=true
28. **media tabs switch 12 times** — ok: selected tab Audio
29. **send 30 messages quickly and check order** — ok: bob got all 30 in order; alice ws events {"ids":30,"duplicated":0,"max":1}, dom {"bubbles":71,"unique":71,"duplicated":0}
30. **zero-width and control-looking characters** — ok: rendered
31. **paste an image, send it, and confirm delivery** — ok: delivered=true, media API 200 items=1
32. **drop a file on the composer** — ok: drop created a chip
33. **send while an upload is still in progress** — ok: blocked with a toast, nothing sent
34. **cancel an in-flight upload** — ok: chip removed
35. **upload a rejected executable** — ok: chip text: "executable.exe"
36. **upload an oversized file** — ok: rejected client-side, toast=true
37. **voice recording start, stop, and send** — ok: voice message delivered to bob
38. **voice recording cancelled** — ok: recording bar closed, nothing sent
39. **lightbox opens and navigates from the Photos tab** — error: locator.waitFor: Error: strict mode violation: getByLabel('Image viewer') resolved to 2 elements:
40. **close a tab in the middle of an upload** — ok: server healthy (200) after the tab closed
41. **switch account in one browser** — ok: bob sees 2 rows after login on the same tab
42. **offline send leaves a pending bubble and shows the banner** — error: locator.click: Test ended.
43. **3 offline flaps while typing preserve the draft** — error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed
44. **viewport rotation mid-conversation** — error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed
45. **200% zoom** — error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed
46. **long unbroken word does not overflow the page** — error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed
47. **scroll up while messages arrive** — error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed
48. **browser back and forward** — error: page.waitForTimeout: Target page, context or browser has been closed
49. **reload keeps the session** — error: page.setViewportSize: Target page, context or browser has been closed
50. **console, page errors, and failed requests** — ok: {"console":8,"requestfailed":1}

## Browser events
- +36.2s [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae212c620dc1964a3229915
- +36.3s [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae212c620dc1964a3229915
- +36.3s [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae212c620dc1964a3229915
- +39.9s [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae212c620dc1964a3229915
- +39.9s [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae212c620dc1964a3229915
- +40s [a] console: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 6ae212c620dc1964a3229915
- +41.6s [a] console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)
- +89.2s [a] requestfailed: POST http://127.0.0.1:3101/api/uploads net::ERR_ABORTED
- +89.9s [a] console: Failed to load resource: the server responded with a status of 400 (Bad Request)