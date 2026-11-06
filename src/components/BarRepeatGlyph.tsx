import type { SVGProps } from 'react';

type BarRepeatGlyphProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>;

export default function BarRepeatGlyph({ className = 'h-7 w-7', ...props }: BarRepeatGlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" data-bar-repeat-glyph {...props}>
      <circle cx="9" cy="9" r="1.2" />
      <circle cx="15" cy="15" r="1.2" />
      <path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
