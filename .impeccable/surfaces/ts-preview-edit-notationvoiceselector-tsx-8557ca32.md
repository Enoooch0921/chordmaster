---
version: 1
slug: "ts-preview-edit-notationvoiceselector-tsx-8557ca32"
primary_target: "src/components/preview-edit/NotationVoiceSelector.tsx"
related_targets: ["src/components/preview-edit/PreviewBarEditor.tsx","src/components/JianpuVoiceStack.tsx","src/components/RhythmVoiceStack.tsx"]
---

# In-place multi-voice editing extension

Mode: Operate. Extend the current notation keyboard without changing song data until the user edits.

## Direction contract

THESIS: Selecting another voice remains an action within the same bar and keyboard, instead of replacing the task with a separate editor.
OWN-WORLD: Inherit existing ChordMaster controls, green selected states, semantic light/dark surfaces and notation glyphs. No new identity or decorative card system.
STORY: See the current section, bar and voice; select the primary or additional voice; use the same notation keys; rename the selected voice in place. Names remain per-bar, and primary labels retain their existing fallback behavior.
FIRST VIEWPORT: Header and navigation remain. A compact horizontal voice selector and a direct name/manage entry sit above the existing key rows. Additional voices use the same key layout and show their name while editing. Protected projection writes only the selected voice, never other notation or bars.
FORM: Scoped code-led component adaptation; no concept-seed round. Signature interaction: selecting a voice keeps the bar, beat and keyboard context, and the chart highlights that voice.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance


## Confirmed interaction refinements

- Text is the fourth header segment beside Chords, Rhythm and Jianpu in every notation keyboard. Selecting Text preserves the notation mode and selected voice; returning restores that keyboard.
- Text applies to the whole current bar and is explicitly described as shared by all voices. Voice names have a separate pencil entry and remain per-bar.
- Notation panels size to their actual rows. Fixed empty filler below rhythm keys is rejected. The bounded center scrolls on short viewports while header and footer remain visible.
- Required captures: 320×568, 390×844, 768×1024, 1440×1000; short 390×360 rename state. Persisted synthetic-fixture checks preserve primary and neighboring notation.
