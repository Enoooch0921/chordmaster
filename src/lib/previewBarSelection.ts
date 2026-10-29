export interface PreviewBarSelectionTarget {
  previewIdentity: string;
  sectionId: string;
  barId: string;
}

// Keep the anchor outside the selection: repeated Shift-clicks can shrink a
// range, and Cmd/Ctrl+Shift can add a range without losing isolated selections.
export const selectPreviewBarRange = (
  current: PreviewBarSelectionTarget[],
  ordered: PreviewBarSelectionTarget[],
  target: PreviewBarSelectionTarget,
  anchor: PreviewBarSelectionTarget | null,
  additive = false
): PreviewBarSelectionTarget[] => {
  const candidates = ordered.filter((item) => item.previewIdentity === target.previewIdentity);
  const end = candidates.findIndex((item) => getPreviewBarSelectionKey(item) === getPreviewBarSelectionKey(target));
  if (end < 0) return current;
  const start = anchor ? candidates.findIndex((item) => getPreviewBarSelectionKey(item) === getPreviewBarSelectionKey(anchor)) : -1;
  const range = candidates.slice(Math.min(start < 0 ? end : start, end), Math.max(start < 0 ? end : start, end) + 1);
  const keys = new Set([...range, ...(additive ? current : [])].map(getPreviewBarSelectionKey));
  return candidates.filter((item) => keys.has(getPreviewBarSelectionKey(item)));
};

export const getPreviewBarSelectionKey = (target: PreviewBarSelectionTarget) => (
  `${target.previewIdentity}\u0000${target.sectionId}\u0000${target.barId}`
);

export const togglePreviewBarSelection = (
  current: PreviewBarSelectionTarget[],
  target: PreviewBarSelectionTarget,
  activeTarget: PreviewBarSelectionTarget | null = null
): PreviewBarSelectionTarget[] => {
  const samePreviewTargets = current.filter((candidate) => (
    candidate.previewIdentity === target.previewIdentity
  ));
  const targetKey = getPreviewBarSelectionKey(target);
  const activeKey = activeTarget ? getPreviewBarSelectionKey(activeTarget) : null;
  const seededTargets = samePreviewTargets.length === 0
    && activeTarget?.previewIdentity === target.previewIdentity
    && activeKey !== targetKey
    ? [activeTarget]
    : samePreviewTargets;
  const exists = samePreviewTargets.some((candidate) => (
    getPreviewBarSelectionKey(candidate) === targetKey
  ));

  return exists
    ? seededTargets.filter((candidate) => getPreviewBarSelectionKey(candidate) !== targetKey)
    : [...seededTargets, target];
};
