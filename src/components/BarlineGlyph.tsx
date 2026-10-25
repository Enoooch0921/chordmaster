const BarlineGlyph = ({ final = false }: { final?: boolean }) => (
  <svg viewBox="0 0 18 22" width="18" height="22" className="inline-block shrink-0 align-middle" aria-hidden="true">
    <path d="M5 3V19" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 3V19" stroke="currentColor" strokeWidth={final ? 4 : 1.5} />
  </svg>
);

export default BarlineGlyph;
