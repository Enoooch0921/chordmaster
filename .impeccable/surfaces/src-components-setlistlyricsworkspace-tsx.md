---
version: 1
slug: "src-components-setlistlyricsworkspace-tsx"
primary_target: "src/components/SetlistLyricsWorkspace.tsx"
related_targets: ["src/components/SetlistLyricsWorkspace.css", "src/components/LyricsBook.tsx", "src/components/LyricsSheet.tsx", "src/App.tsx"]
---

# Setlist lyrics reading workspace

Mode: Read. User approved on 2026-11-06: prioritize live reading and song navigation, reorganize the reading flow, and preserve existing A4 print layouts.

Entering setlist lyrics starts in locked continuous reading on desktop, tablet and phone. A stationary toolbar sits outside the scrolling lyrics and outside A4 scaling. Keep explicit Reading and Print layout destinations, previous/next song, numbered current-song selection, current-song section shortcuts, and immediate font-size controls. Advanced font, language and spacing settings expand on demand. Use the existing green semantic UI and 44px control floors; short viewports scroll the bounded toolbar independently.

Reading settings persist on this device, isolated by signed-in account, and stay separate from A4 settings and saved songs. Persist only font, font size, line spacing and language; validate stored values and tolerate unavailable storage. Use whole-song bounds for visible-song selection, preserving explicit jumps until a new reader gesture. Repeated songs retain their setlist-entry identities. Preserve the visible block's position through settings reflow, viewport resizing, focus changes and return from print/edit. Pending scroll frames must not overwrite the reading anchor after a mode change.

Reading omits the repeated gathering title. Highlight the current section as the reader scrolls and reveal its shortcut inside the horizontal section strip without scrolling the page. Focus reading opens a viewport-sized modal surface with section and song navigation; hide unrelated app controls, retain the reading position, trap keyboard focus and support Escape to return. Account for safe-area insets around controls and the bottom of the content.

Responsive layout follows the workspace's available width, including tablet split views. Under 700px, keep previous/current/next song in a fixed footer for thumb access; at 700px and wider, place navigation in the toolbar's first row and reserve the other half for tools. Collapse secondary action labels when space is limited, retain accessible names, and keep all controls at least 44px. Focus mode compresses the narrow toolbar to one row.

Only an explicit Edit action exposes the existing single-song editor, with the original permission and setlist-entry save paths. Done returns to locked reading. Hide the editor's duplicate view toggle because the workspace owns the view. Keep existing undo/redo accessible in the integrated editor. Viewers have no editing entry.

A4 preview scales only the fixed 794px paper; controls remain full-sized. Preserve both readable and compact pagination, print typography, gray numbered song titles, grouping, language pairing, and export geometry. The export action names the chosen A4 layout, and setlist PDF export uses that layout even while reading or editing. Paper and ink stay light in the dark theme; surrounding controls follow semantic theme tokens.

The local review page is `tmp/lyrics-reader-review/index.html`, backed by the real components and preexisting local song snapshots. Its song edits are React-state-only; reading preferences use a dedicated test-page storage identity. No production reads or writes. The dev server is retained for the user's requested review. Verification covers 320/390/768/1024/1280px, short viewport, dark mode, song and section jumps, scroll selection, reading anchors, focus entry/exit and keyboard trap, persistent preferences, emulated touch scrolling, explicit edits, and a real three-page A4 PDF. These are browser checks rather than physical-device tests. Focused App, gesture, performance, navigation, lyrics and reading-preference suites passed 131 tests; typecheck and web build passed.
