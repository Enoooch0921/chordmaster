---
version: 1
slug: "src-components-lyricsbook-tsx"
primary_target: "src/components/LyricsBook.tsx"
related_targets: ["src/utils/lyricsBook.ts"]
---

# Setlist lyrics on A4

Mode: Read. Preserve ChordMaster's green controls and printable white paper.

The reader moves between Verse, Chorus and Bridge while singing, often returning
to an earlier section. Keep the song visually together rather than filling every
available line. The default A4 易讀版 keeps a complete song in one column when it
fits; longer songs reserve a page when their whole sections fit across that page.
Move ordinary sections as units. Only a section whose measured content and title
exceed an empty column may continue by rows. Explicit section page breaks win.

Titles reuse the original A4 treatment exactly in both A4 layouts: inherit the
selected book font, bold song names inside 《書名號》, #d9d9d9 gray fill, inherited
black ink and 0 4px inline padding. Do not introduce a separate sans-serif title
font or extra title spacing in the readable layout. Gathering titles retain
their original 24px type, 32px leading, 8px bottom space, #e7e7e7 fill and thin
dark outline. Continuation names inherit the same font and gray highlight in
their smaller margin position. Preserve these user-confirmed title treatments
in print and export. Keep the
existing colored section labels to support finding repeated sections. Continuing
columns repeat a compact song name with （續） in the reserved top margin, leaving
the lyric capacity intact. The fixed A4 geometry remains 794 × 1123 CSS pixels.

Keep the original row-filling pagination under A4 省紙版.
大字閱讀 remains a continuous responsive view. Exports use the selected A4 layout,
even when the screen is currently in the continuous reading view. Typography,
language pairing, section editing and source lyric content retain their behavior.

The control group exposes all three views with pressed states. Font, size, leading
and language selectors have visible labels and keyboard focus outlines. App-level
A4 zoom preserves paper geometry on narrow screens; reading view reflows normally.

Verification uses real local song snapshots, including bilingual and mixed lyrics,
short songs, a song spanning two columns, and a song exceeding one page. Compare
the actual PDF export with the preview and check continuation labels, content
bounds, page numbering, editing the correct repeated entry, and explicit breaks.

Mechanical scan exception: Arial is the incumbent printable sans-serif font,
not a new application theme font.
