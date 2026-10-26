import type { Song } from '../types';
import { getPickupDisplay, getPickupTimeSignature, pickupTimeSignatureForUnits, resizePickup, PICKUP_EDITOR_BAR_ID, PICKUP_EDITOR_SECTION_ID } from '../utils/pickupUtils';
import { parseTimeSignature } from '../utils/rhythmUtils';
import { applyPreviewDraft, createPreviewEditSession, retargetPreviewEditSession, type PreviewEditSession, type PreviewEditTarget } from './previewEditSession';

export function openPickupPreviewSession(song: Song, target: PreviewEditTarget, current: PreviewEditSession | null): PreviewEditSession {
  const existing = current?.previewIdentity === target.previewIdentity ? current : null;
  const source = existing?.draftSong ?? song;
  let pickup = source.pickup;
  if (!pickup) pickup = { id: crypto.randomUUID(), timeSignature: pickupTimeSignatureForUnits(Math.min(4, parseTimeSignature(source.timeSignature).barUnits / 2)) };
  else if (!pickup.timeSignature) {
    const display = getPickupDisplay(pickup, source.timeSignature);
    pickup = resizePickup(pickup, source.timeSignature, display.timeSignature) ?? pickup;
  }
  const session = existing ? retargetPreviewEditSession(existing, target) : createPreviewEditSession({ song: source, target });
  return pickup === source.pickup ? session : applyPreviewDraft(session, { ...source, pickup });
}

/** Adapt only for the shared notation keyboard. Never persist this virtual section. */
export function toPickupEditorSong(song: Song): Song {
  if (!song.pickup) return { ...song, sections: [] };
  return { ...song, sections: [{ id: PICKUP_EDITOR_SECTION_ID, title: 'Pickup', bars: [{
    ...song.pickup, id: PICKUP_EDITOR_BAR_ID, chords: [], partialMeasure: true,
    timeSignature: getPickupTimeSignature(song.pickup, song.timeSignature)
  }] }] };
}

/** A keyboard update may change only pickup notation, never regular bars or metadata. */
export function applyPickupEditorSong(song: Song, edited: Song): Song {
  if (!song.pickup) return song;
  const bar = edited.sections[0]?.bars[0];
  if (!bar) return song;
  return { ...song, pickup: { ...song.pickup,
    riff: bar.riff, riffVoices: bar.riffVoices, rhythm: bar.rhythm
  } };
}
