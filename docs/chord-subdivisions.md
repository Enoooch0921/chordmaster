# Additional chords within a beat

`Bar.chordSubdivisions` adds an independent harmony event without replacing the ordinary `chords` slot. Each entry has a zero-based notated `beat`, an `offset` of `0.25`, `0.5` or `0.75`, and a `chord` in the bar's written key (letter or Nashville notation). These offsets divide the meter's notated beat; in 6/8 one beat is an eighth note.

For Am at 1, Am/B at 1&, Am/C at 2 and G/D at 2& in 4/4:

```json
{
  "chords": ["Am", "Am/C", "", ""],
  "chordSubdivisions": [
    {"beat": 0, "offset": 0.5, "chord": "Am/B"},
    {"beat": 1, "offset": 0.5, "chord": "G/D"}
  ]
}
```

Chords with additional events use a sequence of equal-width engraving cells. Every cell prints its actual beat position (1, 1&, 2, 2&); horizontal spacing is for legibility, not proportional duration. The rhythm and riff lanes retain the original meter. Preview, shares and PDF use the same renderer, transposition and Nashville conversion.

Use **&+ / 拍內追加和弦** in the preview editor, or the additional chord controls in the full editor's marks panel. Existing ordinary chords remain editable with the ordinary keyboard. Additional chords can be edited, moved or removed independently. The selector excludes occupied positions and rests. Structured chord/bar copies, undo/redo, saved JSON and key changes retain additional events. Plain-text clipboard output includes beat labels as readable text; structured paste is needed to preserve editing metadata.

A full-bar repeat/rest replaces all chord events; a two-beat rest removes additional events in those beats. Inserting a beat moves additional events with that beat; events shifted beyond the bar are removed consistently with ordinary slots. A meter change does not silently remove additional events: positions beyond the new meter remain visible and the editor flags them for correction.

Clients predating this feature cannot display these events; use the updated website or an updated native build before editing these songs. No database schema migration is required. Native installation is separate from building.
