import { useEffect, type RefObject } from 'react';
import { X } from 'lucide-react';
import { controlKeyLabel, KEYBOARD_ACTIONS, MIDI_ACTIONS, type KeyboardAction, type MidiAction } from '../lib/drummerMidi';
import type { useDrummerMidi } from '../hooks/useDrummerMidi';
import './DrummerMidiSettings.css';

export const midiActionLabel = (action: MidiAction, zh: boolean) => ({
  tempoUp: zh ? '加速 +1 BPM' : 'Tempo +1 BPM', tempoDown: zh ? '減速 −1 BPM' : 'Tempo −1 BPM',
  tempo: zh ? '速度旋鈕' : 'Tempo knob', tap: 'TAP', playPause: zh ? '播放／停止' : 'Play / stop',
  previousPage: zh ? '樂譜上一頁' : 'Previous chart page', nextPage: zh ? '樂譜下一頁' : 'Next chart page',
  previous: zh ? '上一首' : 'Previous song', next: zh ? '下一首' : 'Next song',
})[action];

export default function DrummerMidiSettings({ midi, zh, onClose, onPrepareAudio, panelRef }: {
  midi: ReturnType<typeof useDrummerMidi>; zh: boolean; onClose: () => void; onPrepareAudio: () => Promise<void>; panelRef: RefObject<HTMLElement | null>;
}) {
  const t = (a: string, b: string) => zh ? a : b;
  useEffect(() => { panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [panelRef]);
  const notices: Record<string, string> = {
    unsupported: t('此瀏覽器未支援 MIDI。iPad 請使用 App；電腦可使用 Chrome 或 Edge。', 'MIDI is unavailable in this browser. Use the iPad app, or Chrome / Edge on a computer.'),
    'connect-failed': t('無法連線。請確認已允許 MIDI 存取，再重試。', 'Could not connect. Check MIDI permissions, then retry.'),
    disconnected: t('控制器已中斷。接回後請重新選擇裝置，配置仍會保留。', 'Controller disconnected. Reconnect and select it again; your mappings are kept.'),
    'same-knob': t('請使用剛才同一顆旋鈕向左轉。', 'Turn the same knob to the left.'),
    'relative-required': t('尚無法辨識。請先將旋鈕設為 Relative（相對）模式，再重新學習。', 'Mode not recognised. Set the knob to Relative mode, then learn it again.'),
    learned: t('已設定。可繼續設定其他按鍵。', 'Mapped. Continue with the other controls.'),
    saved: t('配置已儲存在這台裝置。', 'Profile saved on this device.'),
    'save-failed': t('無法儲存。請確認瀏覽器允許本機儲存後重試。', 'Could not save. Enable local storage and retry.'),
  };
  const keyLabel = (action: KeyboardAction) => action === 'tempoUp' ? t('加速 +1 BPM', 'Tempo +1 BPM') : action === 'tempoDown' ? t('減速 −1 BPM', 'Tempo −1 BPM') : midiActionLabel(action, zh);
  const keyConflict = midi.notice.startsWith('key-conflict:') ? midi.notice.slice(13) as KeyboardAction : null;
  const conflict = midi.notice.startsWith('conflict:') ? midi.notice.slice(9) as MidiAction : null;
  const message = keyConflict ? t(`這個按鍵已用於「${keyLabel(keyConflict)}」，請換一個。`, `This key is already mapped to ${keyLabel(keyConflict)}.`) : conflict ? t(`這個控制已用於「${midiActionLabel(conflict, zh)}」，請換一個。`, `This control is already mapped to ${midiActionLabel(conflict, zh)}. Choose another.`) : notices[midi.notice];
  return <div className="drummer-midi-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} className="drummer-midi-panel" data-source={midi.source} role="dialog" aria-modal="true" aria-labelledby="drummer-midi-title">
      <header><div><h2 id="drummer-midi-title">{t('MIDI 與鍵盤', 'MIDI & keyboard')}</h2><p>{t('接上、學習，存成自己的配置。', 'Connect, learn, and save your controls.')}</p></div><button aria-label={t('關閉 MIDI 設定', 'Close MIDI settings')} onClick={onClose}><X size={22}/></button></header>
      <div className="drummer-midi-body">
        <div className="drummer-input-sources" role="group" aria-label={t('控制來源', 'Control source')}><button aria-pressed={midi.source === 'midi'} onClick={() => midi.setSource('midi')}>{t('MIDI 控制器', 'MIDI controller')}</button><button aria-pressed={midi.source === 'keyboard'} onClick={() => { void onPrepareAudio(); midi.setSource('keyboard'); }}>{t('電腦鍵盤', 'Computer keyboard')}</button></div>
        {midi.source === 'midi' && <>

        <div className="drummer-midi-connection"><strong>{t('裝置', 'Device')}</strong><button onClick={() => { void onPrepareAudio(); void midi.connect(); }} disabled={midi.status === 'connecting' || midi.status === 'ready'}>{midi.status === 'connecting' ? t('連線中…', 'Connecting…') : midi.status === 'ready' ? t('已啟用 MIDI', 'MIDI enabled') : t('連接控制器', 'Connect controller')}</button></div>
        <label className="drummer-midi-device">{t('選擇裝置', 'Select device')}<select value={midi.selectedId} disabled={!midi.devices.length} onChange={event => void midi.selectDevice(event.target.value)}><option value="">{t('選擇 MIDI 輸入', 'Select MIDI input')}</option>{midi.devices.map(device => <option key={device.id} value={device.id}>{device.name}{device.manufacturer ? ` · ${device.manufacturer}` : ''}</option>)}</select></label>
        {midi.status === 'ready' && !midi.devices.length && <p>{t('尚未找到控制器。接上 USB MIDI 後會自動更新。', 'No controller found. Connect a USB MIDI controller; this list updates automatically.')}</p>}
        </>}
        <div className="drummer-profile-fields">
        <label>{t('我的配置', 'My profiles')}<select value={midi.profileId} onChange={event => midi.loadProfile(event.target.value)}><option value="">{t('新增配置', 'New profile')}</option>{midi.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <label>{t('配置名稱', 'Profile name')}<input value={midi.name} maxLength={60} placeholder={t('例如：鼓手現場', 'e.g. Live drums')} onChange={event => midi.setName(event.target.value)}/></label>
        </div>
        <div className="drummer-midi-mapping-heading"><h3>{t('控制對應', 'Mappings')}</h3><span>{midi.source === 'keyboard' ? Object.keys(midi.keyboard).length : Object.keys(midi.bindings).length} / {midi.source === 'keyboard' ? KEYBOARD_ACTIONS.length : MIDI_ACTIONS.length} {t('已設定', 'mapped')}</span></div>
        <p>{midi.source === 'keyboard' ? t('點選功能後，按下要使用的鍵。輸入文字時不會觸發快捷鍵；Esc 與 Tab 保留給介面操作。', 'Choose a function, then press a key. Shortcuts are inactive while typing. Esc and Tab remain navigation keys.') : t('點選要設定的功能，再操作控制器。設定畫面開啟時不會觸發播放或換歌。', 'Choose a function, then move its hardware control. No MIDI actions run while this panel is open.')}</p>
        {midi.source === 'midi' && midi.learning && <div className="drummer-midi-learning" role="status"><strong>{midi.learning.action === 'tempo' ? (midi.learning.firstCount === 2 ? t('現在向左慢轉幾格', 'Now turn slowly left a few steps') : t('請向右慢轉幾格', 'Turn slowly right a few steps')) : t(`請按一下「${midiActionLabel(midi.learning.action, zh)}」要用的實體按鍵`, `Press the hardware button for ${midiActionLabel(midi.learning.action, zh)}`)}</strong><button onClick={midi.cancelLearn}>{t('取消學習', 'Cancel learn')}</button></div>}
        {midi.source === 'midi' && <div className="drummer-midi-mappings drummer-control-mappings">{MIDI_ACTIONS.map(action => {
          const binding = midi.bindings[action];
          return <div className="drummer-midi-mapping" key={action} data-action={action} data-learning={midi.learning?.action === action}>
            <div><strong>{midiActionLabel(action, zh)}</strong><small>{binding ? `${binding.type === 'cc' ? 'CC' : 'Note'} ${binding.number} · ${t('通道', 'Ch')} ${binding.channel + 1}` : t('尚未設定', 'Not mapped')}</small></div>
            <button disabled={!midi.selectedId} aria-label={t(`設定${midiActionLabel(action, zh)}`, `Learn ${midiActionLabel(action, zh)}`)} onClick={() => midi.learn(action)}>{binding ? t('重新學習', 'Relearn') : t('開始學習', 'Learn')}</button>
            {binding && <button className="drummer-midi-clear" aria-label={t(`清除${midiActionLabel(action, zh)}設定`, `Clear ${midiActionLabel(action, zh)} mapping`)} onClick={() => midi.clearBinding(action)}><X size={16}/></button>}
          </div>;
        })}</div>}
        {midi.source === 'midi' && midi.bindings.tempo && <label>{t('旋鈕每步調整', 'BPM per step')}<select value={midi.bindings.tempo.step ?? 1} onChange={event => midi.setStep(Number(event.target.value))}><option value="1">1 BPM</option><option value="0.1">0.1 BPM</option></select></label>}
        {midi.source === 'keyboard' && <>
          {midi.keyLearning && <div className="drummer-midi-learning" role="status"><strong>{t(`請按下「${keyLabel(midi.keyLearning)}」要用的鍵`, `Press a key for ${keyLabel(midi.keyLearning)}`)}</strong><button onClick={midi.cancelLearn}>{t('取消學習', 'Cancel learn')}</button></div>}
          <div className="drummer-midi-mappings drummer-control-mappings">{KEYBOARD_ACTIONS.map(action => <div className="drummer-midi-mapping" data-learning={midi.keyLearning === action} key={action}><div><strong>{keyLabel(action)}</strong><small>{midi.keyboard[action] ? controlKeyLabel(midi.keyboard[action]!) : t('尚未設定', 'Not mapped')}</small></div><button aria-label={t(`設定鍵盤${keyLabel(action)}`, `Learn keyboard ${keyLabel(action)}`)} onClick={() => midi.learnKey(action)}>{midi.keyboard[action] ? t('重新學習', 'Relearn') : t('開始學習', 'Learn')}</button>{midi.keyboard[action] && <button className="drummer-midi-clear" aria-label={t(`清除鍵盤${keyLabel(action)}`, `Clear keyboard ${keyLabel(action)}`)} onClick={() => midi.clearKey(action)}><X size={16}/></button>}</div>)}</div>
        </>}

        {message && <p className="drummer-midi-notice" role="status">{message}</p>}
      </div>
      <footer><span>{midi.dirty ? t('有未儲存的變更', 'Unsaved changes') : t('配置只儲存在這台裝置', 'Saved on this device')}</span><button className="drummer-midi-save" disabled={!midi.name.trim() || (midi.source === 'keyboard' ? !Object.keys(midi.keyboard).length || Boolean(midi.keyLearning) : !midi.selectedId || !Object.keys(midi.bindings).length || Boolean(midi.learning))} onClick={midi.save}>{t('儲存配置', 'Save profile')}</button></footer>
    </section>
  </div>;
}
