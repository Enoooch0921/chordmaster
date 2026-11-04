---
version: 1
slug: "src-components-previewpastemenu-tsx"
primary_target: "src/components/PreviewPasteMenu.tsx"
related_targets: ["src/App.tsx", "src/hooks/usePreviewClipboardShortcuts.ts"]
---

# Choose notation on paste

Mode: Operate. Preserve the existing compact chart context-menu style and semantic colors.

THESIS: Copy once without deciding which lane; decide at the destination.
OWN-WORLD: One copy action, a 280px anchored popup, four equal horizontal choices 小節 / 和弦 / 節奏 / 簡譜. Match the existing score utility menus; no new decoration or motion.
STORY: Select measures, copy, select a destination, paste, choose content. Cancelling changes nothing. Reuse the same snapshot for another lane.
FIRST VIEWPORT: A short heading and copy count above four 44px-tall buttons; keep within the window with an 8px margin and a narrow-screen width cap. Show the complete choice row without scrolling.
FORM: Freeze destination and source on opening. Arrow keys, Home/End, Enter, Escape, outside dismissal and focus restoration work. Preserve native text clipboard behavior and reject stale clipboard tokens. Context-menu and keyboard entry points use the same choices.
FINISH: Native Command+C/V and selective paste verified in an isolated local browser origin; user test page kept open. Regression tests cover deferred mutation, cancellation, reuse, preserved lanes and multi-bar operations. Source detector for this component reported no findings. See output/playwright/chord-rhythm-alignment-20261029/verification.md.
