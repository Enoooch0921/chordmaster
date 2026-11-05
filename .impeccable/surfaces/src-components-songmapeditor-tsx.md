---
version: 1
slug: "src-components-songmapeditor-tsx"
primary_target: "src/components/SongMapEditor.tsx"
related_targets: ["src/components/SongMapEditor.css"]
---

# Song map block editor

Mode: Operate. Musicians arrange a library default or a meeting-specific song map on iPad, phone, and desktop. Preserve draft-only editing, inheritance, custom labels, repeats, insertions, undo, and save/cancel boundaries. Do not alter score geometry or the printed map's round tokens.

## Direction contract

THESIS: Build the user's selected 積木拖排 option. The sequence leads; compact circular tokens inside small repeated boxes are replaced by readable rectangular blocks.

OWN-WORLD: Existing ChordMaster green actions and Inter typography. Soft blue verse, green chorus, purple bridge, and neutral other blocks follow the accepted preview. Quiet neutral controls; green outline marks selection. Both app themes remain readable.

STORY: Read the performance order, drag a block, adjust its repeats, then tap a section below to add it. Save explicitly commits; closing discards the draft.

FIRST VIEWPORT: Dialog title and song together; six-column large-block grid on tablet/desktop and four columns on phones; selected controls immediately below; source bank last. The save footer stays reachable, while long content scrolls as one body without overlays hiding its end.

FORM: User selected option 1 積木拖排 from the interactive HTML prototypes on 2026-11-05. Code-led, no seed required for this user-pinned local redesign. Reference: tmp/song-map-options-1105/final-blocks.png and the accepted visualization's blocks variant.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

### Performance cue labels and shared Intro/Outro (2026-11-05)

Compact map codes recognize a section name embedded in a performance cue, including a section number following that name. An ordinal before the name does not create a numbered section. Preserve the full cue name in the editor, arrangement, tooltip and score; only the token code is abbreviated.

Expand shared `Intro 2/Outro` into separate Intro 2 and Outro steps, retaining repeat counts. Generated defaults put Outros last; normalization moves only the Outro split from a shared label, preserving an explicitly arranged standalone Outro's position. Keep draft/save boundaries, block design, chart geometry and source musical data unchanged.

Independent fresh finish review: **ship**, no material fixes. Chrome desktop/tablet/mobile and WebKit evidence is in `.impeccable/review/refinements-1105/`; validation passed 208 test files / 2353 tests, lint and both builds. All 50 detector findings were inherited, with zero on edited lines. No global design-system files changed.
