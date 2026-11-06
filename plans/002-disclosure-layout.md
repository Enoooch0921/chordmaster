# 002 — Remove per-frame disclosure layout

- **Status**: DONE
- **Commit**: 768fefd7
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: InteractionMotion.tsx and existing keyboard/disclosure tests

## Problem

`src/components/ui/InteractionMotion.tsx:34–40`:
```tsx
hidden: { height: 0, opacity: 0 },
visible: (preference) => ({ height: 'auto', opacity: 1, transition: {
  height: { duration: preference.instant || preference.reduced ? 0 : 0.2, ease: UI_EASE_OUT },
  opacity: { duration: preference.instant ? 0 : 0.125, ease: UI_EASE_OUT }
} })
```
`DisclosureBody` at 51–65 measures via ResizeObserver and then animates every measured height in resize mode. `PreviewBarEditor.tsx:1951` uses this for the frequently changed keyboard. `usePreviewKeyboardVisibility.ts:100–143` observes its panel, rescans all preview anchors, reads layout/styles and changes padding/scroll for those height frames. Workspace and metadata disclosure users also pay layout during animation.

## Target

Use natural layout height with no tween while mounted; on close keep its height during the opacity exit and unmount after 125ms, making a single layout change. Keyboard modality unmounts immediately. Animate opacity only for 125ms with UI_EASE_OUT `[0.23, 1, 0.32, 1]`. Keyboard modality duration zero. Keep outgoing content mounted for the opacity exit but inert and aria-hidden immediately. Existing resize prop callers may remain source-compatible; remove measurement/height tween infrastructure if unnecessary. No animated height, width, padding, top, left or measured intermediate heights.

## Repo conventions

Use existing AnimatePresence/useIsPresent and UiMotionPreference patterns. Follow existing inert/aria-hidden handling, preserve inner content refs if needed. Opacity-only motion is appropriate for these frequent disclosures.

## Steps

1. Refactor AnimatedDisclosure/DisclosureBody to use static final geometry plus opacity presence. Prefer no ResizeObserver/state for auto height. Preserve resize prop call signature to avoid unrelated call-site changes. Ensure keyboard body does not disappear briefly on mode/content changes.
2. Extend meaningful tests for final layout behavior, immediate inert exit, no per-frame keyboard avoidance loop; run existing visibility and keyboard tests. Ensure manual scrolling interruption and top/bottom keyboard clearance still work.
3. Browser exercise keyboard expand/collapse and chords/rhythm/jianpu switches on a long synthetic setlist. Compare layout/ResizeObserver events; verify active bar remains visible and scrolling does not oscillate. Also exercise metadata/workspace disclosures.

## Boundaries

No data/notation change, no new animation subsystem, no dependencies. Do not change keyboard placement/avoidance rules or user-scroll priority. Do not alter unrelated files.

## Verification

`npm run lint`; tests for InteractionMotion, PreviewBarEditor, usePreviewKeyboardVisibility and ResponsiveDialog; production build. Slow-playback: content fades at natural size then unmounts rather than dragging the whole document through intermediate sizes; reduced-motion gets opacity, keyboards immediate. Done when height animation is absent and active bar visibility remains correct.

## Result

Implemented and reviewed in isolated worktree, then integrated after checking parent file versions. Typecheck, production build, diff check and 381 tests across six focused suites passed. Combined browser validation belongs to plan001.
