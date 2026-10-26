---
version: 1
slug: "src-components-songmetadatapanel-tsx"
primary_target: "src/components/SongMetadataPanel.tsx"
related_targets: ["src/components/PreviewWysiwygEditor.tsx","src/App.tsx"]
---

# Mobile song information

Mode: Operate. Scope: mobile login entry and song metadata editor; preserve desktop behavior, existing brand palette, authentication and score semantics.

The user confirmed mobile reading and full editing are equally important. The existing green brand and UI font remain the incumbent authority; this is a component replacement, not a new product identity.

## Direction contract

THESIS: A complete song editor with three direct destinations, so routine musical changes and full metadata editing have equal access. Replace stacked decorative containers with a continuous editing surface.

OWN-WORLD: Inherit ChordMaster green, semantic light/dark surfaces and the existing UI font. Use one continuous sheet, clear field labels, consistent 44–48px controls and deliberate section spacing.

STORY: Open song information, adjust song details, switch directly to chart layout or reference recordings, and return to the same chart position.

FIRST VIEWPORT: Compact header with an explicit Done action; three equal tabs below. Song name leads the default view, followed by credits and paired musical controls. No redundant introductory copy or icon tiles. Header remains visible while the selected tab scrolls.

FORM: Scoped component adaptation inside the established app world; code-led. Concept-seed does not apply to this narrow replacement. Signature interaction: selecting a tab changes the editing job while the chart remains anchored.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
