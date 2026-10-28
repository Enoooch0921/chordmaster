# Global workspace Undo/Redo

Release 0.11.0, 2026-10-28. Production uses the church NAS Supabase; the historical Cloud project must not receive this migration or test data.

## User behavior

- One timeline covers committed song edits, setlist song edits and order, adding/removing songs, setlist/project creation, copying, renaming, moving, archiving, and deletion. A held drag creates one action; returning to its original order creates none.
- Undo/Redo uses the existing preview/editor controls, Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y. Delete/removal and completed reorder show an optional Undo action in the existing notification. A stale notification cannot undo a newer action.
- On iPhone/iPad, three fingers left undo and right redo, including on the setlist/song list. The web fallback reserves the touch stream as soon as the third finger lands outside text inputs and dialogs, before Safari can start native scrolling; the action still requires a consistent horizontal translation. It includes release coordinates when the last move was coalesced, yields single-finger scrolling and two-finger zoom, rejects pinch/cancel/extra fingers, and deduplicates a native `beforeinput` history intent with its touch fallback. Focus left in a sort/title field does not block a gesture performed on the list.
- Native search, title, author and other ordinary text inputs keep their own text history. Custom chord capture/editor inputs use score history. Open preview drafts keep their existing draft history until commit.
- The latest 50 actions persist in IndexedDB on this device, separated by account and library. New edits discard Redo. This is not a cross-device audit trail or a general version browser. Clearing browser storage removes local history.
- Deleting a project detaches its setlists to the root. Undo restores its identity, original grouping and server-owned shared memberships. Deleting a setlist/entry restores its original identities, arrangements, assignments, source baseline and members' personal Capo data.
- Ordinary source-song deletion archives it first, including personal libraries. Undoing creation/duplication archives the new source instead of hard-deleting it. Identical-copy cleanup also archives copies without rewriting setlist references.
- Explicit permanent song deletion remains irreversible and clears this workspace's Undo/Redo timeline after success. The confirmation states this. Sharing, permission changes, project pins, personal display preferences and personal Capo are outside the content timeline; Undo cannot reinstate a revoked team role.

## Data path and safety

`App` records compact commands → `useWorkspaceHistory` serializes/persists history → local per-field compare-and-swap or repository RPC → guarded PostgreSQL transaction → UI/saved baseline. Cloud replay flushes outstanding saves first, requires connectivity, pauses editing/remote refresh during the operation, and re-reads server content after success. A failed follow-up read does not turn a committed write into a second Undo attempt; regular refresh can retry.

Order commands store entry ID arrays, not full scores; replay preserves later Key, score and Capo edits. Other updates store affected fields/entries only. Server patches compare each expected field, retain existing RLS/content guards, and commit all fields/order changes atomically. A conflicting edit or revoked authorization rejects the operation and keeps the history entry available; it does not replace the entire library.

Deletion snapshots live in `chordmaster_private.workspace_trash`, never in a browser RPC response. Receipts are actor-bound UUIDs. Restore verifies the current library role and access; saved delegated setlist assignments are restored within the same transaction before the final authorization check. The private, transaction-bound restore context permits the exact original project link through the project-scope trigger, without accepting a client GUC as authorization. All other classifications keep the existing trigger. Failed restoration rolls back row creation and assignments together. IDs already reused and child setlists moved into another project cause a conflict.

Trusted entry restoration preserves the original server source baseline. Batch restoration reverses receipt order so removed entries recover their original slots. Source archive timestamp comparisons use browser millisecond precision. No hard-delete fallback runs when the migration/RPC is unavailable.

History receipts have no automatic purge in this release. Retention/cleanup must preserve unconsumed receipts needed by active local timelines; clearing a local timeline does not erase server backups. Database and browser backups contain score content and should stay under their existing access controls.

## Release requirement

Apply `supabase/migrations/20261027173400_workspace_history.sql` to the authoritative NAS database before releasing the new frontend. Use the established NAS migration workflow and a database backup. On 2026-10-28 the migration was backed up, rollback-tested, applied to NAS and checked with synthetic sort/restore/patch operations in a rolled-back transaction; no synthetic rows remained. Frontend release uses the GitHub Pages workflow. The migration adds private backup/context tables, guarded patch/trash/restore/reorder RPCs and a narrow trusted-restore condition around the existing setlist project trigger. Each new routine has explicit caller grants; existing cross-schema defaults are preserved for the NAS Supabase services.

Rollback the frontend first if needed. Keep private backup rows and restore functions until recovery needs are resolved; dropping them loses deletion recovery. Do not copy membership tokens or backend credentials into fixtures, logs or reports.

## Verification

The disposable SQL suite covers owner and assigned editor restoration, grouped setlists, role downgrades, atomic rollback, private snapshots, source baselines, source archive timestamps, order conflicts and personal Capo preservation. It runs through `supabase/tests/run-permission-tests.mjs` using an external PGlite runtime, without connecting to NAS or Cloud.

Unit/integration coverage includes scoped IndexedDB persistence, failures/retry, Undo/Redo serialization, order coalescing, hydrated defaults, repository request scope, missing RPC safety, keyboard/native text priority, native/touch deduplication and pinch cancellation. Browser desktop checks verified order Undo/Redo and the notification; a 390px capture verifies the stable controls. CUA's hidden native-confirm focus issue blocked subsequent browser deletion interactions; SQL and App integration tests cover those flows. Physical iPhone/iPad gesture validation remains required before claiming hardware verification.

Implementation-workspace checks passed 141 test files / 1,396 tests. The isolated 0.11.0 release excludes the separate lyrics changes and passed TypeScript, production build and 140 test files / 1,380 tests. Disposable SQL passed 103 history, 117 team administration, 187 library permission and checks of the new functions’ explicit ACLs. The independent verdict scored both requested corrections resolved. NAS verification also confirmed all seven new RPC/helper signatures, anonymous denial, private schema isolation and preservation of all protected application rows. The existing global default-privilege probe remains outside scope; new routines use explicit ACLs.

Evidence: `.impeccable/review/global-undo-20261028/desktop.png` and `mobile.png`. Preview uses synthetic data only at `http://127.0.0.1:3133/tmp/global-undo-20261028/index.html`.
