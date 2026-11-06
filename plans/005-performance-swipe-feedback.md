# 005 — Add direct swipe feedback and discoverable performance navigation

- **Status**: DONE — integrated and verified locally
- **Commit**: 768fefd7 + current uncommitted animation fixes
- **Severity**: HIGH
- **Category**: Gesture feedback / first-use guidance

## Problem
`src/App.tsx` performanceTouchRef only records touchstart/end; no touchmove feedback. Existing44px horizontal threshold turns immediately and suppresses synthetic click. New users think tiny arrows are the only targets though existing left/right half-screen areas are active. User explicitly requests modest finger-following motion and better discoverability.

## Target
Add a dedicated reusable gesture hook and minimal App integration. Full transform string applied directly to a separate swipe wrapper around performance spread; leave existing scale/vertical-page translator untouched. Horizontal intent locks after small travel; frame-coalesced ref/DOM updates, no WorkspaceApp rerender per pointermove or within-song turn. Small capped direct translation during touch; cancellation/release settles rapidly using existing Motion/WAAPI with UI_EASE_OUT[.23,1,.32,1] and duration160–200ms, or existing spring where warranted. No width/height/layout animation. Keep vertical gestures/multitouch, handwriting and chrome controls safe; ignore interactive controls and notes. Cancel cleanly on exit/reentry/page identity/scope changes. Keyboard/pedal remains instant. Reduced motion retains feedback without displacement. Existing swipes only count once; swipe-to-next/previous still crosses songs correctly and previous ends at final spread.

Show a brief unobtrusive first-use inline hint '左右滑動翻頁，也可輕點畫面左右兩側' (English localized), not modal/onboarding tour. Should not block reading or interact with full-height hit areas; a small reachable acknowledgement and persistent understandable control labels if appropriate. Save dismissal/learned state in local browser; first successful gesture can dismiss. Guide may remain visible until understood (not disappearing with idle before read). Existing arrows keep broad hit targets, accessible labels and shortcuts. Respect dark surround/light paper.

## Steps and boundaries
Executor works in isolated worktree with current parent App/hooks/CSS snapshot; primary root is editing sidebar handlers and token typography elsewhere, preserve all. Own new gesture hook/tests, performance-specific App changes/index.css section and performanceSafety tests only. Do not copy entire App/index.css back; send focused patch for parent review. Read animate skill, impeccable animate/onboard references and performance-mode surface brief; historical 'no new animation' is overridden only by current user request. Use existing styles/tokens, no dependencies. No backend/remote data/commit/push/deploy. Meaningful tests: drag preview before release, short swipe snaps back without page, vertical/multitouch/control/handwriting excluded, synthetic click prevention, page/last/first/song boundaries, reduced motion, keyboard immediate, hint dismissal persistence. Browser feel check synthetic multipage at desktop/tablet/phone; ensure no extra score renders within-song. Parent review before integration.

## Result
Implemented independent swipe feedback, cancellation and first-use guidance. Synthetic native CDP touch measured 80px finger travel → 17.6px paper feedback, then exactly one turn and zero App/ChordSheet commits for within-song navigation. Short/vertical/multitouch/cancel, cross-song boundary, assistive click and immediate hardware input checks passed. Evidence: `output/playwright/performance-swipe-20261106/browser-verification.json`. Parent integration passed targeted tests, typecheck and production build. Physical iPad testing remains unverified; nothing is deployed.
