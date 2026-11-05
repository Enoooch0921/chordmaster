import type { Section } from '../types';
import { isClosedBar } from './closedBar';
import { hasUnmeteredChords } from './unmeteredChords';

export const lastOpenBarIndex = (section: Section): number => {
  for (let index = section.bars.length - 1; index >= 0; index--) {
    if (!isClosedBar(section.bars[index])) return index;
  }
  return -1;
};

export const hasDoubleBarline = (section: Section, barIndex: number): boolean => {
  const bar = section.bars[barIndex];
  if (!bar || bar.repeatEnd || bar.finalBar) return false;
  if (bar.doubleBar) return true;
  return !bar.singleBar && !hasUnmeteredChords(bar) && !isClosedBar(bar)
    && barIndex === lastOpenBarIndex(section);
};
