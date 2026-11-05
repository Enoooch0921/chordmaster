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

### Chord attack alignment and direct beat entry (2026-10-29)

Align each available short rhythm attack with its chord root immediately; an unfinished notation lane must not delay alignment. Missing attacks use provisional positions within their own beats. Rhythm takes priority over melody, while a whole/long rhythm can use the melody's first attack (so an Am over a whole note aligns with a C over quarter notes). Sustained-only and chord-only bars retain their original first-position treatment. Use the rendered lane and melody digit bounds, including voice gutters, print insets and fractional preview zoom; do not rewrite musical data for visual alignment.

Subdivided beats yield horizontal space before neighboring full beats. Begin half-beat chords at 70% horizontal width and quarter-beat chords at 60%, keep root anchors fixed, and fit further only when necessary. Beat labels appear only on beats with subdivisions or an explicit offset: 3 / 3& or 3 / e / & / a. Keep the existing 8px notation-label role; these are chart annotations scaled with the printable score, not UI body text.

Every beat, including an empty beat, has an independent full-height hit area and hover frame. The selected 2px section-color frame and empty-beat caret remain outside text scaling and survive editor-mode switches. Selection overlays are removable preview editing chrome. Subdivision-editor columns and their hit areas share the same widths and gaps.

Desktop direct text and physical keyboards accept concatenated letter chords case-insensitively: gam → G + Am at offsets 0/.5; gambmcm → G + Am + Bm + Cm at 0/.25/.5/.75. The three-chord intermediate state occupies 0/.25/.5 while a fourth chord is typed. Each command replaces only the selected beat's run, retains other beats, uses existing conversion and undo history, and rejects more than four chords. Consume maj/min/dim/aug/add/sus qualities and slash basses before looking for another root. Partial quality words remain editable while typing. A lowercase b immediately after a root retains its flat meaning; Nashville digits are not automatically split. The ordinary keyboard opens by default; the existing &+ panel remains available for explicit positions and numbered passes.

Selecting an ordinary rest over a same-value triplet rest removes triplet timing and shifts following rhythm events by the duration difference, only if the measure has room. A triplet note changed to a rest retains its intended triplet value. Incomplete triplet groups show a small 3 so an accidental triplet rest cannot look ordinary. Valid adjacent eighth notes beam after timing is corrected.

Verification: `output/playwright/chord-rhythm-alignment-20261029/` records local browser examples, source detector findings and test evidence. Source detection found inherited specialist-font and chart-size exceptions; the new row retains existing score typography. Real local browser interaction confirmed lowercase two/four chord entry, selection across modes, corrected eighth-rest timing and connected beams. No production score backend was accessed.

### Copy once, choose on paste; optical chord alignment (2026-10-29 follow-up)

This supersedes the earlier four-way copy row. All chart copy actions capture complete immutable measures, including every notation voice and musical context. Command/Ctrl+C copies the selected range or current/hovered measure; text selections and ordinary text inputs retain native clipboard behavior. Command/Ctrl+V opens a compact four-choice paste menu: 小節, 和弦, 節奏, 簡譜. Do not modify data until a choice is made. Freeze destination IDs and copied content when opening; Esc/outside click cancels, arrows/Home/End navigate, Enter activates, and focus returns on dismissal. Context menus expose the same horizontal paste row beneath one copy action. Keyboard copy buttons copy complete measures and their paste buttons open the choice menu. One copied snapshot can be reused for multiple lane choices; lane paste preserves other content and retains existing meter/input-mode checks, multi-bar extension, transposition and undo behavior.

Chord alignment now targets the complete chord's center rather than its root letter. Allow nearby whitespace to absorb up to 22% of the nearest attack spacing, capped at 10 chart px, before condensing. A slash-bass chord receives a bounded 2px rightward optical preference. Keep the half-/quarter-beat condensation and lightly condense a long full-beat chord following subdivisions to 90%; maintain a 3px minimum ink gap where fitting permits. Beat labels remain at the exact musical onset. This is visual placement only.

Ordinary and notation-aligned chord rows share a 27px baseline allocation (3px top + 24px content). Subdivision labels sit above the content without pushing it down. A beat slash uses a fixed 24px box with a 2px optical lift; its chord-only wrapper uses flex rather than inline-flex to avoid an extra anonymous text descender. Both slash layouts now have the same measured height. Printable/exported geometry retains the same rules; editing overlays are removed.

### Harmony-only subdivision layout (2026-10-29)
The user's latest preference extends the compact aligned layout to subdivided harmony with neither rhythm nor melody. Use beat/span centers with whole-chord optical fitting; retain only subdivision labels, narrow subbeats and breathing room before the following full-beat chord. This supersedes the previous notation-required rule for that case. Whole-note-only and sustained-melody-only cases retain their existing placement.

Plain chord rows use the same per-beat hover affordance as notation-aligned rows: hover and click target each owned beat, including empty beats and slash placeholders. The enclosing row must not draw a competing full-row hover outline.

Notation arrows avoid the measure's bottom selection stroke with 3 logical pixels of clearance when collision occurs. Both rhythm and jianpu use the same pointer component. Clicking a jianpu beat background at an occupied onset points to the rendered digit center, including voice gutters; empty positions retain the temporal insertion location.

### Selection and barline separation (2026-10-29)
Active and multi-selected measures use the existing section tint and a complete, subtle rounded dashed frame. Insets leave extra room beside double, final and repeat barlines, including adjacent boundaries. This replaces the rejected horizontal-only selection treatment. Beat selection frames remain solid and distinct. Preview-only frames are omitted from export.


### Same God alignment and removable marks (2026-11-04)

Before geometry is available, notation-aligned chord contents center on their provisional attack anchors rather than starting at those anchors. Measured whole-chord fitting and its bounded slash-chord optical correction remain intact. Actual Same God F/A–G–F–slash over 4–3–2–1 measured with the second chord within 0.05 chart px of its digit at 78–200% browser zoom.

An existing unison badge is a keyboard-focusable score editing target when editing is permitted. It opens the marked bar's symbol editor. The preview keyboard shows an explicit 44px Remove unison mark action in every notation mode, including bars without jianpu. Removing it uses the existing draft/history flow and changes only unisonMark. Reading/export keeps the badge noninteractive.

Verified the actual NAS source in an isolated local copy; pointer and keyboard badge entry, desktop/phone removal, unchanged other bar fields, source immutability, and a disappearing badge after removal. Source score correction separately removed the user's unwanted mark from TopChurchWorship Same God, Bridge 4 bar 3, with full private backup, updated_at guard and full JSON re-read verification.

### Reading hierarchy and complete map labels (2026-11-05)

Parenthetical and bracketed song-title text uses the shared display-only subtitle treatment (0.72em, weight 600). Setlist chart titles prefix the current entry's one-based position, including performance mode and export; reordering changes that number without changing the saved title. The existing chart title, page geometry and musical rows retain their layout.

Map circles retain their established dimensions. Fit each complete measured label inside its ring, including combined section codes such as V1/2 and B1&2, without ellipsis. Refit after container resize and font loading. Adjacent identical unnumbered steps compact into one token with the summed repeat count; distinct numbered steps and nonadjacent repeats keep their positions. This does not reorder the chart.

The independent review accepted the scoped refinement. Desktop, tablet, phone, Joy, app and performance screenshots are in `.impeccable/review/reading-1105/`; WebKit measurements found unchanged score-body row geometry and no map-label overflow. Final validation passed 208 test files / 2348 tests, TypeScript and web/iPad builds. These are local reading rules; `DESIGN.md` and `.impeccable/design.json` remain unchanged.

### Reading refinement follow-up (2026-11-05; supersedes earlier title/map details)

The drummer score now receives the current setlist entry's one-based number, matching its row and current-song heading. Shared title rendering preserves saved names; in the lyrics book, a short trailing subtitle stays beside the main title and moves intact to the next line only when it does not fit. No musical source data or score geometry changes.

Map tokens recognize section names embedded in performance cues and display the compact base code, retaining any section number after that name. An ordinal before the name does not become a section number. Full cue names remain available unchanged in the arrangement, editor, tooltip and score. Shared `Intro 2/Outro` expands into separate Intro 2 and Outro steps; generated defaults put Outros last. Explicitly arranged standalone Outros retain their chosen position.

Independent fresh finish review: **ship**, no material fixes. Chrome desktop/tablet/mobile and WebKit evidence is in `.impeccable/review/refinements-1105/`. Validation passed 208 test files / 2353 tests, lint and both web/iPad builds. The detector reported 50 inherited findings and zero on edited lines; they are not new design rules. Global design files remain unchanged.
