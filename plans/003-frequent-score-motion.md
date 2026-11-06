# 003 — Stop repeated editor and notation entrance motion

- **Status**: DONE
- **Commit**: 768fefd7
- **Severity**: MEDIUM
- **Category**: Performance / Purpose & frequency
- **Estimated scope**: SongEditor.tsx, ChordSheet.tsx and existing tests

## Problem

`src/components/SongEditor.tsx:6512–6515`: the compact inspector uses `layout`, `initial={{ opacity: 0, y: -10 }}`, `animate={{ opacity: 1, y: 0 }}`, transition 180ms whenever its active-bar key remounts. Nested layout springs also occur at 6661,6974,7228:
```tsx
layout
transition={{ layout: { type: 'spring', stiffness: 360, damping: 30 } }}
```
This measures substantial editor layout for frequent typing/bar-selection updates. Section wrapper `transition-all` can animate size/scale as well.

`src/components/ChordSheet.tsx:364–376` push/pull markers individually mount animated from scale zero:
```tsx
initial={{ scale: 0, opacity: 0, x: 5, y: 5 }}
animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
```
This causes many unnecessary Motion springs while rendering large scores and ignores reduced/keyboard modality.

## Target

High-frequency score editing and static notation have immediate rendering; no per-marker entrance or compact inspector layout/position tween. Preserve all notation and marker CSS geometry, collision offsets, drag gesture behavior and DOM data attributes. Prefer deleting unnecessary layout motion and broad transitions to inventing alternate animations. Existing occasional overlay surfaces keep their normal tokens.

## Repo conventions

`src/lib/uiMotion.ts`: no motion on score content. ChordSheet already `initial={false}` on ordinary score rows. Use plain div for static markers; retain same className and attributes.

## Steps

1. Replace only push/pull marker motion.div wrappers with div, removing initial/animate. Keep classes and children verbatim.
2. Remove compact inspector layout/entrance, and unconditional layout/layout transition from section shell and bars grid. Review wrapper at 6661 similarly. These should not do layout measurement during editing. Preserve any actual drag transforms and drag reorder handlers; do not remove functional motion props used for gestures.
3. Replace transition-all on the affected section shell with explicit color-only transitions or none (high-frequency active section highlighting should be immediate). Do not mass-edit all button transitions without evidence.
4. Existing notation tests must retain arrows and collision geometry. Existing SongEditor tests for compact navigation, editing, collapse and drag must pass. Browser keyboard/bar selection should update instantly; reduced motion must have no marker entrance.

## Boundaries

No styling redesign, no notation values/chord semantics changes, no drag behavior change, no broad motion cleanup. If documented intentional motion is found, report it before changing that part.

## Verification

`npm run lint`, relevant SongEditor/ChordSheet/FormattedChord/collision tests, `npm run build`. Browser: open compact inspector, switch bars rapidly and enter text; verify no wobble/vertical tween and no new layout springs. Push/pull symbols fully visible on first frame and export unchanged. Done when these repeated animation instances are removed and existing editing still works.

## Result

Implemented and reviewed in isolated worktree, then integrated after checking parent file versions. Typecheck, production build, diff check and 381 tests across six focused suites passed. Combined browser validation belongs to plan001.
