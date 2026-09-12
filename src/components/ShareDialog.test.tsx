import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareDialog from './ShareDialog';
import { ShareContactPicker } from './ShareContactPicker';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
const contacts = [{ userId: 'one', name: '小美', email: 'mei@example.com' }, { userId: 'two', name: 'Joseph', email: 'joseph@example.com' }];
const labels = { title: '選擇聯絡人', empty: '沒有聯絡人', button: '分享給所選聯絡人', syncing: '載入中' };

describe('ShareDialog', () => {
  it('keeps copy separate from contacts and shows success without closing the dialog', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<ShareDialog language="zh" title="分享歌單" url="https://example.com/share/song" sharing={false} onClose={onClose} onCopy={onCopy} contacts={<div>聯絡人清單</div>} />);
    await user.click(screen.getByRole('button', { name: '複製連結' }));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('連結已複製');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '邀請聯絡人' }));
    expect(screen.getByRole('button', { name: '邀請聯絡人' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps selected contacts across filtering and retries failed sharing without losing selection', async () => {
    const user = userEvent.setup();
    const onShare = vi.fn().mockRejectedValueOnce(new Error('網路中斷')).mockResolvedValueOnce(1);
    render(<ShareContactPicker language="zh" contacts={contacts} labels={labels} loading={false} sharing={false} onShare={onShare} />);
    await user.click(screen.getByRole('button', { name: /小美/ }));
    await user.type(screen.getByRole('textbox', { name: '搜尋聯絡人' }), 'joseph');
    expect(screen.queryByRole('button', { name: /小美/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '分享給所選聯絡人 (1)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('網路中斷');
    expect(screen.getByRole('button', { name: '分享給所選聯絡人 (1)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '分享給所選聯絡人 (1)' }));
    expect(onShare).toHaveBeenLastCalledWith(['one']);
    expect(await screen.findByRole('status')).toHaveTextContent('已分享給 1 人');
    expect(screen.getByRole('button', { name: '分享給所選聯絡人' })).toBeDisabled();
  });

  it('keeps drafts when switching sharing methods and prevents duplicate submissions', async () => {
    const user = userEvent.setup();
    let finish: (count: number) => void;
    const onShare = vi.fn(() => new Promise<number>((resolve) => { finish = resolve; }));
    function Harness() {
      const [sharing, setSharing] = useState(false);
      return <ShareDialog language="zh" title="分享歌單" url="https://example.com/share/song" sharing={sharing} onClose={vi.fn()} onCopy={vi.fn()} contacts={<ShareContactPicker language="zh" contacts={contacts} labels={labels} loading={false} sharing={sharing} onShare={async (ids) => { setSharing(true); try { return await onShare(); } finally { setSharing(false); } }} />} />;
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '邀請聯絡人' }));
    await user.click(screen.getByRole('button', { name: /小美/ }));
    await user.click(screen.getByRole('button', { name: '分享連結' }));
    await user.click(screen.getByRole('button', { name: '邀請聯絡人' }));
    expect(screen.getByRole('button', { name: /小美/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '分享給所選聯絡人 (1)' }));
    expect(screen.getByRole('button', { name: '分享給所選聯絡人 (1)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '關閉分享' })).toBeDisabled();
    finish!(1);
    expect(await screen.findByRole('status')).toHaveTextContent('已分享給 1 人');
    expect(onShare).toHaveBeenCalledOnce();
  });
});
