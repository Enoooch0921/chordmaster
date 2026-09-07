import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RecoveryBoundary from './RecoveryBoundary';
import { setRecoverySnapshot } from '../lib/recovery';

describe('view recovery', () => {
  afterEach(() => { setRecoverySnapshot(null); vi.restoreAllMocks(); });
  it('keeps the surrounding workspace mounted and retries a failed view', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = true;
    const View = () => { if (fail) throw new Error('render error'); return <div>Recovered chart</div>; };
    setRecoverySnapshot({ songs: [{ title: 'Unsaved song' }] });
    render(<><div>Workspace controls</div><RecoveryBoundary label="預覽"><View /></RecoveryBoundary></>);
    expect(screen.getByText('Workspace controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下載資料備份' })).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(screen.getByText('Recovered chart')).toBeInTheDocument();
  });
});
