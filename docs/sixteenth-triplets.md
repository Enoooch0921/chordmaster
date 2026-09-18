# Sixteenth-note triplets

Jianpu uses `=t` for a sixteenth-note triplet (`3=t4=t5=t`). Three such notes occupy half a quarter-note beat. The existing `_t` and `t` forms retain their durations. Accidentals, octaves, rests, slurs, transposition, JSON storage and copying preserve the triplet marker.

The jianpu duration keys and triplet toggle can be combined in both editors. Consecutive groups are marked in threes, including two half-beat groups within one beat. Dots remain disabled for triplets.

Unpitched rhythms accept `s3`, `s3r`, `s3c` and `s3cu`, with the existing tie and accent suffixes. Preview, legacy and additional-voice editors expose the note input; the preview and additional-voice keyboards also expose explicit triplet rests. Both rhythm rendering paths draw the double beam and triplet number.

Editing gaps use exact sixth/third subdivisions internally. Jianpu `x` remains a two-thirds-sixteenth gap; `y` is a one-third-sixteenth gap. Rhythm uses `s3x` and `y` for those same invisible gaps. These represent unfilled editing space, not rests. They prevent duration changes from shifting later notes.

Existing valid notation keeps its timing. Older clients do not support `=t`, `s3` or `y`; update clients before editing charts that contain these forms. iPad build verification does not install an updated native app.
