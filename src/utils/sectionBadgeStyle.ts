import type { CSSProperties } from 'react';

const getSectionBadgeTone = (accent: string) => {
  switch (accent) {
    case 'blue':
      return {
        backgroundColor: 'rgba(219, 234, 254, 0.96)',
        borderColor: 'rgba(30, 64, 175, 0.92)',
        color: 'rgba(30, 64, 175, 0.96)'
      };
    case 'rose':
      return {
        backgroundColor: 'rgba(255, 228, 230, 0.96)',
        borderColor: 'rgba(159, 18, 57, 0.92)',
        color: 'rgba(159, 18, 57, 0.96)'
      };
    case 'amber':
      return {
        backgroundColor: 'rgba(254, 243, 199, 0.96)',
        borderColor: 'rgba(146, 64, 14, 0.92)',
        color: 'rgba(146, 64, 14, 0.96)'
      };
    case 'emerald':
      return {
        backgroundColor: 'rgba(209, 250, 229, 0.96)',
        borderColor: 'rgba(6, 95, 70, 0.92)',
        color: 'rgba(6, 95, 70, 0.96)'
      };
    case 'cyan':
      return {
        backgroundColor: 'rgba(207, 250, 254, 0.96)',
        borderColor: 'rgba(14, 116, 144, 0.92)',
        color: 'rgba(14, 116, 144, 0.96)'
      };
    case 'fuchsia':
      return {
        backgroundColor: 'rgba(250, 232, 255, 0.96)',
        borderColor: 'rgba(162, 28, 175, 0.92)',
        color: 'rgba(162, 28, 175, 0.96)'
      };
    case 'violet':
      return {
        backgroundColor: 'rgba(237, 233, 254, 0.96)',
        borderColor: 'rgba(109, 40, 217, 0.92)',
        color: 'rgba(109, 40, 217, 0.96)'
      };
    case 'slate':
      return {
        backgroundColor: 'rgba(226, 232, 240, 0.94)',
        borderColor: 'rgba(30, 41, 59, 0.9)',
        color: 'rgba(30, 41, 59, 0.94)'
      };
    default:
      return {
        backgroundColor: 'rgba(224, 231, 255, 0.96)',
        borderColor: 'rgba(55, 48, 163, 0.92)',
        color: 'rgba(55, 48, 163, 0.96)'
      };
  }
};

export const getSectionBadgeStyle = (accent: string): CSSProperties => {
  const tone = getSectionBadgeTone(accent);
  return {
    backgroundColor: tone.backgroundColor,
    borderColor: tone.borderColor,
    color: tone.color
  };
};
