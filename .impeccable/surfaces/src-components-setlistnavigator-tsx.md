---
version: 1
slug: "src-components-setlistnavigator-tsx"
primary_target: "src/components/SetlistNavigator.tsx"
related_targets: ["src/App.tsx", "src/hooks/useSetlistNavigationMemory.ts", "src/hooks/useSetlistOpening.ts", "src/lib/setlistNavigationMemory.ts"]
---

# Remembered setlist navigation and opening feedback

Mode: Operate / Read. Preserve the existing project cards, setlist rows, typography and chart geometry.

THESIS: Opening the app resumes the same place, and opening a meeting visibly acknowledges input before its score renders.
OWN-WORLD: Existing project/setlist hierarchy, navigation pane, green selection, semantic light/dark surfaces and shared motion timings.
STORY: Resume a project overview or its meeting. If the meeting was archived, return to its parent for a deliberate new choice; if the project was archived, return to All Setlists. Open an active meeting with immediate named loading feedback over the right preview and a directional hierarchy push.
FORM: Device-local preferences scoped to account/library, resolved after cloud readiness. No score or permission mutations. Loading status paints before the deferred React transition. Panel-only Motion presence, 240ms with UI_DRAWER_EASE. Forward: child enters from +100%, parent retreats to -25%; back reverses the paths. Exiting panels become inert. Reduced motion fades for 125ms, keyboard instant. No chart translation, no layout projection and no panel animation on automatic restoration.
QUALITY BAR: Refresh retains the meeting; archived meetings/projects land at the required level without choosing another meeting. A delayed cloud/shared-project load must not erase memory. Pending work is cancelled on context changes. Verify loading acknowledgement in the right preview, both slide directions, rapid reversals and a fixed chart position.
