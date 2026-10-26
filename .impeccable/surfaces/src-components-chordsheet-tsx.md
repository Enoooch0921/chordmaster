---
version: 1
slug: "src-components-chordsheet-tsx"
primary_target: "src/components/ChordSheet.tsx"
related_targets: ["src/components/PickupPreview.tsx"]
---

# Chart notation proximity refinement

Mode: Operate / Read. Preserve ChordMaster's score engraving and printable pages.

THESIS: Chords, rhythm and numbered notation in a measure read as one musical unit. Spare A4 page height must not separate these lanes.
OWN-WORLD: Existing gray marker lanes, music fonts, bar lines, annotation badges and multi-voice labels.
STORY: Read chord and its corresponding rhythm/melody together; identify simultaneous voices without empty vertical fill between lanes.
FIRST VIEWPORT: Timed music rows have a content-derived maximum height: chord-only rows34px only in one-line mode and68px in default/explicit two-line mode, ordinary melody68px and a two-voice intro92px. Extra notation height stays local to its row; chord-only three-line handwriting keeps its writable space. Extra voice/pass rows reserve their real heights; sparse-page extra space goes after the musical rows instead of inside them.
FORM: Narrow layout refinement. Retain lane anchors, section-gutter and pickup alignment, one-/three-line pagination capacities, chart content and export geometry. Two-line timed pages use their row heights within a 900px/940px music-area budget and at most ten rows; only inter-row gaps may tighten from 24px/32px down to20px. Preview, setlist and PDF share the decision. Verify one-, two- and three-row modes, dense voices, variants, pickup, phone/tablet/desktop.
FINISH: Independent screenshot review and updated design documentation. No new assets.
