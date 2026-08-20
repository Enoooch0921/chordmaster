import React from 'react';

type BeatSlashGlyphProps = Omit<React.SVGProps<SVGSVGElement>, 'children' | 'viewBox'>;

const BeatSlashGlyph: React.FC<BeatSlashGlyphProps> = ({
  className = 'h-[0.92em] w-[0.7em]',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    viewBox="0 0 16 16"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M3 13L13 3" />
  </svg>
);

export default BeatSlashGlyph;
