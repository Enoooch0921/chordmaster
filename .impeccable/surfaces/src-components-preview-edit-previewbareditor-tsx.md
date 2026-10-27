---
version: 1
slug: "src-components-preview-edit-previewbareditor-tsx"
primary_target: "src/components/preview-edit/PreviewBarEditor.tsx"
related_targets: ["src/components/PickupPreview.tsx","src/hooks/useThemeMode.ts","src/styles/dark-ui.css","src/components/ChordSheet.tsx","src/utils/closedBar.ts","src/App.tsx","src/lib/songEditing.ts"]
---

# Notation keyboard, chart cell actions and live theme

Mode: Operate. Scoped adaptation of the existing editor, retaining its controls and musical semantics.

## Direction contract

THESIS: Keep notation entry usable on phone screens, preserve distinct desktop utility rows and keep system theme changes coherent throughout the app UI. No controls should overlap or disappear under adjacent rows. Make clear/close/reopen available from the chart cell itself.

OWN-WORLD: Preserve existing ChordMaster green, UI font, notation glyphs and semantic light/dark surfaces. Keep printable chart paper and ink independent of interface theme.

STORY: Read a chart, open a notation keyboard, enter or modify notes and return to the chart. Desktop hardware entry can hide letter/number rows while retaining utility keys. Right-click a measure to clear its content, close an empty cell or reopen a closed cell, retaining the later music. A system theme change updates labels, form controls and the ChordMaster wordmark together.

FIRST VIEWPORT: Keyboard header and navigation footer remain visible. Key rows have physical height floors; the middle region scrolls at constrained heights. Desktop utility-only chord entry has three distinct rows and a complete header. The right-click menu starts with Clear and Close/Reopen, with brief descriptions before the existing copy/paste and ending controls. Phone jianpu modifiers wrap into two rows, and the phone chord keyboard retains its full docked layout. Weak pickup notation has the same gray marker background as regular notation lanes.

FORM: Scoped responsive adaptation; code-led, no new visual world or concept-seed round. Signature interaction: full keyboard controls stay distinct in portrait, landscape and a reduced visual viewport.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Close an empty chart cell — 2026-10-27

THESIS: Mark an unused existing measure without moving the music that follows it.

OWN-WORLD: Reuse the existing chart's gray 2px unused-cell line and the notation editor's 小節操作 controls. Retain printable chart geometry and current semantic UI colors; no new token, surface or decorative treatment.

STORY: Select an empty bar and choose 關閉此小節 from 小節操作 or the cell's right-click menu. The bar keeps its identity and slot; closing the first cell leaves cells two through four in their original positions. In edit mode, the closed cell remains focusable and opens the same editor; its actual hit target also accepts right-click and Command/Ctrl selection. 重新開啟小節 in either action surface restores it. Entering new content also clears the closed flag. Both close and reopen use the existing draft and undo/redo workflow.

FIRST VIEWPORT: The closed cell displays the same horizontal line as an unused cell, with no printed bar number or notation content. Its edit target covers that cell and has a visible inset focus outline. The existing structure-action grid contains the close/reopen choice and the explanation “只關閉空白格，後面小節不移動”. A nonempty bar shows the disabled close choice; the right-click menu keeps the reason to clear first readable.

FORM: Closing is available only for an empty ordinary bar, outside pickup or individual-voice editing. Emptiness checks every saved field, so notation, annotations, musical context and performance instructions prevent closing. Rendering checks again; an imported or stale closed flag cannot hide content. A closed cell is not absorbed into a preceding multi-measure rest. The saved flag survives supported JSON/workspace and whole-bar copy paths while the original bar positions remain intact.

QUALITY BAR: Preserve cells two through four, musical content, source identities and chart/export geometry. Verify close/reopen, disabled nonempty bars, content entry, stale flags and persistence. This feature is local editing capability; its verification does not write production songs.

## Initial closed-cell evidence

Source: `src/utils/closedBar.ts`, `src/components/ChordSheet.tsx` and `src/components/preview-edit/PreviewBarEditor.tsx`. Tests in `src/utils/closedBar.test.tsx` cover retained slots, multi-measure-rest separation, saved metadata, stale flags and persistence; `src/components/preview-edit/PreviewBarEditor.test.tsx` covers close/reopen, unchanged following bars, disabled nonempty bars and reopening on content entry. Source comparison and synchronization name the change 小節關閉 and show 開啟/關閉 values, with English equivalents. Parent verification passed lint, production build and 405 tests across 11 files; the final comparison-label correction also passed 19 tests across two files and lint.

Captures: `.impeccable/review/closed-bar-20261027/menu.png`, `closed.png`, `menu-mobile.png` and `closed-mobile.png`. The fresh independent closed-cell review returned **SHIP** after the comparison-label correction and recheck, with no remaining material issues. These browser captures do not establish physical-device performance. No shipping raster assets were created.

## Desktop utility rows and direct cell actions — 2026-10-27

This scoped repair preserves the existing green palette, fonts, notation glyphs and keyboard material. It introduces no new visual world or global tokens. It extends the close-cell behavior above without replacing the phone keyboard, voice workflow or live-theme rules.

Desktop chord common mode with letter/number keys hidden uses a panel up to 620px wide and ordinarily 260px high, bounded by the visual viewport with 12px margins. Its three utility rows have 44px minimum heights and 8px gaps; the grid has a 148px floor. Toolbar buttons do not shrink and their labels remain on one line. A short viewport keeps the header visible and scrolls the middle to reach the complete color row. Other notation modes, expanded subdivisions and unmetered content retain their own sizing. The phone keeps the existing full docked keyboard and navigation footer.

The normal bar right-click menu starts with 清空此小節 / Clear this bar, followed by 關閉此小節 / Close this bar when empty or 重新開啟此小節 / Reopen this bar when every selected bar is closed. Labels reflect a multiple-bar selection. Clear explains that it removes content and marks while retaining the cell; Close explains that the horizontal line leaves later bars in place; Reopen restores an empty input cell. If any selected bar is nonempty, Close is disabled while “請先清空小節，再關閉” / “Clear the bar before closing it” remains readable. Emptiness includes every saved field, including annotations, additional voices and context metadata. The append-to-section paste entry retains its separate existing behavior.

Copy selected bars, overwrite paste, paste before/after and ending controls remain below the new actions. The menu uses a 280px width, clamps its origin within 8px viewport margins and limits its height to the remaining viewport; its body scrolls with overscroll containment. The local 5300 layer places it above the 5000 notation keyboard. Arrow Up/Down cycle enabled buttons; Home/End focus the first/last enabled action; Escape dismisses. A closed cell's full-cell hit target is exempt from the ordinary button exclusion for context-menu and modifier-selection events, so the visible line can be reopened directly.

Clear/close/reopen resolve selections by section and bar IDs. Clear retains each affected bar ID and position while removing its contents; close/reopen changes only the closed flag. Unselected bars and songs remain intact, and a nonempty selection cannot be closed. The handler retains editor permission and current-preview identity guards. An active editor receives the change through its draft/undo path; otherwise the existing batch commit records it. No separate immediate-save path is introduced.

## Utility-row and context-menu evidence

Current evidence lives in `.impeccable/review/bar-actions-20261027/`: `direction.md`, `verification.md`, `desktop.png`, `user-991.png`, `context-filled.png`, `context-empty.png`, `closed-first.png`, `context-closed.png`, `mobile.png`, `mobile-context.png`, `short-window.png` and `short-window-scrolled.png`. The browser used synthetic App data at `localhost:3129`.

At 1280×720, the desktop utility panel measured 620×260 with three approximately 45px rows and 8px gaps. Browser checks completed clear → close first cell → right-click the actual closed hit target → reopen → Undo → Cancel, retaining later Dm/F/G positions and restoring the draft without saving. A 390px iframe retained the full mobile keyboard and a bounded context menu. At 700×260, the header stayed visible while the center scrolled to the full color row; the short-window captures show scrollport clipping rather than overlapping keys.

The parent verification reports 328 relevant tests passing after the closed-hit guard correction. The earlier 224-test pass in the initial verification entry preceded that correction; final lint/build and finish-review status are tracked in `verification.md` by the parent. The earlier closed-cell SHIP verdict above belongs to that earlier scope and does not certify this added menu/layout pass. No physical iPad test, deployment, production data access or final user approval is claimed. No new dependencies or shipping raster assets were created. No additional detector pass was run; existing glyphs, small keyboard labels and raised key materials remain local incumbent details.


The final current-pass verification passed 328 tests, lint and production build. The full finish review requested a local dark Key contrast fix; the verdict pass returned `ship` after the inherited and selected labels and chevrons became readable in fresh captures. The Key trigger uses semantic dark colors when inheriting a key and inherits the active foreground for both its value and chevron. Closing the context menu restores the previous connected focus (or the desktop chord capture), keeping hardware entry usable. Final evidence and scope are in `bar-actions-20261027/verification.md` and `review.md`.
