---
version: 1
slug: "src-components-swipeactionrow-tsx"
primary_target: "src/components/SwipeActionRow.tsx"
related_targets: ["src/App.tsx", "src/components/SwipeActionRow.test.tsx"]
---

# Isolated swipe actions

Mode: Operate. Preserve the existing meeting/project cards, member identities and role controls.

THESIS: A row follows the finger without involving the score renderer, and exposes exactly the action the gesture requests.
OWN-WORLD: Existing archive/delete actions, neutral opaque surfaces, selection tint, rounded row clipping and shared UI_EASE_OUT.
STORY: Swipe a meeting/project right for archive or left for delete. Swipe a removable member left; pull back to close. Scroll normally without triggering an action or role change.
FORM: Pointer events with horizontal axis lock, native vertical/pinch touch actions, per-frame DOM transforms and local settled accessibility state. No App drag state. Paint only the exposed side; keep closed actions hidden/inert and the foreground opaque. Release snaps last 160ms, keyboard/reduced snaps are immediate. Only one row is open; context, cancellation, outside interaction, Escape and inactivity close it.
QUALITY BAR: Same synthetic desktop gesture before/after measured fourteen React commits (seven expensive, roughly 27–86ms each) versus one local 0.6ms commit on release. This is development desktop evidence, not an old-iPad frame-rate claim. Tablet-width visual checks and touch-pointer tests cover direction, scroll, cancellation, reverse, hidden layers and confirmations; old-iPad feel still requires device testing. Keep score geometry and backend data untouched by gesture previews.
