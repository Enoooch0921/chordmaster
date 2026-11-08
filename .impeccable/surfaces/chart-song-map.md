---
version: 1
slug: "chart-song-map"
primary_target: "src/components/ChartSongMap.tsx"
related_targets: ["src/components/SongMapToken.tsx", "src/lib/songMap.ts", "src/index.css", "src/components/SongMapToken.test.tsx"]
---

# User-selected color blocks — 2026-11-06

Mode: Read. The user selected the color-block direction from four rendered alternatives, then requested Intro / Inter / Outro and End. This supersedes the prior circle/wide-token treatment.

The latest naming preference distinguishes Turnaround as `Turn` (superseding `Tr`) and spells out `Tag`. Keep numbered forms (`Turn2`, `Tag2`) and legacy `Ta` / `Tr` / `T` / `Tg` inputs working. Chart tokens, the roadmap editor and section navigation share these two labels; `Turn around` also receives the Turnaround color.

The user found `R` / `Bd` too cryptic: display Refrain as `Ref` and Breakdown as `Break`, including numbered forms. The roadmap editor uses the same readable display helper as the chart (also Intro / Inter / Outro / End); section navigation uses Ref / Break / Turn and resolves old input aliases first. `Break` is a display label only, not a new parsing alias that could reinterpret an existing custom section. The preview server disables HMR, so refresh the user-facing preview after changes and retain the selected song.

For long performance-cue names such as Keep It Burning's `1st Chorus Drop` and `正常Chorus`, display `C · 1st Drop` and `C · 正常`: a prominent section code followed by a 12px, medium-weight cue in the same color. Retain every cue word, including `1st`; it is not the section number in `C1` or a repeat count. Keep original names in storage, score headings, editing, tooltips and accessible labels. Only separate a single recognized section name; compound names (`Intro / Outro`, `Verse into Chorus`, `回主歌Inter`) and unknown labels remain intact. Reuse actual text measurement for fitting and print all cues.

Visibility defaults (latest user instruction): a basic section inventory is hidden beneath the title unless explicitly enabled. Do not infer a visible roadmap just from chart sections or numbered verses. With no explicit visibility choice, only saved routing with a return to an identical section or an explicit repeat count enables the map; use the effective setlist map first. A source-verified arrangement, including a matched MultiTracks version, can explicitly set `showSongMap: true`. Preserve explicit manual on/off choices, the music's section labels, and access to settings while hidden. The metadata toggle and chart share `shouldShowSongMap`.

Use the selected second palette, 淡彩深字・清透版, at the reference preview's 115% strength. Low rectangular blocks have 4px corners and a shared dark ink (`#303c48`). Preserve the section hues with 73.6% saturation and 94% lightness. Neutral Intro, Interlude and Ending use hue 215, 11.5% saturation and 95% lightness. Apply these colors to roadmap tokens on chart paper in light mode, dark mode and print.

Normal blocks are 24px high with 13px labels and 8px inline padding. Section numbers remain attached to their codes; repeat counts sit inside the same block on the baseline, separated by a light vertical hairline. The chart-display helper expands I / It / O / E to Intro / Inter / Outro / End, including numbered variants, without changing saved names, parsing aliases or score data. Preserve specific custom performance cues in full.

The latest user correction requires Keep It Burning to stay on one line. Measure complete labels, including repeat counts, before fitting. Try a compact single row with 4px inline padding and 2px gaps at the original 13px font before reducing type or wrapping. Keep It Burning fits this way with Turn / Ref / Break and both Chorus cues intact. Only if the compact row still cannot fit should the map try 11px effective labels; reserve two balanced rows for arrangements that still exceed the available width. A single row uses the 34px heading budget; only an actually wrapped map uses 42px and adjusts heading padding. Never infer wrapping from the number of steps alone. Preserve accessible full names, existing settings/edit controls, continuation headers, and print hiding of editor controls.

Evidence: `output/playwright/song-map-selected-20261106/` contains desktop/phone/tablet views, dense 28-cue layouts, full custom cues, print checks and final Intro/Inter/Outro/End capture. The isolated preview now imports the actual shipping components. No production NAS data was accessed or changed. This is a local implementation, not a production deployment or physical-device readability measurement.
