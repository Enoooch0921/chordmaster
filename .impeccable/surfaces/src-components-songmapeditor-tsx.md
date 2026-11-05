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
