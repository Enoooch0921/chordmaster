---
version: 1
slug: "src-components-drummermode-tsx"
primary_target: "src/components/DrummerMode.tsx"
related_targets: ["src/components/DrummerMode.css","src/lib/metronome.ts","src/hooks/useMetronome.ts","src/App.tsx"]
---

# Drummer mode

Operate surface for worship drummers on phones and iPads. The user approved a setlist-linked stage metronome with large BPM, TAP, speed adjustment, single-tap song playback and optional score reading. Preserve the current ChordMaster visual system and all score data. This is an extension with a confirmed composition, implemented directly in code.

## Direction contract

THESIS: Keep the sounding song, tempo and transport unmistakable while making the next song reachable in one deliberate action.

OWN-WORLD: Inherit semantic light/dark surfaces, green active states, system UI typography and existing printed score rendering. Use flat rows and a prominent tabular tempo readout, with no decorative imagery.

STORY: Open a setlist snapshot, start the selected song, tap or adjust its temporary tempo, tap any setlist row to start that song immediately from beat one. There is no queue; dedicated previous/next buttons also select and play immediately, per the user’s later update.

FIRST VIEWPORT: Header names the setlist and exit action. Phone shows the current song, a meter-only label and current note symbol above the large editable BPM and +/- controls, then three-level beat columns without visible explanatory hints that cycle accent / silent / soft / regular per beat, one current subdivision glyph beside tempo metadata; tapping opens a compact menu of four formal music glyphs, including triplets, with no visible note names or tooltips; each setlist entry remembers its choice on this device, large transport/TAP controls and a scrolling setlist with a large BPM column on the left, meter above the song title on the right; its score tab retains the transport. Tablet places the score alongside the same control column and setlist. Audio settings remain secondary. A Live mode entry requests browser fullscreen and keeps the same mounted audio engine and chart. At 600 px and above, outside the phone-landscape query below, a complete A4 page fits the available height/width on the right by default. The left column holds the scrolling setlist above a bottom-anchored performance console, using the same width in standard and live modes to preserve position. Large Play/TAP and +/- targets, plus one compact 52 px-high meter/note picker, take priority over compactness. Wider consoles put tempo and beat bars side by side. Portrait phones retain chart/setlist tabs above their bottom controls; short landscape phones use the no-chart, left-controls/right-setlist composition below and open sound settings in a full-height sheet. Entering live mode and switching songs reset chart fit to the entire A4; resize preserves its aspect ratio.

FORM: Extend the existing performance workspace with the approved phone/control and tablet/score composition. seed: none (existing approved composition).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

No production data access, automatic score following, native background playback, or shared BPM writes. The user confirmed the official Goodness of God Click Track preview on 2026-10-31: MultiTracks Click is now the default. Two one-shots are exact PCM excerpts of the decoded public AAC preview, with source, frame ranges, processing and hashes recorded; they are not claimed as lossless original masters. Preserve Ableton Live Classic using the existing byte-identical installed-app samples. Add Drive Click from exact 48 kHz stereo PCM24 one-shot excerpts of the user-provided Click(150).wav, with frame ranges and hashes recorded; do not ship the loudness-matched comparison files. All three use AudioBufferSourceNode, unchanged pitch and decay, and gain-only beat strengths. A native sound select is first in the existing secondary settings and stays enabled while starting or playing; the closed summary names the current sound. Changing sound cancels pending loads/clicks and restarts with the new sound, current tempo and pattern. Stopped changes remain silent. Only meter and beat-unit grouping require stopping before changes. Choice and volume persist on this device across songs and reopening. Cache pairs independently, retry failed pairs, reject stale starts, and never substitute a synthetic or different sound on failure. All six WAVs ship with offline build assets. Reuse usePerformanceFullscreen for standard/WebKit request, ownership, rejection and teardown behavior; a failed fullscreen request keeps live layout usable. Escape closes the note picker before leaving live mode. Use Web Audio scheduling, personal preferences and in-session tempo overrides. Missing BPM or unconfirmed meter must be resolved locally before playback. Hidden pages and interrupted audio stop explicitly; attempt a screen wake lock during foreground playback. Entry IDs distinguish duplicate songs. Stop and release audio on exit.


## Controller and keyboard follow-up (2026-10-31)

Standard and live modes share bottom-anchored tempo/transport. The selected song is a full green row with white metadata and aria-current; visible Current/Playing status text is removed. Three-digit and decimal tempo strings scale within their own input, with fixed large +/- targets. Meter and subdivision share one compact control; normal subdivisions reuse the existing RhythmNotation glyph geometry rather than independent hand-drawn beams. Generic drummer button styling excludes descendants of the scaled score, preserving ChordSheet section badges’ native size, radius, colors and full opacity. Multi-page A4 charts turn one page at a time in live mode without moving the console; the second preview entry is explicitly synthetic two-page content.

MIDI and keyboard share one full-height, focus-contained setup sheet. Explicit source selection, learning, duplicate-control feedback and named local profiles take precedence over device-specific presets. Keyboard controls include independent +1/-1 BPM, TAP, play/stop and previous/next. Editable fields, composition and system modifier shortcuts are protected. Performance actions are suspended while either setup sheet is open. Use paired keyboard rows on wide sheets and single rows on phones, with a persistent save footer. CoreMIDI is native iPad-only; Web MIDI is the supported desktop path. Hardware latency remains an explicit verification boundary.

TAP acquires from new gesture intervals, then stabilizes; pointer-down and original key/MIDI timestamps avoid release and callback timing errors. Sound settings occupy a full-height sheet instead of a small nested scroll region.


The standard/performance follow-up unifies the entire left grid and toolbar, not just its column width. MIDI and the fixed-width 演出模式/一般模式 switch share exact coordinates. The title remains 鼓手模式. Workspace entry/exit slides only the left sidebar/controls horizontally and reverses direction on return. The right preview stays still; left snapshots are clipped to their bounds. Fullscreen ownership and audio teardown remain explicit.


Final motion direction: one complete left-panel clipping surface, originating from the actual drummer trigger with a restrained Genie-like curve and transform (280ms, shared ease-out). Exit contracts back to that button. The right preview remains stationary and blends over the old opaque frame (160ms) without a simultaneous fade-out. Pointer source coordinates and temporary paths are cleared after the transition; interrupting an update cannot recapture stale names. Mobile uses the same preserved controls and chart tab, with subgrid retaining exact row positions.

Performance/keyboard follow-up: stage restores 50vw clamped 360–640px and the former wide controls. Header width stays at the standard 42vw/300–440px to keep MIDI and the toggle fixed. Six controls acknowledge keyboard and MIDI with the pointer press, a 100ms marker and shared release easing, without chart render or audio delay. Explicit Standard exits existing fullscreen; cleanup remains ownership-aware and browser Escape restores Standard.

Space-use follow-up: taller performance screens give A4 exactly the required width, a content-height/capped setlist, and the remaining left area to tempo, beats and transport. The toolbar stays fixed; standard mode is unchanged. At 1024x768 the list occupies 241px and controls 479px, without control scrolling; A4 fits entirely. Guitarist entry is below Google sign-in in top-right overflow and phone Account & settings, with no setlist-actions duplicate.

Compact follow-up supersedes the height-filling console: play/TAP stay 76px high, +/- 56x72px, BPM max64px and beat segments12px. On wide left panels (760px+), the setlist and a 420–560px compact console sit side by side. On iPad landscape they stack directly; BPM and accents share a row. Narrow console contents below420px stack accents/tempo to protect readability. The regular layout remains transparent through a display:contents body wrapper. Verification uses a fullscreen-denied iframe with local-only presets, avoiding browser-wide viewport overrides.

Latest requested refinement: preserve a simple upper workspace and bottom-anchored compact controls; hide performance chart tools while fitting a complete page. Native desktop fullscreen needs safe top clearance and reliable press-time exit. Keyboard/MIDI profile settings expose two separate, customizable chart-page actions without conflating them with song changes.

Portrait performance: chart removed by user choice. Setlist and bottom console use full width in a single stacked workspace; landscape outside the phone-landscape query below restores the chart. Do not add upper filler information.

Desktop performance refinement: one left stack, setlist above bottom controls. Bound landscape desktop to a 480–560px left column and full-page right column capped at 880px, centered on muted outer space. No extra panels or enlarged buttons.

Latest user correction: remove centered desktop workspace and outer gutters. Performance fills the viewport edge-to-edge, with the 480–560px stacked left column flush left and the chart region using all remaining width. Keep the A4 page proportionally contained in that region; never stretch the sheet. This supersedes the centered 1440px workspace cap.

Final desktop width allocation: the right chart gets exactly the width needed for a whole A4 at the available height (794/1123 ratio, 16px padding and 1px divider). All remaining width goes to the stacked left song list and bottom metronome, with a 480px minimum. Remove the 560px left-column cap; preserve fixed control heights and portrait chart hiding.

Desktop performance fallback keeps the console centered at a maximum 600px width, with meter/navigation and tempo/accents paired in rows. Play/TAP remain up to 200px each, separated by 12px, at 76px high. This cap remains the fallback for narrower desktops; the eligible desktop layout below supersedes it.

Latest desktop-only refinement (2026-10-31): landscape performance with a fine pointer and hover, a viewport at least 1440px wide and 650px high, and at least 760px of available console-container width uses three bottom-anchored groups. Tempo and +/- sit on the left; meter/subdivision, beat accents and sound settings form the middle group; Play/TAP sit above previous/next song on the right. Center the console at a maximum 1120px width, with fixed 56px / 76px / 56px grid rows and 8px vertical / 16px horizontal gaps. Play/TAP each cap at 176px wide and remain 96px high. Tempo caps at 360px wide, with a 72px base BPM font. Extra space does not stretch the controls.

The song list spans the full left width above the console. The right column still gets exactly the width required for a complete A4 page; viewport filling and proportional page fit are unchanged. Standard mode, mobile and iPad layouts retain their existing controls. Desktop windows that miss either the media or console-width condition retain the previous compact arrangement. No visual identity or shared design-system change is introduced.


Finish review disposition: **ship**. Source review covers the final desktop media/container block in `src/components/DrummerMode.css`; the build passed. Visual evidence: [desktop three-group controls](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/desktop-three-zone-controls.png). Documentation records this surface-specific refinement; `DESIGN.md` and the design sidecar remain unchanged by this pass.

Scoped repair finish review: **ship**. Sound switching, removal of Current/Playing text and score-button style isolation passed 46 focused tests and the build. Visual evidence: [score section labels](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/score-labels-fixed.png), [sound selection](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/sound-selection-fixed.png). No shared design-system or sidecar change.

Phone landscape refinement (2026-10-31), based on the user’s reference image: both Standard and Performance use controls on the left (about 64%) and the scrolling setlist on the right (about 36%, minimum 200px) when landscape is at most 1000px wide and 500px high. Hide the chart, Songs/Chart switch and repeated song heading. A full-width 44px header sits above the two columns. Large beat stacks fill the top control row; BPM with 48×56px +/- and meter/subdivision occupy the middle; Play/TAP/previous/next share a 56px bottom transport row, followed by a 44px sound-settings row. The list uses one column below 800px and two from 800–1000px. This supersedes prior short-landscape phone dimensions and stacking. Desktop/iPad landscape outside the query and portrait rules are unchanged.

Phone landscape finish review: **pass**, no material findings, based on source and screenshots. The local harness `tmp/drummer-phone-check/index.html` uses the real component with synthetic sample data. Build passed; layout detector returned `[]`; next song, stop, tempo increase/reset, entering Performance and native fullscreen exit were verified. Physical-device testing remains outstanding. Visual evidence: [844×390 Performance](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/phone-landscape-controls.png), [568×320 small viewport](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/phone-landscape-small.png). No design identity, `DESIGN.md` or sidecar change.

Phone song-card refinement: compact 88px cards with order at top left, meter at top right, centered tempo and one-line title below. Hide per-card subdivision controls only in the phone-landscape query; retain the console note picker. Directional selection reveals the previous or next visual row while retaining the selected card, including single-column 3→2 revealing song 1. Desktop scrolling remains selected-row-only.

手機橫向還原速度鍵改為速度區內獨立 44px 欄位，取消向下溢出的絕對定位；數字依剩餘寬度縮放，保持下排按鍵不重疊。TAP 按下立即變色並下壓 1px，取消縮放及透明度變化，放開立即解除按壓並以既有 100ms / ease-ui-out 回彈。鍵盤及 MIDI 的 TAP 脈衝縮為 50ms，減少連點黏滯感；減少動態效果時只保留即時顏色回饋。取樣仍使用 pointerdown／原始事件時間，pointerup 與 click 不重複計拍。
