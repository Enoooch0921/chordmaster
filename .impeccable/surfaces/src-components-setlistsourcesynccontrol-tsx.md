---
version: 1
slug: "src-components-setlistsourcesynccontrol-tsx"
primary_target: "src/components/SetlistSourceSyncControl.tsx"
related_targets: ["src/components/SetlistSourceSyncControl.css", "src/components/SourceScoreComparison.tsx", "src/lib/setlistSourceComparison.ts", "src/lib/setlistSourceSync.ts"]
---

# Clear source reconciliation

Mode: Operate / Read. Preserve the green product identity, exact snapshots, backups and concurrency checks.

THESIS: Users can tell what differs, which version they will use and exactly where it will be written.
FORM: Current library and named setlist stay in fixed columns. Show actual changed values and added/removed measure contents. Conflicts require an explicit direction. Highlight the adopted column, label the affected column, and keep scope and directional confirmation visible in a fixed footer. Comparison content scrolls inside the viewport; save-as and baseline history use disclosures. Identity-only differences never masquerade as changed music; their exact records still guard persistence.
QUALITY BAR: Direction changes never swap comparison columns. No writes occur on preview or selection. A failed or stale confirmation requires a fresh preview. Verify short and narrow screens, visible buttons, empty comparisons and save-as retries. Use local fixtures without production writes.

The App uses a compact floating entry above its existing preview controls. It must not insert a band above the content area or participate in sheet sizing. Verify notice transitions by measuring viewport bounds, sheet transform, scroll position and the visible song’s coordinates before/after a real local score edit.


## Theme correction — 2026-10-28

Keep source selection, comparison labels, directional arrows, scope and primary confirmation on component-scoped theme roles. Dark mode uses green-300 accents and green-200 text on green-950 selected surfaces; its primary action uses green-300 with green-950 text. Light mode uses green-700 with white text for confirmation. Never inherit the global inverse-text token on a fixed green action. The compact/noncompact entry also retains readable amber feedback in dark mode.

Verified actual production component with isolated synthetic data at 1280×800 and 390×844, including both conflict directions and the light theme. Dark body, scope, selected fields and confirmation exceed 4.5:1. No source or setlist data was written.


## Graphical differences — 2026-11-02

Measure changes use read-only excerpts from the production ChordSheet renderer, retaining the complete song's meter, key and tie context. Group all changed fields in a measure together. Library differences use rose ink and setlist differences use blue ink, with named columns and accessible exact values; the adopted-version green remains independent. Added/removed bars and sections, pickup measures, and expanded baseline history use the same visual treatment. Metadata and lyrics retain direct values with the changed span highlighted. Score paper stays white with the same ink colors in both themes. Compact 9–11px context labels and 3/6px ink-highlight corners are deliberate notation-scale exceptions, not new general UI typography or control tokens.

Verified local synthetic comparisons at 1280×900 and 390×844 in both themes, including actual note fonts, two fixed columns, no horizontal overflow, and the fixed confirmation footer. Source comparison, concurrency and persistence checks remain unchanged.

## Personal libraries and local workspaces — 2026-11-04

The same compact notice, fixed comparison columns and graphical score differences now serve owned personal cloud libraries and local workspaces. Local commands validate both the live draft and the latest IndexedDB copy, then atomically save a backup and the accepted version. Unknown historical baselines require an explicit choice. Joined setlists remain outside source reconciliation.

Verified the real App with synthetic local data at 1280×900 and 390×844, in light and dark themes. The mobile confirmation remains visible, notation colors remain readable, and a successful sync removes the notice after a full reload. App integration tests also cover personal cloud preview and reconciliation.

## Persistent replacement direction — 2026-11-04

Keep library on the left and the named setlist on the right. A fixed two-column band outside the scrolling body labels the source “取用這份譜面” and destination “這份譜面將被覆蓋”; its arrow points from source to destination. Unknown/conflicting versions start unselected. Save-as has no replacement arrow, and invalidated comparisons replace adoption styling with a refresh instruction. Accessible table column headers retain both identities and roles.

The fixed footer names the actual replacement action and offers backup options. Each download is a single-song JSON file with a fresh identity and a version-labelled title, using the existing append-single import flow. Downloads do not reconcile or mutate scores. System backups and concurrency checks remain intact.

Only the body can scroll. The dialog and layout use overflow clipping so WebKit focus scrolling cannot move the fixed header/footer. Phone confirmation uses a full-width row. On very short phones the explicit action label supplies the repeated scope; backup options remain accessible while explanatory footer copy is reduced. Long names remain available in accessible text and title attributes.

Verified synthetic 18-measure comparisons in WebKit at 320×568, 390×844, 834×1194, 1194×834 and 844×390, including both directions, dark English long names, scrolling and backup download. Component/App/source-sync tests cover direction, stale versions, save-as and independent backup downloads.
