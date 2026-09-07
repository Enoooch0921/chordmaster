import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ native: vi.fn(), write: vi.fn(), share: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: mocks.write }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));
import { downloadRecoveryData } from './recovery';

describe('recovery backup delivery', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.native.mockReturnValue(true); mocks.write.mockResolvedValue({ uri: 'file:///cache/recovery.json' }); });

  it('saves Unicode backup contents and shares only the native file', async () => {
    await downloadRecoveryData({ songs: [{ title: '主日歌譜' }] });
    const [options] = mocks.write.mock.calls[0];
    expect(JSON.parse(options.data).songs[0].title).toBe('主日歌譜');
    expect(options.encoding).toBe('utf8');
    expect(mocks.share).toHaveBeenCalledWith({ files: ['file:///cache/recovery.json'] });
  });

  it('handles cancellation without reporting a backup failure', async () => {
    mocks.share.mockRejectedValue(new Error('Share canceled'));
    await expect(downloadRecoveryData({ songs: [] })).resolves.toBeUndefined();
  });

  it('surfaces disk failure instead of claiming a successful backup', async () => {
    mocks.write.mockRejectedValue(new Error('Disk full'));
    await expect(downloadRecoveryData({ songs: [] })).rejects.toThrow('Disk full');
    expect(mocks.share).not.toHaveBeenCalled();
  });
});
