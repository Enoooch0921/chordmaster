# Chord positions within a beat

The chord editor's **Beat position / 拍內位置** menu sets a chord on the beat or one quarter, half or three quarters of the way through its existing beat slot (`e`, `&`, `a`). The score and PDF shift the chord anchor and print the exact position, such as `2e`. This subdivides the notated beat: in 4/4, `2e` is 1.25 quarter notes after the bar starts. In /8 meters the beat unit is an eighth note.

`bar.chordMarks[rawChordIndex].beatOffset` stores `0.25`, `0.5`, or `0.75`. Omission means the existing on-beat placement. The index is into `bar.chords`, matching other chord marks; legacy compact chord arrays keep their automatic placement. The offset follows a chord when the editor expands a compact array or inserts a beat. Deleting a chord removes its timing mark; color changes and clearing colors retain timing. JSON/workspace, cloud, setlist snapshots and structured chord/bar copy-paste preserve it.

Exact positions and the existing push/pull arrows are alternatives. Selecting a nonzero offset removes `<`/`>` from that chord and preserves other modifiers; adding either arrow clears its explicit offset. Whole-bar repeats, rests and beat slashes cannot have offsets. One chord per existing beat slot is supported; this feature does not add simultaneous chord events or additional bar length.

The preview editor exposes the menu with the articulation controls on desktop and phone. The full editor exposes it alongside each chord's mark controls. ChordSheet is shared by performance views, sharing and PDF capture, so the position label and shifted anchor appear there too.

Older clients do not render this metadata and may discard it when normalizing a save. Refresh web clients and update native builds before editing songs containing offsets. Native build validation does not install an updated app.

Tests cover editing, invalid metadata, compact-to-grid remapping, insertion/deletion, arrow replacement, normalization and JSON reload, copy-paste with key changes, undo/redo, and all score row layouts in transposed letter/Nashville modes. Desktop and phone UI tests exercise the selection. A browser-generated PDF of the source song is also visually checked before release.
