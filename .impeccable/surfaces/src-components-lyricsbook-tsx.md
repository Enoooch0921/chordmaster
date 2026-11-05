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

### Numbered titles and grouped lyrics (2026-11-05)

Song titles show the current setlist entry's one-based number in reading, A4 and export, including continuation headings. Preserve the existing book font, gray highlight and main-title brackets. Parenthetical and bracketed subtitle text uses the shared 0.72em, weight-600 treatment. A trailing subtitle starts intact on its own line below the bracketed main title, as verified with Joy; the measuring copy uses the same rendering so pagination includes its height. Saved song titles remain unchanged.

LyricsSheet and LyricsBook group recognized sections in reading order: Intro, numeric Verse, Pre-Chorus, Chorus, Refrain, Bridge, Interlude, Tag, Outro, Ending, with numbers ascending within each type. Equal headings retain their order; unlabelled/custom blocks retain their slots. Keep each block's identity, paired language content and explicit page break together. This is presentation order, not a reorder of stored blocks, chart sections or the song map. In LyricsSheet, move controls only exchange adjacent blocks with the same sorting rank and number.

Review screenshots are in `.impeccable/review/reading-1105/`, including `lyrics.png`, `book.png` and `mobile-joy.png`. The independent review accepted the refinement; focused tests and the final 208-file / 2348-test suite passed, as did TypeScript and web/iPad builds. Existing Arial and 10px detector advisories remain specialized lyrics typography, not additions to the global type ramp. No global design-system files changed.

### Title wrapping and continuation follow-up (2026-11-05; supersedes earlier rules)

A short trailing parenthetical or bracketed subtitle stays inline after the numbered, bracketed main title. Keep the subtitle intact and wrap it onto the next line only when it does not fit; retain the existing secondary size/weight, book font and gray highlight. Measurement uses the same rendering. This replaces the earlier mandatory separate subtitle line.

Remove repeated song-name-plus-（續） continuation headers from A4 columns and pages. The song's opening title remains numbered; existing section continuation labels, pagination, explicit breaks and source content retain their behavior. No score geometry or stored song data changes.

Independent fresh finish review: **ship**, no material fixes. Chrome desktop/tablet/mobile and WebKit captures are in `.impeccable/review/refinements-1105/`; validation passed 208 test files / 2353 tests, lint and both builds. The 50 detector findings are inherited, with zero on edited lines; no global design-system update is needed.
