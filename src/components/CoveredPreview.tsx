import { memo, type ReactNode } from 'react';

type Props = { covered: boolean; scope: string; children: ReactNode };

/** Keep the last committed preview while phone navigation covers it. The outer
 * inert boundary still updates immediately; uncovering applies current content
 * and callbacks. A resource/account change must never reuse another scope. */
const PreviewContent = memo(function PreviewContent({ children }: Props) {
  return <>{children}</>;
}, (previous, next) => next.covered && previous.scope === next.scope);

export default function CoveredPreview(props: Props) {
  return <div className="contents" inert={props.covered || undefined} data-covered-preview={props.covered}>
    <PreviewContent {...props} />
  </div>;
}
