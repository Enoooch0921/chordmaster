---
version: 1
slug: "src-components-songmetadatapanel-tsx"
primary_target: "src/components/SongMetadataPanel.tsx"
related_targets: ["src/components/PreviewWysiwygEditor.tsx","src/App.tsx"]
---

# Song information

Mode: Operate. Scope: mobile login entry and song metadata editor, plus the desktop chart's song-information popover; preserve existing brand palette, authentication and score semantics.

The user confirmed mobile reading and full editing are equally important. The existing green brand and UI font remain the incumbent authority; this is a component replacement, not a new product identity.

## Direction contract

THESIS: A complete song editor with three direct destinations, so routine musical changes and full metadata editing have equal access. Replace stacked decorative containers with a continuous editing surface.

OWN-WORLD: Inherit ChordMaster green, semantic light/dark surfaces and the existing UI font. Use one continuous sheet, clear field labels, consistent 44–48px controls and deliberate section spacing.

STORY: Open song information, adjust song details, switch directly to chart layout or reference recordings, and return to the same chart position.

FIRST VIEWPORT: Compact header with an explicit Done action; three equal tabs below. Song name leads the default view, followed by credits and paired musical controls. No redundant introductory copy or icon tiles. Header remains visible while the selected tab scrolls.

FORM: Scoped component adaptation inside the established app world; code-led. Concept-seed does not apply to this narrow replacement. Signature interaction: selecting a tab changes the editing job while the chart remains anchored.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Desktop adaptation — 2026-10-28

The user identified the desktop information panel as too large and obscuring the chart. Replace its 900px minimum width with a 480px maximum and 12px viewport margins. Align its right edge with the information trigger, choose above/below placement from available space, and clamp its height to the lesser of 520px and 70vh. Keep the heading visible and scroll only the form on short screens.

Use the existing Song, Chart and Audio destinations for the complete floating editor, without the embedded editor's duplicate heading and nested card. The preview-header variant retains its existing fields, including Capo, in a two-column form without additional tabs. Desktop fields are 36px high, with 12px labels and 13px values; mobile retains its established 48px fields and full editing. Embedded desktop and tablet editors keep their existing presentation.

Verification: 43 focused tests and production build passed. Chromium renders at 1440×1000, 1024×768, 1280×400, 390×844 and 320×640 showed no horizontal form overflow; chart/layout/audio tabs and keyboard tab navigation worked. Screenshots live in output/playwright/song-info-*.png and use the bundled symbol-test song, never production score data. The mechanical scan returned only incumbent advisory typography/color findings. Full project type checking is blocked by the pre-existing App.tsx appViewportRef.current error. No shipping raster was created. Verdict: ready for local review; unpublished. Physical-device behavior was not reverified.


Release integration — 2026-10-28: the prior App.tsx type-check blocker is resolved. Combined v0.11.6 passed all 1,512 tests, TypeScript and production build in an isolated checkout, together with invitation, search and workspace-menu changes.
