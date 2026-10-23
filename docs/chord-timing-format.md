# Chord timing arrows

`Song.chordTimingVersion: 2` defines a trailing `<` as earlier/left and `>` as later/right. The sheet, full editor and preview editor use `ChordTimingArrow` so their icons agree. New song templates carry version 2; external JSON generators must also set this field on each song (the enclosing backup version is independent).

Songs with no timing version or version 1 used the opposite arrow drawings. At ingestion, `migrateChordTimingArrows` swaps only the trailing chord modifier characters and sets version 2. For example, legacy `C<^` becomes `C>^`, preserving its right arrow and accent. Titles, lyrics, annotations, rhythm, jianpu, identities and timestamps are retained. Subsequent normalization and JSON round trips leave the migrated arrows unchanged.

Both app and workspace normalization apply this migration after validating song structure. These paths cover local snapshots, legacy storage, pending sync, imported backups, cloud song rows, team copies and embedded setlist songs. Public share pages separately normalize songs, bundles, setlists and project setlists. Changes persist through the existing save/sync flow; opening a shared read-only chart does not write to its owner. There is no bulk database rewrite or schema change.

Release the new renderer and migration together. Older web sessions and older native app builds do not understand version 2 and can draw migrated content in reverse; refresh web clients and update native builds before editing the same library across versions. Rolling back only the renderer has the same limitation. Keep pre-update backups for rollback; do not strip `chordTimingVersion` from version 2 exports.

Regression coverage: `chordTimingMigration.test.ts` exercises modifier preservation, immutable/idempotent conversion, local reloads, setlist snapshots, pending sync and public share nesting. `ChordSheet.test.tsx` verifies new directions and preserved legacy directions in C and D. `PreviewBarEditor.test.tsx` checks the arrow buttons write matching suffixes.
