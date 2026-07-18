import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreviewSectionActionMenu from './PreviewSectionActionMenu';

const anchorRect = {
  left: 120,
  top: 80,
  right: 200,
  bottom: 112,
  width: 80,
  height: 32
};

describe('PreviewSectionActionMenu', () => {
  it('shows anchored desktop actions and disables deleting the only section', () => {
    const onDuplicate = vi.fn();
    render(
      <PreviewSectionActionMenu
        language="zh"
        deviceLayout="desktop"
        title="Chorus"
        anchorRect={anchorRect}
        canDelete={false}
        onRename={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Chorus')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刪除段落' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '複製到後方' }));
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it('uses the touch bottom sheet for phone and tablet layouts', () => {
    const { rerender } = render(
      <PreviewSectionActionMenu
        language="zh"
        deviceLayout="phone"
        title="Verse"
        anchorRect={anchorRect}
        canDelete
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('段落操作')).toBeInTheDocument();

    rerender(
      <PreviewSectionActionMenu
        language="zh"
        deviceLayout="tablet"
        title="Bridge"
        anchorRect={anchorRect}
        canDelete
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Bridge')).toBeInTheDocument();
  });
});
