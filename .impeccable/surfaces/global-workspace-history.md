---
version: 1
slug: "global-workspace-history"
primary_target: "src/App.tsx"
related_targets: ["src/components/Toast.tsx", "src/components/PreviewWysiwygEditor.tsx", "src/hooks/useWorkspaceHistory.ts", "src/hooks/useSongHistoryShortcuts.ts", "src/hooks/useThreeFingerHistory.ts", "src/lib/workspaceHistory.ts", "src/lib/repository.ts", "docs/global-workspace-history.md"]
---

# Global workspace Undo/Redo

Mode: Operate. Ordinary extension of the existing ChordMaster green workspace.
The task adds recovery for committed workspace changes, including song order and
project deletion, through familiar Undo/Redo controls and iOS/iPadOS gestures.
`PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` remain the inherited
authority. This surface introduces no new world, tokens or component primitives.

Preserve the released sidebar song rows, selection treatment and stacked Key/BPM
rail. Recovery does not change their composition, spacing, controls or drag
behavior. A completed held reorder records one operation; returning the songs to
their original order records none. Key, score and personal Capo changes remain
independent of order restoration.

The existing preview/editor Undo and Redo controls operate on the shared committed
workspace timeline. An open preview draft retains its own draft history until
commit. Persistent preview buttons keep localized accessible names, disabled
states and the existing geometry; their titles name the next available operation.
Success feedback also names the operation. Keep these controls available after a
temporary notification expires.

The existing notification accepts an optional Undo action after removal/deletion
and completed reordering. Its button uses the inherited green foreground, soft
green hover, rounded shape and visible green focus outline; its minimum height is
(44px). The raised semantic surface, border, type and success icon retain their
existing roles in light and dark themes. The viewport width is
`min(92vw, 360px)`, with the existing bottom/right inset, so a phone keeps the
message and action within its viewport. An action is bound to the operation that
created it; an older notification must not undo a newer change.

Notifications retain the existing polite live region and status semantics, with
alert semantics for errors. Optional action buttons remain ordinary keyboard
buttons. Exiting notifications become inert and leave the accessibility tree
immediately. Reuse the established notification and pointer-press motion,
including its keyboard and live reduced-motion behavior; recovery itself commits
without decorative motion.

All entry points share the same active history: the visible controls,
Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y, native `beforeinput` history intents and the
three-finger touch fallback. Ordinary search, title, author and other text inputs
retain their native text Undo/Redo. Custom score-entry inputs use score/draft
history. Modal and composition handling must preserve those boundaries.

On iPhone/iPad, a horizontal three-finger translation left requests Undo and
right requests Redo. Preserve single-finger scrolling and two-finger chart zoom.
Reject pinch-like divergence,
vertical movement, cancellation and extra fingers. Deduplicate a native history
intent with its touch fallback so one gesture causes one operation. Gesture
handling respects active drafts, busy history, dragging and workspace transitions;
it must not bypass the visible controls' authorization or safety rules.

Keep the latest (50) committed actions in device-local IndexedDB, scoped by
account and library. New edits discard Redo. A restore uses field-level
compare-and-swap and current permissions; conflicts preserve the history entry
and show actionable feedback. Deleting a project moves its setlists to the root;
Undo restores the original project identity and grouping. Server-owned private
receipts preserve deletion snapshots and memberships without exposing them to the
browser. Ordinary source-song deletion archives it first. Explicit permanent
purge remains a clearly confirmed irreversible barrier that clears the timeline.
Sharing and permission changes, pins, personal display preferences and personal
Capo remain outside the content timeline. Detailed data and rollout contracts are
in `docs/global-workspace-history.md`.

Verification evidence, 2026-10-28:

- `.impeccable/review/global-undo-20261028/desktop.png` (1280 × 720) shows the
  completed reorder notification and Undo action in the unchanged workspace.
- `.impeccable/review/global-undo-20261028/mobile.png` (390 × 844) shows persistent
  Undo/Redo controls. The transient notification had expired; its narrow-screen
  behavior is additionally grounded in the responsive viewport source above.
- The scoped detector result at
  `/tmp/chordmaster-global-history-design-detect.json` contains no findings (`[]`).
  Fresh finish review returned ship after grouped setlist restoration for an
  assigned editor and hydrated-default comparability were corrected.
- Browser checks passed order Undo/Redo. Unit/App integration and disposable SQL
  suites cover persistence, atomic/conflicting recovery, authorization, keyboard
  priority, gesture deduplication and cancellation. Subsequent browser deletion
  interaction was blocked by CUA's hidden native-confirm focus issue; App
  integration and SQL tests cover those flows.
- `.impeccable/review/global-undo-20261028/verification.json` records the final
  local checks: (141) test files and (1,396) tests passed, TypeScript passed and
  production build passed with the existing bundle-size warning. Disposable SQL
  passed (103) history, (117) team administration, (187) library permission and
  explicit new-function ACL checks. The earlier full default-privilege probe result
  predates release scoping; the existing global default-privilege issue remains
  outside this release. Disposable tests did not connect to NAS or Cloud.

These captures establish a scoped visual extension. Physical iPhone/iPad gesture
validation remains outstanding. For release 0.11.0, the isolated candidate passed (140) test files / (1,380) tests;
it excludes the separate lyrics work. The required history migration was backed
up, rollback-tested and applied to the authoritative NAS on 2026-10-28. All new
routines have explicit ACLs; existing cross-schema defaults were preserved.
NAS smoke checks passed and rolled back without retaining fixture rows.
Deployment prerequisites and rollback guidance remain in the implementation doc.

Pre-existing design context is preserved: `DESIGN.md` already distinguishes the
released song control rail from older mobile-row token/sidecar examples. This
surface does not refresh those examples or repair unrelated working-tree drift.
