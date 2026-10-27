---
version: 1
slug: "src-components-setlistsourcesynccontrol-tsx"
primary_target: "src/components/SetlistSourceSyncControl.tsx"
related_targets: ["src/components/SetlistSourceSyncControl.css", "src/lib/setlistSourceComparison.ts", "src/lib/setlistSourceSync.ts"]
---

# Clear source reconciliation

Mode: Operate / Read. Preserve the green product identity, exact snapshots, backups and concurrency checks.

THESIS: Users can tell what differs, which version they will use and exactly where it will be written.
FORM: Current library and named setlist stay in fixed columns. Show actual changed values and added/removed measure contents. Conflicts require an explicit direction. Highlight the adopted column, label the affected column, and keep scope and directional confirmation visible in a fixed footer. Comparison content scrolls inside the viewport; save-as and baseline history use disclosures. Identity-only differences never masquerade as changed music; their exact records still guard persistence.
QUALITY BAR: Direction changes never swap comparison columns. No writes occur on preview or selection. A failed or stale confirmation requires a fresh preview. Verify short and narrow screens, visible buttons, empty comparisons and save-as retries. Use local fixtures without production writes.

The App uses a compact floating entry above its existing preview controls. It must not insert a band above the content area or participate in sheet sizing. Verify notice transitions by measuring viewport bounds, sheet transform, scroll position and the visible song’s coordinates before/after a real local score edit.
