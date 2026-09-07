import { Capacitor } from '@capacitor/core';

let recoverySnapshot: unknown = null;

export const setRecoverySnapshot = (snapshot: unknown) => { recoverySnapshot = snapshot; };
export const getRecoverySnapshot = () => recoverySnapshot;

export const downloadRecoveryData = async (data: unknown, fileName = 'ChordMaster-recovery.json') => {
  const serialized = JSON.stringify(data, null, 2);
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share')
    ]);
    const file = await Filesystem.writeFile({ path: fileName, data: serialized, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try { await Share.share({ files: [file.uri] }); }
    catch (error) { if (!/cancel|abort/i.test(String(error))) throw error; }
    return;
  }
  const blob = new Blob([serialized], { type: 'application/json' });
  const file = new File([blob], fileName, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (error) { if (/cancel|abort/i.test(String(error))) return; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
