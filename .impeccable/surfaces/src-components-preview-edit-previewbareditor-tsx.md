---
version: 1
slug: "src-components-preview-edit-previewbareditor-tsx"
primary_target: "src/components/preview-edit/PreviewBarEditor.tsx"
related_targets: ["src/components/PickupPreview.tsx","src/hooks/useThemeMode.ts","src/styles/dark-ui.css"]
---

# Mobile notation keyboard and live theme

Mode: Operate. Scoped adaptation of the existing editor, retaining its controls and musical semantics.

## Direction contract

THESIS: Keep rhythm and jianpu entry usable on phone screens and keep system theme changes coherent throughout the app UI. No controls should overlap or disappear under adjacent rows.

OWN-WORLD: Preserve existing ChordMaster green, UI font, notation glyphs and semantic light/dark surfaces. Keep printable chart paper and ink independent of interface theme.

STORY: Read a chart, open a notation keyboard, enter or modify notes and return to the chart. A system theme change updates labels, form controls and the ChordMaster wordmark together.

FIRST VIEWPORT: Keyboard header and navigation footer remain visible. Key rows have physical height floors; the middle region scrolls at constrained heights. Phone jianpu modifiers wrap into two rows. Weak pickup notation has the same gray marker background as regular notation lanes.

FORM: Scoped responsive adaptation; code-led, no new visual world or concept-seed round. Signature interaction: full keyboard controls stay distinct in portrait, landscape and a reduced visual viewport.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
