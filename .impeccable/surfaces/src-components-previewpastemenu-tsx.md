---
version: 1
slug: "src-components-previewpastemenu-tsx"
primary_target: "src/components/PreviewPasteMenu.tsx"
related_targets: ["src/App.tsx", "src/hooks/usePreviewClipboardShortcuts.ts", "src/components/preview-edit/PreviewBarMenuActions.tsx", "src/components/preview-edit/PreviewSectionActionMenu.tsx"]
---

# Choose notation on paste

Mode: Operate. Preserve the existing compact chart context-menu style and semantic colors.

THESIS: Copy once without deciding which lane; decide at the destination.
OWN-WORLD: One copy action, a 280px anchored popup, four equal horizontal choices 小節 / 和弦 / 節奏 / 簡譜. Match the existing score utility menus; no new decoration or motion.
STORY: Select measures, copy, select a destination, paste, choose content. Cancelling changes nothing. Reuse the same snapshot for another lane.
FIRST VIEWPORT: A short heading and copy count above four 44px-tall buttons; keep within the window with an 8px margin and a narrow-screen width cap. Show the complete choice row without scrolling.
FORM: Freeze destination and source on opening. Arrow keys, Home/End, Enter, Escape, outside dismissal and focus restoration work. Preserve native text clipboard behavior and reject stale clipboard tokens. Context-menu and keyboard entry points use the same choices.
FINISH: Native Command+C/V and selective paste verified in an isolated local browser origin; user test page kept open. Regression tests cover deferred mutation, cancellation, reuse, preserved lanes and multi-bar operations. Source detector for this component reported no findings. See output/playwright/chord-rhythm-alignment-20261029/verification.md.

## Compact chart menus (2026-11-04)

Context menus now keep copy, insert-before, clear/close and delete in single 44px rows. Paste choices and ending marks open an in-place second level with a labelled back action; Escape returns to its parent and restores focus. The root menu is 366px high at normal text size (previously about 542px), caps width on narrow screens and scrolls only when viewport height requires it. Clear/delete explanations remain available as control titles. The keyboard paste popup still opens directly to the four lane choices.

Section labels expose “在前面插入段落”, including the first section. Insert a named “新段落” / “New section” so structural cleanup retains it, then select its name for editing. Cancelling naming keeps the inserted section; workspace Undo removes it. In setlists, insert immediately before the displayed target even with custom section order. Bar insertion respects the active draft, preserves existing content, and uses the existing undo/cancel history.

Verification: 194 related tests, TypeScript and production build pass. WebKit menu bounds checked at 834×1194, 1194×834, 390×844, 320×568 and 844×390; all fit the viewport. Touch section sheet and naming checked using tablet touch signals. New/changed menu components have no detector findings. Evidence: output/playwright/bar-menu-*.png and section-menu-ipad.png; tmp/compact-menu-tests.log.
