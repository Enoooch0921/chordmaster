# Jianpu grace notes

`{2}3` attaches an unmetered 2 before the principal note 3. Grace accidentals and octave marks are supported, for example `{#2'}3_`. The principal note retains its duration, beat position, slurs and selection index; the ornament does not create a timed event or take space from the following note.

In the preview jianpu editor, select a pitched principal note, choose **Grace note**, then set the ornament's pitch, accidental and octave. Apply adds or replaces it; Remove clears only the ornament. Fixed-do input uses the same target play key as the principal note. Principal pitch/duration edits, JSON storage, copy and relative/fixed-do conversion preserve ornaments. Replacing the principal note with a rest removes its ornament.

Preview, legacy rendering and PDF export draw the small grace pitch with its own accidental/octave dots and a connecting arc. The legacy text field accepts the same notation. This currently represents one pre-note ornament; measured appoggiaturas, multiple-note ornaments and unpitched drum grace notes are not encoded by this syntax.

Older clients interpret the new syntax incorrectly; update before editing affected charts. Web/iPad builds are checked, but building iPad output does not install a native update.
