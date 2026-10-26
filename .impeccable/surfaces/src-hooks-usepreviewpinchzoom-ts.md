---
version: 1
slug: "src-hooks-usepreviewpinchzoom-ts"
primary_target: "src/hooks/usePreviewPinchZoom.ts"
related_targets: ["src/App.tsx","src/lib/previewZoom.ts","src/hooks/useSetlistPreviewNavigation.ts"]
---

# Anchored preview pinch zoom

Mode: Operate / Read. Preserve the current chart and toolbar design.

THESIS: The exact score point between the user's two fingers remains there while scaling and after release.
OWN-WORLD: Existing ChordMaster paper, notation, toolbar and one-finger scrolling. No visual restyling.
STORY: Two fingers claim a pinch; move and scale around their midpoint; release without snapping or opening the bar editor; resume normal scroll. Setlist selection and automatic positioning stay paused for the whole gesture.
FIRST VIEWPORT: No per-frame canvas resize or inherited CSS-variable changes through the notation subtree. One transform write per animation frame; canvas/pan extent commits once at release, including a page that still fits inside the viewport.
FORM: Narrow input and rendering refactor. Track stable touch IDs, prevent browser default only for an owned pinch, preserve an ordinary single-finger pan and suppress synthesized click after release. No score data writes.
QUALITY BAR: Browser-emulated multi-touch anchor drift and release shift below1CSSpx; no passive-listener warnings; repeated and long setlist pinches preserve selection; measured style/layout cost compared with the same40-move baseline. Do not claim real-device fps from desktop browser emulation.
FINISH: Unit regression checks, rendered phone/tablet interactions, independent scoped finish review, and updated design behavior documentation.
