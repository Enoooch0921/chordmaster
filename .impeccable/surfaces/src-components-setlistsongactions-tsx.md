---
version: 1
slug: "src-components-setlistsongactions-tsx"
primary_target: "src/components/SetlistSongActions.tsx"
related_targets: ["src/App.tsx"]
---

# Mobile setlist navigation refinement

Mode: Operate. Existing green identity, mobile-only row composition; desktop preserved.
THESIS: Scan the song order and title first, adjust Key and Capo second, expose destructive actions deliberately.
OWN-WORLD: Green selection, quiet dividers, readable song text and familiar picker controls.
STORY: Enter setlist, choose song, adjust Key/Capo, reorder via numbered grip; remove through a clearly labelled overflow menu. Overview previews remain plain text, without nested white cards.
FIRST VIEWPORT: Remove duplicated Key/Capo metadata and tiny current badges. Keep original key/meter/version information. Use16px song title,12px secondary text,44px controls; two equal control columns align with title. Highlight current row with soft green and a check.
FORM: Flatten mobile card stack to divided rows. Preserve song order, source data, permissions, picker handlers and desktop markup. Keep overview search/project filters and management available.
QUALITY BAR:320/390px, dark, long title, overflow menu near bottom, real selection, Key/Capo edits and touch reorder verified in browser. No backend writes.
FINISH: Fresh reviewer, detector once scoped, then documenter records accepted layout.

Project extension: Owned, read-only and joined project lists share the mobile flat-row hierarchy,16px names,12px counts,44px rename/create controls. Project management heading has its count; preserve creation, filtering, rename, sharing, archive and delete handlers. Keep desktop composition.
