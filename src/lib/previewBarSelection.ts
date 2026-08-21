export interface PreviewBarSelectionTarget {
  previewIdentity: string;
  sectionId: string;
  barId: string;
}

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
