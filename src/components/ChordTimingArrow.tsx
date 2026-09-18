import React from 'react';

interface ChordTimingArrowProps {
  /** Earlier/left (<), later/right (>), matching the stored chord suffix. */
  marker: '<' | '>';
  className?: string;
  strokeWidth?: number;
}

export default function ChordTimingArrow({ marker, className, strokeWidth = 1.5 }: ChordTimingArrowProps) {
  return (
    <svg viewBox="0 0 32 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {marker === '<'
        ? <><path d="M16 20c0-8-4-10-12-10" /><path d="M7 7l-3 3 3 3" /></>
        : <><path d="M16 20c0-8 4-10 12-10" /><path d="M25 7l3 3-3 3" /></>}
    </svg>
  );
}
