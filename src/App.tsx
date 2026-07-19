/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createRoot } from 'react-dom/client';
import { toPng, toCanvas, getFontEmbedCSS } from 'html-to-image';
import { jsPDF } from 'jspdf';
import * as OpenCC from 'opencc-js/t2cn';
import {
  CloudLibrarySummary,
  LibraryRole,
  Song,
  Key,
  AppLanguage,
  JoinedSetlist,
  JoinedProject,
  Project,
  Setlist,
  SetlistShareStatus,
  ProjectShareStatus,
  ProjectMemberRole,
  ShareParticipant,
  SetlistSong,
  SetlistDisplayMode,
  StoredSong,
  BarNumberMode,
  SongReferenceKind,
  TeamManagementSnapshot,
  ShareContact,
  AppNotification,
  NotificationResourceType
} from './types';
import { ALL_KEYS, getPlayKey, getSuggestedGuitarCapo, getTransposeOffset, normalizeKeySpelling, transposeKeyPreferFlats, transposeKeyWithPreference } from './utils/musicUtils';
import { normalizeBarChords } from './utils/barUtils';
import { convertAbsoluteJianpuToRelativeNotation, convertRelativeJianpuToAbsoluteNotation } from './utils/jianpuUtils';
import { hasPlayableReference, normalizeSongReferences } from './utils/referenceUtils';
import { useThemeMode } from './hooks/useThemeMode';
import { useToast } from './components/Toast';
import { DEFAULT_CHORD_FONT_PRESET } from './constants/chordFonts';
import { DEFAULT_NASHVILLE_FONT_PRESET } from './constants/nashvilleFonts';
import { APP_NAME, APP_VERSION, APP_GITHUB_URL, getLocalizedAppMeta } from './constants/appMeta';
import { getUiCopy } from './constants/i18n';
import ChordSheet, { ChordSheetElementClickMeta, ChordSheetElementField, ChordSheetElementTarget, ChordSheetMetaField, getChordSheetMetaAnchorKey, PreviewAnchorRect } from './components/ChordSheet';
import LyricsDocEditor from './components/LyricsDocEditor';
import LyricsSheet from './components/LyricsSheet';
import PreviewWysiwygEditor, { PreviewWysiwygTarget } from './components/PreviewWysiwygEditor';
import PreviewBarEditor from './components/preview-edit/PreviewBarEditor';
import PreviewSectionActionMenu from './components/preview-edit/PreviewSectionActionMenu';
import PreviewSectionTitleEditor from './components/preview-edit/PreviewSectionTitleEditor';
import SongEditor from './components/SongEditor';
import KeyPicker from './components/KeyPicker';
import CapoPicker from './components/CapoPicker';
import SongMetadataPanel from './components/SongMetadataPanel';
import ReferencePlayer from './components/ReferencePlayer';
import { CompactSegmentedControl } from './components/SetlistCompactControls';
import { NotificationBell } from './components/NotificationBell';
import { ShareContactPicker } from './components/ShareContactPicker';
import SetlistNavigator, {
  SETLIST_PROJECT_FILTER_STORAGE_KEY,
  SetlistPanelView,
  SetlistProjectFilter,
  filterOwnedSetlistsByProject,
  getSetlistPreviewTitles,
  parseSetlistProjectFilter,
  resolveInitialSetlistProjectFilter,
  serializeSetlistProjectFilter,
  shouldCollapseSetlistSidebar,
  validateSetlistProjectFilter
} from './components/SetlistNavigator';
import {
  applySetlistSongOverrides,
  getDefaultSectionOrder,
  getEffectiveSetlistSongCapo,
  insertNewSetlistSectionsAfterSources,
  reorderSetlistSectionOrder,
  resolveSetlistSongCapo
} from './utils/setlistUtils';
import { formatInitialCaps } from './utils/textUtils';
import { Edit3, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Save, Hash, Music2, Mic2, Plus, FileText, Trash2, Undo2, Redo2, Search, Copy, LogOut, Upload, Download, Info, BookOpen, ExternalLink, ListMusic, GripVertical, MoreHorizontal, Share2, Cloud, CloudOff, CloudCheck, CloudAlert, LoaderCircle, HardDrive, RefreshCw, Play, Users, UserPlus, Sun, Moon, MonitorSmartphone, Archive, ArchiveRestore, FolderTree, Guitar, Check, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSupabaseAuth } from './lib/auth';
import { createCloudRepository } from './lib/repository';
import { loadPendingSync, markMigrationCompleted, hasCompletedMigration, savePendingSync } from './lib/workspace';
import { mergeWorkspaceByUpdatedAt, syncWorkspaceDiff } from './lib/sync';
import { hasSupabaseConfig } from './lib/supabase';
import {
  applyPreviewDraft,
  createPreviewEditSession,
  markPreviewTargetDeleted,
  PreviewEditField,
  PreviewEditSession,
  redoPreviewDraft,
  retargetPreviewEditSession,
  setPreviewEditInputMode,
  undoPreviewDraft
} from './lib/previewEditSession';
import {
  createEmptyBar,
  deleteSection,
  deleteBar,
  duplicateBar,
  duplicateSection,
  ensureSongEditingIds,
  finalizeSectionTitleEdit,
  findSongBar,
  getBeatCount,
  getChordBeatSlots,
  getChordStorageModeForTarget,
  getSectionStoredKey,
  insertBar,
  reorderSection,
  resolvePreviewChordSlotIndex,
  splitSectionAtBar,
  updateSectionTitle
} from './lib/songEditing';
import { getPreviewEditorBottomInset, resolvePreviewEditorDeviceLayout } from './lib/previewEditorLayout';
import { getPreviewZoomContentRatio, resolvePreviewZoomScrollPosition } from './lib/previewZoom';
import { getChordDisplaySlotOwnership } from './utils/chordSlots';

const SONG_LIBRARY_STORAGE_KEY = 'chordmaster.song-library.v1';
const SETLIST_STORAGE_KEY = 'chordmaster.setlists.v1';
const PROJECT_STORAGE_KEY = 'chordmaster.projects.v1';
const SELECTED_PROJECT_STORAGE_KEY = 'chordmaster.selected-project-id.v1';
const SELECTED_SONG_STORAGE_KEY = 'chordmaster.selected-song-id.v1';
const SELECTED_SONG_BY_LIBRARY_STORAGE_KEY = 'chordmaster.selected-song-id-by-library.v1';
const SELECTED_SETLIST_STORAGE_KEY = 'chordmaster.selected-setlist-id.v1';
const SELECTED_SETLIST_SONG_STORAGE_KEY = 'chordmaster.selected-setlist-song-id.v1';
const SETLIST_SORT_STORAGE_KEY = 'chordmaster.setlist-sort.v1';
const LIBRARY_SORT_STORAGE_KEY = 'chordmaster.library-sort.v1';
const WORKSPACE_MODE_STORAGE_KEY = 'chordmaster.workspace-mode.v1';
const GUITARIST_MODE_STORAGE_KEY = 'chordmaster.guitarist-mode.v1';
const PREVIEW_QUICK_EDIT_STORAGE_KEY = 'chordmaster.preview-quick-edit.v1';
const LAST_SAVED_AT_STORAGE_KEY = 'chordmaster.last-saved-at.v1';
const JOINED_SETLIST_DISPLAY_PREFERENCES_STORAGE_KEY = 'chordmaster.joined-setlist-display-preferences.v1';
const GOOGLE_SESSION_STORAGE_KEY = 'chordmaster.google-session.v1';
const SIDEBAR_WIDTH_STORAGE_KEY = 'chordmaster.sidebar-width.v1';
const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services-script';
const COLLAPSED_SIDEBAR_WIDTH = 80;
const DEFAULT_EXPANDED_SIDEBAR_WIDTH = 420;
const MIN_EXPANDED_SIDEBAR_WIDTH = 360;
const MAX_EXPANDED_SIDEBAR_WIDTH = 640;
const PHONE_VIEWPORT_BREAKPOINT = 640;
// Setlist swipe-to-reveal tuning. Reveal width matches the w-20 (5rem = 80px)
// behind-buttons so the card lines up flush with them when fully snapped open.
const SETLIST_SWIPE_AXIS_LOCK_PX = 6;
const SETLIST_SWIPE_REVEAL_PX = 80;
const SETLIST_SWIPE_OPEN_THRESHOLD_PX = 10;

// Shared swipe-to-reveal engine used by both the setlist rows and the project
// rows so the two lists behave identically (right swipe → archive, left swipe →
// delete, iOS-style hysteresis, mouse drag on the web). A controller is built
// per render from the caller's ref + state setters so its closures always see
// the latest open/dragging state, mirroring inline handlers.
type SwipeGestureState = {
  id: string;
  x: number;
  y: number;
  axis: 'h' | 'v' | null;
  latestDx: number;
  baseOffset: number;
  latestOffset: number;
};

type SwipeControllerConfig = {
  ref: React.MutableRefObject<SwipeGestureState | null>;
  handledRef: React.MutableRefObject<boolean>;
  openId: string | null;
  openAction: 'delete' | 'archive' | null;
  setDragging: React.Dispatch<React.SetStateAction<{ id: string; dx: number } | null>>;
  setOpen: (next: { id: string; action: 'delete' | 'archive' } | null) => void;
  canArchive: (id: string) => boolean;
};

const createSwipeController = (config: SwipeControllerConfig) => {
  // Carry over the row's current open offset so dragging from an open row can
  // pull it closed instead of jumping the transform back to 0. Delete lives on
  // the right (row translated left → negative offset); archive on the left.
  const begin = (id: string, clientX: number, clientY: number) => {
    const baseOffset = config.openId === id
      ? (config.openAction === 'delete' ? -SETLIST_SWIPE_REVEAL_PX : SETLIST_SWIPE_REVEAL_PX)
      : 0;
    config.ref.current = { id, x: clientX, y: clientY, axis: null, latestDx: 0, baseOffset, latestOffset: baseOffset };
    config.handledRef.current = false;
  };

  // Returns the locked axis ('h' once it is a horizontal swipe) so the mouse
  // pointer handler knows when to capture the pointer and suppress selection.
  const update = (clientX: number, clientY: number): 'h' | 'v' | null => {
    const start = config.ref.current;
    if (!start) return null;
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (start.axis === null) {
      if (Math.abs(dx) < SETLIST_SWIPE_AXIS_LOCK_PX && Math.abs(dy) < SETLIST_SWIPE_AXIS_LOCK_PX) return null;
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      // Past the lock threshold, treat as a deliberate swipe so the follow-up
      // tap doesn't fall through to selecting the row.
      if (start.axis === 'h') config.handledRef.current = true;
    }
    if (start.axis !== 'h') return start.axis;
    // Neutral rows can travel either direction; an already-open row only swings
    // back toward 0 so a single gesture can't tear through one action into the other.
    const candidate = start.baseOffset + dx;
    const min = start.baseOffset === SETLIST_SWIPE_REVEAL_PX ? 0 : -SETLIST_SWIPE_REVEAL_PX;
    const max = start.baseOffset === -SETLIST_SWIPE_REVEAL_PX ? 0 : SETLIST_SWIPE_REVEAL_PX;
    const offset = Math.max(min, Math.min(max, candidate));
    start.latestDx = dx;
    start.latestOffset = offset;
    config.setDragging((current) => (
      current && current.id === start.id && current.dx === offset ? current : { id: start.id, dx: offset }
    ));
    return 'h';
  };

  // Commits the final action. Returns true when a horizontal swipe was handled
  // (so the caller can preventDefault and suppress the trailing click).
  const commit = (id: string): boolean => {
    const start = config.ref.current;
    config.ref.current = null;
    config.setDragging(null);
    if (!start || start.id !== id) return false;
    if (start.axis !== 'h') { config.handledRef.current = false; return false; }
    // iOS-style hysteresis. From neutral: left past threshold → reveal delete,
    // right past threshold → reveal archive. From an open row: nudging back past
    // the threshold toward 0 closes it; anything smaller stays open.
    const offset = start.latestOffset;
    const movedFromBase = offset - start.baseOffset;
    const wasOpen = start.baseOffset !== 0;
    if (wasOpen) {
      const closingNudge = start.baseOffset < 0 ? movedFromBase : -movedFromBase;
      if (closingNudge > SETLIST_SWIPE_OPEN_THRESHOLD_PX) config.setOpen(null);
      else config.setOpen({ id, action: start.baseOffset < 0 ? 'delete' : 'archive' });
    } else if (offset <= -SETLIST_SWIPE_OPEN_THRESHOLD_PX) {
      config.setOpen({ id, action: 'delete' });
    } else if (offset >= SETLIST_SWIPE_OPEN_THRESHOLD_PX) {
      if (config.canArchive(id)) config.setOpen({ id, action: 'archive' });
      else config.setOpen(null);
    } else {
      config.setOpen(null);
    }
    return true;
  };

  const reset = () => {
    config.ref.current = null;
    config.handledRef.current = false;
    config.setDragging(null);
  };

  const touchStart = (id: string, event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    begin(id, touch.clientX, touch.clientY);
  };
  const touchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    update(touch.clientX, touch.clientY);
  };
  const touchEnd = (id: string, event: React.TouchEvent<HTMLDivElement>) => {
    if (commit(id)) event.preventDefault();
  };

  // Mouse-only pointer handlers bring the same swipe to the web. Touch input
  // keeps flowing through the touch handlers, so these bail for non-mouse
  // pointers to avoid double-driving the gesture on touchscreens.
  const pointerDown = (id: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    begin(id, event.clientX, event.clientY);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !config.ref.current) return;
    const axis = update(event.clientX, event.clientY);
    if (axis === 'h') {
      // Capture the pointer so the drag keeps tracking if the cursor leaves the
      // row, and stop the browser from selecting the row's text.
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* noop */ }
      }
      event.preventDefault();
    }
  };
  const pointerEnd = (id: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !config.ref.current) return;
    commit(id);
  };

  return { begin, update, commit, reset, touchStart, touchMove, touchEnd, pointerDown, pointerMove, pointerEnd };
};

const SIDEBAR_OVERLAY_BREAKPOINT = 1280;
const SPLIT_EDITOR_BREAKPOINT = 1360;
// User-draggable editor/preview split bounds (desktop split view only).
const EDITOR_PANE_MIN_WIDTH = 440;
const PREVIEW_PANE_MIN_WIDTH = 360;
const EDITOR_WIDTH_STORAGE_KEY = 'chordmaster.editor-width.v1';
// Editor-pane widths at which the inner layout flips to its richer form: the
// full bar cards appear once content width >= 640 (≈720px pane after ~80px of
// padding) and the wide metadata panel once content width >= 820 (≈900px pane).
// Each detent sits a safe margin *inside* the richer side of its threshold, and
// pulls symmetrically from both directions, so wherever you release near a
// boundary the editor always lands on the richer ("more info") layout — never
// snapping onto the simpler one — regardless of drag direction.
const EDITOR_SNAP_POINTS = [720, 900];
const EDITOR_SNAP_DETENT = 12;
const EDITOR_SNAP_PULL = 36;
const snapEditorPaneWidth = (rawWidth: number) => {
  for (const threshold of EDITOR_SNAP_POINTS) {
    const detent = threshold + EDITOR_SNAP_DETENT;
    if (Math.abs(rawWidth - detent) <= EDITOR_SNAP_PULL) {
      return detent;
    }
  }
  return rawWidth;
};
const PREVIEW_TARGET_WIDTH = 794;
const PREVIEW_MIN_SCALE = 0.35;
const PREVIEW_MAX_SCALE = 2.4;
const PREVIEW_ZOOM_STEP = 0.15;
const PREVIEW_SAFETY_MARGIN = 20;
const PREVIEW_PAGE_HEIGHT = 1123;
const PDF_EXPORT_PREFERRED_PIXEL_RATIO = 5;
const PDF_EXPORT_MOBILE_MAX_PIXEL_RATIO = 3;
const PDF_EXPORT_MOBILE_MAX_CANVAS_SIDE = 4096;
const PDF_EXPORT_MOBILE_MAX_CANVAS_AREA = 12_000_000;
const PDF_EXPORT_DESKTOP_MAX_CANVAS_SIDE = 16384;
const PDF_EXPORT_DESKTOP_MAX_CANVAS_AREA = 64_000_000;
const VALID_KEYS = new Set<string>(ALL_KEYS);
const VALID_NAVIGATION_MARKERS = new Set([
  'segno',
  'coda',
  'ds',
  'dc',
  'fine',
  'ds-al-coda',
  'ds-al-fine'
]);
const VALID_BAR_NUMBER_MODES = new Set(['none', 'line-start', 'all']);
const VALID_NASHVILLE_FONT_PRESETS = new Set([
  'ibm-plex-serif',
  'source-serif-4',
  'atkinson-hyperlegible-next',
  'source-sans-3'
]);
const VALID_CHORD_FONT_PRESETS = new Set([
  'classic-serif',
  'stage-sans'
]);
const VALID_SETLIST_DISPLAY_MODES = new Set([
  'nashville-number-system',
  'chord-fixed-key',
  'chord-movable-key'
]);
const VALID_SETLIST_SORT_MODES = new Set<SetlistSortMode>([
  'updated-desc',
  'created-desc',
  'name-asc'
]);
const PERFORMANCE_NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Space', 'Spacebar', 'Enter']);
const PERFORMANCE_PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);
const PERFORMANCE_NEXT_CODES = new Set(['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'Enter', 'NumpadEnter']);
const PERFORMANCE_PREV_CODES = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);
const PERFORMANCE_NEXT_KEY_CODES = new Set([13, 32, 34, 39, 40]);
const PERFORMANCE_PREV_KEY_CODES = new Set([33, 37, 38]);
const PERFORMANCE_TOGGLE_KEY_VALUES = new Set([' ', 'Space', 'Spacebar', 'Enter']);
const PERFORMANCE_SPACE_KEY_VALUES = new Set([' ', 'Space', 'Spacebar']);
const PERFORMANCE_KEYBOARD_CAPTURE_ATTRIBUTE = 'data-performance-keyboard-capture';

type PerformancePageDirection = 'next' | 'prev';

const isInteractiveKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.closest(`[${PERFORMANCE_KEYBOARD_CAPTURE_ATTRIBUTE}]`)) {
    return false;
  }

  return target.isContentEditable || Boolean(target.closest('button, input, select, textarea, a[href]'));
};

const getPerformancePageDirection = (event: KeyboardEvent): PerformancePageDirection | null => {
  const legacyKeyCode = event.keyCode || event.which || 0;
  const isToggleKey = (
    PERFORMANCE_TOGGLE_KEY_VALUES.has(event.key) ||
    event.code === 'Space' ||
    event.code === 'Enter' ||
    event.code === 'NumpadEnter' ||
    legacyKeyCode === 13 ||
    legacyKeyCode === 32
  );

  if (isToggleKey && isInteractiveKeyboardTarget(event.target)) {
    return null;
  }

  if (
    event.shiftKey &&
    (PERFORMANCE_SPACE_KEY_VALUES.has(event.key) || event.code === 'Space' || legacyKeyCode === 32)
  ) {
    return 'prev';
  }

  if (
    PERFORMANCE_NEXT_KEYS.has(event.key) ||
    PERFORMANCE_NEXT_CODES.has(event.code) ||
    PERFORMANCE_NEXT_KEY_CODES.has(legacyKeyCode)
  ) {
    return 'next';
  }

  if (
    PERFORMANCE_PREV_KEYS.has(event.key) ||
    PERFORMANCE_PREV_CODES.has(event.code) ||
    PERFORMANCE_PREV_KEY_CODES.has(legacyKeyCode)
  ) {
    return 'prev';
  }

  return null;
};

const getPerformanceKeyboardSignature = (event: KeyboardEvent) => {
  const legacyKeyCode = event.keyCode || event.which || 0;
  return `${event.key}:${event.code}:${legacyKeyCode}:${event.shiftKey ? 'shift' : ''}`;
};

const isLineInAppBrowser = () => (
  typeof navigator !== 'undefined' && /Line\//i.test(navigator.userAgent)
);

interface GoogleUserSession {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

const TEAM_EDIT_ROLES = new Set<LibraryRole>(['owner', 'editor']);
const TEAM_SETLIST_CREATE_ROLES = new Set<LibraryRole>(['owner', 'editor', 'setlist_manager']);

const getRoleLabel = (role: LibraryRole, language: AppLanguage) => {
  if (language === 'zh') {
    switch (role) {
      case 'owner': return '擁有者';
      case 'editor': return '完全編輯';
      case 'setlist_manager': return '查看與建立歌單';
      case 'viewer': return '只能查看';
      default: return role;
    }
  }

  switch (role) {
    case 'owner': return 'Owner';
    case 'editor': return 'Full Editor';
    case 'setlist_manager': return 'Setlist Creator';
    case 'viewer': return 'Viewer';
    default: return role;
  }
};

const getUnknownErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === 'object') {
    const record = error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length > 0) {
      return parts.join('\n');
    }
  }

  return typeof error === 'string' && error.trim() ? error.trim() : '';
};

const isTeamFeatureSchemaError = (message: string) => (
  /get_user_libraries|create_team|get_team_management|create_team_invite|team_invites|library_members|schema cache|PGRST202|PGRST204|Could not find the function|function public\./i.test(message)
);

const getTeamFeatureErrorMessage = (error: unknown, language: AppLanguage) => {
  const reason = getUnknownErrorMessage(error);
  if (isTeamFeatureSchemaError(reason)) {
    const message = language === 'zh'
      ? '團隊功能的 Supabase migration 尚未套用。請先執行最新 migration，之後就可以建立團隊與邀請成員。'
      : 'The Supabase migration for team workspaces has not been applied yet. Apply the latest migration before creating teams or invites.';
    return reason ? `${message}\n\n${reason}` : message;
  }

  return reason || (language === 'zh' ? '無法載入雲端工作區。' : 'Unable to load cloud workspace.');
};

interface ExportedSongLibraryPayload {
  version: 1;
  exportedAt: number;
  songs: Array<Omit<StoredSong, 'updatedAt'> & { updatedAt?: number }>;
}

type WorkspaceMode = 'songs' | 'setlists';
type SetlistSortMode = 'updated-desc' | 'created-desc' | 'name-asc';
interface JoinedSetlistDisplayPreference {
  displayMode?: SetlistDisplayMode;
  barNumberMode?: BarNumberMode;
}

interface PdfExportProgressState {
  totalPages: number;
  completedPages: number;
  currentPage: number;
  songIndex: number;
  totalSongs: number;
  songTitle: string;
  sectionIndex: number | null;
  sectionTitle: string | null;
  pageInSong: number;
  totalPagesInSong: number;
  cancelRequested: boolean;
}

interface ExportPageDescriptor {
  element: HTMLElement;
  songIndex: number;
  totalSongs: number;
  songTitle: string;
  sectionIndex: number | null;
  sectionTitle: string | null;
  pageInSong: number;
  totalPagesInSong: number;
}

interface PdfCanvasLimits {
  maxSide: number;
  maxArea: number;
  maxPixelRatio: number;
}

interface PdfRenderedImage {
  data: string;
  format: 'JPEG' | 'PNG';
}

class PdfExportCancelledError extends Error {
  constructor() {
    super('PDF export cancelled.');
    this.name = 'PdfExportCancelledError';
  }
}

const sanitizeFileNamePart = (value: string) => (
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
);

const buildPdfFileName = (song: Song) => {
  const title = sanitizeFileNamePart(song.title) || 'ChordMaster';
  const keyPart = `Key${song.currentKey}`;
  const capoValue = song.capo || 0;
  const chartType = song.showNashvilleNumbers ? 'NUM' : 'CH';
  const doModePart = song.showAbsoluteJianpu ? '固定調' : '首調';
  const nameParts = [
    title,
    keyPart,
    ...(capoValue > 0 ? [`Capo${capoValue}`] : []),
    chartType,
    doModePart
  ];

  return nameParts.join('_');
};

const getSetlistPdfDisplayModeLabel = (displayMode: SetlistDisplayMode) => {
  switch (displayMode) {
    case 'nashville-number-system':
      return '級數';
    case 'chord-fixed-key':
      return '固定調';
    case 'chord-movable-key':
    default:
      return '首調';
  }
};

const buildSetlistPdfFileName = (setlist: Setlist) => {
  const title = sanitizeFileNamePart(setlist.name) || 'Service Setlist';
  const displayModeLabel = getSetlistPdfDisplayModeLabel(setlist.displayMode);
  const nameParts = [
    title,
    displayModeLabel
  ];

  return nameParts.join('_');
};

const ensureTrailingSlash = (value: string) => (
  value.endsWith('/') ? value : `${value}/`
);

const getAppBaseUrl = () => {
  const configuredPublicUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (configuredPublicUrl) {
    return ensureTrailingSlash(configuredPublicUrl);
  }

  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
};

const buildShareUrl = (token: string) => (
  new URL(`share/${token}`, getAppBaseUrl()).toString()
);

const isShareAuthErrorMessage = (message: string) => (
  /sign in again|unauthorized|jwt|auth/i.test(message)
);

const copyShareUrlToClipboard = async (shareUrl: string) => {
  // Native iPad WKWebView rejects navigator.clipboard writes once the user
  // gesture has expired (e.g. after awaiting the share-link network calls), so
  // use the Capacitor plugin which has no transient-activation requirement.
  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: shareUrl });
      return true;
    } catch {
      return false;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      return true;
    } catch {
      // Fall back for in-app browsers that expose Clipboard API but block writes.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textArea = document.createElement('textarea');
  textArea.value = shareUrl;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';

  const previousActiveElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  try {
    document.body.appendChild(textArea);
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, shareUrl.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textArea.remove();
    previousActiveElement?.focus({ preventScroll: true });
  }
};

const openSystemShareSheet = async (shareUrl: string, title: string) => {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text: title, url: shareUrl });
      return true;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text: title, url: shareUrl });
      return true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel|abort/i.test(message)) return true;
    return false;
  }
  return false;
};

// On native iPad (Capacitor WKWebView), jsPDF's `.save()` relies on an
// `<a download>` click that WKWebView silently ignores, so nothing happens.
// Instead, write the PDF to the cache directory and hand it to the iOS share
// sheet (Save to Files, AirDrop, Mail, etc.).
const savePdfDocument = async (pdf: jsPDF, fileName: string) => {
  const safeFileName = `${fileName}.pdf`;

  if (!Capacitor.isNativePlatform()) {
    pdf.save(safeFileName);
    return;
  }

  // jsPDF emits a "data:application/pdf;filename=...;base64,XXXX" URI; strip the
  // prefix so Filesystem.writeFile receives raw base64 data.
  const dataUri = pdf.output('datauristring');
  const base64Data = dataUri.slice(dataUri.indexOf(',') + 1);

  const writeResult = await Filesystem.writeFile({
    path: safeFileName,
    data: base64Data,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: fileName,
      url: writeResult.uri,
    });
  } catch (error) {
    // Dismissing the iOS share sheet rejects with a "canceled" error — that is
    // not an export failure, so swallow it.
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message)) {
      return;
    }
    throw error;
  }
};

const waitForPaint = async () => {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

const parsePositiveIntegerAttribute = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.round(numericValue);
};

const isMobileLikePdfExportDevice = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (maxTouchPoints > 1 && hasCoarsePointer) ||
    window.innerWidth < 1024
  );
};

const getPdfCanvasLimits = (): PdfCanvasLimits => (
  isMobileLikePdfExportDevice()
    ? {
        maxSide: PDF_EXPORT_MOBILE_MAX_CANVAS_SIDE,
        maxArea: PDF_EXPORT_MOBILE_MAX_CANVAS_AREA,
        maxPixelRatio: PDF_EXPORT_MOBILE_MAX_PIXEL_RATIO,
      }
    : {
        maxSide: PDF_EXPORT_DESKTOP_MAX_CANVAS_SIDE,
        maxArea: PDF_EXPORT_DESKTOP_MAX_CANVAS_AREA,
        maxPixelRatio: PDF_EXPORT_PREFERRED_PIXEL_RATIO,
      }
);

const getElementExportSize = (element: HTMLElement) => ({
  width: Math.max(1, Math.ceil(element.scrollWidth || element.offsetWidth || element.getBoundingClientRect().width)),
  height: Math.max(1, Math.ceil(element.scrollHeight || element.offsetHeight || element.getBoundingClientRect().height)),
});

const getSafePdfPixelRatio = (width: number, height: number, preferredRatio = PDF_EXPORT_PREFERRED_PIXEL_RATIO) => {
  const limits = getPdfCanvasLimits();
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const sideLimitedRatio = Math.min(limits.maxSide / safeWidth, limits.maxSide / safeHeight);
  const areaLimitedRatio = Math.sqrt(limits.maxArea / (safeWidth * safeHeight));
  const ratio = Math.min(preferredRatio, limits.maxPixelRatio, sideLimitedRatio, areaLimitedRatio);

  return Math.max(1, Math.floor(ratio * 100) / 100);
};

const canvasHasVisibleContent = (canvas: HTMLCanvasElement) => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return false;
  }

  const probeCanvas = document.createElement('canvas');
  const probeSize = 64;
  probeCanvas.width = probeSize;
  probeCanvas.height = probeSize;

  const probeContext = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!probeContext) {
    return true;
  }

  probeContext.fillStyle = '#ffffff';
  probeContext.fillRect(0, 0, probeSize, probeSize);
  probeContext.drawImage(canvas, 0, 0, probeSize, probeSize);

  try {
    const imageData = probeContext.getImageData(0, 0, probeSize, probeSize).data;
    for (let index = 0; index < imageData.length; index += 4) {
      const alpha = imageData[index + 3];
      const red = imageData[index];
      const green = imageData[index + 1];
      const blue = imageData[index + 2];

      if (alpha > 8 && (red < 245 || green < 245 || blue < 245)) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
};

const getSongVersionSummary = (song: Song) => (
  Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ')
);

const isReferenceOnlySongChange = (previousSong: Song, nextSong: Song): boolean => {
  if (previousSong.sections !== nextSong.sections || previousSong.references === nextSong.references) {
    return false;
  }

  const { references: _previousReferences, sections: _previousSections, ...previousRest } = previousSong;
  const { references: _nextReferences, sections: _nextSections, ...nextRest } = nextSong;
  return JSON.stringify(previousRest) === JSON.stringify(nextRest);
};

const normalizeTempo = (tempo: unknown): number | undefined => {
  if (tempo === '' || tempo === null || tempo === undefined) return undefined;
  const numericTempo = typeof tempo === 'number' ? tempo : Number(tempo);
  if (!Number.isFinite(numericTempo)) return undefined;
  return Math.min(400, Math.max(20, Math.round(numericTempo)));
};

const normalizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return value;
};

const normalizeText = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

const traditionalToSimplifiedForSearch = OpenCC.Converter({ from: 'tw', to: 'cn' });

const normalizeSearchText = (value: string): string => (
  traditionalToSimplifiedForSearch(value)
    .trim()
    .toLowerCase()
    .replace(/祢/g, '你')
);

const normalizeBoolean = (value: unknown): boolean | undefined => (
  typeof value === 'boolean' ? value : undefined
);

const normalizeOptionalInteger = (value: unknown, min: number, max: number): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return undefined;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
};

const normalizeNavigationMarker = (value: unknown) => (
  typeof value === 'string' && VALID_NAVIGATION_MARKERS.has(value) ? value : undefined
);

const normalizeChordTokens = (value: unknown) => {
  if (Array.isArray(value)) {
    return normalizeBarChords(value.filter((token): token is string => typeof token === 'string'));
  }

  if (typeof value === 'string') {
    return normalizeBarChords(value.split(/\s+/).filter(Boolean));
  }

  return [];
};

const formatSongLibraryCredits = (song: Song) => {
  const lyricist = song.lyricist?.trim();
  const composer = song.composer?.trim();
  const translator = song.translator?.trim();
  const versionNames = Array.from(new Set([lyricist, composer].filter(Boolean)));
  const parts: string[] = [];

  if (versionNames.length > 0) parts.push(versionNames.join(' / '));
  if (translator) parts.push(translator);

  return parts;
};

const getSongLibraryMeta = (song: Song, shuffleLabel: string) => {
  const creditParts = formatSongLibraryCredits(song);
  const primary = [
    song.currentKey,
    typeof song.tempo === 'number' ? `${song.tempo} BPM` : '',
    song.timeSignature
  ].filter(Boolean).join(' · ');
  const isShuffle = song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle';

  if (creditParts.length > 0 || isShuffle) {
    return {
      primary,
      secondary: [isShuffle ? shuffleLabel : '', ...creditParts].filter(Boolean).join(' · '),
      tooltip: [primary, isShuffle ? shuffleLabel : '', ...creditParts].filter(Boolean).join('\n'),
    };
  }

  return {
    primary,
    secondary: '',
    tooltip: primary,
  };
};

const INITIAL_SONG: Song = {
  title: "Speak Jesus",
  shuffle: true,
  originalKey: "E",
  currentKey: "E",
  showAbsoluteJianpu: false,
  tempo: 74,
  timeSignature: "4/4",
  barNumberMode: 'none',
  nashvilleFontPreset: DEFAULT_NASHVILLE_FONT_PRESET,
  chordFontPreset: DEFAULT_CHORD_FONT_PRESET,
  sections: [
    {
      id: "s1",
      title: "Intro",
      bars: [
        { chords: ["E"], riff: "3 - 4 -", riffLabel: "Riff" },
        { chords: ["%"] },
        { chords: ["C#m"], riff: "5 - 7 i", riffLabel: "Riff" },
        { chords: ["/"] },
        { chords: ["A"] },
        { chords: ["%"] }
      ]
    },
    {
      id: "s2",
      title: "Verse 1, 2",
      bars: [
        { chords: ["E"], repeatStart: true },
        { chords: ["%"] },
        { chords: ["C#m"] },
        { chords: ["%"] },
        { chords: ["A"] },
        { chords: ["%"] },
        { chords: ["E"], riff: "3 - 4 -", riffLabel: "Riff" },
        { chords: ["E"], riff: "5 - 7 i", riffLabel: "Riff", repeatEnd: true }
      ]
    },
    {
      id: "s3",
      title: "Chorus",
      bars: [
        { chords: ["B", "E/G#"], repeatStart: true },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E"] },
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"], ending: "1", riff: "3 - 4 -", riffLabel: "Riff" },
        { chords: ["E"], ending: "1", riff: "5 - 7 i", riffLabel: "Riff", repeatEnd: true }
      ]
    },
    {
      id: "s4",
      title: "Breakdown",
      bars: [
        { chords: ["E"], ending: "2" },
        { chords: ["E"], ending: "2" }
      ]
    },
    {
      id: "s5",
      title: "Verse 3",
      bars: [
        { chords: ["E"] },
        { chords: ["%"] },
        { chords: ["C#m"] },
        { chords: ["%"] },
        { chords: ["A"] },
        { chords: ["%"] },
        { chords: ["E"] },
        { chords: ["E"] }
      ]
    },
    {
      id: "s6",
      title: "Chorus",
      bars: [
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E"] },
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E"] }
      ]
    },
    {
      id: "s7",
      title: "Bridge",
      bars: [
        { chords: ["E"], annotation: "AG 8 beats" },
        { chords: ["Esus4", "E"] },
        { chords: ["C#m"] },
        { chords: ["C#m6", "C#m"] },
        { chords: ["A"] },
        { chords: ["A"] },
        { chords: ["E"], annotation: "Kick In" },
        { chords: ["E"] }
      ]
    },
    {
      id: "s8",
      title: "Bridge",
      bars: [
        { chords: ["E"], annotation: "8 beat build" },
        { chords: ["E"] },
        { chords: ["C#m"] },
        { chords: ["C#m"] },
        { chords: ["A"] },
        { chords: ["A"] },
        { chords: ["E"], annotation: "16 beat build" },
        { chords: ["E"] }
      ]
    },
    {
      id: "s9",
      title: "Up Chorus",
      bars: [
        { chords: ["B", "E/G#"], repeatStart: true },
        { chords: ["A"] },
        { chords: ["E"] },
        { chords: ["E", "C#m"] },
        { chords: ["B", "E/G#"] },
        { chords: ["A"] },
        { chords: ["E"], ending: "1" },
        { chords: ["E"], ending: "1", repeatEnd: true }
      ]
    },
    {
      id: "s10",
      title: "Breakdown",
      bars: [
        { chords: ["E"], ending: "2" },
        { chords: ["E"], ending: "2" }
      ]
    }
  ]
};

const EMPTY_LIBRARY_PREVIEW_SONG: StoredSong = {
  id: 'empty-library-preview',
  title: 'No songs yet',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  showAbsoluteJianpu: false,
  sections: [],
  updatedAt: 0
};

interface SongHistoryState {
  past: Song[];
  future: Song[];
}

interface SetlistSongHistorySnapshot {
  song: Song;
  sectionOrder: string[];
}

interface SetlistSongHistoryState {
  past: SetlistSongHistorySnapshot[];
  future: SetlistSongHistorySnapshot[];
}

type AppView = 'sheet' | 'about' | 'help';
type EditorFocusField = 'chords' | 'riff' | 'label' | 'annotation' | 'rhythm' | 'lyrics' | 'sectionName' | 'marker';

interface PreviewSectionActionTarget {
  previewIdentity: string;
  sectionId: string;
  title: string;
  anchorKey: string;
  anchorRect: PreviewAnchorRect;
}

interface EditorFocusRequest {
  sIdx: number;
  bIdx: number;
  field: EditorFocusField;
  requestId: number;
  // When the editor is being opened (or the song is being switched) by this
  // request, jump straight to the bar with an instant scroll instead of the
  // smooth scroll used for in-editor navigation — the panel is still settling
  // its layout, so a smooth scroll would visibly bounce up/down several times.
  instant?: boolean;
}

interface PreviewDragState {
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
}

interface PreviewPinchState {
  startDistance: number;
  startScale: number;
  baseScale: number;
  contentRatioX: number;
  contentRatioY: number;
  currentScale: number;
  focalX: number;
  focalY: number;
}

const cloneSong = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// Switching the jianpu input mode keeps the on-screen numbers identical and just
// reinterprets them in the new mode (the user's "keep numbers" choice). Storage is
// always relative, so we rewrite every riff using each section's sounding (play)
// key — the same key the editor/chart use to render absolute jianpu — so the
// displayed digits stay put while the stored pitches shift to the newly intended
// reading. Fully reversible: switching back (or Undo) restores the original riffs.
const reinterpretSongJianpuInput = (song: Song, toAbsolute: boolean): Song => {
  const capo = song.capo || 0;
  const globalKeyShift = getTransposeOffset(song.originalKey, song.currentKey);

  // Written key in effect at each section (mirrors getSectionKeyStates' activeKeys).
  let writtenKey = song.originalKey;
  const sectionPlayKeys = song.sections.map((section) => {
    if (section.keyChangeTo) writtenKey = section.keyChangeTo;
    return getPlayKey(transposeKeyWithPreference(writtenKey, globalKeyShift, song.currentKey), capo);
  });
  const pickupPlayKey = getPlayKey(transposeKeyWithPreference(song.originalKey, globalKeyShift, song.currentKey), capo);

  const rewrite = (riff: string | undefined, key: Key): string | undefined => {
    if (!riff?.trim()) return riff;
    return toAbsolute
      ? convertAbsoluteJianpuToRelativeNotation(riff, key)
      : convertRelativeJianpuToAbsoluteNotation(riff, key);
  };

  return {
    ...song,
    pickup: song.pickup ? { ...song.pickup, riff: rewrite(song.pickup.riff, pickupPlayKey) } : song.pickup,
    sections: song.sections.map((section, sIdx) => ({
      ...section,
      bars: section.bars.map((bar) => (
        bar.riff?.trim() ? { ...bar, riff: rewrite(bar.riff, sectionPlayKeys[sIdx]) } : bar
      ))
    }))
  };
};

const inactiveSetlistShareStatus: SetlistShareStatus = {
  activeToken: null,
  activeCreatedAt: null,
  participantCount: 0,
  participants: []
};

const createSongId = () => crypto.randomUUID();
const createSetlistId = () => crypto.randomUUID();
const createSetlistSongId = () => crypto.randomUUID();

const reindexSetlistSongs = (setlistSongs: SetlistSong[]) => setlistSongs.map((item, index) => ({
  ...item,
  order: index
}));

const normalizeSongBars = <T extends Song>(song: T): T => {
  const originalKey = typeof song.originalKey === 'string' && VALID_KEYS.has(song.originalKey) ? song.originalKey as Key : 'C';
  const currentKey = typeof song.currentKey === 'string' && VALID_KEYS.has(song.currentKey) ? song.currentKey as Key : originalKey;
  const rawSections = Array.isArray(song.sections) ? song.sections : [];
  const sections = rawSections.map((section, sectionIndex) => {
    const safeSection = (section && typeof section === 'object' ? section : {}) as Partial<Song['sections'][number]> & Record<string, unknown>;
    const rawBars = Array.isArray(safeSection.bars) ? safeSection.bars : [];

    return {
      ...safeSection,
      id: typeof safeSection.id === 'string' && safeSection.id.trim() ? safeSection.id : undefined,
      title: normalizeText(safeSection.title, `Section ${sectionIndex + 1}`),
      keyChangeTo: typeof safeSection.keyChangeTo === 'string' && VALID_KEYS.has(safeSection.keyChangeTo)
        ? safeSection.keyChangeTo as Key
        : undefined,
      bars: rawBars.map((bar) => {
        const safeBar = (bar && typeof bar === 'object' ? bar : {}) as Partial<Song['sections'][number]['bars'][number]> & Record<string, unknown>;
        return {
          ...safeBar,
          id: typeof safeBar.id === 'string' && safeBar.id.trim() ? safeBar.id : undefined,
          chords: normalizeChordTokens(safeBar.chords),
          timeSignature: normalizeOptionalText(safeBar.timeSignature),
          riff: normalizeOptionalText(safeBar.riff),
          rhythm: normalizeOptionalText(safeBar.rhythm),
          label: normalizeOptionalText(safeBar.label),
          riffLabel: normalizeOptionalText(safeBar.riffLabel),
          rhythmLabel: normalizeOptionalText(safeBar.rhythmLabel),
          annotation: normalizeOptionalText(safeBar.annotation),
          leftMarker: normalizeNavigationMarker(safeBar.leftMarker),
          rightMarker: normalizeNavigationMarker(safeBar.rightMarker),
          leftText: normalizeOptionalText(safeBar.leftText),
          rightText: normalizeOptionalText(safeBar.rightText),
          repeatStart: Boolean(safeBar.repeatStart),
          repeatEnd: Boolean(safeBar.repeatEnd),
          finalBar: Boolean(safeBar.finalBar),
          ending: normalizeOptionalText(safeBar.ending)
        };
      })
    };
  });

  const rawPickup = song.pickup && typeof song.pickup === 'object'
    ? song.pickup as NonNullable<Song['pickup']> & Record<string, unknown>
    : null;
  const pickup = rawPickup
    ? {
        id: typeof rawPickup.id === 'string' && rawPickup.id.trim() ? rawPickup.id : undefined,
        riff: normalizeOptionalText(rawPickup.riff),
        rhythm: normalizeOptionalText(rawPickup.rhythm)
      }
    : undefined;

  return {
    ...song,
    title: normalizeText(song.title),
    lyricist: normalizeOptionalText(song.lyricist),
    composer: normalizeOptionalText(song.composer),
    translator: normalizeOptionalText(song.translator),
    groove: normalizeOptionalText(song.groove),
    shuffle: normalizeBoolean(song.shuffle),
    originalKey,
    currentKey,
    tempo: normalizeTempo(song.tempo),
    timeSignature: normalizeText(song.timeSignature, '4/4'),
    useSectionColors: normalizeBoolean(song.useSectionColors),
    showNashvilleNumbers: normalizeBoolean(song.showNashvilleNumbers),
    showAbsoluteJianpu: normalizeBoolean(song.showAbsoluteJianpu) ?? false,
    jianpuInputAbsolute: normalizeBoolean(song.jianpuInputAbsolute) ?? false,
    barNumberMode: typeof song.barNumberMode === 'string' && VALID_BAR_NUMBER_MODES.has(song.barNumberMode) ? song.barNumberMode : 'none',
    nashvilleFontPreset: typeof song.nashvilleFontPreset === 'string' && VALID_NASHVILLE_FONT_PRESETS.has(song.nashvilleFontPreset)
      ? song.nashvilleFontPreset
      : DEFAULT_NASHVILLE_FONT_PRESET,
    chordFontPreset: typeof song.chordFontPreset === 'string' && VALID_CHORD_FONT_PRESETS.has(song.chordFontPreset)
      ? song.chordFontPreset
      : DEFAULT_CHORD_FONT_PRESET,
    capo: normalizeOptionalInteger(song.capo, 0, 12),
    references: normalizeSongReferences(song.references, VALID_KEYS),
    pickup: pickup && (pickup.id || pickup.riff || pickup.rhythm) ? pickup : undefined,
    sections: sections.length > 0 ? sections : [
      {
        id: undefined,
        title: 'Verse',
        bars: [{ chords: [] }]
      }
    ]
  } as T;
};

const createStoredSong = (song: Song, id = createSongId()): StoredSong => ({
  ...cloneSong(normalizeSongBars(song)),
  id,
  createdAt: Date.now(),
  updatedAt: Date.now()
});

const createStoredSetlistSong = (songId: string, setlistId: string, baseSong?: Song): SetlistSong => ({
  id: createSetlistSongId(),
  setlistId,
  songId,
  order: 0,
  overrideKey: baseSong?.currentKey,
  capo: baseSong?.capo ?? 0,
  sectionOrder: baseSong ? getDefaultSectionOrder(baseSong) : []
});

const sanitizeSetlistSectionOrder = (order: string[], song: Song) => {
  const nextIds = getDefaultSectionOrder(song);

  if (nextIds.length === 0) {
    return [];
  }

  const remainingCounts = new Map<string, number>();
  nextIds.forEach((id) => {
    remainingCounts.set(id, (remainingCounts.get(id) ?? 0) + 1);
  });

  const preserved = order.filter((id) => {
    const remaining = remainingCounts.get(id) ?? 0;
    if (remaining <= 0) {
      return false;
    }

    remainingCounts.set(id, remaining - 1);
    return true;
  });

  const missing = nextIds.filter((id) => {
    const remaining = remainingCounts.get(id) ?? 0;
    if (remaining <= 0) {
      return false;
    }

    remainingCounts.set(id, remaining - 1);
    return true;
  });

  const merged = [...preserved, ...missing];
  return merged.length > 0 ? merged : nextIds;
};

const normalizeSetlistDisplayMode = (value: unknown): SetlistDisplayMode => (
  typeof value === 'string' && VALID_SETLIST_DISPLAY_MODES.has(value)
    ? value as SetlistDisplayMode
    : 'chord-movable-key'
);

const normalizeSetlistSong = (setlistId: string, setlistSong: Partial<SetlistSong> & Record<string, unknown>, songsById: Map<string, StoredSong>, index: number): SetlistSong => {
  const songId = typeof setlistSong.songId === 'string' ? setlistSong.songId : '';
  const sourceSong = songsById.get(songId);
  const rawSongData = setlistSong.songData && typeof setlistSong.songData === 'object'
    ? setlistSong.songData as Song
    : undefined;
  const normalizedSongData = rawSongData ? normalizeSongBars(rawSongData) : undefined;
  const sectionOrderSourceSong = normalizedSongData ?? sourceSong;
  const rawSectionOrder = Array.isArray(setlistSong.sectionOrder)
    ? setlistSong.sectionOrder.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    id: typeof setlistSong.id === 'string' && setlistSong.id.trim() ? setlistSong.id : createSetlistSongId(),
    setlistId,
    songId,
    order: typeof setlistSong.order === 'number' && Number.isFinite(setlistSong.order) ? setlistSong.order : index,
    overrideKey: typeof setlistSong.overrideKey === 'string' && VALID_KEYS.has(setlistSong.overrideKey)
      ? setlistSong.overrideKey as Key
      : sourceSong?.currentKey,
    capo: normalizeOptionalInteger(setlistSong.capo, 0, 12) ?? sourceSong?.capo ?? 0,
    sectionOrder: sectionOrderSourceSong
      ? sanitizeSetlistSectionOrder(rawSectionOrder, sectionOrderSourceSong)
      : rawSectionOrder,
    songData: normalizedSongData
  };
};

const normalizeStoredSetlist = (setlist: Partial<Setlist> & Record<string, unknown>, songsById: Map<string, StoredSong>, index: number): Setlist => {
  const setlistId = typeof setlist.id === 'string' && setlist.id.trim() ? setlist.id : createSetlistId();
  const rawSongs = Array.isArray(setlist.songs) ? setlist.songs : [];
  const songs = reindexSetlistSongs(
    rawSongs
      .map((item, itemIndex) => normalizeSetlistSong(setlistId, item as Partial<SetlistSong> & Record<string, unknown>, songsById, itemIndex))
      .filter((item) => songsById.has(item.songId))
      .sort((a, b) => a.order - b.order)
  );

  return {
    id: setlistId,
    name: normalizeText(setlist.name, `Setlist ${index + 1}`),
    displayMode: normalizeSetlistDisplayMode(setlist.displayMode),
    createdAt: typeof setlist.createdAt === 'number' && Number.isFinite(setlist.createdAt) ? setlist.createdAt : Date.now(),
    updatedAt: typeof setlist.updatedAt === 'number' && Number.isFinite(setlist.updatedAt) ? setlist.updatedAt : Date.now(),
    archived: normalizeBoolean(setlist.archived) ?? false,
    projectId: typeof setlist.projectId === 'string' && setlist.projectId.trim() ? setlist.projectId : null,
    songs
  };
};

const normalizeStoredProject = (project: Partial<Project> & Record<string, unknown>, index: number): Project => ({
  id: typeof project.id === 'string' && project.id.trim() ? project.id : crypto.randomUUID(),
  name: normalizeText(project.name, `Project ${index + 1}`),
  archived: normalizeBoolean(project.archived) ?? false,
  createdBy: normalizeOptionalText(project.createdBy),
  updatedBy: normalizeOptionalText(project.updatedBy),
  createdAt: typeof project.createdAt === 'number' && Number.isFinite(project.createdAt) ? project.createdAt : Date.now(),
  updatedAt: typeof project.updatedAt === 'number' && Number.isFinite(project.updatedAt) ? project.updatedAt : Date.now()
});

const serializeProjects = (projects: Project[]) =>
  JSON.stringify(projects.map((project) => ({ ...project })));

const buildDuplicateSongTitle = (existingSongs: StoredSong[], originalTitle: string, untitledSong: string, copyLabel: string) => {
  const baseTitle = originalTitle.trim() || untitledSong;
  const existingTitles = new Set(existingSongs.map((song) => song.title.trim().toLowerCase()));

  let copyIndex = 1;
  let nextTitle = `${baseTitle} ${copyLabel}`;

  while (existingTitles.has(nextTitle.trim().toLowerCase())) {
    copyIndex += 1;
    nextTitle = `${baseTitle} ${copyLabel} ${copyIndex}`;
  }

  return nextTitle;
};

const buildImportedTeamSongTitle = (existingSongs: StoredSong[], originalTitle: string, untitledSong: string, importLabel: string) => {
  const baseTitle = originalTitle.trim() || untitledSong;
  const existingTitles = new Set(existingSongs.map((song) => song.title.trim().toLowerCase()));
  if (!existingTitles.has(baseTitle.trim().toLowerCase())) {
    return baseTitle;
  }

  let copyIndex = 1;
  let nextTitle = `${baseTitle} ${importLabel}`;

  while (existingTitles.has(nextTitle.trim().toLowerCase())) {
    copyIndex += 1;
    nextTitle = `${baseTitle} ${importLabel} ${copyIndex}`;
  }

  return nextTitle;
};

const createEmptySong = (title: string): StoredSong =>
  createStoredSong({
    title,
    shuffle: false,
    originalKey: 'C',
    currentKey: 'C',
    showAbsoluteJianpu: false,
    tempo: 120,
    timeSignature: '4/4',
    barNumberMode: 'none',
    nashvilleFontPreset: DEFAULT_NASHVILLE_FONT_PRESET,
    chordFontPreset: DEFAULT_CHORD_FONT_PRESET,
    sections: [
      {
        id: 's1',
        title: 'Verse',
        bars: [{ chords: [] }, { chords: [] }, { chords: [] }, { chords: [] }]
      }
    ]
  });

const getDefaultLibrary = () => {
  const defaultSong = createStoredSong(INITIAL_SONG, createSongId());
  return {
    songs: [defaultSong],
    selectedSongId: defaultSong.id
  };
};

const getSongSelectionLibraryKey = (libraryId: string | null | undefined) => (
  libraryId ? `cloud:${libraryId}` : 'personal'
);

const readSelectedSongByLibrary = () => {
  if (typeof window === 'undefined') return {};

  try {
    const stored = window.localStorage.getItem(SELECTED_SONG_BY_LIBRARY_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, string>
      : {};
  } catch {
    return {};
  }
};

const getStoredSelectedSongId = (libraryId: string | null | undefined) => {
  if (typeof window === 'undefined') return null;

  try {
    const selectedByLibrary = readSelectedSongByLibrary();
    return selectedByLibrary[getSongSelectionLibraryKey(libraryId)]
      ?? window.localStorage.getItem(SELECTED_SONG_STORAGE_KEY);
  } catch {
    return null;
  }
};

const pickAvailableSongId = (songs: StoredSong[], preferredIds: Array<string | null | undefined>) => {
  for (const preferredId of preferredIds) {
    if (preferredId && songs.some((song) => song.id === preferredId)) {
      return preferredId;
    }
  }

  return songs[0]?.id ?? '';
};

const persistSelectedSongId = (libraryId: string | null | undefined, songId: string) => {
  if (typeof window === 'undefined') return;

  const selectedByLibrary = readSelectedSongByLibrary();
  selectedByLibrary[getSongSelectionLibraryKey(libraryId)] = songId;
  window.localStorage.setItem(SELECTED_SONG_BY_LIBRARY_STORAGE_KEY, JSON.stringify(selectedByLibrary));
  window.localStorage.setItem(SELECTED_SONG_STORAGE_KEY, songId);
};

const loadSongLibrary = () => {
  if (typeof window === 'undefined') {
    return {
      ...getDefaultLibrary(),
      lastSavedAt: null as number | null
    };
  }

  try {
    const storedSongs = window.localStorage.getItem(SONG_LIBRARY_STORAGE_KEY);
    const storedSelectedId = getStoredSelectedSongId(null);
    const storedLastSavedAt = window.localStorage.getItem(LAST_SAVED_AT_STORAGE_KEY);

    if (!storedSongs) {
      return {
        ...getDefaultLibrary(),
        lastSavedAt: null as number | null
      };
    }

    const parsedSongs = JSON.parse(storedSongs) as StoredSong[];
    if (!Array.isArray(parsedSongs) || parsedSongs.length === 0) {
      return {
        ...getDefaultLibrary(),
        lastSavedAt: null as number | null
      };
    }

    const songs = parsedSongs.map((song, index) => normalizeSongBars({
      ...song,
      id: song.id || `song-restored-${index + 1}`,
      updatedAt: typeof song.updatedAt === 'number' ? song.updatedAt : Date.now()
    }));
    const selectedSongId = pickAvailableSongId(songs, [storedSelectedId]);
    const parsedLastSavedAt = storedLastSavedAt ? Number(storedLastSavedAt) : null;

    return {
      songs,
      selectedSongId,
      lastSavedAt: Number.isFinite(parsedLastSavedAt) ? parsedLastSavedAt : null
    };
  } catch {
    return {
      ...getDefaultLibrary(),
      lastSavedAt: null as number | null
    };
  }
};

const loadSetlists = (songs: StoredSong[]) => {
  if (typeof window === 'undefined') {
    return {
      setlists: [] as Setlist[],
      selectedSetlistId: null as string | null,
      selectedSetlistSongId: null as string | null
    };
  }

  try {
    const storedSetlists = window.localStorage.getItem(SETLIST_STORAGE_KEY);
    const storedSelectedSetlistId = window.localStorage.getItem(SELECTED_SETLIST_STORAGE_KEY);
    const storedSelectedSetlistSongId = window.localStorage.getItem(SELECTED_SETLIST_SONG_STORAGE_KEY);

    if (!storedSetlists) {
      return {
        setlists: [] as Setlist[],
        selectedSetlistId: null as string | null,
        selectedSetlistSongId: null as string | null
      };
    }

    const parsedSetlists = JSON.parse(storedSetlists) as Array<Partial<Setlist> & Record<string, unknown>>;
    if (!Array.isArray(parsedSetlists)) {
      return {
        setlists: [] as Setlist[],
        selectedSetlistId: null as string | null,
        selectedSetlistSongId: null as string | null
      };
    }

    const songsById = new Map(songs.map((song) => [song.id, song] as const));
    const setlists = parsedSetlists.map((setlist, index) => normalizeStoredSetlist(setlist, songsById, index));
    const selectedSetlist = setlists.find((setlist) => setlist.id === storedSelectedSetlistId) ?? setlists[0] ?? null;
    const selectedSetlistSongId = selectedSetlist?.songs.some((item) => item.id === storedSelectedSetlistSongId)
      ? storedSelectedSetlistSongId
      : selectedSetlist?.songs[0]?.id ?? null;

    return {
      setlists,
      selectedSetlistId: selectedSetlist?.id ?? null,
      selectedSetlistSongId
    };
  } catch {
    return {
      setlists: [] as Setlist[],
      selectedSetlistId: null as string | null,
      selectedSetlistSongId: null as string | null
    };
  }
};

const loadProjects = () => {
  if (typeof window === 'undefined') {
    return {
      projects: [] as Project[],
      selectedProjectId: null as string | null
    };
  }

  try {
    const stored = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    const storedSelected = window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) as Array<Partial<Project> & Record<string, unknown>> : [];
    const projects = Array.isArray(parsed)
      ? parsed.map((project, index) => normalizeStoredProject(project, index))
      : [];
    const selectedProjectId = storedSelected && projects.some((project) => project.id === storedSelected)
      ? storedSelected
      : null;
    return { projects, selectedProjectId };
  } catch {
    return {
      projects: [] as Project[],
      selectedProjectId: null as string | null
    };
  }
};

const loadSetlistProjectFilter = (projects: Project[]): SetlistProjectFilter => {
  if (typeof window === 'undefined') return { kind: 'all' };

  try {
    return resolveInitialSetlistProjectFilter({
      storedFilter: window.localStorage.getItem(SETLIST_PROJECT_FILTER_STORAGE_KEY),
      legacyProjectId: window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY),
      projects
    });
  } catch {
    return { kind: 'all' };
  }
};

const loadWorkspaceMode = (): WorkspaceMode => {
  if (typeof window === 'undefined') {
    return 'songs';
  }

  return window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY) === 'setlists' ? 'setlists' : 'songs';
};

const loadGuitaristMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(GUITARIST_MODE_STORAGE_KEY) === 'true';
};

const loadPreviewQuickEditPreference = (): boolean => {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(PREVIEW_QUICK_EDIT_STORAGE_KEY) !== 'false';
};

const loadSetlistSortPreference = (): SetlistSortMode => {
  if (typeof window === 'undefined') {
    return 'updated-desc';
  }

  const storedMode = window.localStorage.getItem(SETLIST_SORT_STORAGE_KEY);
  return storedMode && VALID_SETLIST_SORT_MODES.has(storedMode as SetlistSortMode)
    ? storedMode as SetlistSortMode
    : 'updated-desc';
};

const sortSetlistsForDisplay = <T extends Pick<Setlist, 'name' | 'createdAt' | 'updatedAt'>>(items: T[], sortMode: SetlistSortMode): T[] => {
  const getTimestamp = (item: T, field: 'createdAt' | 'updatedAt') => {
    const value = item[field];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };

  return [...items].sort((first, second) => {
    if (sortMode === 'name-asc') {
      const firstName = first.name.trim() || '\uffff';
      const secondName = second.name.trim() || '\uffff';
      return firstName.localeCompare(secondName, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortMode === 'created-desc') {
      return getTimestamp(second, 'createdAt') - getTimestamp(first, 'createdAt');
    }

    return getTimestamp(second, 'updatedAt') - getTimestamp(first, 'updatedAt');
  });
};

// Library songs reuse the same sort modes as setlists (updated / created / name).
type LibrarySortMode = SetlistSortMode;

const loadLibrarySortPreference = (): LibrarySortMode => {
  if (typeof window === 'undefined') {
    return 'updated-desc';
  }
  const storedMode = window.localStorage.getItem(LIBRARY_SORT_STORAGE_KEY);
  return storedMode && VALID_SETLIST_SORT_MODES.has(storedMode as LibrarySortMode)
    ? storedMode as LibrarySortMode
    : 'updated-desc';
};

const sortSongsForDisplay = (items: StoredSong[], sortMode: LibrarySortMode): StoredSong[] => {
  const getTimestamp = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

  return [...items].sort((first, second) => {
    if (sortMode === 'name-asc') {
      const firstName = (first.title || '').trim() || '￿';
      const secondName = (second.title || '').trim() || '￿';
      return firstName.localeCompare(secondName, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (sortMode === 'created-desc') {
      // Songs created before this field existed fall back to updatedAt.
      return getTimestamp(second.createdAt ?? second.updatedAt) - getTimestamp(first.createdAt ?? first.updatedAt);
    }

    return getTimestamp(second.updatedAt) - getTimestamp(first.updatedAt);
  });
};

const formatSavedAt = (timestamp: number | null, language: AppLanguage) => {
  if (!timestamp) {
    return language === 'zh' ? '尚未儲存' : 'Not saved yet';
  }

  return `${language === 'zh' ? '已儲存 ' : 'Saved '}${new Date(timestamp).toLocaleTimeString(language === 'zh' ? 'zh-TW' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
};

const serializeSongLibrary = (library: StoredSong[]) =>
  JSON.stringify(
    library.map(({ updatedAt, ...song }) => song)
  );

const serializeSetlists = (setlists: Setlist[]) =>
  JSON.stringify(
    setlists.map((setlist) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs).map(({ personalCapoOverride, ...setlistSong }) => setlistSong)
    }))
  );


const loadJoinedSetlistDisplayPreferences = (): Record<string, JoinedSetlistDisplayPreference> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(JOINED_SETLIST_DISPLAY_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, Partial<JoinedSetlistDisplayPreference>>;
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([setlistId, preference]) => {
          if (!setlistId || !preference || typeof preference !== 'object') return null;

          const normalized: JoinedSetlistDisplayPreference = {};
          if (typeof preference.displayMode === 'string' && VALID_SETLIST_DISPLAY_MODES.has(preference.displayMode)) {
            normalized.displayMode = preference.displayMode as SetlistDisplayMode;
          }
          if (typeof preference.barNumberMode === 'string' && VALID_BAR_NUMBER_MODES.has(preference.barNumberMode)) {
            normalized.barNumberMode = preference.barNumberMode as BarNumberMode;
          }

          return [setlistId, normalized] as const;
        })
        .filter((entry): entry is readonly [string, JoinedSetlistDisplayPreference] => Boolean(entry))
    );
  } catch {
    return {};
  }
};

const saveJoinedSetlistDisplayPreferences = (preferences: Record<string, JoinedSetlistDisplayPreference>) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(JOINED_SETLIST_DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
};

const loadGoogleSession = (): GoogleUserSession | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedSession = window.localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY);
    if (!storedSession) {
      return null;
    }

    const parsedSession = JSON.parse(storedSession) as GoogleUserSession;
    if (!parsedSession?.sub || !parsedSession?.name || !parsedSession?.email) {
      return null;
    }

    return parsedSession;
  } catch {
    return null;
  }
};

const loadSidebarWidthPreference = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  }

  const rawValue = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(rawValue)) {
    return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  }

  return Math.max(MIN_EXPANDED_SIDEBAR_WIDTH, Math.min(MAX_EXPANDED_SIDEBAR_WIDTH, rawValue));
};

// null = use the automatic (responsive) editor width; a number = the user's
// dragged preference, clamped against the current viewport when applied.
const loadEditorWidthPreference = (): number | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY);
  if (raw === null || raw === '') {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
};

const parseGoogleCredential = (credential: string): GoogleUserSession | null => {
  try {
    const payloadSegment = credential.split('.')[1];
    if (!payloadSegment) {
      return null;
    }

    const normalizedPayload = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(window.atob(paddedPayload)) as Partial<GoogleUserSession>;

    if (!payload.sub || !payload.name || !payload.email) {
      return null;
    }

    return {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      picture: payload.picture
    };
  } catch {
    return null;
  }
};

const loadGoogleIdentityScript = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.google?.accounts?.id) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;

    const handleLoad = () => resolve();
    const handleError = () => reject(new Error('Failed to load Google Identity Services.'));

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });
};

export default function App() {
  const {
    user: rawAuthenticatedUser,
    session,
    status: authStatus,
    isConfigured: isAuthConfigured,
    signInWithGoogle,
    signOut
  } = useSupabaseAuth();
  // Supabase fires onAuthStateChange (TOKEN_REFRESHED, focus-driven re-auth, the
  // periodic auto-refresh, etc.) repeatedly, and each event hands back a brand-new
  // user object with identical fields. Effects keyed on `authenticatedUser` — most
  // importantly the cloud-workspace loader and the pending-sync flush — would then
  // re-run on every refresh, reloading the whole workspace and resetting the
  // selected project/setlist/song mid-session (the preview suddenly goes blank and
  // the user has to re-pick the project). Stabilize the reference by user id so
  // those effects only re-run on a genuine sign-in / sign-out / account switch.
  const authenticatedUser = React.useMemo(
    () => rawAuthenticatedUser,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawAuthenticatedUser?.id]
  );
  const [activeBar, setActiveBar] = useState<{ sIdx: number; bIdx: number } | null>(null);
  const [previewMetaEditTarget, setPreviewMetaEditTarget] = useState<PreviewWysiwygTarget | null>(null);
  const [isPreviewQuickEditEnabled, setIsPreviewQuickEditEnabled] = useState(loadPreviewQuickEditPreference);
  const [previewEditSession, setPreviewEditSession] = useState<PreviewEditSession | null>(null);
  const [previewSectionActionTarget, setPreviewSectionActionTarget] = useState<PreviewSectionActionTarget | null>(null);
  const [previewEditorPanelHeight, setPreviewEditorPanelHeight] = useState(0);
  const handlePreviewEditorPanelHeightChange = React.useCallback((height: number) => {
    const roundedHeight = Math.max(0, Math.round(height));
    setPreviewEditorPanelHeight((currentHeight) => (
      currentHeight === roundedHeight ? currentHeight : roundedHeight
    ));
  }, []);
  const [isPreviewEditExitPromptOpen, setIsPreviewEditExitPromptOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>('zh');
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const toast = useToast();
  const initialLibraryRef = useRef(loadSongLibrary());
  const initialSetlistsRef = useRef(loadSetlists(initialLibraryRef.current.songs));
  const initialProjectsRef = useRef(loadProjects());
  const [songs, setSongs] = useState<StoredSong[]>(initialLibraryRef.current.songs);
  const [savedSongs, setSavedSongs] = useState<StoredSong[]>(cloneSong(initialLibraryRef.current.songs));
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(loadWorkspaceMode);
  const [guitaristMode, setGuitaristMode] = useState<boolean>(loadGuitaristMode);
  const [selectedSongId, setSelectedSongId] = useState(initialLibraryRef.current.selectedSongId);
  const [setlists, setSetlists] = useState<Setlist[]>(initialSetlistsRef.current.setlists);
  const [savedSetlists, setSavedSetlists] = useState<Setlist[]>(cloneSong(initialSetlistsRef.current.setlists));
  const [projects, setProjects] = useState<Project[]>(initialProjectsRef.current.projects);
  const [savedProjects, setSavedProjects] = useState<Project[]>(cloneSong(initialProjectsRef.current.projects));
  const [setlistProjectFilter, setSetlistProjectFilter] = useState<SetlistProjectFilter>(() => (
    loadSetlistProjectFilter(initialProjectsRef.current.projects)
  ));
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [projectPicker, setProjectPicker] = useState<{ mode: 'move' | 'copy'; setlistIds: string[] } | null>(null);
  const [creatingProjectShareLinkId, setCreatingProjectShareLinkId] = useState<string | null>(null);
  const [multiSelectedSetlistIds, setMultiSelectedSetlistIds] = useState<string[]>([]);
  const [joinedSetlists, setJoinedSetlists] = useState<JoinedSetlist[]>([]);
  const [joinedProjects, setJoinedProjects] = useState<JoinedProject[]>([]);
  const [joinedSetlistDisplayPreferences, setJoinedSetlistDisplayPreferences] = useState<Record<string, JoinedSetlistDisplayPreference>>(loadJoinedSetlistDisplayPreferences);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(initialSetlistsRef.current.selectedSetlistId);
  const [selectedSetlistSongId, setSelectedSetlistSongId] = useState<string | null>(initialSetlistsRef.current.selectedSetlistSongId);
  const [songHistories, setSongHistories] = useState<Record<string, SongHistoryState>>({});
  const [setlistSongHistories, setSetlistSongHistories] = useState<Record<string, SetlistSongHistoryState>>({});
  const [selectedLibrarySongIds, setSelectedLibrarySongIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLyricsMode, setIsLyricsMode] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportProgress, setPdfExportProgress] = useState<PdfExportProgressState | null>(null);
  const [isLibraryEditing, setIsLibraryEditing] = useState(false);
  const [activeAppView, setActiveAppView] = useState<AppView>('sheet');
  // Auto-save is always on now (the toggle was removed). Kept as a constant so
  // the existing "auto-saved" hints and the auto-save effect read true.
  const isAutoSaveEnabled = true;
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialLibraryRef.current.lastSavedAt);
  const [highlightedSectionIds, setHighlightedSectionIds] = useState<string[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState<EditorFocusRequest | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? SPLIT_EDITOR_BREAKPOINT : window.innerWidth
  ));
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window === 'undefined' ? 800 : window.innerHeight
  ));
  // Distinguishes real laptop/desktop pointers (mouse/trackpad) from touch
  // tablets so the split-editor layout can engage at a smaller width on
  // desktops without affecting iPad-style touch devices.
  const [hasFinePointer, setHasFinePointer] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: fine)').matches
      : false
  ));
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [performancePageIndex, setPerformancePageIndex] = useState(0);
  const [performanceChromeVisible, setPerformanceChromeVisible] = useState(true);
  const [performanceTotalPages, setPerformanceTotalPages] = useState(1);
  const [activeReferenceKind, setActiveReferenceKind] = useState<SongReferenceKind | null>(null);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidthPreference);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [editorWidthPreference, setEditorWidthPreference] = useState<number | null>(loadEditorWidthPreference);
  const [isEditorResizing, setIsEditorResizing] = useState(false);
  const editorPaneLeftRef = useRef(0);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [setlistSearchQuery, setSetlistSearchQuery] = useState('');
  const [setlistSongSearchQuery, setSetlistSongSearchQuery] = useState('');
  // Shared selection bag for the add-songs page. Repeated ids intentionally
  // represent duplicate additions of the same library song.
  const [setlistAddSongSelection, setSetlistAddSongSelection] = useState<string[]>([]);
  const [setlistSortMode, setSetlistSortMode] = useState<SetlistSortMode>(loadSetlistSortPreference);
  const [showArchivedSetlists, setShowArchivedSetlists] = useState(false);
  const [librarySortMode, setLibrarySortMode] = useState<LibrarySortMode>(loadLibrarySortPreference);
  const [setlistPanelView, setSetlistPanelView] = useState<SetlistPanelView>(
    initialSetlistsRef.current.selectedSetlistId ? 'detail' : 'list'
  );
  const [isCreateSetlistOpen, setIsCreateSetlistOpen] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [newSetlistProjectId, setNewSetlistProjectId] = useState('');
  const [isSetlistActionsMenuOpen, setIsSetlistActionsMenuOpen] = useState(false);
  const [isToolbarOverflowMenuOpen, setIsToolbarOverflowMenuOpen] = useState(false);
  const [isGoogleAccountMenuOpen, setIsGoogleAccountMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileActionsSheetOpen, setIsMobileActionsSheetOpen] = useState(false);
  const [isMobileMetadataOpen, setIsMobileMetadataOpen] = useState(false);
  const [mobileSwipeSetlist, setMobileSwipeSetlist] = useState<{ id: string; action: 'delete' | 'archive' } | null>(null);
  const [draggingSetlist, setDraggingSetlist] = useState<{ id: string; dx: number } | null>(null);
  const [mobileSwipeProject, setMobileSwipeProject] = useState<{ id: string; action: 'delete' | 'archive' } | null>(null);
  const [draggingProject, setDraggingProject] = useState<{ id: string; dx: number } | null>(null);
  const [mobileSwipeMember, setMobileSwipeMember] = useState<{ id: string; action: 'delete' | 'archive' } | null>(null);
  const [draggingMember, setDraggingMember] = useState<{ id: string; dx: number } | null>(null);
  const [draggingSetlistSongId, setDraggingSetlistSongId] = useState<string | null>(null);
  const [dragOverSetlistSongId, setDragOverSetlistSongId] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUserSession | null>(loadGoogleSession);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [authUiError, setAuthUiError] = useState<string | null>(null);
  const [authUiMessage, setAuthUiMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'syncing' | 'offline' | 'failed'>('saved');
  const [isLoadingCloudWorkspace, setIsLoadingCloudWorkspace] = useState(false);
  const [isImportPromptOpen, setIsImportPromptOpen] = useState(false);
  const [isImportingLocalWorkspace, setIsImportingLocalWorkspace] = useState(false);
  const [leavingSharedSetlistId, setLeavingSharedSetlistId] = useState<string | null>(null);
  const [pendingLeaveSharedSetlistId, setPendingLeaveSharedSetlistId] = useState<string | null>(null);
  const [leavingSharedProjectId, setLeavingSharedProjectId] = useState<string | null>(null);
  const [pendingLeaveSharedProjectId, setPendingLeaveSharedProjectId] = useState<string | null>(null);
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(null);
  const [selectedSetlistShareStatus, setSelectedSetlistShareStatus] = useState<SetlistShareStatus | null>(null);
  const [isLoadingSetlistShareStatus, setIsLoadingSetlistShareStatus] = useState(false);
  const [selectedProjectShareStatus, setSelectedProjectShareStatus] = useState<ProjectShareStatus | null>(null);
  const [isLoadingProjectShareStatus, setIsLoadingProjectShareStatus] = useState(false);
  const [pendingRevokeShareSetlistId, setPendingRevokeShareSetlistId] = useState<string | null>(null);
  const [isRevokingSetlistShare, setIsRevokingSetlistShare] = useState(false);
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  const [isCreatingSongShare, setIsCreatingSongShare] = useState(false);
  const [shareDialogContext, setShareDialogContext] = useState<{ resourceType: NotificationResourceType; resourceId: string } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [shareContacts, setShareContacts] = useState<ShareContact[]>([]);
  const [isLoadingShareContacts, setIsLoadingShareContacts] = useState(false);
  const [isSharingToContacts, setIsSharingToContacts] = useState(false);
  const [cloudLibraries, setCloudLibraries] = useState<CloudLibrarySummary[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [isSwitchingLibrary, setIsSwitchingLibrary] = useState(false);
  const [teamManagement, setTeamManagement] = useState<TeamManagementSnapshot | null>(null);
  const [isTeamManagementOpen, setIsTeamManagementOpen] = useState(false);
  const [isLoadingTeamManagement, setIsLoadingTeamManagement] = useState(false);
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = useState(false);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isImportingPersonalSongs, setIsImportingPersonalSongs] = useState(false);
  const [teamInviteEmail, setTeamInviteEmail] = useState('');
  const [teamInviteRole, setTeamInviteRole] = useState<Exclude<LibraryRole, 'owner'>>('viewer');
  const [isCreatingTeamInvite, setIsCreatingTeamInvite] = useState(false);
  const [teamInviteShareUrl, setTeamInviteShareUrl] = useState<string | null>(null);
  const [teamFeatureError, setTeamFeatureError] = useState<string | null>(null);
  const [teamSourceStatuses, setTeamSourceStatuses] = useState<Record<string, {
    latestUpdatedAt?: number;
    missing?: boolean;
    error?: string;
    isLoading?: boolean;
  }>>({});
  const previewRef = React.useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previewZoomLabelRef = useRef<HTMLButtonElement>(null);
  const mobileWysiwygKeyboardProxyInputRef = useRef<HTMLInputElement>(null);
  const setlistActionsMenuRef = useRef<HTMLDivElement>(null);
  const toolbarOverflowMenuRef = useRef<HTMLDivElement>(null);
  const googleAccountMenuRef = useRef<HTMLDivElement>(null);
  const importLibraryInputRef = useRef<HTMLInputElement>(null);
  const googleSignInRef = useRef<HTMLDivElement>(null);
  const googleIdentityInitializedRef = useRef(false);
  const mobileSetlistSwipeRef = useRef<SwipeGestureState | null>(null);
  const mobileSetlistSwipeHandledRef = useRef(false);
  const mobileProjectSwipeRef = useRef<SwipeGestureState | null>(null);
  const mobileProjectSwipeHandledRef = useRef(false);
  const mobileMemberSwipeRef = useRef<SwipeGestureState | null>(null);
  const mobileMemberSwipeHandledRef = useRef(false);
  const mobileLongPressRef = useRef<{ kind: 'song' | 'setlist'; id: string; x: number; y: number } | null>(null);
  const mobileLongPressTimerRef = useRef<number | null>(null);
  const mobileLongPressTriggeredRef = useRef(false);
  const editorFocusTimeoutRef = useRef<number | null>(null);
  const editorFocusRequestIdRef = useRef(0);
  const pendingPreviewTransitionRef = useRef<(() => void) | null>(null);
  // When a section/chord of a *non-selected* setlist song is clicked in the
  // preview, we first switch the focused setlist song (async) and stash the
  // desired editor target here so it can be applied once that song is active.
  const pendingSetlistElementFocusRef = useRef<{
    itemId: string;
    sectionId: string | null;
    sIdx: number;
    bIdx: number;
    field: ChordSheetElementField;
    target?: ChordSheetElementTarget;
  } | null>(null);
  const previewDragStateRef = useRef<PreviewDragState | null>(null);
  const previewPinchStateRef = useRef<PreviewPinchState | null>(null);
  const previewPinchFrameRef = useRef<number | null>(null);
  const previewScaleCleanupFrameRef = useRef<number | null>(null);
  const previewSuppressClickTimeoutRef = useRef<number | null>(null);
  const skipNextSetlistPreviewAutoScrollRef = useRef(false);
  const preserveSetlistPreviewSelectionUntilRef = useRef(0);
  // Whether the setlist preview pane is scrolled down far enough to show the
  // "back to top" button (the preview can be a tall stack of songs).
  const [showPreviewBackToTop, setShowPreviewBackToTop] = useState(false);
  const setlistSongPointerDragRef = useRef<{
    sourceId: string;
    pointerId: number;
    lastTargetId: string | null;
    previousUserSelect: string;
    startX: number;
    startY: number;
    element: HTMLElement;
    activated: boolean;
    holdTimeoutId: number | null;
  } | null>(null);
  const pdfExportCancelRequestedRef = useRef(false);
  const suppressPreviewClickRef = useRef(false);
  const performanceOverlayRef = useRef<HTMLDivElement>(null);
  const performanceKeyboardCaptureRef = useRef<HTMLInputElement>(null);
  const performanceSheetRef = useRef<HTMLDivElement>(null);
  const performanceTranslatorRef = useRef<HTMLDivElement>(null);
  const performancePageIndexRef = useRef(0);
  const performancePageOffsetsRef = useRef<number[]>([]);
  const performanceTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPerformanceKeyboardEventRef = useRef<{ signature: string; handledAt: number } | null>(null);
  // Performance-mode chrome (exit / references / page indicator / arrows) auto-hides
  // after a short idle so it stops covering the sheet; any touch reveals it again.
  const performanceChromeHideTimerRef = useRef<number | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const cloudRepositoryRef = useRef<ReturnType<typeof createCloudRepository> | null>(null);
  const [previewBaseScale, setPreviewBaseScale] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewViewportWidth, setPreviewViewportWidth] = useState(PREVIEW_TARGET_WIDTH);
  const [previewViewportHeight, setPreviewViewportHeight] = useState(1123);
  const [previewPageHeight, setPreviewPageHeight] = useState(PREVIEW_PAGE_HEIGHT);
  const [sheetMetrics, setSheetMetrics] = useState({ width: PREVIEW_TARGET_WIDTH, height: 1123 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const logoSrc = `${import.meta.env.BASE_URL}logo.svg`;
  const copy = getUiCopy(language);
  const { aboutSections, helpSections, changelogEntries } = getLocalizedAppMeta(language);
  const googleClientId = '';
  const showGoogleAuth = false;
  const isAuthenticated = Boolean(session && authenticatedUser);
  const isCloudMode = isAuthenticated && Boolean(cloudRepositoryRef.current || authenticatedUser);
  const activeCloudLibrary = cloudLibraries.find((library) => library.id === activeLibraryId)
    ?? cloudLibraries.find((library) => library.kind === 'personal')
    ?? null;
  const personalCloudLibrary = cloudLibraries.find((library) => library.kind === 'personal') ?? null;
  const workspaceLibraryButtons = cloudLibraries.length > 0
    ? cloudLibraries
    : isAuthenticated
      ? [{
          id: activeLibraryId ?? 'personal-placeholder',
          name: language === 'zh' ? '個人區' : 'Personal',
          kind: 'personal' as const,
          ownerUserId: authenticatedUser?.id ?? '',
          role: 'owner' as const,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        }]
      : [];
  const isTeamWorkspace = activeCloudLibrary?.kind === 'team';
  const activeLibraryRole = activeCloudLibrary?.role ?? 'owner';
  const hasSongs = songs.length > 0;
  const linkedTeamSourceSignature = React.useMemo(
    () => songs
      .filter((item) => item.teamSource)
      .map((item) => `${item.id}:${item.teamSource?.libraryId}:${item.teamSource?.songId}:${item.teamSource?.updatedAt}`)
      .join('|'),
    [songs]
  );
  const canEditTeamSongs = !isTeamWorkspace || TEAM_EDIT_ROLES.has(activeLibraryRole);
  const canCreateTeamSetlists = !isTeamWorkspace || TEAM_SETLIST_CREATE_ROLES.has(activeLibraryRole);
  const canManageActiveTeam = isTeamWorkspace && activeLibraryRole === 'owner';
  const hasTeamLibraries = cloudLibraries.some((library) => library.kind === 'team');
  // Keep the create-team form collapsed by default so it never permanently
  // compresses the sidebar; it only expands when the user opens it explicitly.
  const shouldShowCreateTeamForm = isCreateTeamOpen;
  const song = songs.find((item) => item.id === selectedSongId) ?? songs[0] ?? EMPTY_LIBRARY_PREVIEW_SONG;
  const libraryIsDirty = serializeSongLibrary(songs) !== serializeSongLibrary(savedSongs);
  const setlistIsDirty = serializeSetlists(setlists) !== serializeSetlists(savedSetlists);
  const workspaceIsDirty = libraryIsDirty || setlistIsDirty;
  const isSheetView = activeAppView === 'sheet';
  const isSetlistMode = workspaceMode === 'setlists';
  const performanceScale = Math.min(
    viewportWidth / PREVIEW_TARGET_WIDTH,
    viewportHeight / PREVIEW_PAGE_HEIGHT
  );
  const isPhoneViewport = viewportWidth < PHONE_VIEWPORT_BREAKPOINT;
  const previewEditorUserAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const previewEditorPlatform = typeof navigator === 'undefined' ? '' : navigator.platform || '';
  const previewEditorTouchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0;
  const previewEditorIsPhoneDevice = /iPhone|iPod|Android.*Mobile/i.test(previewEditorUserAgent);
  const previewEditorDeviceLayout = resolvePreviewEditorDeviceLayout({
    viewportWidth,
    maxTouchPoints: previewEditorTouchPoints,
    hasCoarsePointer: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false,
    isPhoneDevice: previewEditorIsPhoneDevice,
    isKnownTabletDevice: /iPad/i.test(previewEditorUserAgent)
      || (/Macintosh/i.test(previewEditorUserAgent) && previewEditorPlatform === 'MacIntel' && previewEditorTouchPoints > 1)
      || (Capacitor.getPlatform() === 'ios' && !previewEditorIsPhoneDevice && viewportWidth >= PHONE_VIEWPORT_BREAKPOINT)
  });
  const isSidebarExpanded = isPhoneViewport ? isMobileNavOpen : (isSidebarPinned || isSidebarHovered);
  const usesOverlaySidebar = viewportWidth < SIDEBAR_OVERLAY_BREAKPOINT;
  const collapsedSidebarWidth = isPhoneViewport ? 0 : COLLAPSED_SIDEBAR_WIDTH;
  const phoneSidebarMaxWidth = Math.max(240, viewportWidth - 12);
  const phoneSidebarMinWidth = Math.min(320, phoneSidebarMaxWidth);
  const phoneSidebarPreferredWidth = Math.max(
    phoneSidebarMinWidth,
    Math.min(phoneSidebarMaxWidth, Math.floor(viewportWidth * 0.92))
  );
  const responsiveSidebarMinWidth = isPhoneViewport
    ? phoneSidebarPreferredWidth
    : usesOverlaySidebar
      ? Math.max(collapsedSidebarWidth + 216, 288)
      : MIN_EXPANDED_SIDEBAR_WIDTH;
  const responsiveSidebarMaxWidth = isPhoneViewport
    ? phoneSidebarPreferredWidth
    : usesOverlaySidebar
      ? Math.min(Math.max(Math.floor(viewportWidth * 0.86), responsiveSidebarMinWidth), 420)
      : MAX_EXPANDED_SIDEBAR_WIDTH;
  const resolvedSidebarWidth = Math.max(
    responsiveSidebarMinWidth,
    Math.min(responsiveSidebarMaxWidth, sidebarWidth)
  );
  const currentSidebarWidth = isSidebarExpanded ? resolvedSidebarWidth : collapsedSidebarWidth;
  const phoneSidebarShellWidth = isMobileNavOpen ? resolvedSidebarWidth : 0;
  const phoneSidebarHiddenOffset = resolvedSidebarWidth + 24;
  const sidebarShellWidth = usesOverlaySidebar ? collapsedSidebarWidth : currentSidebarWidth;
  const isPhoneSetlistDrawer = isPhoneViewport && isSetlistMode;
  const mainViewportWidth = Math.max(0, viewportWidth - sidebarShellWidth);
  // Desktop laptops (fine pointer) keep the side-by-side split far below the
  // touch threshold so 14" MacBooks — especially with "Larger Text" display
  // scaling or a pinned song list — stay on the desktop layout instead of the
  // iPad-style floating overlay editor.
  const splitEditorMinMain = hasFinePointer ? 1024 : SPLIT_EDITOR_BREAKPOINT;
  const shouldUseSplitEditor = mainViewportWidth >= splitEditorMinMain;
  // On desktops give the editor pane whatever is left after reserving a
  // readable minimum preview width, capped so it never grows absurdly wide.
  // This lets the editor reach its full desktop layout (wide metadata panel +
  // full bar cards) whenever the screen allows, while still keeping the preview
  // usable. On genuinely narrow laptops the editor simply gets less room and
  // gracefully degrades to its compact cards rather than squeezing the preview.
  const splitPreviewMinWidth = 440;
  const splitEditorMaxWidth = 1040;
  const autoSplitEditorWidth = hasFinePointer
    ? Math.min(splitEditorMaxWidth, Math.max(560, mainViewportWidth - splitPreviewMinWidth))
    : Math.max(680, Math.min(860, Math.round(mainViewportWidth * 0.5)));
  // When the user has dragged the divider, honour their width (clamped so the
  // editor stays usable and the preview keeps a readable minimum); otherwise
  // fall back to the automatic responsive width.
  const draggedEditorMaxWidth = Math.max(EDITOR_PANE_MIN_WIDTH, mainViewportWidth - PREVIEW_PANE_MIN_WIDTH);
  const splitEditorWidth = editorWidthPreference != null
    ? Math.max(EDITOR_PANE_MIN_WIDTH, Math.min(draggedEditorMaxWidth, editorWidthPreference))
    : autoSplitEditorWidth;
  const overlayEditorWidth = Math.min(
    isPhoneViewport ? mainViewportWidth : Math.max(560, Math.round(mainViewportWidth * 0.52)),
    Math.max(0, mainViewportWidth - (isPhoneViewport ? 0 : 32))
  );
  const denseDesktopHeaderMinMain = hasFinePointer ? 1024 : 1200;
  const usesDenseDesktopHeader = isSheetView && mainViewportWidth >= denseDesktopHeaderMinMain;
  const usesTabletHeader = isSheetView && !isPhoneViewport && !usesDenseDesktopHeader;
  const isToolbarSecondaryCollapsed = mainViewportWidth < 1240;
  const toolbarPrimaryGridClassName = mainViewportWidth < 1040
    ? 'grid-cols-4'
    : mainViewportWidth < 1380
      ? 'grid-cols-4'
      : 'grid-cols-7';
  const currentSongHistory = songHistories[song?.id || ''] ?? { past: [], future: [] };
  const allJoinedProjectSetlists: JoinedSetlist[] = React.useMemo(
    () => joinedProjects.flatMap((project) =>
      project.setlists.map((sl) => ({ ...sl, isJoined: true } as JoinedSetlist))
    ),
    [joinedProjects]
  );
  const firstAvailableSetlist = setlists[0] ?? joinedSetlists[0] ?? allJoinedProjectSetlists[0] ?? null;
  const selectedSetlist = selectedSetlistId
    ? setlists.find((item) => item.id === selectedSetlistId)
      ?? joinedSetlists.find((item) => item.id === selectedSetlistId)
      ?? allJoinedProjectSetlists.find((item) => item.id === selectedSetlistId)
      ?? firstAvailableSetlist
    : firstAvailableSetlist;
  const isJoinedSetlist = selectedSetlist !== null && (selectedSetlist as JoinedSetlist).isJoined === true;
  const canEditSelectedSetlist = !isTeamWorkspace
    ? !isJoinedSetlist
    : !isJoinedSetlist && (
      TEAM_EDIT_ROLES.has(activeLibraryRole)
      || (activeLibraryRole === 'setlist_manager' && selectedSetlist?.createdBy === authenticatedUser?.id)
    );
  const canCreateNewShareLink = !isTeamWorkspace || TEAM_EDIT_ROLES.has(activeLibraryRole);
  const canShareSelectedSetlist = canEditSelectedSetlist && canCreateNewShareLink;
  // The joined project (if any) that contains the currently-selected setlist, plus
  // whether I'm a *manager* of it. Managers may edit the shared key + song order of
  // the project's setlists (Phase 1); everyone else stays read-only.
  const selectedSetlistJoinedProject = selectedSetlistId
    ? joinedProjects.find((jp) => jp.setlists.some((sl) => sl.id === selectedSetlistId)) ?? null
    : null;
  const isJoinedProjectManager = selectedSetlistJoinedProject?.role === 'manager';
  // Key picker + drag-reorder unlock for owners/team-editors as before, *and* for
  // joined-project managers.
  const canEditSelectedSetlistKey = canEditSelectedSetlist || isJoinedProjectManager;
  const canReorderSelectedSetlist = canEditSelectedSetlist || isJoinedProjectManager;
  const canManageSetlist = (setlist: Pick<Setlist, 'createdBy'>) => !isTeamWorkspace
    || TEAM_EDIT_ROLES.has(activeLibraryRole)
    || (activeLibraryRole === 'setlist_manager' && setlist.createdBy === authenticatedUser?.id);
  const isMultiSelectMode = multiSelectedSetlistIds.length > 0;
  const exitMultiSelect = () => setMultiSelectedSetlistIds([]);
  const toggleMultiSelect = (setlistId: string) => {
    setMultiSelectedSetlistIds((current) => (
      current.includes(setlistId)
        ? current.filter((id) => id !== setlistId)
        : [...current, setlistId]
    ));
  };
  // Owned project sharing follows team owner/editor rights. Joined project
  // managers get their own sharing path after selectedJoinedProject is known.
  const canCreateProject = canCreateTeamSetlists;
  const canManageProject = (project: Pick<Project, 'createdBy'>) => !isTeamWorkspace
    || TEAM_EDIT_ROLES.has(activeLibraryRole)
    || (activeLibraryRole === 'setlist_manager' && project.createdBy === authenticatedUser?.id);
  const canShareProject = canCreateNewShareLink;
  const canOpenEditor = isSetlistMode ? canEditSelectedSetlist : canEditTeamSongs && hasSongs;
  const joinedSetlistDisplayPreference = isJoinedSetlist && selectedSetlist
    ? joinedSetlistDisplayPreferences[selectedSetlist.id] ?? {}
    : {};
  const effectiveSelectedSetlist = selectedSetlist
    ? {
        ...selectedSetlist,
        displayMode: isJoinedSetlist
          ? joinedSetlistDisplayPreference.displayMode ?? selectedSetlist.displayMode
          : selectedSetlist.displayMode
      }
    : null;
  const pendingLeaveSharedSetlist = pendingLeaveSharedSetlistId
    ? joinedSetlists.find((item) => item.id === pendingLeaveSharedSetlistId)
      ?? allJoinedProjectSetlists.find((item) => item.id === pendingLeaveSharedSetlistId)
      ?? null
    : null;
  const pendingLeaveSharedProject = pendingLeaveSharedProjectId
    ? joinedProjects.find((jp) => jp.id === pendingLeaveSharedProjectId) ?? null
    : null;
  const pendingRevokeShareSetlist = pendingRevokeShareSetlistId
    ? setlists.find((item) => item.id === pendingRevokeShareSetlistId) ?? null
    : null;
  const selectedSetlistSong = selectedSetlist?.songs.find((item) => item.id === selectedSetlistSongId) ?? selectedSetlist?.songs[0] ?? null;
  const selectedSetlistSourceSong = selectedSetlistSong
    ? songs.find((item) => item.id === selectedSetlistSong.songId)
      ?? (selectedSetlistSong.songData ? { ...selectedSetlistSong.songData, id: selectedSetlistSong.songId, updatedAt: 0 } as StoredSong : null)
    : null;
  const currentSetlistSongHistory = setlistSongHistories[selectedSetlistSong?.id || ''] ?? { past: [], future: [] };
  const activeSetlistEditableSong = React.useMemo(() => (
    selectedSetlistSong
      ? ensureSongEditingIds(normalizeSongBars(cloneSong(selectedSetlistSong.songData ?? selectedSetlistSourceSong ?? INITIAL_SONG)))
      : null
  ), [selectedSetlistSong, selectedSetlistSourceSong]);
  const activeLibraryEditableSong = React.useMemo(() => (
    song ? ensureSongEditingIds(song) : null
  ), [song]);
  const activeSetlistPreviewSong = selectedSetlistSong && selectedSetlistSourceSong && effectiveSelectedSetlist
    ? {
        ...applySetlistSongOverrides(activeSetlistEditableSong ?? selectedSetlistSourceSong, effectiveSelectedSetlist, selectedSetlistSong, guitaristMode),
        references: selectedSetlistSourceSong.references,
        ...(isJoinedSetlist && joinedSetlistDisplayPreference.barNumberMode
          ? { barNumberMode: joinedSetlistDisplayPreference.barNumberMode }
          : {})
      }
    : null;
  const activeEditorSong = isSetlistMode
    ? (activeSetlistEditableSong ?? selectedSetlistSourceSong ?? null)
    : activeLibraryEditableSong;
  const activeNavigationPreviewSong = isSetlistMode
    ? (activeSetlistPreviewSong ?? activeEditorSong)
    : activeLibraryEditableSong;
  const activePreviewIdentity = isSetlistMode ? selectedSetlistSong?.id ?? null : song?.id ?? null;
  const activePreviewEditSession = previewEditSession?.previewIdentity === activePreviewIdentity
    ? previewEditSession
    : null;
  const previewEditorBottomInset = activePreviewEditSession
    ? getPreviewEditorBottomInset(previewEditorDeviceLayout, previewEditorPanelHeight)
    : 0;
  const activeDraftEditorSong = activePreviewEditSession?.draftSong ?? activeEditorSong;
  const activeDraftNavigationPreviewSong = isSetlistMode
    ? (activeDraftEditorSong && selectedSetlistSong && selectedSetlistSourceSong && effectiveSelectedSetlist
        ? {
            ...applySetlistSongOverrides(activeDraftEditorSong, effectiveSelectedSetlist, selectedSetlistSong, guitaristMode),
            references: selectedSetlistSourceSong.references,
            ...(isJoinedSetlist && joinedSetlistDisplayPreference.barNumberMode
              ? { barNumberMode: joinedSetlistDisplayPreference.barNumberMode }
              : {})
          }
        : activeNavigationPreviewSong)
    : activeDraftEditorSong;
  const activeAppViewLabel = activeAppView === 'about'
    ? copy.about
    : activeAppView === 'help'
      ? copy.help
      : isSetlistMode
        ? selectedSetlist?.name || copy.untitledSetlist
        : hasSongs ? song.title || copy.untitledSong : (activeCloudLibrary?.name ?? copy.songLibrary);
  const mobileDrawerContextLabel = isSetlistMode ? copy.serviceSetlist : copy.songLibrary;
  const mobileDrawerContextValue = isSetlistMode
    ? setlistPanelView === 'detail' || setlistPanelView === 'addSongs'
      ? (selectedSetlist?.name || copy.untitledSetlist)
      : setlistPanelView === 'manageProjects'
        ? (language === 'zh' ? '專案管理' : 'Manage projects')
        : (language === 'zh' ? '歌單總覽' : 'Setlists')
    : activeAppViewLabel;
  const workspaceModeBadge = isSetlistMode ? copy.setlistModeBadge : copy.songModeBadge;
  const syncStatusLabel = syncStatus === 'saved'
    ? copy.cloudSyncSaved
    : syncStatus === 'syncing'
      ? copy.cloudSyncSyncing
      : syncStatus === 'offline'
        ? copy.cloudSyncOffline
        : copy.cloudSyncFailed;
  // Colour tone for the compact sync-status indicator in the collapsed sidebar.
  const syncStatusTone = syncStatus === 'failed'
    ? 'bg-rose-50 text-rose-600 ring-rose-200/70 hover:bg-rose-100'
    : syncStatus === 'offline'
      ? 'bg-amber-50 text-amber-600 ring-amber-200/70 hover:bg-amber-100'
      : syncStatus === 'syncing'
        ? 'bg-indigo-50 text-indigo-600 ring-indigo-200/70 hover:bg-indigo-100'
        : 'bg-emerald-50 text-emerald-600 ring-emerald-200/70 hover:bg-emerald-100';
  const importSummaryLabel = copy.importLocalStats
    .replace('{songs}', String(songs.length))
    .replace('{setlists}', String(setlists.length));
  const toolbarSurfaceDark = 'dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface)] dark:text-[color:var(--color-text)] dark:hover:border-[color:var(--color-indigo-700)] dark:hover:bg-[color:var(--color-surface-raised)]';
  const toolbarEmphasisDark = 'dark:bg-[color:var(--color-indigo-700)] dark:text-[color:var(--color-text-inverse)] dark:hover:bg-[color:var(--color-indigo-600)]';
  const toolbarToggleActiveAccentDark = 'dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200';
  const toolbarToggleActiveAccentDarkLight = 'dark:border-[color:var(--color-indigo-700)] dark:bg-[color:var(--color-indigo-900)] dark:text-[color:var(--color-indigo-100)]';
  const toolbarPrimaryActionClassName = `flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`;
  const toolbarPrimaryEmphasisActionClassName = `flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-800 ${toolbarEmphasisDark}`;
  const toolbarSecondaryToggleClassName = (active: boolean) => `inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition-all ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-indigo-950/40'
      : `border border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:text-indigo-600 ${toolbarSurfaceDark}`
  }`;
  const desktopToolbarActionClassName = `inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`;
  const desktopToolbarPrimaryActionClassName = `inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 ${toolbarEmphasisDark}`;
  const desktopToolbarToggleClassName = (active: boolean, tone: 'neutral' | 'accent' = 'neutral') => `inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-semibold shadow-sm transition-colors ${
    active
      ? tone === 'accent'
        ? `border-amber-200 bg-amber-50 text-amber-700 ${toolbarToggleActiveAccentDark}`
        : `border-indigo-200 bg-indigo-50 text-indigo-700 ${toolbarToggleActiveAccentDarkLight}`
      : `border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`
  }`;
  const denseHeaderShowsContextLabel = mainViewportWidth >= 1500;
  const denseToolbarShowsLabels = mainViewportWidth >= 1680;
  const denseToolbarActionClassName = denseToolbarShowsLabels
    ? desktopToolbarActionClassName
    : `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`;
  const denseToolbarPrimaryActionClassName = denseToolbarShowsLabels
    ? desktopToolbarPrimaryActionClassName
    : `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white shadow-sm transition-colors hover:bg-gray-800 ${toolbarEmphasisDark}`;
  const denseToolbarToggleClassName = (active: boolean, tone: 'neutral' | 'accent' = 'neutral') => (
    denseToolbarShowsLabels
      ? desktopToolbarToggleClassName(active, tone)
      : `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-colors ${
          active
            ? tone === 'accent'
              ? `border-amber-200 bg-amber-50 text-amber-700 ${toolbarToggleActiveAccentDark}`
              : `border-indigo-200 bg-indigo-50 text-indigo-700 ${toolbarToggleActiveAccentDarkLight}`
            : `border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`
        }`
  );
  const denseToolbarMenuButtonClassName = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`;
  const compactEditorToggleLabel = language === 'zh' ? '編輯' : 'Editor';
  const compactLyricsToggleLabel = language === 'zh' ? '歌詞' : 'Lyrics';
  const compactSaveLabel = language === 'zh' ? '儲存' : 'Save';
  const compactPdfLabel = language === 'zh' ? 'PDF' : 'PDF';
  const mobileTopbarActionBaseClassName = 'flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold shadow-sm transition-colors';
  const mobileTopbarToggleChipClassName = (active: boolean, tone: 'neutral' | 'accent' = 'neutral') => {
    if (active) {
      return `${mobileTopbarActionBaseClassName} ${
        tone === 'accent'
          ? `border-amber-200 bg-amber-50 text-amber-700 ${toolbarToggleActiveAccentDark}`
          : `border-indigo-200 bg-indigo-50 text-indigo-700 ${toolbarToggleActiveAccentDarkLight}`
      }`;
    }

    return `${mobileTopbarActionBaseClassName} border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`;
  };
  const getMobileTopbarActionClassName = (tone: 'default' | 'primary' | 'accent' = 'default') => {
    if (tone === 'primary') {
      return `${mobileTopbarActionBaseClassName} border-gray-900 bg-gray-900 text-white hover:bg-gray-800 dark:border-[color:var(--color-indigo-700)] ${toolbarEmphasisDark}`;
    }

    if (tone === 'accent') {
      return `${mobileTopbarActionBaseClassName} border-amber-500 bg-amber-500 text-white hover:bg-amber-400`;
    }

    return `${mobileTopbarActionBaseClassName} border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50 ${toolbarSurfaceDark}`;
  };
  const inlineModeBadgeClassName = (active: boolean) => `inline-flex min-w-[28px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-black leading-none ${
    active
      ? 'border-indigo-200 bg-white/70 text-current'
      : 'border-gray-200 bg-gray-50 text-gray-600'
  }`;
  const setlistDisplayModeOptions: Array<{ value: SetlistDisplayMode; label: string }> = [
    { value: 'chord-movable-key', label: language === 'zh' ? '首調' : 'Movable' },
    { value: 'nashville-number-system', label: language === 'zh' ? '級數' : 'Numbers' },
    { value: 'chord-fixed-key', label: language === 'zh' ? '固定調' : 'Fixed' }
  ];
  const barNumberModeOptions: Array<{ value: BarNumberMode; label: string }> = [
    { value: 'none', label: copy.editor.barNumbersOff },
    { value: 'line-start', label: copy.editor.barNumbersLineStart },
    { value: 'all', label: copy.editor.barNumbersAll }
  ];
  const currentSetlistDisplayMode = effectiveSelectedSetlist?.displayMode ?? 'chord-movable-key';
  const currentSetlistBarNumberMode = joinedSetlistDisplayPreference.barNumberMode
    ?? activeSetlistPreviewSong?.barNumberMode
    ?? 'none';
  const renderSetlistDisplayModeControl = (className = '', size: 'xs' | 'sm' = 'xs') => (
    isSetlistMode && effectiveSelectedSetlist ? (
      <CompactSegmentedControl
        value={currentSetlistDisplayMode}
        options={setlistDisplayModeOptions}
        onChange={handleSetlistDisplayModeChange}
        size={size}
        className={`shrink-0 ${size === 'xs' ? '!h-9 rounded-lg bg-white shadow-sm' : ''} ${className}`}
        buttonClassName={size === 'xs' ? 'min-w-[42px]' : 'min-w-[54px]'}
      />
    ) : null
  );
  const toolbarOverflowPanel = isToolbarOverflowMenuOpen ? (
    <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface-raised)]">
      <button
        type="button"
        onClick={() => {
          handleSaveLibrary();
          setIsToolbarOverflowMenuOpen(false);
        }}
        className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
          workspaceIsDirty
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)] dark:hover:text-[color:var(--color-text)]'
        }`}
      >
        <Save size={14} />
        <span>{workspaceIsDirty ? copy.saveChanges : copy.saved}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          handleExportPdf();
          setIsToolbarOverflowMenuOpen(false);
        }}
        disabled={isExportingPdf}
        className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
          isExportingPdf
            ? 'cursor-wait bg-gray-100 text-gray-400'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)] dark:hover:text-[color:var(--color-text)]'
        }`}
      >
        <Save size={14} />
        <span>{isExportingPdf ? copy.preparingPdf : isSetlistMode ? copy.exportSetlistPdf : copy.exportPdf}</span>
      </button>

      {isSheetView && canOpenEditor && (
        <button
          type="button"
          onClick={() => {
            const nextEnabled = !isPreviewQuickEditEnabled;
            if (!nextEnabled && previewEditSession?.dirty) {
              pendingPreviewTransitionRef.current = () => {
                setPreviewEditSession(null);
                setIsPreviewQuickEditEnabled(false);
              };
              setIsPreviewEditExitPromptOpen(true);
            } else {
              if (!nextEnabled) setPreviewEditSession(null);
              setIsPreviewQuickEditEnabled(nextEnabled);
            }
            setIsToolbarOverflowMenuOpen(false);
          }}
          className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
            isPreviewQuickEditEnabled
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)] dark:hover:text-[color:var(--color-text)]'
          }`}
          role="menuitemcheckbox"
          aria-checked={isPreviewQuickEditEnabled}
        >
          <span className="flex items-center gap-2"><Edit3 size={14} /><span>{language === 'zh' ? '預覽快捷編輯' : 'Preview quick edit'}</span></span>
          <span className="text-[11px] font-bold">{isPreviewQuickEditEnabled ? copy.on : copy.off}</span>
        </button>
      )}

      {isAuthenticated ? (
        <>
          <div className={`mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            syncStatus === 'failed'
              ? 'bg-rose-50 text-rose-700'
              : syncStatus === 'offline'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}>
            {syncStatus === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />}
            <span>{syncStatusLabel}</span>
          </div>

          {activeAppView === 'sheet' && !isSetlistMode && hasSongs && (!isTeamWorkspace || canEditTeamSongs) && (
            <button
              type="button"
              onClick={() => {
                void handleCreateShareLink('song');
                setIsToolbarOverflowMenuOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)] dark:hover:text-[color:var(--color-text)]"
            >
              <Share2 size={14} />
              <span>{copy.shareCurrentSong}</span>
            </button>
          )}

          {activeAppView === 'sheet' && isSetlistMode && selectedSetlist && canShareSelectedSetlist && (
            <button
              type="button"
              onClick={() => {
                void handleCreateShareLink('setlist');
                setIsToolbarOverflowMenuOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)] dark:hover:text-[color:var(--color-text)]"
            >
              <Share2 size={14} />
              <span>{copy.shareCurrentSetlist}</span>
            </button>
          )}
        </>
      ) : !showGoogleAuth ? (
        <button
          type="button"
          onClick={() => {
            void handleGoogleSignIn();
            setIsToolbarOverflowMenuOpen(false);
          }}
          disabled={!isAuthConfigured}
          className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)] dark:hover:text-[color:var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ExternalLink size={14} />
          <span>{copy.continueWithGoogle}</span>
        </button>
      ) : null}

      <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-gray-50 p-1 dark:bg-[color:var(--color-surface-sunken)]">
        {([
          { value: 'light', icon: Sun, label: language === 'zh' ? '淺色' : 'Light' },
          { value: 'dark', icon: Moon, label: language === 'zh' ? '深色' : 'Dark' },
          { value: 'auto', icon: MonitorSmartphone, label: language === 'zh' ? '系統' : 'Auto' }
        ] as const).map(({ value, icon: Icon, label }) => {
          const isActive = themeMode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setThemeMode(value)}
              aria-pressed={isActive}
              aria-label={label}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white dark:bg-[color:var(--color-surface-raised)] dark:text-[color:var(--color-text)]'
                  : 'text-gray-600 hover:bg-white dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)]'
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-gray-50 p-1 dark:bg-[color:var(--color-surface-sunken)]">
        <button
          type="button"
          onClick={() => {
            setLanguage('zh');
            setIsToolbarOverflowMenuOpen(false);
          }}
          className={`rounded-lg px-2.5 py-2 text-xs font-bold transition-colors ${
            language === 'zh'
              ? 'bg-gray-900 text-white dark:bg-[color:var(--color-surface-raised)] dark:text-[color:var(--color-text)]'
              : 'text-gray-600 hover:bg-white dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)]'
          }`}
        >
          中文
        </button>
        <button
          type="button"
          onClick={() => {
            setLanguage('en');
            setIsToolbarOverflowMenuOpen(false);
          }}
          className={`rounded-lg px-2.5 py-2 text-xs font-bold transition-colors ${
            language === 'en'
              ? 'bg-gray-900 text-white dark:bg-[color:var(--color-surface-raised)] dark:text-[color:var(--color-text)]'
              : 'text-gray-600 hover:bg-white dark:text-[color:var(--color-text-muted)] dark:hover:bg-[color:var(--color-surface)]'
          }`}
        >
          EN
        </button>
      </div>
    </div>
  ) : null;
  const normalizedLibrarySearchQuery = normalizeSearchText(librarySearchQuery);
  const normalizedSetlistSearchQuery = normalizeSearchText(setlistSearchQuery);
  const normalizedSetlistSongSearchQuery = normalizeSearchText(setlistSongSearchQuery);
  const currentCapo = song.capo || 0;
  const currentPlayKey = getPlayKey(song.currentKey, currentCapo);
  const currentSetlistKey = activeSetlistPreviewSong?.currentKey ?? selectedSetlistSourceSong?.currentKey ?? 'C';
  const currentSetlistCapo = selectedSetlistSong
    ? resolveSetlistSongCapo(selectedSetlistSong, selectedSetlistSourceSong ?? { capo: 0, currentKey: currentSetlistKey }, guitaristMode)
    : (selectedSetlistSourceSong?.capo ?? 0);
  const currentSetlistPlayKey = getPlayKey(currentSetlistKey, currentSetlistCapo);
  const exportProgressPercent = pdfExportProgress && pdfExportProgress.totalPages > 0
    ? Math.max(0, Math.min(100, (pdfExportProgress.completedPages / pdfExportProgress.totalPages) * 100))
    : 0;
  const exportSectionLabel = pdfExportProgress?.sectionTitle?.trim()
    ? pdfExportProgress.sectionTitle
    : pdfExportProgress?.sectionIndex
      ? `${copy.exportingPdfSectionLabel} ${pdfExportProgress.sectionIndex}`
      : '—';
  const mobileMetadataTitle = isSetlistMode ? copy.setlistEditor.instanceSettings : copy.editor.editSong;
  const mobileMetadataSong = activeEditorSong;
  const mobileMetadataKey = isSetlistMode ? currentSetlistKey : song.currentKey;
  const mobileMetadataCapo = isSetlistMode ? currentSetlistCapo : currentCapo;
  const mobileMetadataTempo = typeof mobileMetadataSong?.tempo === 'number' ? `${mobileMetadataSong.tempo}` : '—';
  const mobileMetadataTime = mobileMetadataSong?.timeSignature?.trim() || '—';
  const mobileMetadataVersion = mobileMetadataSong ? getSongVersionSummary(mobileMetadataSong) : '';
  const mobileMetadataTranslator = mobileMetadataSong?.translator?.trim() || '';
  const activeReferenceSong = isSetlistMode ? activeSetlistPreviewSong : song;
  const activeReferenceCurrentKey = isSetlistMode ? currentSetlistKey : song.currentKey;
  const playableReferenceKinds = (['band', 'vocal'] as SongReferenceKind[])
    .filter((kind) => hasPlayableReference(activeReferenceSong?.references?.[kind]));
  const shouldShowReferenceControls = isSheetView && Boolean(activeReferenceSong) && playableReferenceKinds.length > 0;
  const getReferenceKindLabel = (kind: SongReferenceKind) => (
    language === 'zh'
      ? kind === 'band' ? '樂團' : '歌手'
      : kind === 'band' ? 'Band' : 'Vocal'
  );
  const openReferencePlayer = (kind: SongReferenceKind) => {
    setActiveReferenceKind(kind);
  };
  const renderReferenceButtons = (
    className: string,
    options: { showLabels?: boolean; activeClassName?: string } = {}
  ) => {
    if (!shouldShowReferenceControls) {
      return null;
    }

    return (
      <>
        {playableReferenceKinds.map((kind) => {
          const isActive = activeReferenceKind === kind;
          const buttonClassName = isActive && options.activeClassName ? options.activeClassName : className;

          return (
            <button
              key={kind}
              type="button"
              onClick={() => openReferencePlayer(kind)}
              className={buttonClassName}
              title={`${getReferenceKindLabel(kind)} Reference`}
              aria-label={`${getReferenceKindLabel(kind)} Reference`}
            >
              {kind === 'band' ? <Music2 size={14} /> : <Mic2 size={14} />}
              {options.showLabels ? <span>{getReferenceKindLabel(kind)}</span> : null}
            </button>
          );
        })}
      </>
    );
  };
  React.useEffect(() => {
    if (!activeReferenceKind) {
      return;
    }

    if (!playableReferenceKinds.includes(activeReferenceKind)) {
      setActiveReferenceKind(playableReferenceKinds[0] ?? null);
    }
  }, [activeReferenceKind, playableReferenceKinds.join('|')]);
  const duplicateLabel = language === 'zh' ? '副本' : 'Copy';
  const previewScale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, previewBaseScale * previewZoom));
  const previewSheetWidth = sheetMetrics.width * previewScale;
  const previewSheetHeight = sheetMetrics.height * previewScale;
  const previewCanvasWidth = Math.max(previewSheetWidth, previewViewportWidth);
  const previewFitHeightScale = Math.min(
    PREVIEW_MAX_SCALE,
    Math.max(PREVIEW_MIN_SCALE, previewViewportHeight / Math.max(1, previewPageHeight))
  );
  const previewScalePercent = Math.round((previewScale / previewFitHeightScale) * 100);
  const previewFitWidthScale = Math.min(
    PREVIEW_MAX_SCALE,
    Math.max(PREVIEW_MIN_SCALE, previewViewportWidth / Math.max(1, sheetMetrics.width))
  );
  const filteredSongs = sortSongsForDisplay(songs.filter((item) => {
    if (!normalizedLibrarySearchQuery) {
      return true;
    }

    const librarySearchText = [
      item.title,
      item.originalKey,
      item.currentKey,
      item.timeSignature,
      typeof item.tempo === 'number' ? String(item.tempo) : '',
      item.lyricist,
      item.composer,
      item.translator,
      ...item.sections.map((section) => section.title)
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    return normalizeSearchText(librarySearchText).includes(normalizedLibrarySearchQuery);
  }), librarySortMode);
  const getSetlistSongSource = (item: SetlistSong): StoredSong | null => {
    const libSong = songs.find((songItem) => songItem.id === item.songId);
    return libSong ?? (item.songData ? { ...item.songData, id: item.songId, updatedAt: 0 } as StoredSong : null);
  };
  const getSetlistSongInfoSummary = (item: SetlistSong, sourceSong: Song) => {
    const effectiveKey = item.overrideKey ?? sourceSong.currentKey;
    const effectiveCapo = resolveSetlistSongCapo(item, sourceSong, guitaristMode);
    const displaySong = item.songData ?? sourceSong;
    const versionSummary = getSongVersionSummary(displaySong);
    const translator = displaySong.translator?.trim();

    return [
      `${copy.editor.originalKey} ${displaySong.originalKey}`,
      `${copy.key} ${effectiveKey}`,
      `Capo ${effectiveCapo}`,
      typeof displaySong.tempo === 'number' ? `${displaySong.tempo} BPM` : '',
      displaySong.timeSignature,
      versionSummary,
      translator
    ].filter(Boolean).join(' · ');
  };
  const getSetlistCardSongSummaries = (setlist: Pick<Setlist, 'songs'>) => (
    setlist.songs
      .map((item) => {
        const sourceSong = getSetlistSongSource(item);
        if (!sourceSong) return null;

        const displaySong = item.songData ?? sourceSong;
        return {
          id: item.id,
          title: displaySong.title || sourceSong.title || copy.untitledSong,
          summary: getSetlistSongInfoSummary(item, sourceSong)
        };
      })
      .filter((item): item is { id: string; title: string; summary: string } => Boolean(item))
      .slice(0, 3)
  );
  const setlistSongsWithSource = (selectedSetlist?.songs ?? []).map((item) => {
    const sourceSong = getSetlistSongSource(item);
    return { item, sourceSong };
  }).filter((entry): entry is { item: SetlistSong; sourceSong: StoredSong } => entry.sourceSong !== null);
  const setlistMatchesSearch = (item: Setlist | JoinedSetlist) => {
    if (!normalizedSetlistSearchQuery) {
      return true;
    }

    const searchText = [
      item.name,
      ...item.songs.map((setlistSong) => {
        const sourceSong = getSetlistSongSource(setlistSong);
        const displaySong = setlistSong.songData ?? sourceSong;
        return displaySong?.title ?? '';
      })
    ].join(' ');

    return normalizeSearchText(searchText).includes(normalizedSetlistSearchQuery);
  };
  const selectedJoinedProject = setlistProjectFilter.kind === 'shared-project'
    ? joinedProjects.find((item) => item.id === setlistProjectFilter.projectId) ?? null
    : null;

  const setlistsInScope = filterOwnedSetlistsByProject(setlists, setlistProjectFilter);
  const joinedSetlistsInScope: JoinedSetlist[] = setlistProjectFilter.kind === 'all'
    ? [
        ...joinedSetlists,
        ...joinedProjects.flatMap((project) => project.setlists.map((setlist) => ({ ...setlist, isJoined: true } as JoinedSetlist)))
      ]
    : setlistProjectFilter.kind === 'shared-setlists'
      ? joinedSetlists
      : setlistProjectFilter.kind === 'shared-project'
        ? (joinedProjects.find((project) => project.id === setlistProjectFilter.projectId)?.setlists ?? [])
          .map((setlist) => ({ ...setlist, isJoined: true } as JoinedSetlist))
        : [];
  const archivedSetlistCount = setlistsInScope.filter((item) => item.archived).length;
  const visibleSetlists = showArchivedSetlists ? setlistsInScope : setlistsInScope.filter((item) => !item.archived);
  const filteredSetlists: Setlist[] = sortSetlistsForDisplay<Setlist>(visibleSetlists.filter(setlistMatchesSearch), setlistSortMode);
  const filteredJoinedSetlists: JoinedSetlist[] = sortSetlistsForDisplay<JoinedSetlist>(
    joinedSetlistsInScope.filter(setlistMatchesSearch),
    setlistSortMode
  );

  const activeProjects = projects.filter((item) => !item.archived);
  const archivedProjectsCount = projects.length - activeProjects.length;
  const visibleProjects = showArchivedProjects ? projects : activeProjects;
  const selectedProject = setlistProjectFilter.kind === 'owned-project'
    ? projects.find((item) => item.id === setlistProjectFilter.projectId) ?? null
    : null;
  const selectedProjectShareTarget = selectedProject ?? selectedJoinedProject;
  const canShareSelectedProject = selectedProject
    ? canShareProject
    : selectedJoinedProject?.role === 'manager';
  const ungroupedSetlistCount = setlists.filter((item) => (item.projectId ?? null) === null && !item.archived).length;
  const projectSetlistCount = (projectId: string) => setlists.filter((item) => item.projectId === projectId && !item.archived).length;
  const selectedProjectFilterLabel = setlistProjectFilter.kind === 'all'
    ? (language === 'zh' ? '全部歌單' : 'All setlists')
    : setlistProjectFilter.kind === 'ungrouped'
      ? copy.ungroupedProject
      : setlistProjectFilter.kind === 'shared-setlists'
        ? copy.sharedWithMe
        : setlistProjectFilter.kind === 'owned-project'
          ? projects.find((project) => project.id === setlistProjectFilter.projectId)?.name ?? copy.untitledProject
          : joinedProjects.find((project) => project.id === setlistProjectFilter.projectId)?.name ?? copy.sharedWithMe;

  const handleSetlistProjectFilterChange = (nextFilter: SetlistProjectFilter) => {
    setSetlistProjectFilter(nextFilter);
    setShowArchivedSetlists(false);
    setMobileSwipeSetlist(null);
  };
  // Filter from the full library (not filteredSongs) so the song-library search
  // query never leaks into the setlist "add songs" list.
  const filteredSongsForSetlist = songs.filter((item) => {
    if (!normalizedSetlistSongSearchQuery) {
      return true;
    }

    const searchText = [
      item.title,
      item.currentKey,
      item.originalKey,
      ...item.sections.map((section) => section.title)
    ].join(' ');

    return normalizeSearchText(searchText).includes(normalizedSetlistSongSearchQuery);
  });

  useEffect(() => {
    if (!isPhoneSetlistDrawer) return;

    if (!selectedSetlist) {
      // Keep an intentional 'manageProjects' (or 'list') view; only setlist-bound
      // views fall back to the list when nothing is selected.
      setSetlistPanelView((view) => (view === 'detail' || view === 'addSongs') ? 'list' : view);
      return;
    }

    if (!isMobileNavOpen) {
      setSetlistPanelView('detail');
      setSetlistSongSearchQuery('');
    }
  }, [isMobileNavOpen, isPhoneSetlistDrawer, selectedSetlist?.id]);

  useEffect(() => {
    // The setlist list (with its swipe behind-buttons) is visible in two
    // layouts: the phone drawer when in 'list' view, OR the desktop/tablet
    // sidebar when in 'list' view. Close any open swipe only when neither
    // list surface is on screen.
    const listVisible = setlistPanelView === 'list';
    if (!listVisible) {
      setMobileSwipeSetlist(null);
      return;
    }

    if (mobileSwipeSetlist && !setlists.some((item) => item.id === mobileSwipeSetlist.id)) {
      setMobileSwipeSetlist(null);
    }
  }, [setlistPanelView, mobileSwipeSetlist, setlists]);

  useEffect(() => {
    // Auto-collapse an open swipe after a few seconds of inactivity so a
    // forgotten "delete" button doesn't linger waiting to be tapped.
    if (!mobileSwipeSetlist) return;
    const timeout = window.setTimeout(() => setMobileSwipeSetlist(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [mobileSwipeSetlist]);

  useEffect(() => {
    if (isPhoneViewport) {
      return;
    }

    if (!isSetlistMode || !selectedSetlist) {
      // Only the views that REQUIRE a selected setlist fall back to the list.
      // The 'manageProjects' (and 'list') views are valid with no selection, so a new
      // user who opens 'manageProjects' isn't bounced straight back to the setlist list.
      setSetlistPanelView((view) => (view === 'detail' || view === 'addSongs') ? 'list' : view);
      return;
    }

    if (setlistPanelView === 'addSongs' && !canEditSelectedSetlist) {
      setSetlistPanelView('detail');
    }
  }, [canEditSelectedSetlist, setlistPanelView, isPhoneViewport, isSetlistMode, selectedSetlist?.id]);

  useEffect(() => () => {
    clearMobileLongPressTimer();
  }, []);

  const createNewSongTitle = (index: number) => language === 'zh' ? `新歌 ${index}` : `New Song ${index}`;
  const createDefaultSong = (index = 1) => createEmptySong(createNewSongTitle(index));

  useEffect(() => {
    if (!activeEditorSong) {
      setActiveSectionId(null);
      setActiveBar(null);
      return;
    }

    if (activeSectionId && activeEditorSong.sections.some((section) => section.id === activeSectionId)) {
      if (activeBar) {
        const targetSection = activeEditorSong.sections[activeBar.sIdx];
        if (!targetSection?.bars[activeBar.bIdx]) {
          setActiveBar(null);
        }
      }
      return;
    }

    setActiveSectionId(activeEditorSong.sections[0]?.id ?? null);
    setActiveBar(null);
  }, [activeBar, activeEditorSong, activeSectionId]);

  useEffect(() => {
    // The lyrics formatter is a pure local view toggle now; exit it whenever the
    // active song or setlist changes so we never land on it unexpectedly.
    setIsLyricsMode(false);
  }, [effectiveSelectedSetlist?.id, isSetlistMode, song?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    // iOS/iPadOS reports stale window dimensions while a rotation is animating,
    // which can leave the layout broken after rotating back. Re-measure a few
    // times after the orientation settles.
    const settleTimers: number[] = [];
    const handleOrientationChange = () => {
      handleResize();
      settleTimers.push(window.setTimeout(handleResize, 200));
      settleTimers.push(window.setTimeout(handleResize, 450));
      settleTimers.push(window.setTimeout(handleResize, 800));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.visualViewport?.removeEventListener('resize', handleResize);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const finePointerQuery = window.matchMedia('(pointer: fine)');
    const updateFinePointer = () => setHasFinePointer(finePointerQuery.matches);

    updateFinePointer();
    finePointerQuery.addEventListener('change', updateFinePointer);

    return () => {
      finePointerQuery.removeEventListener('change', updateFinePointer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SETLIST_SORT_STORAGE_KEY, setlistSortMode);
  }, [setlistSortMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LIBRARY_SORT_STORAGE_KEY, librarySortMode);
  }, [librarySortMode]);

  useEffect(() => {
    if (!isSidebarResizing) {
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      const nextWidth = Math.max(
        responsiveSidebarMinWidth,
        Math.min(responsiveSidebarMaxWidth, event.clientX)
      );
      setSidebarWidth(nextWidth);
    };

    const handlePointerUp = () => {
      setIsSidebarResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [isSidebarResizing, responsiveSidebarMaxWidth, responsiveSidebarMinWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (editorWidthPreference == null) {
      window.localStorage.removeItem(EDITOR_WIDTH_STORAGE_KEY);
    } else {
      window.localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, String(Math.round(editorWidthPreference)));
    }
  }, [editorWidthPreference]);

  useEffect(() => {
    if (!isEditorResizing) {
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      const maxWidth = Math.max(EDITOR_PANE_MIN_WIDTH, mainViewportWidth - PREVIEW_PANE_MIN_WIDTH);
      const rawWidth = Math.max(
        EDITOR_PANE_MIN_WIDTH,
        Math.min(maxWidth, event.clientX - editorPaneLeftRef.current)
      );
      // Snap onto layout boundaries so crossing them feels magnetic rather than
      // jumpy; keep the snapped value within the usable range.
      const nextWidth = Math.max(
        EDITOR_PANE_MIN_WIDTH,
        Math.min(maxWidth, snapEditorPaneWidth(rawWidth))
      );
      setEditorWidthPreference(nextWidth);
    };

    const handlePointerUp = () => {
      setIsEditorResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [isEditorResizing, mainViewportWidth]);

  useEffect(() => {
    const repository = cloudRepositoryRef.current;
    const linkedSongs = songs.filter((item) => item.teamSource);

    if (!authenticatedUser || isTeamWorkspace || !repository || linkedSongs.length === 0) {
      setTeamSourceStatuses({});
      return;
    }

    let isCancelled = false;
    setTeamSourceStatuses((current) => {
      const next: typeof current = {};
      linkedSongs.forEach((linkedSong) => {
        next[linkedSong.id] = { ...current[linkedSong.id], isLoading: true };
      });
      return next;
    });

    const loadStatuses = async () => {
      const results = await Promise.all(linkedSongs.map(async (linkedSong) => {
        try {
          const sourceSong = await repository.loadTeamSourceSong(linkedSong);
          return {
            songId: linkedSong.id,
            status: sourceSong
              ? { latestUpdatedAt: sourceSong.updatedAt, isLoading: false }
              : { missing: true, isLoading: false }
          };
        } catch (error) {
          return {
            songId: linkedSong.id,
            status: {
              error: error instanceof Error ? error.message : 'Unable to load linked team song.',
              isLoading: false
            }
          };
        }
      }));

      if (isCancelled) return;
      setTeamSourceStatuses(Object.fromEntries(results.map((result) => [result.songId, result.status])));
    };

    void loadStatuses();

    return () => {
      isCancelled = true;
    };
  }, [authenticatedUser, isTeamWorkspace, linkedTeamSourceSignature, songs]);

  useEffect(() => {
    if (!isEditing || !activeSectionId) return;

    const scrollRoot = previewRef.current;
    if (!scrollRoot) return;

    const target = scrollRoot.querySelector<HTMLElement>(`[data-preview-section-id="${activeSectionId}"]`);
    if (!target) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const currentTop = scrollRoot.scrollTop;
    const offsetTop = targetRect.top - rootRect.top + currentTop;
    const desiredTop = Math.max(0, offsetTop - Math.min(120, rootRect.height * 0.18));

    if (Math.abs(scrollRoot.scrollTop - desiredTop) < 12) return;

    scrollRoot.scrollTo({
      top: desiredTop,
      behavior: 'smooth'
    });
  }, [activeSectionId, isEditing]);

  const persistWorkspace = async (
    nextSongs: StoredSong[],
    nextSetlists: Setlist[],
    nextProjects: Project[] = projects
  ) => {
    const savedAt = Date.now();

    if (!isTeamWorkspace) {
      try {
        window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(nextSongs));
        window.localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(nextSetlists));
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(nextProjects));
        window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
      } catch {
        // Ignore local cache failures and keep the app usable.
      }
    }

    if (!authenticatedUser || !cloudRepositoryRef.current) {
      setSavedSongs(cloneSong(nextSongs));
      setSavedSetlists(cloneSong(nextSetlists));
      setSavedProjects(cloneSong(nextProjects));
      setLastSavedAt(savedAt);
      setSyncStatus('saved');
      return;
    }

    if (!navigator.onLine) {
      if (isTeamWorkspace) {
        setSyncStatus('offline');
        throw new Error(language === 'zh' ? '團隊區需要連線才能儲存。' : 'Team workspaces require an internet connection to save.');
      }
      savePendingSync({
        songs: cloneSong(nextSongs),
        setlists: cloneSong(nextSetlists),
        projects: cloneSong(nextProjects),
        savedAt
      });
      setSyncStatus('offline');
      return;
    }

    try {
      setSyncStatus('syncing');
      await syncWorkspaceDiff({
        repository: cloudRepositoryRef.current,
        songs: nextSongs,
        setlists: nextSetlists,
        projects: nextProjects,
        savedSongs,
        savedSetlists,
        savedProjects
      });
      savePendingSync(null);
      setSavedSongs(cloneSong(nextSongs));
      setSavedSetlists(cloneSong(nextSetlists));
      setSavedProjects(cloneSong(nextProjects));
      setLastSavedAt(savedAt);
      setSyncStatus('saved');
    } catch (error) {
      if (!isTeamWorkspace) {
        savePendingSync({
          songs: cloneSong(nextSongs),
          setlists: cloneSong(nextSetlists),
          projects: cloneSong(nextProjects),
          savedAt
        });
      }
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      const fallbackMessage = language === 'zh'
        ? '雲端儲存失敗，請確認網路後再試一次。'
        : 'Cloud save failed. Please check your connection and try again.';
      const detail = error instanceof Error && error.message.trim() ? error.message.trim() : '';
      throw new Error(detail ? `${fallbackMessage}\n\n${detail}` : fallbackMessage);
    }
  };

  const pushSongHistory = (songId: string, previousSong: Song) => {
    setSongHistories((currentHistory) => {
      const entry = currentHistory[songId] ?? { past: [], future: [] };
      return {
        ...currentHistory,
        [songId]: {
          past: [...entry.past.slice(-29), cloneSong(previousSong)],
          future: []
        }
      };
    });
  };

  const replaceSongInLibrary = (songId: string, nextSong: Song) => {
    setSongs((currentSongs) =>
      currentSongs.map((item) =>
        item.id === songId
          ? {
              ...cloneSong(nextSong),
              id: item.id,
              createdAt: item.createdAt,
              updatedAt: Date.now()
            }
          : item
      )
    );
  };

  const replaceSetlist = (setlistId: string, updater: (currentSetlist: Setlist) => Setlist) => {
    setSetlists((currentSetlists) =>
      currentSetlists.map((item) => {
        if (item.id !== setlistId) {
          return item;
        }

        const nextSetlist = updater(item);
        return {
          ...nextSetlist,
          songs: reindexSetlistSongs(nextSetlist.songs),
          updatedAt: Date.now()
        };
      })
    );
  };

  const pushSetlistSongHistory = (setlistSongId: string, previousSong: Song, sectionOrder: string[]) => {
    setSetlistSongHistories((currentHistory) => {
      const entry = currentHistory[setlistSongId] ?? { past: [], future: [] };
      return {
        ...currentHistory,
        [setlistSongId]: {
          past: [...entry.past.slice(-29), {
            song: cloneSong(previousSong),
            sectionOrder: [...sectionOrder]
          }],
          future: []
        }
      };
    });
  };

  const syncSetlistSectionOrder = (currentOrder: string[], previousSong: Song, nextSong: Song) => {
    const normalizedCurrentOrder = sanitizeSetlistSectionOrder(currentOrder, previousSong);
    const previousDefaultOrder = getDefaultSectionOrder(previousSong);
    const isFollowingSongSectionOrder = normalizedCurrentOrder.length === previousDefaultOrder.length
      && normalizedCurrentOrder.every((sectionId, index) => sectionId === previousDefaultOrder[index]);

    if (isFollowingSongSectionOrder) {
      return getDefaultSectionOrder(nextSong);
    }

    return sanitizeSetlistSectionOrder(
      insertNewSetlistSectionsAfterSources(normalizedCurrentOrder, previousSong, nextSong),
      nextSong
    );
  };

  const handleSetlistSongContentChange = (nextSong: Song) => {
    if (!selectedSetlist || !selectedSetlistSong || !activeSetlistEditableSong) {
      return;
    }
    if (!canEditSelectedSetlist) {
      return;
    }

    // Only treat this edit as a key change if the editable song's key actually
    // changed; otherwise keep the user's existing setlist key override so that
    // editing other content (chords, lyrics, etc.) does not reset the key.
    const keyChangedInEdit = nextSong.currentKey !== activeSetlistEditableSong.currentKey;

    pushSetlistSongHistory(selectedSetlistSong.id, activeSetlistEditableSong, selectedSetlistSong.sectionOrder);
    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: keyChangedInEdit
        ? nextSong.currentKey
        : (currentSetlistSong.overrideKey ?? nextSong.currentKey),
      capo: nextSong.capo ?? 0,
      sectionOrder: syncSetlistSectionOrder(currentSetlistSong.sectionOrder, activeSetlistEditableSong, nextSong),
      songData: cloneSong(normalizeSongBars(nextSong))
    }));
  };

  const restoreSavedWorkspace = () => {
    const restoredSongs = cloneSong(savedSongs);
    const restoredSetlists = cloneSong(savedSetlists);
    setSongs(restoredSongs);
    setSetlists(restoredSetlists);

    const nextSelectedSongId = restoredSongs.some((item) => item.id === selectedSongId)
      ? selectedSongId
      : restoredSongs[0]?.id ?? '';
    setSelectedSongId(nextSelectedSongId);

    const nextSetlist = restoredSetlists.find((item) => item.id === selectedSetlistId) ?? restoredSetlists[0] ?? null;
    setSelectedSetlistId(nextSetlist?.id ?? null);
    setSelectedSetlistSongId(nextSetlist?.songs.find((item) => item.id === selectedSetlistSongId)?.id ?? nextSetlist?.songs[0]?.id ?? null);
  };

  const runSelectionChange = async (applySelection: () => void) => {
    const performSelectionChange = async () => {
      setActiveAppView('sheet');

      // Always persist silently in the background when switching songs so the user
      // is never interrupted by a save prompt (changes are never lost).
      if (workspaceIsDirty) {
        try {
          await persistWorkspace(songs, setlists);
        } catch {
          // Keep edits in memory and still switch; the next save will retry.
        }
      }

      applySelection();
    };

    if (previewEditSession?.dirty) {
      pendingPreviewTransitionRef.current = () => { void performSelectionChange(); };
      setIsPreviewEditExitPromptOpen(true);
      return;
    }
    if (previewEditSession) {
      setPreviewEditSession(null);
    }
    await performSelectionChange();
  };

  const handleSaveLibrary = async () => {
    try {
      await persistWorkspace(songs, setlists);
    } catch {
      toast.error(copy.cloudSyncFailed);
    }
  };

  const handleAppViewChange = (nextView: AppView) => {
    if (previewEditSession?.dirty) {
      pendingPreviewTransitionRef.current = () => {
        setPreviewEditSession(null);
        setActiveAppView((currentView) => currentView === nextView ? 'sheet' : nextView);
      };
      setIsPreviewEditExitPromptOpen(true);
      return;
    }
    if (previewEditSession) setPreviewEditSession(null);
    setActiveAppView((currentView) => currentView === nextView ? 'sheet' : nextView);
  };

  const handleToggleEditor = () => {
    if (!isEditing && !canOpenEditor) {
      toast.error(language === 'zh' ? '你目前只有查看權限，不能編輯內容。' : 'Your current role can view this workspace but cannot edit it.');
      return;
    }

    // When opening the editor in setlist mode, snap selection to the setlist
    // song the user is currently looking at by picking the card whose center
    // is closest to the viewport center. Using a 28%-from-top activation line
    // (the auto-track scroll observer's heuristic) often picked the song
    // above the one the user was actually reading.
    if (!isEditing && isSetlistMode && previewRef.current) {
      const scrollRoot = previewRef.current;
      const songCards = Array.from(scrollRoot.querySelectorAll('[data-setlist-preview-song-id]')) as HTMLElement[];
      if (songCards.length > 0) {
        const rootRect = scrollRoot.getBoundingClientRect();
        const viewportCenterY = rootRect.top + rootRect.height / 2;
        let nextId: string | null = null;
        let smallestDistance = Number.POSITIVE_INFINITY;
        for (const card of songCards) {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = (cardRect.top + cardRect.bottom) / 2;
          const distance = Math.abs(cardCenter - viewportCenterY);
          if (distance < smallestDistance) {
            smallestDistance = distance;
            nextId = card.dataset.setlistPreviewSongId ?? null;
          }
        }
        if (nextId && nextId !== selectedSetlistSongId) {
          skipNextSetlistPreviewAutoScrollRef.current = true;
          setSelectedSetlistSongId(nextId);
        }
      }
    }

    setIsEditing((current) => !current);
  };

  const handleToggleLibraryEditing = () => {
    if (!isLibraryEditing && !canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有管理這個團隊歌曲庫的權限。' : 'You do not have permission to manage this team song library.');
      return;
    }

    setIsLibraryEditing((current) => !current);
  };

  const applyWorkspaceSnapshot = (
    workspace: { songs: StoredSong[]; setlists: Setlist[]; joinedSetlists: JoinedSetlist[]; projects: Project[]; joinedProjects?: JoinedProject[]; lastSavedAt: number | null },
    libraryId = activeLibraryId
  ) => {
    setSongs(workspace.songs);
    setSavedSongs(cloneSong(workspace.songs));
    setSetlists(workspace.setlists);
    setSavedSetlists(cloneSong(workspace.setlists));
    setProjects(workspace.projects);
    setSavedProjects(cloneSong(workspace.projects));
    setJoinedSetlists(workspace.joinedSetlists);
    setJoinedProjects(workspace.joinedProjects ?? []);
    setLastSavedAt(workspace.lastSavedAt);
    setSongHistories({});
    setSetlistSongHistories({});
    setSelectedLibrarySongIds([]);
    setIsLibraryEditing(false);
    setSelectedSongId(pickAvailableSongId(workspace.songs, [
      getStoredSelectedSongId(libraryId),
      selectedSongId
    ]));
    const nextJoinedProject = workspace.joinedProjects?.find((project) => project.setlists.length > 0) ?? null;
    const nextJoinedProjectSetlist = nextJoinedProject?.setlists[0] ?? null;
    const nextSetlist = workspace.setlists[0] ?? workspace.joinedSetlists[0] ?? nextJoinedProjectSetlist ?? null;
    setSelectedSetlistId(nextSetlist?.id ?? null);
    setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
    setSetlistProjectFilter((currentFilter) => validateSetlistProjectFilter(
      currentFilter,
      workspace.projects,
      workspace.joinedProjects ?? []
    ));
    setWorkspaceMode(workspace.setlists.length > 0 || workspace.joinedSetlists.length > 0 || Boolean(nextJoinedProjectSetlist) ? 'setlists' : 'songs');
  };

  const handleSwitchCloudLibrary = async (libraryId: string) => {
    const repository = cloudRepositoryRef.current;
    if (!repository || libraryId === activeLibraryId || isSwitchingLibrary) {
      return;
    }

    try {
      if (workspaceIsDirty) {
        if (isAutoSaveEnabled) {
          await persistWorkspace(songs, setlists);
        } else {
          const shouldSave = window.confirm(copy.confirmSaveBeforeSwitch);
          if (shouldSave) {
            await persistWorkspace(songs, setlists);
          } else {
            restoreSavedWorkspace();
          }
        }
      }

      setIsSwitchingLibrary(true);
      setAuthUiError(null);
      repository.setActiveLibrary(libraryId);
      const workspace = await repository.loadLibraryWorkspace(libraryId);
      applyWorkspaceSnapshot(workspace, libraryId);
      setActiveLibraryId(libraryId);
      setSelectedSetlistShareStatus(null);
      setTeamManagement(null);
      setIsTeamManagementOpen(false);
      setSyncStatus('saved');
    } catch (error) {
      setAuthUiError(getTeamFeatureErrorMessage(error, language));
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    } finally {
      setIsSwitchingLibrary(false);
    }
  };

  const refreshCloudLibraries = async () => {
    const repository = cloudRepositoryRef.current;
    if (!repository) return;
    try {
      const libraries = await repository.listLibraries();
      setCloudLibraries(libraries);
      setTeamFeatureError(null);
      if (!activeLibraryId) {
        setActiveLibraryId(libraries.find((library) => library.kind === 'personal')?.id ?? libraries[0]?.id ?? null);
      }
    } catch (error) {
      setTeamFeatureError(getTeamFeatureErrorMessage(error, language));
    }
  };

  const handleCreateTeam = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const repository = cloudRepositoryRef.current;
    if (!repository) {
      setAuthUiError(copy.authUnavailable);
      return;
    }

    if (teamFeatureError && isTeamFeatureSchemaError(teamFeatureError)) {
      setAuthUiError(teamFeatureError);
      return;
    }

    const name = newTeamName.trim();
    if (!name) return;

    try {
      setIsCreatingTeam(true);
      setSyncStatus('syncing');
      const library = await repository.createTeam(name);
      const libraries = await repository.listLibraries();
      setCloudLibraries(libraries);
      setTeamFeatureError(null);
      setNewTeamName('');
      setIsCreateTeamOpen(false);
      await handleSwitchCloudLibrary(library.id);
      setSyncStatus('saved');
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      const message = getTeamFeatureErrorMessage(error, language);
      setTeamFeatureError(message);
      setAuthUiError(message);
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const loadTeamManagement = async () => {
    const repository = cloudRepositoryRef.current;
    if (!repository || !activeCloudLibrary || !canManageActiveTeam) {
      setTeamManagement(null);
      return;
    }

    try {
      setIsLoadingTeamManagement(true);
      const snapshot = await repository.getTeamManagement(activeCloudLibrary.id);
      setTeamManagement(snapshot);
      setAuthUiError(null);
    } catch (error) {
      setTeamManagement(null);
      setAuthUiError(getTeamFeatureErrorMessage(error, language));
    } finally {
      setIsLoadingTeamManagement(false);
    }
  };

  const handleCreateTeamInvite = async () => {
    const repository = cloudRepositoryRef.current;
    if (!repository || !activeCloudLibrary || !teamInviteEmail.trim()) return;

    try {
      setIsCreatingTeamInvite(true);
      const invite = await repository.createTeamInvite(activeCloudLibrary.id, teamInviteEmail.trim(), teamInviteRole);
      const inviteUrl = new URL(`team-invite/${invite.token}`, getAppBaseUrl()).toString();
      setTeamInviteShareUrl(inviteUrl);
      await copyShareUrlToClipboard(inviteUrl);
      setTeamInviteEmail('');
      await loadTeamManagement();
    } catch (error) {
      toast.error(getTeamFeatureErrorMessage(error, language));
    } finally {
      setIsCreatingTeamInvite(false);
    }
  };

  const handleRevokeTeamInvite = async (inviteId: string) => {
    const repository = cloudRepositoryRef.current;
    if (!repository) return;
    try {
      await repository.revokeTeamInvite(inviteId);
      await loadTeamManagement();
    } catch (error) {
      toast.error(getTeamFeatureErrorMessage(error, language));
    }
  };

  const handleUpdateTeamMemberRole = async (userId: string, role: Exclude<LibraryRole, 'owner'>) => {
    const repository = cloudRepositoryRef.current;
    if (!repository || !activeCloudLibrary) return;
    try {
      await repository.updateTeamMemberRole(activeCloudLibrary.id, userId, role);
      await loadTeamManagement();
      await refreshCloudLibraries();
    } catch (error) {
      toast.error(getTeamFeatureErrorMessage(error, language));
    }
  };

  const handleRemoveTeamMember = async (userId: string) => {
    const repository = cloudRepositoryRef.current;
    if (!repository || !activeCloudLibrary) return;
    const confirmed = window.confirm(language === 'zh' ? '要移除此團隊成員嗎？' : 'Remove this team member?');
    if (!confirmed) return;
    try {
      await repository.removeTeamMember(activeCloudLibrary.id, userId);
      await loadTeamManagement();
    } catch (error) {
      toast.error(getTeamFeatureErrorMessage(error, language));
    }
  };

  const handleSelectSong = (nextSongId: string) => {
    if (nextSongId === selectedSongId && workspaceMode === 'songs') {
      return;
    }

    void runSelectionChange(() => {
      setWorkspaceMode('songs');
      setSelectedSongId(nextSongId);
    });
  };

  const handleSongChange = (newSong: Song) => {
    if (!song) {
      return;
    }
    if (!hasSongs) {
      return;
    }
    if (!canEditTeamSongs) {
      return;
    }

    let nextSong = newSong;

    if (newSong.originalKey !== song.originalKey && newSong.currentKey === song.currentKey) {
      const keyShift = getTransposeOffset(song.originalKey, newSong.originalKey);
      nextSong = {
        ...newSong,
        currentKey: transposeKeyWithPreference(song.currentKey, keyShift, newSong.originalKey)
      };
    }

    nextSong = {
      ...nextSong,
      originalKey: normalizeKeySpelling(nextSong.originalKey),
      currentKey: normalizeKeySpelling(nextSong.currentKey)
    };

    // Detect if sections were reordered
    const oldIds = song.sections.map(s => s.id);
    const newIds = nextSong.sections.map(s => s.id);
    
    if (oldIds.join(',') !== newIds.join(',') && oldIds.length === newIds.length) {
      // Find all IDs that are at different indices
      const movedIds = newIds.filter((id, index) => id !== oldIds[index]);
      
      if (movedIds.length > 0) {
        setHighlightedSectionIds(movedIds);
        setTimeout(() => setHighlightedSectionIds([]), 1500);
      }
    }

    if (!isReferenceOnlySongChange(song, nextSong)) {
      pushSongHistory(song.id, song);
    }
    replaceSongInLibrary(song.id, nextSong);
  };

  const handleToggleLyricsMode = () => {
    if (previewEditSession?.dirty) {
      pendingPreviewTransitionRef.current = () => {
        setPreviewEditSession(null);
        setIsLyricsMode((current) => !current);
      };
      setIsPreviewEditExitPromptOpen(true);
      return;
    }
    if (previewEditSession) setPreviewEditSession(null);
    // Pure local view toggle between the chord chart and the lyrics formatter.
    setIsLyricsMode((current) => !current);
  };

  React.useEffect(() => {
    const updateScale = () => {
      if (!previewRef.current) {
        return;
      }

      const previewRootWidth = previewRef.current.offsetWidth;
      const previewRootHeight = previewRef.current.offsetHeight;
      const horizontalPadding = previewRootWidth < 640 ? 24 : previewRootWidth < 960 ? 48 : 96;
      const verticalPadding = previewRootWidth < 640 ? 24 : previewRootWidth < 960 ? 40 : 96;
      const containerWidth = Math.max(220, previewRootWidth - horizontalPadding - PREVIEW_SAFETY_MARGIN);
      const containerHeight = Math.max(220, previewRootHeight - verticalPadding - PREVIEW_SAFETY_MARGIN);
      setPreviewViewportWidth(containerWidth);
      setPreviewViewportHeight(containerHeight);

      if (containerWidth < PREVIEW_TARGET_WIDTH) {
        setPreviewBaseScale(Math.max(PREVIEW_MIN_SCALE, containerWidth / PREVIEW_TARGET_WIDTH));
      } else {
        setPreviewBaseScale(1);
      }
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateScale);
    });

    if (previewRef.current) {
      observer.observe(previewRef.current);
    }

    updateScale();
    return () => observer.disconnect();
  }, [isEditing]);

  React.useEffect(() => {
    const updateSheetMetrics = () => {
      if (!sheetRef.current) {
        return;
      }

      const nextWidth = Math.max(PREVIEW_TARGET_WIDTH, sheetRef.current.scrollWidth || PREVIEW_TARGET_WIDTH);
      const nextHeight = Math.max(1, sheetRef.current.scrollHeight || sheetRef.current.offsetHeight || 1);
      const firstPageHeight = sheetRef.current.querySelector<HTMLElement>('[data-print-page]')?.offsetHeight || PREVIEW_PAGE_HEIGHT;

      setSheetMetrics((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return { width: nextWidth, height: nextHeight };
      });
      setPreviewPageHeight((current) => current === firstPageHeight ? current : firstPageHeight);
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateSheetMetrics);
    });

    if (sheetRef.current) {
      observer.observe(sheetRef.current);
    }

    updateSheetMetrics();
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => () => {
    if (previewSuppressClickTimeoutRef.current !== null) {
      window.clearTimeout(previewSuppressClickTimeoutRef.current);
    }
    if (previewPinchFrameRef.current !== null) {
      window.cancelAnimationFrame(previewPinchFrameRef.current);
    }
    if (previewScaleCleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(previewScaleCleanupFrameRef.current);
    }
  }, []);

  React.useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const dragState = previewDragStateRef.current;
      const scrollRoot = previewRef.current;

      if (!dragState || !scrollRoot) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.moved && Math.hypot(deltaX, deltaY) >= 4) {
        dragState.moved = true;
        setIsPreviewDragging(true);
        document.body.style.userSelect = 'none';
      }

      if (!dragState.moved) {
        return;
      }

      scrollRoot.scrollLeft = dragState.startScrollLeft - deltaX;
      scrollRoot.scrollTop = dragState.startScrollTop - deltaY;
    };

    const handleWindowMouseUp = () => {
      if (!previewDragStateRef.current) {
        return;
      }

      endPreviewDrag();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const handleKeyChange = (newKey: Key) => {
    const shouldUpdateCapoForKeyChange = song.currentKey !== newKey && (song.capo ?? 0) > 0;

    handleSongChange({
      ...song,
      currentKey: newKey,
      ...(shouldUpdateCapoForKeyChange ? { capo: getSuggestedGuitarCapo(newKey) } : {})
    });
  };

  // A project manager editing a setlist that lives inside a *joined* project: the
  // new key is the shared base everyone sees, so it persists via a role-checked RPC
  // (set_project_setlist_song_key) and updates the local joinedProjects copy.
  const handleJoinedProjectSetlistKeyChange = (setlistSongId: string, key: Key) => {
    setJoinedProjects((current) => current.map((jp) => {
      if (!jp.setlists.some((sl) => sl.id === selectedSetlistId)) return jp;
      return {
        ...jp,
        setlists: jp.setlists.map((sl) =>
          sl.id !== selectedSetlistId ? sl : {
            ...sl,
            songs: sl.songs.map((s) => s.id === setlistSongId ? { ...s, overrideKey: key } : s)
          }
        )
      };
    }));
    if (cloudRepositoryRef.current) {
      void cloudRepositoryRef.current.setProjectSetlistSongKey(setlistSongId, key);
    }
  };

  const handleSetlistSongKeyChange = (setlistSongId: string, currentKey: Key, currentCapo: number, newKey: Key) => {
    if (!selectedSetlist) {
      return;
    }

    const nextCapo = getSuggestedGuitarCapo(newKey);
    const shouldUpdateCapoForKeyChange = currentKey !== newKey && currentCapo > 0;

    // Joined project + I'm a manager: edit the shared key for everyone.
    if (isJoinedProjectManager) {
      handleJoinedProjectSetlistKeyChange(setlistSongId, newKey);
      if (shouldUpdateCapoForKeyChange) {
        handleJoinedSetlistCapoChange(setlistSongId, nextCapo);
      }
      return;
    }

    if (isJoinedSetlist || !canEditSelectedSetlist) {
      return;
    }

    handleUpdateSetlistSong(setlistSongId, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: newKey,
      ...(shouldUpdateCapoForKeyChange
        ? (isCloudMode ? { personalCapoOverride: nextCapo } : { capo: nextCapo })
        : {})
    }));

    if (isCloudMode && shouldUpdateCapoForKeyChange) {
      savePersonalCapoOverride(setlistSongId, nextCapo);
    }
  };

  const handleSetlistKeyChange = (newKey: Key) => {
    if (!selectedSetlistSong) {
      return;
    }

    handleSetlistSongKeyChange(selectedSetlistSong.id, currentSetlistKey, currentSetlistCapo, newKey);
  };

  const getKeyOptionMeta = (key: Key) => {
    const rawOffset = getTransposeOffset(song.originalKey, key);
    const normalizedOffset = rawOffset > 6 ? rawOffset - 12 : rawOffset < -6 ? rawOffset + 12 : rawOffset;

    if (normalizedOffset === 0) {
      return copy.original;
    }

    return normalizedOffset > 0 ? `+${normalizedOffset}` : `${normalizedOffset}`;
  };

  const handleTranspose = (steps: number) => {
    handleSongChange({ ...song, currentKey: transposeKeyPreferFlats(song.currentKey, steps) });
  };

  const handleSetlistTranspose = (steps: number) => {
    if (!selectedSetlistSong || !activeSetlistPreviewSong) {
      return;
    }

    handleSetlistKeyChange(transposeKeyPreferFlats(activeSetlistPreviewSong.currentKey, steps));
  };

  const handleCreateSong = () => {
    if (!canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有編輯這個團隊歌曲庫的權限。' : 'You do not have permission to edit this team song library.');
      return;
    }
    const newSong = createDefaultSong(songs.length + 1);
    const nextSongs = [newSong, ...songs];
    setSongs(nextSongs);
    setSelectedSongId(newSong.id);
    setActiveAppView('sheet');
    setIsEditing(true);
    setWorkspaceMode('songs');
  };

  const handleCreateSetlist = () => {
    if (!canCreateTeamSetlists) {
      toast.error(language === 'zh' ? '你沒有在這個團隊建立歌單的權限。' : 'You do not have permission to create setlists in this team.');
      return;
    }

    setNewSetlistName(language === 'zh' ? `服事歌單 ${setlists.length + 1}` : `Service Setlist ${setlists.length + 1}`);
    setNewSetlistProjectId(setlistProjectFilter.kind === 'owned-project' ? setlistProjectFilter.projectId : '');
    setIsCreateSetlistOpen(true);
  };

  const handleConfirmCreateSetlist = () => {
    const trimmedName = newSetlistName.trim();
    if (!trimmedName || !canCreateTeamSetlists) return;

    const now = Date.now();
    const newSetlist: Setlist = {
      id: createSetlistId(),
      name: trimmedName,
      displayMode: 'chord-movable-key',
      createdBy: authenticatedUser?.id,
      updatedBy: authenticatedUser?.id,
      createdAt: now,
      updatedAt: now,
      projectId: newSetlistProjectId || null,
      songs: []
    };

    setSetlists((current) => [newSetlist, ...current]);
    setSelectedSetlistId(newSetlist.id);
    setSelectedSetlistSongId(null);
    setWorkspaceMode('setlists');
    setActiveAppView('sheet');
    setIsEditing(false);
    setSetlistPanelView('detail');
    setSetlistSongSearchQuery('');
    setIsCreateSetlistOpen(false);
  };

  const handleCreateProject = () => {
    if (!canCreateProject) {
      toast.error(language === 'zh' ? '你沒有在這個團隊建立專案的權限。' : 'You do not have permission to create projects in this team.');
      return;
    }
    const now = Date.now();
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: language === 'zh' ? `新專案 ${projects.length + 1}` : `New Project ${projects.length + 1}`,
      archived: false,
      createdBy: authenticatedUser?.id,
      updatedBy: authenticatedUser?.id,
      createdAt: now,
      updatedAt: now
    };
    const nextProjects = [newProject, ...projects];
    setProjects(nextProjects);
    void persistWorkspace(songs, setlists, nextProjects).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const handleRenameProject = (projectId: string, nextName: string) => {
    const target = projects.find((item) => item.id === projectId);
    if (!target) return;
    if (!canManageProject(target)) {
      toast.error(language === 'zh' ? '你沒有重新命名這個專案的權限。' : 'You do not have permission to rename this project.');
      return;
    }
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === target.name) return;
    const nextProjects = projects.map((item) =>
      item.id === projectId ? { ...item, name: trimmed, updatedAt: Date.now(), updatedBy: authenticatedUser?.id } : item
    );
    setProjects(nextProjects);
    void persistWorkspace(songs, setlists, nextProjects).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const handleSetProjectArchived = (projectId: string, archived: boolean) => {
    const target = projects.find((item) => item.id === projectId);
    if (!target) return;
    if (!canManageProject(target)) {
      toast.error(language === 'zh' ? '你沒有管理這個專案的權限。' : 'You do not have permission to manage this project.');
      return;
    }
    const nextProjects = projects.map((item) =>
      item.id === projectId ? { ...item, archived, updatedAt: Date.now(), updatedBy: authenticatedUser?.id } : item
    );
    setProjects(nextProjects);
    if (archived && setlistProjectFilter.kind === 'owned-project' && setlistProjectFilter.projectId === projectId) {
      handleSetlistProjectFilterChange({ kind: 'all' });
    }
    void persistWorkspace(songs, setlists, nextProjects).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
    toast.success(archived
      ? (language === 'zh' ? '已將專案歸檔。' : 'Project archived.')
      : (language === 'zh' ? '已將專案取消歸檔。' : 'Project restored from archive.'));
  };

  const handleDeleteProject = (projectId: string) => {
    const target = projects.find((item) => item.id === projectId);
    if (!target) return;
    if (!canManageProject(target)) {
      toast.error(language === 'zh' ? '你沒有刪除這個專案的權限。' : 'You do not have permission to delete this project.');
      return;
    }
    const confirmed = window.confirm(language === 'zh'
      ? '要刪除這個專案嗎？裡面的歌單會變成「未分類」。'
      : 'Delete this project? Setlists inside will become Ungrouped.');
    if (!confirmed) return;
    // Detach any setlists pointing at this project so they fall back to "Ungrouped".
    const nextSetlists = setlists.map((item) =>
      item.projectId === projectId ? { ...item, projectId: null, updatedAt: Date.now() } : item
    );
    const nextProjects = projects.filter((item) => item.id !== projectId);
    setSetlists(nextSetlists);
    setProjects(nextProjects);
    if (setlistProjectFilter.kind === 'owned-project' && setlistProjectFilter.projectId === projectId) {
      handleSetlistProjectFilterChange({ kind: 'all' });
    }
    void persistWorkspace(songs, nextSetlists, nextProjects).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const handleSelectProject = (nextProjectId: string | null) => {
    exitMultiSelect();
    handleSetlistProjectFilterChange(nextProjectId
      ? { kind: 'owned-project', projectId: nextProjectId }
      : { kind: 'ungrouped' });
    setSetlistPanelView('list');
  };

  const handleMoveSetlistToProject = (setlistId: string, nextProjectId: string | null) => {
    const target = setlists.find((item) => item.id === setlistId);
    if (!target) return;
    if (!canManageSetlist(target)) {
      toast.error(language === 'zh' ? '你沒有編輯這份歌單的權限。' : 'You do not have permission to edit this setlist.');
      return;
    }
    if ((target.projectId ?? null) === nextProjectId) return;
    const nextSetlists = setlists.map((item) =>
      item.id === setlistId ? { ...item, projectId: nextProjectId, updatedAt: Date.now() } : item
    );
    setSetlists(nextSetlists);
    void persistWorkspace(songs, nextSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
    const projectName = nextProjectId
      ? projects.find((item) => item.id === nextProjectId)?.name ?? ''
      : language === 'zh' ? '未分類' : 'Ungrouped';
    toast.success(language === 'zh' ? `已移到「${projectName}」` : `Moved to "${projectName}"`);
  };

  const applyProjectChangeToSetlists = (
    mode: 'move' | 'copy',
    setlistIds: string[],
    nextProjectId: string | null
  ) => {
    if (setlistIds.length === 0) return;
    const targets = setlistIds
      .map((id) => setlists.find((item) => item.id === id))
      .filter((item): item is Setlist => Boolean(item));
    if (targets.length === 0) return;
    if (mode === 'move' && !targets.every(canManageSetlist)) {
      toast.error(language === 'zh' ? '你沒有編輯某些歌單的權限。' : 'You do not have permission to edit some of these setlists.');
      return;
    }
    if (mode === 'copy' && !canCreateTeamSetlists) {
      toast.error(language === 'zh' ? '你沒有在這個團隊建立歌單的權限。' : 'You do not have permission to create setlists in this team.');
      return;
    }

    const now = Date.now();
    const projectName = nextProjectId
      ? projects.find((item) => item.id === nextProjectId)?.name ?? ''
      : language === 'zh' ? '未分類' : 'Ungrouped';

    let nextSetlists: Setlist[];
    if (mode === 'move') {
      const targetIds = new Set(setlistIds);
      nextSetlists = setlists.map((item) =>
        targetIds.has(item.id) && (item.projectId ?? null) !== nextProjectId
          ? { ...item, projectId: nextProjectId, updatedAt: now }
          : item
      );
      toast.success(language === 'zh'
        ? `已將 ${targets.length} 份歌單移到「${projectName}」`
        : `Moved ${targets.length} setlist${targets.length === 1 ? '' : 's'} to "${projectName}"`);
    } else {
      const copies = targets.map((source) => {
        const newSetlistId = createSetlistId();
        const copiedName = language === 'zh' ? `${source.name}（副本）` : `${source.name} (Copy)`;
        return {
          ...cloneSong(source),
          id: newSetlistId,
          name: copiedName,
          projectId: nextProjectId,
          archived: false,
          createdBy: authenticatedUser?.id,
          updatedBy: authenticatedUser?.id,
          createdAt: now,
          updatedAt: now,
          songs: source.songs.map((song, index) => ({
            ...cloneSong(song),
            id: crypto.randomUUID(),
            setlistId: newSetlistId,
            order: index
          }))
        } satisfies Setlist;
      });
      nextSetlists = [...copies, ...setlists];
      toast.success(language === 'zh'
        ? `已將 ${targets.length} 份歌單複製到「${projectName}」`
        : `Copied ${targets.length} setlist${targets.length === 1 ? '' : 's'} to "${projectName}"`);
    }

    setSetlists(nextSetlists);
    void persistWorkspace(songs, nextSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const handleProjectPickerSelect = (nextProjectId: string | null) => {
    if (!projectPicker) return;
    const { mode, setlistIds } = projectPicker;
    setProjectPicker(null);
    applyProjectChangeToSetlists(mode, setlistIds, nextProjectId);
    exitMultiSelect();
  };

  const handleBatchArchiveSelectedSetlists = (archived: boolean) => {
    const ids = multiSelectedSetlistIds;
    if (ids.length === 0) return;
    const targets = setlists.filter((item) => ids.includes(item.id));
    if (!targets.every(canManageSetlist)) {
      toast.error(language === 'zh' ? '你沒有管理某些歌單的權限。' : 'You do not have permission to manage some of these setlists.');
      return;
    }
    const now = Date.now();
    const targetIds = new Set(ids);
    const nextSetlists = setlists.map((item) =>
      targetIds.has(item.id) ? { ...item, archived, updatedAt: now } : item
    );
    setSetlists(nextSetlists);
    exitMultiSelect();
    void persistWorkspace(songs, nextSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
    toast.success(language === 'zh'
      ? `已${archived ? '歸檔' : '取消歸檔'} ${targets.length} 份歌單`
      : `${archived ? 'Archived' : 'Restored'} ${targets.length} setlist${targets.length === 1 ? '' : 's'}`);
  };

  const handleBatchDeleteSelectedSetlists = () => {
    const ids = multiSelectedSetlistIds;
    if (ids.length === 0) return;
    const targets = setlists.filter((item) => ids.includes(item.id));
    if (!targets.every(canManageSetlist)) {
      toast.error(language === 'zh' ? '你沒有刪除某些歌單的權限。' : 'You do not have permission to delete some of these setlists.');
      return;
    }
    const confirmed = window.confirm(language === 'zh'
      ? `要刪除選取的 ${targets.length} 份歌單嗎？此動作無法復原。`
      : `Delete ${targets.length} selected setlist${targets.length === 1 ? '' : 's'}? This cannot be undone.`);
    if (!confirmed) return;
    const targetIds = new Set(ids);
    const nextSetlists = setlists.filter((item) => !targetIds.has(item.id));
    if (selectedSetlistId && targetIds.has(selectedSetlistId)) {
      const fallback = nextSetlists[0] ?? null;
      setSelectedSetlistId(fallback?.id ?? null);
      setSelectedSetlistSongId(fallback?.songs[0]?.id ?? null);
    }
    setSetlists(nextSetlists);
    exitMultiSelect();
    void persistWorkspace(songs, nextSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
    toast.success(language === 'zh' ? `已刪除 ${targets.length} 份歌單` : `Deleted ${targets.length} setlist${targets.length === 1 ? '' : 's'}`);
  };

  const handleCopySetlistToProject = (setlistId: string, nextProjectId: string | null) => {
    const target = setlists.find((item) => item.id === setlistId);
    if (!target) return;
    if (!canCreateTeamSetlists) {
      toast.error(language === 'zh' ? '你沒有在這個團隊建立歌單的權限。' : 'You do not have permission to create setlists in this team.');
      return;
    }

    const now = Date.now();
    const newSetlistId = createSetlistId();
    const copiedName = language === 'zh' ? `${target.name}（副本）` : `${target.name} (Copy)`;
    const newSetlist: Setlist = {
      ...cloneSong(target),
      id: newSetlistId,
      name: copiedName,
      projectId: nextProjectId,
      archived: false,
      createdBy: authenticatedUser?.id,
      updatedBy: authenticatedUser?.id,
      createdAt: now,
      updatedAt: now,
      // Re-issue setlist_song ids so they don't collide with the original's rows.
      songs: target.songs.map((song, index) => ({
        ...cloneSong(song),
        id: crypto.randomUUID(),
        setlistId: newSetlistId,
        order: index
      }))
    };
    const nextSetlists = [newSetlist, ...setlists];
    setSetlists(nextSetlists);
    void persistWorkspace(songs, nextSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
    const projectName = nextProjectId
      ? projects.find((item) => item.id === nextProjectId)?.name ?? ''
      : language === 'zh' ? '未分類' : 'Ungrouped';
    toast.success(language === 'zh' ? `已複製到「${projectName}」` : `Copied to "${projectName}"`);
  };

  const handleSelectSetlist = (nextSetlistId: string) => {
    setMobileSwipeSetlist(null);
    setSetlistPanelView('detail');
    setSetlistSongSearchQuery('');

    if (selectedSetlistId === nextSetlistId && workspaceMode === 'setlists') {
      return;
    }

    void runSelectionChange(() => {
      setIsSetlistActionsMenuOpen(false);
      const nextSetlist = setlists.find((item) => item.id === nextSetlistId)
        ?? joinedSetlists.find((item) => item.id === nextSetlistId)
        ?? allJoinedProjectSetlists.find((item) => item.id === nextSetlistId)
        ?? null;
      setWorkspaceMode('setlists');
      setSelectedSetlistId(nextSetlistId);
      setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
    });
  };

  const handleSelectJoinedSetlist = (nextSetlistId: string) => {
    setMobileSwipeSetlist(null);
    setSetlistPanelView('detail');
    setSetlistSongSearchQuery('');
    if (selectedSetlistId === nextSetlistId && workspaceMode === 'setlists') return;
    void runSelectionChange(() => {
      setIsSetlistActionsMenuOpen(false);
      const nextSetlist = joinedSetlists.find((item) => item.id === nextSetlistId)
        ?? allJoinedProjectSetlists.find((item) => item.id === nextSetlistId)
        ?? null;
      setWorkspaceMode('setlists');
      setSelectedSetlistId(nextSetlistId);
      setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
    });
  };

  const savePersonalCapoOverride = (setlistSongId: string, capo: number) => {
    const repository = cloudRepositoryRef.current;
    if (!repository) {
      return;
    }

    setSyncStatus(navigator.onLine ? 'syncing' : 'offline');
    void repository.saveCapoOverride(setlistSongId, capo)
      .then(() => {
        const savedAt = Date.now();
        try {
          window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
        } catch {
          // Ignore local cache failures; the override has already reached cloud storage.
        }
        setLastSavedAt(savedAt);
        setSyncStatus('saved');
      })
      .catch(() => {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      });
  };

  const handleJoinedSetlistCapoChange = (setlistSongId: string, capo: number) => {
    setJoinedSetlists((current) => current.map((sl) =>
      sl.id !== selectedSetlistId ? sl : {
        ...sl,
        songs: sl.songs.map((s) => s.id === setlistSongId ? { ...s, capo } : s)
      }
    ));
    // Joined-project setlists live inside joinedProjects, not joinedSetlists.
    setJoinedProjects((current) => current.map((jp) => {
      if (!jp.setlists.some((sl) => sl.id === selectedSetlistId)) return jp;
      return {
        ...jp,
        setlists: jp.setlists.map((sl) =>
          sl.id !== selectedSetlistId ? sl : {
            ...sl,
            songs: sl.songs.map((s) => s.id === setlistSongId ? { ...s, capo } : s)
          }
        )
      };
    }));
    savePersonalCapoOverride(setlistSongId, capo);
  };

  // Signed-in users remember capo per-account (a personal override stored in
  // user_setlist_capo_overrides) for every setlist in their local store —
  // whether they own it, can edit it, or merely belong to a team copy — rather
  // than mutating the setlist's shared capo. This is the write half of the
  // resolution already done by getEffectiveSetlistSongCapo (personal ?? base).
  const handlePersonalSetlistCapoChange = (setlistSongId: string, capo: number) => {
    setSetlists((currentSetlists) => currentSetlists.map((setlist) =>
      setlist.id !== selectedSetlistId
        ? setlist
        : {
            ...setlist,
            songs: setlist.songs.map((item) => item.id === setlistSongId ? { ...item, personalCapoOverride: capo } : item)
          }
    ));
    savePersonalCapoOverride(setlistSongId, capo);
  };

  const handleSelectedSetlistCapoChange = (capo: number) => {
    if (!selectedSetlistSong) {
      return;
    }

    if (isJoinedSetlist) {
      handleJoinedSetlistCapoChange(selectedSetlistSong.id, capo);
      return;
    }

    // Signed-in: capo is a per-account override. Anonymous/local users have no
    // account (and saveCapoOverride/personalCapoOverride don't persist locally),
    // so capo stays in the setlist's own state as before.
    if (isCloudMode) {
      handlePersonalSetlistCapoChange(selectedSetlistSong.id, capo);
      return;
    }

    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      capo
    }));
  };

  const handleLeaveSharedSetlist = async (setlistId: string) => {
    if (!cloudRepositoryRef.current || leavingSharedSetlistId) return;

    setLeavingSharedSetlistId(setlistId);
    try {
      await cloudRepositoryRef.current.leaveSharedSetlist(setlistId);
      const nextJoinedSetlists = joinedSetlists.filter((sl) => sl.id !== setlistId);
      setJoinedSetlists(nextJoinedSetlists);
      if (selectedSetlistId === setlistId || selectedSetlist?.id === setlistId) {
        const nextSetlist = setlists[0] ?? nextJoinedSetlists[0] ?? null;
        setSelectedSetlistId(nextSetlist?.id ?? null);
        setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
        if (!nextSetlist) {
          setWorkspaceMode('songs');
        }
      }
      setAuthUiError(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      const message = reason ? `${copy.leaveSetlistError}\n\n${reason}` : copy.leaveSetlistError;
      setAuthUiError(message);
      toast.error(message);
    } finally {
      setLeavingSharedSetlistId(null);
      setPendingLeaveSharedSetlistId(null);
    }
  };

  const requestLeaveSharedSetlist = (setlistId: string) => {
    if (leavingSharedSetlistId) return;
    setPendingLeaveSharedSetlistId(setlistId);
  };

  const handleLeaveSharedProject = async (projectId: string) => {
    if (!cloudRepositoryRef.current || leavingSharedProjectId) return;

    setLeavingSharedProjectId(projectId);
    try {
      await cloudRepositoryRef.current.leaveSharedProject(projectId);
      const leftProject = joinedProjects.find((jp) => jp.id === projectId) ?? null;
      const nextJoinedProjects = joinedProjects.filter((jp) => jp.id !== projectId);
      setJoinedProjects(nextJoinedProjects);
      const selectedBelongsToLeft = Boolean(leftProject?.setlists.some((sl) => sl.id === selectedSetlistId));
      if (setlistProjectFilter.kind === 'shared-project' && setlistProjectFilter.projectId === projectId) {
        handleSetlistProjectFilterChange({ kind: 'all' });
      }
      if (selectedBelongsToLeft) {
        const nextSetlist = setlists[0] ?? joinedSetlists[0] ?? null;
        setSelectedSetlistId(nextSetlist?.id ?? null);
        setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
        if (!nextSetlist) {
          setWorkspaceMode('songs');
        }
      }
      setAuthUiError(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      const message = reason ? `${copy.leaveProjectError}\n\n${reason}` : copy.leaveProjectError;
      setAuthUiError(message);
      toast.error(message);
    } finally {
      setLeavingSharedProjectId(null);
      setPendingLeaveSharedProjectId(null);
    }
  };

  const requestLeaveSharedProject = (projectId: string) => {
    if (leavingSharedProjectId) return;
    setPendingLeaveSharedProjectId(projectId);
  };

  // Owner-only: kick a specific participant from a shared setlist/project, then
  // refresh the participant list. Backed by the remove_shared_member RPC which
  // re-checks can_write_library (RLS alone only allows self-leave).
  const handleRemoveSharedMember = async (
    resourceType: 'setlist' | 'project',
    resourceId: string,
    participant: ShareParticipant
  ) => {
    const repository = cloudRepositoryRef.current;
    if (!repository || removingMemberKey) return;
    if (!window.confirm(copy.removeMemberConfirm)) return;
    setRemovingMemberKey(`${resourceType}:${resourceId}:${participant.userId}`);
    try {
      await repository.removeSharedMember(resourceType, resourceId, participant.userId);
      if (resourceType === 'setlist') {
        await loadSetlistShareStatus(resourceId);
      } else {
        await loadProjectShareStatus(resourceId);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      toast.error(reason ? `${copy.removeMemberError}\n\n${reason}` : copy.removeMemberError);
    } finally {
      setRemovingMemberKey(null);
    }
  };

  const loadSetlistShareStatus = async (setlistId: string) => {
    const repository = cloudRepositoryRef.current;
    if (!repository) {
      setSelectedSetlistShareStatus(null);
      return;
    }

    if (!savedSetlists.some((setlist) => setlist.id === setlistId)) {
      setSelectedSetlistShareStatus(inactiveSetlistShareStatus);
      setIsLoadingSetlistShareStatus(false);
      setAuthUiError(null);
      return;
    }

    try {
      setIsLoadingSetlistShareStatus(true);
      const status = await repository.getSetlistShareStatus(setlistId);
      setSelectedSetlistShareStatus(status);
      setAuthUiError(null);
    } catch (error) {
      setSelectedSetlistShareStatus(null);
      const reason = error instanceof Error ? error.message.trim() : '';
      setAuthUiError(reason ? `${copy.setlistSharingLoadError}\n\n${reason}` : copy.setlistSharingLoadError);
    } finally {
      setIsLoadingSetlistShareStatus(false);
    }
  };

  useEffect(() => {
    if (!authenticatedUser || !cloudRepositoryRef.current || !selectedSetlist || !canShareSelectedSetlist || !isSetlistMode) {
      setSelectedSetlistShareStatus(null);
      setIsLoadingSetlistShareStatus(false);
      return;
    }

    void loadSetlistShareStatus(selectedSetlist.id);
  }, [authenticatedUser, canShareSelectedSetlist, isSetlistMode, savedSetlists, selectedSetlist?.id]);

  // Project "who joined" — mirrors the setlist share status, but for the whole
  // project. Only loadable for owned/manageable projects (not joined ones).
  const loadProjectShareStatus = async (projectId: string) => {
    const repository = cloudRepositoryRef.current;
    if (!repository) {
      setSelectedProjectShareStatus(null);
      return;
    }
    try {
      setIsLoadingProjectShareStatus(true);
      const status = await repository.getProjectShareStatus(projectId);
      setSelectedProjectShareStatus(status);
    } catch {
      // Non-fatal: the panel just shows an empty/zero state and can be refreshed.
      setSelectedProjectShareStatus(null);
    } finally {
      setIsLoadingProjectShareStatus(false);
    }
  };

  // Owner promotes a project participant to manager (can edit shared key + order)
  // or demotes back to viewer, then refreshes the participant list.
  const handleToggleProjectMemberRole = async (projectId: string, participant: ShareParticipant) => {
    const repository = cloudRepositoryRef.current;
    if (!repository) return;
    const nextRole: ProjectMemberRole = participant.role === 'manager' ? 'viewer' : 'manager';
    try {
      await repository.setProjectMemberRole(projectId, participant.userId, nextRole);
      await loadProjectShareStatus(projectId);
    } catch {
      toast.error(language === 'zh' ? '更新成員權限失敗，請重試。' : 'Failed to update member role. Please try again.');
    }
  };

  useEffect(() => {
    if (
      !authenticatedUser
      || !cloudRepositoryRef.current
      || !isSetlistMode
      || !selectedProject
      || selectedJoinedProject
      || !canShareProject
    ) {
      setSelectedProjectShareStatus(null);
      setIsLoadingProjectShareStatus(false);
      return;
    }

    void loadProjectShareStatus(selectedProject.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticatedUser, isSetlistMode, selectedProject?.id, selectedJoinedProject?.id]);

  // In-app notification inbox + "people I shared with before" contact list.
  const refreshNotifications = async () => {
    const repository = cloudRepositoryRef.current;
    if (!repository) return;
    try {
      const list = await repository.getNotifications();
      setNotifications(list);
    } catch {
      // Transient; the next focus/refresh will retry.
    }
  };

  const refreshShareContacts = async () => {
    const repository = cloudRepositoryRef.current;
    if (!repository) return;
    try {
      setIsLoadingShareContacts(true);
      const list = await repository.getShareContacts();
      setShareContacts(list);
    } catch {
      // Silent; the picker simply shows no contacts.
    } finally {
      setIsLoadingShareContacts(false);
    }
  };

  const refreshNotificationsAndContacts = async () => {
    await Promise.all([refreshNotifications(), refreshShareContacts()]);
  };

  const handleShareToContacts = async (resourceType: NotificationResourceType, resourceId: string, userIds: string[]) => {
    const repository = cloudRepositoryRef.current;
    if (!repository || userIds.length === 0 || isSharingToContacts) return;
    try {
      setIsSharingToContacts(true);
      const count = await repository.shareToContacts(resourceType, resourceId, userIds);
      toast.success(language === 'zh' ? `已分享給 ${count} 人` : `Shared with ${count} ${count === 1 ? 'person' : 'people'}`);
      // Reflect the new participants in the open share-status panel.
      if (resourceType === 'setlist' && selectedSetlist?.id === resourceId) {
        void loadSetlistShareStatus(resourceId);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      toast.error(reason ? `${copy.shareToContactsError}\n\n${reason}` : copy.shareToContactsError);
    } finally {
      setIsSharingToContacts(false);
    }
  };

  const handleMarkAllNotificationsRead = () => {
    const repository = cloudRepositoryRef.current;
    const unreadIds = notifications.filter((item) => !item.readAt).map((item) => item.id);
    if (unreadIds.length === 0) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
    if (repository) {
      void repository.markNotificationsRead(unreadIds);
    }
  };

  const handleOpenNotification = async (notification: AppNotification) => {
    const repository = cloudRepositoryRef.current;
    if (!notification.readAt) {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item));
      if (repository) {
        void repository.markNotificationsRead([notification.id]);
      }
    }

    // "Removed from a resource" notifications have nothing to open — the access
    // is already gone — so just mark them read and stop here.
    if (notification.type === 'access_removed') {
      return;
    }

    // The membership was created server-side, so reload joined data to make the
    // shared resource available before navigating to it.
    if (repository) {
      try {
        const workspace = await repository.loadWorkspace();
        setJoinedSetlists(workspace.joinedSetlists);
        const refreshedJoinedProjects = workspace.joinedProjects ?? [];
        setJoinedProjects(refreshedJoinedProjects);
        if (notification.resourceType === 'project') {
          const targetProject = refreshedJoinedProjects.find((item) => item.id === notification.resourceId);
          const firstSetlist = targetProject?.setlists[0] ?? null;
          setSelectedSetlistId(firstSetlist?.id ?? null);
          setSelectedSetlistSongId(firstSetlist?.songs[0]?.id ?? null);
        }
      } catch {
        // Navigate with whatever is already loaded.
      }
    }

    setWorkspaceMode('setlists');
    if (notification.resourceType === 'project') {
      handleSetlistProjectFilterChange({ kind: 'shared-project', projectId: notification.resourceId });
      setSetlistPanelView('list');
    } else {
      handleSetlistProjectFilterChange({ kind: 'shared-setlists' });
      setSelectedSetlistId(notification.resourceId);
      setSetlistPanelView('detail');
    }
  };

  useEffect(() => {
    if (!authenticatedUser) {
      setNotifications([]);
      setShareContacts([]);
      return;
    }

    void refreshNotificationsAndContacts();

    const handleFocus = () => {
      if (document.visibilityState === 'hidden') return;
      // Don't refresh (and thus re-render) while the user is mid-edit in a
      // field. A re-render resets controlled inputs to their committed value,
      // which would drop an autofill/datalist pick that hasn't been committed
      // via change/blur yet (e.g. selecting an artist, then tab-switching back).
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }
      void refreshNotifications();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticatedUser?.id]);

  const notificationBell = isAuthenticated ? (
    <NotificationBell
      notifications={notifications}
      labels={{
        title: copy.notificationsTitle,
        empty: copy.notificationsEmpty,
        markAllRead: copy.notificationsMarkAllRead,
        open: copy.notificationOpen,
        sharedSetlist: copy.notificationSharedSetlist,
        sharedProject: copy.notificationSharedProject,
        promoted: copy.notificationPromoted,
        demoted: copy.notificationDemoted,
        removedSetlist: copy.notificationRemovedSetlist,
        removedProject: copy.notificationRemovedProject,
      }}
      onOpen={(notification) => void handleOpenNotification(notification)}
      onMarkAllRead={handleMarkAllNotificationsRead}
    />
  ) : null;

  const renderShareContactPicker = (resourceType: NotificationResourceType, resourceId: string) => (
    <ShareContactPicker
      contacts={shareContacts}
      loading={isLoadingShareContacts}
      sharing={isSharingToContacts}
      labels={{
        title: copy.shareToContactsTitle,
        empty: copy.shareToContactsEmpty,
        button: copy.shareToContactsButton,
        syncing: copy.cloudSyncSyncing,
      }}
      onShare={(userIds) => void handleShareToContacts(resourceType, resourceId, userIds)}
    />
  );

  useEffect(() => {
    if (!isTeamManagementOpen || !canManageActiveTeam) {
      return;
    }

    void loadTeamManagement();
  }, [activeLibraryId, canManageActiveTeam, isTeamManagementOpen]);

  const handleSetlistNameChange = (setlistId: string, name: string) => {
    replaceSetlist(setlistId, (currentSetlist) => ({
      ...currentSetlist,
      name
    }));
  };

  const handleSetlistDisplaySettingsChange = (setlistId: string, updates: Partial<Pick<Setlist, 'displayMode'>>) => {
    if (!canEditSelectedSetlist) {
      return;
    }
    replaceSetlist(setlistId, (currentSetlist) => ({
      ...currentSetlist,
      ...updates
    }));
  };

  const handleJoinedSetlistDisplayPreferenceChange = (setlistId: string, updates: JoinedSetlistDisplayPreference) => {
    setJoinedSetlistDisplayPreferences((current) => {
      const next = {
        ...current,
        [setlistId]: {
          ...(current[setlistId] ?? {}),
          ...updates
        }
      };
      saveJoinedSetlistDisplayPreferences(next);
      return next;
    });
  };

  const handleSetlistDisplayModeChange = (mode: SetlistDisplayMode) => {
    if (!selectedSetlist) {
      return;
    }

    if (isJoinedSetlist) {
      handleJoinedSetlistDisplayPreferenceChange(selectedSetlist.id, { displayMode: mode });
      return;
    }

    handleSetlistDisplaySettingsChange(selectedSetlist.id, { displayMode: mode });
  };

  const handleDeleteSetlist = (setlistId: string) => {
    const targetSetlist = setlists.find((item) => item.id === setlistId);
    const canDeleteTarget = !isTeamWorkspace
      || TEAM_EDIT_ROLES.has(activeLibraryRole)
      || (activeLibraryRole === 'setlist_manager' && targetSetlist?.createdBy === authenticatedUser?.id);
    if (!canDeleteTarget) {
      toast.error(language === 'zh' ? '你沒有刪除這份團隊歌單的權限。' : 'You do not have permission to delete this team setlist.');
      return;
    }
    const confirmed = window.confirm(copy.confirmDeleteSetlist);
    if (!confirmed) {
      return;
    }

    setIsSetlistActionsMenuOpen(false);
    setMobileSwipeSetlist(null);

    const remainingSetlists = setlists.filter((item) => item.id !== setlistId);
    const nextSetlist = remainingSetlists[0] ?? null;
    setSetlists(remainingSetlists);
    setSelectedSetlistId(nextSetlist?.id ?? null);
    setSelectedSetlistSongId(nextSetlist?.songs[0]?.id ?? null);
    if (isPhoneViewport) {
      setSetlistPanelView(nextSetlist ? 'detail' : 'list');
      setSetlistSongSearchQuery('');
    } else {
      setSetlistPanelView(nextSetlist ? 'detail' : 'list');
      setSetlistSongSearchQuery('');
    }
    if (remainingSetlists.length === 0) {
      setWorkspaceMode('songs');
    }

    void persistWorkspace(songs, remainingSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const handleSetSetlistArchived = (setlistId: string, archived: boolean) => {
    const targetSetlist = setlists.find((item) => item.id === setlistId);
    if (!targetSetlist) {
      return;
    }

    if (!canManageSetlist(targetSetlist)) {
      toast.error(language === 'zh' ? '你沒有管理這份團隊歌單的權限。' : 'You do not have permission to manage this team setlist.');
      return;
    }

    setIsSetlistActionsMenuOpen(false);
    setMobileSwipeSetlist(null);

    const nextSetlists = setlists.map((item) =>
      item.id === setlistId ? { ...item, archived, updatedAt: Date.now() } : item
    );
    setSetlists(nextSetlists);

    // Archiving the open setlist hides it from the default list, so drop back to
    // the setlist list rather than leaving a hidden detail view on screen.
    if (archived && selectedSetlistId === setlistId) {
      if (isPhoneViewport) {
        setSetlistPanelView('list');
      } else {
        setSetlistPanelView('list');
      }
    }

    void persistWorkspace(songs, nextSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });

    toast.success(archived ? copy.setlistArchived : copy.setlistUnarchived);
  };

  const clearMobileLongPressTimer = () => {
    if (mobileLongPressTimerRef.current !== null) {
      window.clearTimeout(mobileLongPressTimerRef.current);
      mobileLongPressTimerRef.current = null;
    }
  };

  const handleMobileSongLongPress = (songId: string) => {
    setIsLibraryEditing(true);
    setSelectedLibrarySongIds([songId]);
  };

  const handleMobileSetlistLongPress = (setlistId: string) => {
    // Long-press enters multi-select mode with this item already selected.
    setMobileSwipeSetlist(null);
    setMultiSelectedSetlistIds((current) => (
      current.includes(setlistId) ? current : [...current, setlistId]
    ));
  };

  const handleMobileLongPressStart = (
    kind: 'song' | 'setlist',
    id: string,
    event: React.TouchEvent<HTMLElement>
  ) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    clearMobileLongPressTimer();
    mobileLongPressTriggeredRef.current = false;
    mobileLongPressRef.current = {
      kind,
      id,
      x: touch.clientX,
      y: touch.clientY
    };
    mobileLongPressTimerRef.current = window.setTimeout(() => {
      mobileLongPressTriggeredRef.current = true;
      if (kind === 'song') {
        handleMobileSongLongPress(id);
      } else {
        handleMobileSetlistLongPress(id);
      }
    }, 450);
  };

  const handleMobileLongPressMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = mobileLongPressRef.current;
    const touch = event.touches[0];
    if (!start || !touch) {
      return;
    }

    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) {
      clearMobileLongPressTimer();
    }
  };

  const handleMobileLongPressEnd = () => {
    clearMobileLongPressTimer();
    mobileLongPressRef.current = null;
  };

  // Setlist + project swipe-to-reveal share one engine (see createSwipeController)
  // so both lists behave identically. Each controller is rebuilt per render so
  // its closures read the latest open/dragging state.
  const setlistSwipe = createSwipeController({
    ref: mobileSetlistSwipeRef,
    handledRef: mobileSetlistSwipeHandledRef,
    openId: mobileSwipeSetlist?.id ?? null,
    openAction: mobileSwipeSetlist?.action ?? null,
    setDragging: setDraggingSetlist,
    setOpen: setMobileSwipeSetlist,
    canArchive: (id) => {
      const target = setlists.find((item) => item.id === id);
      return Boolean(target && canManageSetlist(target));
    }
  });

  // Preserve the handler names the setlist JSX already wires up.
  const handleMobileSetlistTouchStart = setlistSwipe.touchStart;
  const handleMobileSetlistTouchMove = setlistSwipe.touchMove;
  const handleMobileSetlistTouchEnd = setlistSwipe.touchEnd;
  const handleSetlistMousePointerDown = setlistSwipe.pointerDown;
  const handleSetlistMousePointerMove = setlistSwipe.pointerMove;
  const handleSetlistMousePointerEnd = setlistSwipe.pointerEnd;
  const resetSetlistSwipe = setlistSwipe.reset;

  const projectSwipe = createSwipeController({
    ref: mobileProjectSwipeRef,
    handledRef: mobileProjectSwipeHandledRef,
    openId: mobileSwipeProject?.id ?? null,
    openAction: mobileSwipeProject?.action ?? null,
    setDragging: setDraggingProject,
    setOpen: setMobileSwipeProject,
    canArchive: (id) => {
      const target = projects.find((item) => item.id === id);
      return Boolean(target && canManageProject(target));
    }
  });

  // Share-panel member rows reuse the same swipe engine, but only the left
  // swipe (→ reveal "remove"); there's no archive side, so canArchive is false.
  const memberSwipe = createSwipeController({
    ref: mobileMemberSwipeRef,
    handledRef: mobileMemberSwipeHandledRef,
    openId: mobileSwipeMember?.id ?? null,
    openAction: mobileSwipeMember?.action ?? null,
    setDragging: setDraggingMember,
    setOpen: setMobileSwipeMember,
    canArchive: () => false
  });

  // The selection is an ordered list of song ids that ALLOWS duplicates: the same
  // song can appear multiple times so it can be added to the setlist more than once
  // (e.g. sung in a different key each time). Each occurrence becomes its own entry.
  const toggleSetlistAddSongSelection = (songId: string) => {
    setSetlistAddSongSelection((current) =>
      current.includes(songId)
        ? current.filter((id) => id !== songId)
        : [...current, songId]
    );
  };

  const incrementSetlistAddSongSelection = (songId: string) => {
    setSetlistAddSongSelection((current) => [...current, songId]);
  };

  const decrementSetlistAddSongSelection = (songId: string) => {
    setSetlistAddSongSelection((current) => {
      const lastIndex = current.lastIndexOf(songId);
      if (lastIndex === -1) {
        return current;
      }
      const next = [...current];
      next.splice(lastIndex, 1);
      return next;
    });
  };

  // Phone batch-add: commit every selected library song to the setlist in one shot,
  // preserving the order the user picked them in, then return to the detail view.
  const handleAddSongsToSetlist = (songIds: string[]) => {
    if (!selectedSetlist) {
      return;
    }
    if (!canEditSelectedSetlist) {
      toast.error(language === 'zh' ? '你沒有編輯這份團隊歌單的權限。' : 'You do not have permission to edit this team setlist.');
      return;
    }

    const newSetlistSongs = songIds
      .map((songId) => {
        const sourceSong = songs.find((item) => item.id === songId);
        return sourceSong ? createStoredSetlistSong(songId, selectedSetlist.id, sourceSong) : null;
      })
      .filter((item): item is SetlistSong => item !== null);

    if (newSetlistSongs.length === 0) {
      return;
    }

    replaceSetlist(selectedSetlist.id, (currentSetlist) => ({
      ...currentSetlist,
      songs: reindexSetlistSongs([...currentSetlist.songs, ...newSetlistSongs])
    }));
    setSelectedSetlistSongId(newSetlistSongs[newSetlistSongs.length - 1].id);
    setWorkspaceMode('setlists');
    setSetlistAddSongSelection([]);
    setSetlistSongSearchQuery('');
    // Stay in management mode so the newly-added order can be reviewed before
    // the user explicitly chooses a song and returns to the clean sheet.
    setSetlistPanelView('detail');
  };

  const handleSelectSetlistSong = (setlistSongId: string) => {
    if (!selectedSetlist) {
      return;
    }

    // Switching the focused setlist song takes priority over the editor: release
    // any editor focus / pending focus request first so the editor can't grab
    // focus back and block the switch. (activeBar / activeSectionId are reset
    // automatically by the currentPreviewIdentity effect when the song
    // changes, so we don't double-set them here — doing so causes a visible
    // flicker as the editor re-renders twice.)
    if (editorFocusTimeoutRef.current !== null) {
      window.clearTimeout(editorFocusTimeoutRef.current);
      editorFocusTimeoutRef.current = null;
    }
    setEditorFocusRequest(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    void runSelectionChange(() => {
      setWorkspaceMode('setlists');
      setSelectedSetlistId(selectedSetlist.id);
      setSelectedSetlistSongId(setlistSongId);
      // Touch drawers are for arranging/navigating; an explicit song choice
      // returns the entire viewport to the sheet. Run this only after the
      // selection is actually accepted (quick-edit may defer the transition).
      if (shouldCollapseSetlistSidebar({ isPhoneViewport, usesOverlaySidebar, hasFinePointer })) {
        if (isPhoneViewport) {
          setIsMobileNavOpen(false);
        } else {
          setIsSidebarPinned(false);
          setIsSidebarHovered(false);
        }
      }
    });
  };

  // Remove duplicate songs from the library — songs whose title and musical
  // content are identical (ignoring id/timestamps). Keeps the first occurrence
  // and re-points any setlist references from removed copies to the kept one.
  const handleRemoveLibrarySongDuplicates = () => {
    if (!canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有編輯這個團隊歌曲庫的權限。' : 'You do not have permission to edit this song library.');
      return;
    }

    const contentKeyOf = (item: StoredSong) => {
      const { id: _id, updatedAt: _u, createdAt: _c, teamSource: _t, ...rest } = item;
      return JSON.stringify(rest);
    };

    const keptIdByContent = new Map<string, string>();
    const remap = new Map<string, string>();
    const deduped: StoredSong[] = [];
    for (const item of songs) {
      const key = contentKeyOf(item);
      const keptId = keptIdByContent.get(key);
      if (keptId) {
        remap.set(item.id, keptId);
        continue;
      }
      keptIdByContent.set(key, item.id);
      deduped.push(item);
    }

    const removed = songs.length - deduped.length;
    if (removed === 0) {
      toast.info(language === 'zh' ? '沒有發現重複歌曲' : 'No duplicate songs found');
      return;
    }

    // Re-point setlist references from removed copies to the kept song.
    const nextSetlists = setlists.map((setlist) => ({
      ...setlist,
      songs: setlist.songs.map((item) =>
        remap.has(item.songId) ? { ...item, songId: remap.get(item.songId) as string } : item
      )
    }));

    setSongs(deduped);
    setSetlists(nextSetlists);
    if (selectedSongId && remap.has(selectedSongId)) {
      setSelectedSongId(remap.get(selectedSongId) as string);
    }
    setSelectedLibrarySongIds([]);
    toast.success(
      language === 'zh'
        ? `已移除 ${removed} 首重複歌曲`
        : `Removed ${removed} duplicate song${removed > 1 ? 's' : ''}`
    );
  };

  const handleUpdateSetlistSong = (setlistSongId: string, updater: (currentSong: SetlistSong) => SetlistSong) => {
    if (!selectedSetlist) {
      return;
    }
    if (!canEditSelectedSetlist) {
      return;
    }

    replaceSetlist(selectedSetlist.id, (currentSetlist) => ({
      ...currentSetlist,
      songs: currentSetlist.songs.map((item) => item.id === setlistSongId ? updater(item) : item)
    }));
  };

  const handleRemoveSetlistSong = (setlistSongId: string) => {
    if (!selectedSetlist) {
      return;
    }
    if (!canEditSelectedSetlist) {
      return;
    }

    const targetSetlistSong = selectedSetlist.songs.find((item) => item.id === setlistSongId);
    const sourceSong = targetSetlistSong ? songs.find((item) => item.id === targetSetlistSong.songId) : undefined;
    const songTitle = targetSetlistSong?.songData?.title || sourceSong?.title || copy.untitledSong;
    const confirmed = window.confirm(
      language === 'zh'
        ? `要從歌單移出「${songTitle}」嗎？`
        : `Remove "${songTitle}" from this setlist?`
    );
    if (!confirmed) {
      return;
    }

    replaceSetlist(selectedSetlist.id, (currentSetlist) => ({
      ...currentSetlist,
      songs: currentSetlist.songs.filter((item) => item.id !== setlistSongId)
    }));

    const remainingSongs = selectedSetlist.songs.filter((item) => item.id !== setlistSongId);
    setSelectedSetlistSongId(remainingSongs[0]?.id ?? null);
  };

  // Reorder within a *joined* project's setlist (manager only). Updates the local
  // joinedProjects copy and persists the new order via a role-checked RPC.
  const moveJoinedProjectSetlistSong = (sourceId: string, targetId: string) => {
    let orderedIds: string[] | null = null;
    setJoinedProjects((current) => current.map((jp) => {
      if (!jp.setlists.some((sl) => sl.id === selectedSetlistId)) return jp;
      return {
        ...jp,
        setlists: jp.setlists.map((sl) => {
          if (sl.id !== selectedSetlistId) return sl;
          const nextSongs = [...sl.songs];
          const sourceIndex = nextSongs.findIndex((item) => item.id === sourceId);
          const targetIndex = nextSongs.findIndex((item) => item.id === targetId);
          if (sourceIndex === -1 || targetIndex === -1) return sl;
          const [moved] = nextSongs.splice(sourceIndex, 1);
          nextSongs.splice(targetIndex, 0, moved);
          const reindexed = reindexSetlistSongs(nextSongs);
          orderedIds = reindexed.map((item) => item.id);
          return { ...sl, songs: reindexed };
        })
      };
    }));
    if (orderedIds && selectedSetlistId && cloudRepositoryRef.current) {
      void cloudRepositoryRef.current.reorderProjectSetlist(selectedSetlistId, orderedIds);
    }
  };

  const moveSetlistSong = (sourceId: string, targetId: string) => {
    if (!selectedSetlist || sourceId === targetId || !canReorderSelectedSetlist) {
      return;
    }

    if (isJoinedProjectManager) {
      moveJoinedProjectSetlistSong(sourceId, targetId);
      return;
    }

    replaceSetlist(selectedSetlist.id, (currentSetlist) => {
      const nextSongs = [...currentSetlist.songs];
      const sourceIndex = nextSongs.findIndex((item) => item.id === sourceId);
      const targetIndex = nextSongs.findIndex((item) => item.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return currentSetlist;
      }

      const [moved] = nextSongs.splice(sourceIndex, 1);
      nextSongs.splice(targetIndex, 0, moved);

      return {
        ...currentSetlist,
        songs: reindexSetlistSongs(nextSongs)
      };
    });
  };

  const finishSetlistSongPointerDrag = (event?: React.PointerEvent<HTMLElement>) => {
    const dragState = setlistSongPointerDragRef.current;
    if (!dragState || (event && event.pointerId !== dragState.pointerId)) {
      return;
    }

    if (dragState.holdTimeoutId !== null) {
      window.clearTimeout(dragState.holdTimeoutId);
    }

    if (dragState.activated) {
      try {
        dragState.element.releasePointerCapture(dragState.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
      document.body.style.userSelect = dragState.previousUserSelect;
    }

    setlistSongPointerDragRef.current = null;
    setDraggingSetlistSongId(null);
    setDragOverSetlistSongId(null);
  };

  // Press-and-hold before the handle starts dragging, so flicking through the
  // setlist to scroll doesn't accidentally grab a song and reorder it.
  const SETLIST_DRAG_HOLD_MS = 160;
  const SETLIST_DRAG_CANCEL_THRESHOLD = 10;

  const activateSetlistSongPointerDrag = () => {
    const dragState = setlistSongPointerDragRef.current;
    if (!dragState || dragState.activated) {
      return;
    }

    dragState.activated = true;
    dragState.holdTimeoutId = null;
    dragState.previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    try {
      dragState.element.setPointerCapture(dragState.pointerId);
    } catch {
      // Pointer may have already been released before the hold elapsed.
    }
    setDraggingSetlistSongId(dragState.sourceId);
    setDragOverSetlistSongId(dragState.sourceId);
  };

  const handleSetlistSongDragHandlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    setlistSongId: string
  ) => {
    if (!canReorderSelectedSetlist || event.button !== 0) {
      return;
    }

    const element = event.currentTarget;
    const holdTimeoutId = window.setTimeout(() => {
      activateSetlistSongPointerDrag();
    }, SETLIST_DRAG_HOLD_MS);

    setlistSongPointerDragRef.current = {
      sourceId: setlistSongId,
      pointerId: event.pointerId,
      lastTargetId: setlistSongId,
      previousUserSelect: document.body.style.userSelect,
      startX: event.clientX,
      startY: event.clientY,
      element,
      activated: false,
      holdTimeoutId
    };
  };

  const handleSetlistSongDragHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = setlistSongPointerDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    // Before the hold elapses, a noticeable move means the user is scrolling,
    // not reordering — abandon the pending drag and let the list scroll.
    if (!dragState.activated) {
      const movedFar = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
        >= SETLIST_DRAG_CANCEL_THRESHOLD;
      if (movedFar) {
        if (dragState.holdTimeoutId !== null) {
          window.clearTimeout(dragState.holdTimeoutId);
        }
        setlistSongPointerDragRef.current = null;
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const targetElement = document.elementFromPoint(event.clientX, event.clientY);
    const targetCard = targetElement?.closest('[data-setlist-song-id]') as HTMLElement | null;
    const targetId = targetCard?.dataset.setlistSongId;
    if (!targetId || targetId === dragState.lastTargetId) {
      return;
    }

    dragState.lastTargetId = targetId;
    setDragOverSetlistSongId(targetId);
    if (targetId !== dragState.sourceId) {
      moveSetlistSong(dragState.sourceId, targetId);
    }
  };

  const handleExportSongLibraryJson = () => {
    const payload: ExportedSongLibraryPayload = {
      version: 1,
      exportedAt: Date.now(),
      songs: songs.map(({ updatedAt, ...song }) => ({
        ...cloneSong(song),
        updatedAt
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const objectUrl = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = `chordmaster-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.URL.revokeObjectURL(objectUrl);
  };

  const handleImportSongLibraryClick = () => {
    if (!canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有匯入覆蓋這個團隊歌曲庫的權限。' : 'You do not have permission to import into this team song library.');
      return;
    }
    importLibraryInputRef.current?.click();
  };

  const handleImportSongLibrary = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      const parsedContent = JSON.parse(rawContent) as ExportedSongLibraryPayload | Song[];
      const importedSongs = Array.isArray(parsedContent) ? parsedContent : parsedContent.songs;

      if (!Array.isArray(importedSongs) || importedSongs.length === 0) {
        toast.error(copy.importEmptyError);
        return;
      }

      const existingSongIds = new Set(songs.map((item) => item.id));
      const nextSongs = importedSongs.map((item, index) => {
        const storedLikeItem = item as Partial<StoredSong>;
        const normalizedSong = cloneSong(normalizeSongBars(item as Song));
        const shouldImportAsCopy = isCloudMode && (!storedLikeItem.id || !existingSongIds.has(storedLikeItem.id));
        const importedId = shouldImportAsCopy
          ? crypto.randomUUID()
          : storedLikeItem.id || `song-imported-${Date.now()}-${index + 1}`;
        const { teamSource: _teamSource, ...songWithoutWorkspaceLink } = normalizedSong as StoredSong;
        return {
          ...songWithoutWorkspaceLink,
          id: importedId,
          updatedAt: typeof storedLikeItem.updatedAt === 'number' ? storedLikeItem.updatedAt : Date.now()
        };
      }) as StoredSong[];

      const confirmed = window.confirm(
        language === 'zh'
          ? `要匯入 ${nextSongs.length} 首歌並取代目前的 Song Library 嗎？`
          : `Import ${nextSongs.length} songs and replace the current Song Library?`
      );
      if (!confirmed) {
        return;
      }

      const nextSelectedSongId = nextSongs[0].id;
      const nextSongIds = new Set(nextSongs.map((item) => item.id));
      const nextSetlists = setlists.map((setlist) => {
        const songsInLibrary = setlist.songs.filter((item) => nextSongIds.has(item.songId));
        if (songsInLibrary.length === setlist.songs.length) {
          return setlist;
        }

        return {
          ...setlist,
          songs: reindexSetlistSongs(songsInLibrary),
          updatedAt: Date.now()
        };
      });
      setSongs(nextSongs);
      setSetlists(nextSetlists);
      setSelectedSongId(nextSelectedSongId);
      setSelectedSetlistSongId((currentId) => nextSetlists.some((setlist) => setlist.songs.some((item) => item.id === currentId))
        ? currentId
        : null);
      setSongHistories({});
      setSelectedLibrarySongIds([]);
      setIsLibraryEditing(false);
      await persistWorkspace(nextSongs, nextSetlists);
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      toast.error(reason ? `${copy.importInvalidError}\n\n${reason}` : copy.importInvalidError);
    }
  };

  const handleImportPersonalSongsToTeam = async () => {
    const repository = cloudRepositoryRef.current;
    if (!repository || !isTeamWorkspace || !canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有匯入到這個團隊歌曲庫的權限。' : 'You do not have permission to import into this team song library.');
      return;
    }

    const teamName = activeCloudLibrary?.name ?? (language === 'zh' ? '目前團隊' : 'this team');
    const confirmed = window.confirm(
      language === 'zh'
        ? `要把個人區所有歌曲複製到「${teamName}」嗎？\n\n這會建立獨立副本，團隊成員會依權限看到這些歌曲；個人區原本的歌曲不會被修改。同名歌曲會自動加上「(個人匯入)」。`
        : `Copy all personal songs into "${teamName}"?\n\nThis creates independent copies that team members can see according to their roles. Your personal songs will not be changed. Duplicate titles will be renamed with "(Personal import)".`
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsImportingPersonalSongs(true);
      setSyncStatus('syncing');
      const personalWorkspace = await repository.loadPersonalWorkspace();
      if (personalWorkspace.songs.length === 0) {
        toast.error(language === 'zh' ? '個人區目前沒有可匯入的歌曲。' : 'Your personal workspace has no songs to import.');
        return;
      }

      const importedSongs: StoredSong[] = [];
      const nextSongs = [...songs];
      personalWorkspace.songs.forEach((sourceSong, index) => {
        const importLabel = language === 'zh' ? '(個人匯入)' : '(Personal import)';
        const copiedSong: StoredSong = {
          ...cloneSong(normalizeSongBars(sourceSong)),
          id: crypto.randomUUID(),
          title: buildImportedTeamSongTitle(nextSongs, sourceSong.title, copy.untitledSong, importLabel),
          updatedAt: Date.now() + index
        };
        nextSongs.push(copiedSong);
        importedSongs.push(copiedSong);
      });

      setSongs(nextSongs);
      if (!selectedSongId && importedSongs[0]) {
        setSelectedSongId(importedSongs[0].id);
      }
      setSongHistories({});
      setSelectedLibrarySongIds([]);
      setIsLibraryEditing(false);
      await persistWorkspace(nextSongs, setlists);
      toast.error(
        language === 'zh'
          ? `已匯入 ${importedSongs.length} 首個人歌曲到「${teamName}」。個人區歌曲不會被修改。`
          : `Imported ${importedSongs.length} personal songs into "${teamName}". Your personal songs were not modified.`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      toast.error(
        language === 'zh'
          ? `無法從個人區匯入歌曲。${reason ? `\n\n${reason}` : ''}`
          : `Unable to import songs from your personal workspace.${reason ? `\n\n${reason}` : ''}`
      );
    } finally {
      setIsImportingPersonalSongs(false);
    }
  };

  const handleDuplicateSong = (songId: string) => {
    if (!canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有編輯這個團隊歌曲庫的權限。' : 'You do not have permission to edit this team song library.');
      return;
    }
    const targetSong = songs.find((item) => item.id === songId);
    if (!targetSong) {
      return;
    }

    const duplicatedSong = createStoredSong({
      ...cloneSong(targetSong),
      title: buildDuplicateSongTitle(songs, targetSong.title, copy.untitledSong, duplicateLabel)
    });

    setSongs((currentSongs) => {
      const targetIndex = currentSongs.findIndex((item) => item.id === songId);
      if (targetIndex === -1) {
        return [duplicatedSong, ...currentSongs];
      }

      const nextSongs = [...currentSongs];
      nextSongs.splice(targetIndex + 1, 0, duplicatedSong);
      return nextSongs;
    });
    setSongHistories((currentHistory) => ({
      ...currentHistory,
      [duplicatedSong.id]: { past: [], future: [] }
    }));
    setSelectedSongId(duplicatedSong.id);
    setActiveAppView('sheet');
    setIsEditing(true);
  };

  const handleCopyTeamSongToPersonal = async (songId: string) => {
    const repository = cloudRepositoryRef.current;
    const targetSong = songs.find((item) => item.id === songId);
    if (!repository || !targetSong || !isTeamWorkspace) {
      return;
    }

    try {
      setSyncStatus('syncing');
      const copiedSong = await repository.copySongToPersonal(targetSong);
      setSyncStatus('saved');
      toast.success(language === 'zh'
        ? `已轉存到個人區：「${copiedSong.title}」`
        : `Copied to your personal library: "${copiedSong.title}"`, {
        description: language === 'zh'
          ? '這是獨立副本，不會連動團隊版。'
          : 'This is an independent copy and will not sync with the team version.'
      });
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      toast.error(error instanceof Error ? error.message : copy.cloudSyncFailed);
    }
  };

  const handleSyncPersonalSongFromTeam = async (songId: string) => {
    const repository = cloudRepositoryRef.current;
    const targetSong = songs.find((item) => item.id === songId);
    if (!repository || !targetSong?.teamSource || isTeamWorkspace) {
      return;
    }

    const sourceName = targetSong.teamSource.libraryName ?? (language === 'zh' ? '團隊來源' : 'team source');
    const confirmed = window.confirm(
      language === 'zh'
        ? `要把「${targetSong.title || copy.untitledSong}」同步到「${sourceName}」的最新版嗎？\n\n會保留個人副本的歌名與 capo，但譜面內容會更新成團隊版。`
        : `Sync "${targetSong.title || copy.untitledSong}" to the latest version from "${sourceName}"?\n\nThe personal title and capo will be kept, but chart content will be replaced by the team version.`
    );
    if (!confirmed) {
      return;
    }

    try {
      setSyncStatus('syncing');
      const syncedSong = await repository.syncPersonalSongFromTeam(targetSong);
      const nextSongs = songs.map((item) => item.id === syncedSong.id ? syncedSong : item);
      try {
        window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(nextSongs));
        window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(Date.now()));
      } catch {
        // Ignore local cache failures and keep the app usable.
      }
      setSongs(nextSongs);
      setSavedSongs(cloneSong(nextSongs));
      setLastSavedAt(Date.now());
      setSongHistories((currentHistory) => ({
        ...currentHistory,
        [syncedSong.id]: { past: [], future: [] }
      }));
      setTeamSourceStatuses((current) => ({
        ...current,
        [syncedSong.id]: {
          latestUpdatedAt: syncedSong.teamSource?.updatedAt,
          isLoading: false
        }
      }));
      setSyncStatus('saved');
      toast.success(language === 'zh' ? '已同步到團隊最新版' : 'Synced to the latest team version');
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      toast.error(error instanceof Error ? error.message : copy.cloudSyncFailed);
    }
  };

  const handleSongListTitleChange = (songId: string, title: string) => {
    if (!canEditTeamSongs) {
      return;
    }
    const targetSong = songs.find((item) => item.id === songId);
    if (!targetSong || targetSong.title === title) {
      return;
    }

    pushSongHistory(songId, targetSong);
    replaceSongInLibrary(songId, { ...targetSong, title });
  };

  const handleSongListTitleCommit = (songId: string, title: string) => {
    const formattedTitle = formatInitialCaps(title);
    if (formattedTitle !== title) {
      handleSongListTitleChange(songId, formattedTitle);
    }
  };

  const handleDeleteSong = (songId: string) => {
    if (!canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有刪除這個團隊歌曲的權限。' : 'You do not have permission to delete this team song.');
      return;
    }
    const targetSong = songs.find((item) => item.id === songId);
    if (!targetSong) {
      return;
    }

    const confirmed = window.confirm(
      language === 'zh'
        ? `要刪除「${targetSong.title || copy.untitledSong}」嗎？`
        : `Delete "${targetSong.title || copy.untitledSong}"?`
    );
    if (!confirmed) {
      return;
    }

    const remainingSongs = songs.filter((item) => item.id !== songId);
    const remainingSetlists = setlists.map((setlist) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs.filter((item) => item.songId !== songId)),
      updatedAt: Date.now()
    }));

    if (remainingSongs.length === 0) {
      const replacementSong = createDefaultSong(1);
      setSongs([replacementSong]);
      setSetlists([]);
      setSavedSongs([cloneSong(replacementSong)]);
      setSavedSetlists([]);
      setSelectedSetlistId(null);
      setSelectedSetlistSongId(null);
      setSelectedSongId(replacementSong.id);
      setSongHistories({});
      setSelectedLibrarySongIds([]);
      setIsEditing(true);
      void persistWorkspace([replacementSong], []).catch(() => {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      });
      return;
    }

    setSongs(remainingSongs);
    setSetlists(remainingSetlists);
    setSongHistories((currentHistory) =>
      Object.fromEntries(Object.entries(currentHistory).filter(([id]) => id !== songId))
    );
    setSelectedLibrarySongIds((currentIds) => currentIds.filter((id) => id !== songId));

    if (selectedSongId === songId) {
      setSelectedSongId(remainingSongs[0].id);
    }

    void persistWorkspace(remainingSongs, remainingSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const handleToggleSongBulkSelection = (songId: string) => {
    setSelectedLibrarySongIds((currentIds) =>
      currentIds.includes(songId)
        ? currentIds.filter((id) => id !== songId)
        : [...currentIds, songId]
    );
  };

  const handleToggleSelectAllFilteredSongs = () => {
    const filteredIds = filteredSongs.map((item) => item.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedLibrarySongIds.includes(id));
    setSelectedLibrarySongIds((currentIds) => {
      const nextIds = new Set(currentIds);
      filteredIds.forEach((id) => {
        if (allSelected) nextIds.delete(id); else nextIds.add(id);
      });
      return Array.from(nextIds);
    });
  };

  const handleDeleteSelectedSongs = () => {
    if (!canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有刪除這些團隊歌曲的權限。' : 'You do not have permission to delete these team songs.');
      return;
    }
    if (selectedLibrarySongIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      language === 'zh'
        ? `要刪除選取的 ${selectedLibrarySongIds.length} 首歌曲嗎？`
        : `Delete ${selectedLibrarySongIds.length} selected songs?`
    );
    if (!confirmed) {
      return;
    }

    const selectedIdSet = new Set(selectedLibrarySongIds);
    const remainingSongs = songs.filter((item) => !selectedIdSet.has(item.id));
    const remainingSetlists = setlists.map((setlist) => ({
      ...setlist,
      songs: reindexSetlistSongs(setlist.songs.filter((item) => !selectedIdSet.has(item.songId))),
      updatedAt: Date.now()
    }));

    if (remainingSongs.length === 0) {
      const replacementSong = createDefaultSong(1);
      setSongs([replacementSong]);
      setSetlists([]);
      setSavedSongs([cloneSong(replacementSong)]);
      setSavedSetlists([]);
      setSelectedSetlistId(null);
      setSelectedSetlistSongId(null);
      setSelectedSongId(replacementSong.id);
      setSongHistories({});
      setSelectedLibrarySongIds([]);
      setIsEditing(true);
      void persistWorkspace([replacementSong], []).catch(() => {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      });
      return;
    }

    setSongs(remainingSongs);
    setSetlists(remainingSetlists);
    setSongHistories((currentHistory) =>
      Object.fromEntries(Object.entries(currentHistory).filter(([id]) => !selectedIdSet.has(id)))
    );
    setSelectedLibrarySongIds([]);

    if (selectedIdSet.has(selectedSongId)) {
      setSelectedSongId(remainingSongs[0].id);
    }

    void persistWorkspace(remainingSongs, remainingSetlists).catch(() => {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    });
  };

  const handleUndo = () => {
    if (!song || currentSongHistory.past.length === 0 || !canEditTeamSongs) {
      return;
    }

    const previousSong = currentSongHistory.past[currentSongHistory.past.length - 1];
    const newPast = currentSongHistory.past.slice(0, currentSongHistory.past.length - 1);

    setSongHistories((currentHistory) => ({
      ...currentHistory,
      [song.id]: {
        past: newPast,
        future: [cloneSong(song), ...currentSongHistory.future]
      }
    }));

    replaceSongInLibrary(song.id, previousSong);
  };

  const handleRedo = () => {
    if (!song || currentSongHistory.future.length === 0 || !canEditTeamSongs) {
      return;
    }

    const nextSong = currentSongHistory.future[0];
    const newFuture = currentSongHistory.future.slice(1);

    setSongHistories((currentHistory) => ({
      ...currentHistory,
      [song.id]: {
        past: [...currentSongHistory.past, cloneSong(song)],
        future: newFuture
      }
    }));

    replaceSongInLibrary(song.id, nextSong);
  };

  const handleSetlistUndo = () => {
    if (!selectedSetlistSong || currentSetlistSongHistory.past.length === 0 || !canEditSelectedSetlist) {
      return;
    }

    const previousSnapshot = currentSetlistSongHistory.past[currentSetlistSongHistory.past.length - 1];
    const previousSong = previousSnapshot.song;
    const newPast = currentSetlistSongHistory.past.slice(0, currentSetlistSongHistory.past.length - 1);

    setSetlistSongHistories((currentHistory) => ({
      ...currentHistory,
      [selectedSetlistSong.id]: {
        past: newPast,
        future: [{
          song: cloneSong(activeSetlistEditableSong ?? previousSong),
          sectionOrder: [...selectedSetlistSong.sectionOrder]
        }, ...currentSetlistSongHistory.future]
      }
    }));

    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: previousSong.currentKey,
      capo: previousSong.capo ?? 0,
      sectionOrder: sanitizeSetlistSectionOrder(previousSnapshot.sectionOrder, previousSong),
      songData: cloneSong(normalizeSongBars(previousSong))
    }));
  };

  const handleSetlistRedo = () => {
    if (!selectedSetlistSong || currentSetlistSongHistory.future.length === 0 || !canEditSelectedSetlist) {
      return;
    }

    const nextSnapshot = currentSetlistSongHistory.future[0];
    const nextSong = nextSnapshot.song;
    const newFuture = currentSetlistSongHistory.future.slice(1);

    setSetlistSongHistories((currentHistory) => ({
      ...currentHistory,
      [selectedSetlistSong.id]: {
        past: [...currentSetlistSongHistory.past, {
          song: cloneSong(activeSetlistEditableSong ?? nextSong),
          sectionOrder: [...selectedSetlistSong.sectionOrder]
        }],
        future: newFuture
      }
    }));

    handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
      ...currentSetlistSong,
      overrideKey: nextSong.currentKey,
      capo: nextSong.capo ?? 0,
      sectionOrder: sanitizeSetlistSectionOrder(nextSnapshot.sectionOrder, nextSong),
      songData: cloneSong(normalizeSongBars(nextSong))
    }));
  };

  const handleScrollEditorToTop = () => {
    const editorScrollRoot = document.querySelector<HTMLElement>('[data-editor-scroll-root]');
    if (!editorScrollRoot) return;
    editorScrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const collectExportPages = React.useCallback((captureHost: HTMLElement): ExportPageDescriptor[] => {
    const pages = Array.from(captureHost.querySelectorAll('[data-print-page]')) as HTMLElement[];

    return pages.map((page) => {
      const songContainer = page.closest<HTMLElement>('[data-export-song-container]');
      const songIndex = parsePositiveIntegerAttribute(songContainer?.dataset.exportSongIndex ?? null) ?? 1;
      const totalSongs = parsePositiveIntegerAttribute(songContainer?.dataset.exportTotalSongs ?? null) ?? 1;
      const pageInSong = parsePositiveIntegerAttribute(page.dataset.exportPageIndex ?? null) ?? 1;
      const totalPagesInSong = parsePositiveIntegerAttribute(page.dataset.exportPageTotal ?? null) ?? 1;
      const sectionIndex = parsePositiveIntegerAttribute(page.dataset.exportSectionIndex ?? null);
      const songTitle = songContainer?.dataset.exportSongTitle?.trim() || page.dataset.exportSongTitle?.trim() || APP_NAME;
      const sectionTitle = page.dataset.exportSectionTitle?.trim() || null;

      return {
        element: page,
        songIndex,
        totalSongs,
        songTitle,
        sectionIndex,
        sectionTitle,
        pageInSong,
        totalPagesInSong
      };
    });
  }, []);

  const exportCaptureHostToPdf = async (captureHost: HTMLElement, fileName: string) => {
    try {
      await document.fonts.ready;
    } catch {
      // Continue with a best-effort export if font readiness isn't available.
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const pages = collectExportPages(captureHost);
    if (pages.length === 0) {
      throw new Error('No preview pages found for PDF export.');
    }

    let fontEmbedCSS: string | undefined;
    try {
      fontEmbedCSS = await getFontEmbedCSS(captureHost);
    } catch {
      // Fall back to per-page font embedding if pre-fetch fails.
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const createRenderOptions = (pixelRatio: number) => ({
      backgroundColor: '#ffffff',
      cacheBust: false,
      pixelRatio,
      skipAutoScale: true,
      fontEmbedCSS,
    });

    const renderPageElement = async (pageElement: HTMLElement): Promise<PdfRenderedImage> => {
      const pageSize = getElementExportSize(pageElement);
      const primaryPixelRatio = getSafePdfPixelRatio(pageSize.width, pageSize.height);
      const fallbackPixelRatios = Array.from(new Set([
        primaryPixelRatio,
        Math.min(primaryPixelRatio, 2),
        1,
      ])).filter((pixelRatio) => pixelRatio > 0);

      for (const pixelRatio of fallbackPixelRatios) {
        try {
          const canvas = await toCanvas(pageElement, {
            ...createRenderOptions(pixelRatio),
            width: pageSize.width,
            height: pageSize.height,
          });

          if (canvasHasVisibleContent(canvas)) {
            return {
              data: canvas.toDataURL('image/jpeg', 0.92),
              format: 'JPEG',
            };
          }
        } catch {
          // Try the next smaller, safer canvas size.
        }
      }

      return {
        data: await toPng(pageElement, {
          ...createRenderOptions(1),
          width: pageSize.width,
          height: pageSize.height,
        }),
        format: 'PNG',
      };
    };

    // Group pages by their [data-export-song-container] so we can render each
    // song's pages in a single toCanvas() call instead of one per page.
    // DOM serialisation (clone + style-inline + SVG generation) is the main
    // mobile bottleneck — doing it once per song instead of once per page gives
    // an N-fold reduction for multi-page songs.
    const songContainerGroups: { container: HTMLElement; pageIndices: number[] }[] = [];
    for (let i = 0; i < pages.length; i += 1) {
      const container =
        pages[i].element.closest<HTMLElement>('[data-export-song-container]') ??
        captureHost;
      const group = songContainerGroups.find((g) => g.container === container);
      if (group) {
        group.pageIndices.push(i);
      } else {
        songContainerGroups.push({ container, pageIndices: [i] });
      }
    }

    let globalPageCount = 0;
    for (const { container, pageIndices } of songContainerGroups) {
      if (pdfExportCancelRequestedRef.current) {
        throw new PdfExportCancelledError();
      }

      // Render the entire song container once when it fits the current
      // device's canvas limits; otherwise render each page individually.
      let songCanvas: HTMLCanvasElement | null = null;
      let songCanvasPixelRatio = PDF_EXPORT_PREFERRED_PIXEL_RATIO;
      const containerSize = getElementExportSize(container);
      const containerPixelRatio = getSafePdfPixelRatio(containerSize.width, containerSize.height);
      const firstPageSize = getElementExportSize(pages[pageIndices[0]].element);
      const firstPagePixelRatio = getSafePdfPixelRatio(firstPageSize.width, firstPageSize.height);
      const canRenderWholeSong =
        containerPixelRatio >= Math.min(firstPagePixelRatio, PDF_EXPORT_MOBILE_MAX_PIXEL_RATIO);

      if (canRenderWholeSong) {
        try {
          songCanvas = await toCanvas(container, {
            ...createRenderOptions(containerPixelRatio),
            width: containerSize.width,
            height: containerSize.height,
          });
          songCanvasPixelRatio = containerPixelRatio;

          if (!canvasHasVisibleContent(songCanvas)) {
            songCanvas = null;
          }
        } catch {
          songCanvas = null;
        }
      }

      for (const pageIndex of pageIndices) {
        if (pdfExportCancelRequestedRef.current) {
          throw new PdfExportCancelledError();
        }

        const page = pages[pageIndex];
        flushSync(() => {
          setPdfExportProgress({
            totalPages: pages.length,
            completedPages: globalPageCount,
            currentPage: pageIndex + 1,
            songIndex: page.songIndex,
            totalSongs: page.totalSongs,
            songTitle: page.songTitle,
            sectionIndex: page.sectionIndex,
            sectionTitle: page.sectionTitle,
            pageInSong: page.pageInSong,
            totalPagesInSong: page.totalPagesInSong,
            cancelRequested: pdfExportCancelRequestedRef.current,
          });
        });
        await waitForPaint();

        if (pdfExportCancelRequestedRef.current) {
          throw new PdfExportCancelledError();
        }

        let renderedImage: PdfRenderedImage;
        if (songCanvas) {
          // Slice this page out of the full-song canvas.
          // Use layout-relative offsets so off-screen setlist pages keep the
          // correct slice position in browsers with viewport-relative quirks.
          const pageSize = getElementExportSize(page.element);
          const offsetY = Math.round((page.element.offsetTop - container.offsetTop) * songCanvasPixelRatio);
          const sliceW = Math.round(pageSize.width * songCanvasPixelRatio);
          const sliceH = Math.round(pageSize.height * songCanvasPixelRatio);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = sliceW;
          sliceCanvas.height = sliceH;
          const sliceContext = sliceCanvas.getContext('2d')!;
          sliceContext.fillStyle = '#ffffff';
          sliceContext.fillRect(0, 0, sliceW, sliceH);
          sliceContext.drawImage(songCanvas, 0, offsetY, sliceW, sliceH, 0, 0, sliceW, sliceH);

          renderedImage = canvasHasVisibleContent(sliceCanvas)
            ? {
                data: sliceCanvas.toDataURL('image/jpeg', 0.92),
                format: 'JPEG',
              }
            : await renderPageElement(page.element);
        } else {
          renderedImage = await renderPageElement(page.element);
        }

        if (pdfExportCancelRequestedRef.current) {
          throw new PdfExportCancelledError();
        }

        if (globalPageCount > 0) {
          pdf.addPage();
        }
        pdf.addImage(renderedImage.data, renderedImage.format, 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        globalPageCount += 1;

        flushSync(() => {
          setPdfExportProgress((current) =>
            current ? { ...current, completedPages: globalPageCount } : current
          );
        });
      }
    }

    if (pdfExportCancelRequestedRef.current) {
      throw new PdfExportCancelledError();
    }

    await savePdfDocument(pdf, fileName);
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) {
      return;
    }

    pdfExportCancelRequestedRef.current = false;
    setIsExportingPdf(true);
    setPdfExportProgress(null);
    const captureHost = document.createElement('div');
    let exportRoot: ReturnType<typeof createRoot> | null = null;

    try {
      captureHost.setAttribute('aria-hidden', 'true');
      captureHost.style.position = 'fixed';
      captureHost.style.top = '0';
      captureHost.style.left = '-10000px';
      captureHost.style.width = '794px';
      captureHost.style.padding = '0';
      captureHost.style.margin = '0';
      captureHost.style.background = '#ffffff';
      captureHost.style.overflow = 'visible';
      captureHost.style.pointerEvents = 'none';
      captureHost.style.zIndex = '-1';
      document.body.appendChild(captureHost);

      if (isSetlistMode) {
        if (!selectedSetlist || setlistSongsWithSource.length === 0) {
          toast.error(copy.setlistExportEmptyError);
          return;
        }

        exportRoot = createRoot(captureHost);
        flushSync(() => {
          exportRoot?.render(
            <div data-print-preview style={{ width: '794px', minWidth: '794px', maxWidth: '794px' }}>
              {setlistSongsWithSource.map(({ item, sourceSong }, songIndex) => {
                const derivedSong = applySetlistSongOverrides(sourceSong, selectedSetlist, item, guitaristMode);
                return (
                  <div
                    key={item.id}
                    data-export-song-container
                    data-export-song-index={songIndex + 1}
                    data-export-total-songs={setlistSongsWithSource.length}
                    data-export-song-title={derivedSong.title}
                  >
                    <ChordSheet
                      song={derivedSong}
                      language={language}
                      currentKey={derivedSong.currentKey}
                    />
                  </div>
                );
              })}
            </div>
          );
        });
        await exportCaptureHostToPdf(captureHost, buildSetlistPdfFileName(selectedSetlist));
      } else {
        if (!song || !sheetRef.current) {
          return;
        }

        const previewClone = sheetRef.current.cloneNode(true) as HTMLDivElement;
        previewClone.style.transform = 'none';
        previewClone.style.transformOrigin = 'top center';
        previewClone.style.width = '794px';
        previewClone.style.minWidth = '794px';
        previewClone.style.maxWidth = '794px';
        previewClone.style.margin = '0';

        previewClone.querySelectorAll('[data-preview-slot-hit], [data-preview-input-caret], [data-preview-only-control]').forEach((node) => node.remove());

        previewClone.querySelectorAll<HTMLElement>('[data-print-page]').forEach((node) => {
          node.style.boxShadow = 'none';
          node.style.borderColor = 'transparent';
          node.style.outline = 'none';
          node.style.background = '#ffffff';
        });
        previewClone.querySelectorAll<HTMLElement>('[data-preview-section-id]').forEach((node) => {
          node.style.backgroundColor = 'rgba(255, 255, 255, 0)';
          node.style.boxShadow = 'none';
        });
        previewClone.querySelectorAll<HTMLElement>('.sheet-bar').forEach((node) => {
          node.style.backgroundColor = '';
          node.style.boxShadow = 'none';
        });

        const exportSongWrapper = document.createElement('div');
        exportSongWrapper.dataset.exportSongContainer = 'true';
        exportSongWrapper.dataset.exportSongIndex = '1';
        exportSongWrapper.dataset.exportTotalSongs = '1';
        exportSongWrapper.dataset.exportSongTitle = song.title;
        exportSongWrapper.appendChild(previewClone);

        captureHost.appendChild(exportSongWrapper);
        await exportCaptureHostToPdf(captureHost, buildPdfFileName(song));
      }
      toast.success(language === 'zh' ? 'PDF 已匯出' : 'PDF exported');
    } catch (error) {
      if (error instanceof PdfExportCancelledError) {
        return;
      }

      console.error('PDF export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      toast.error(`${copy.pdfExportError} ${errorMessage}`);
    } finally {
      exportRoot?.unmount();
      captureHost.remove();
      pdfExportCancelRequestedRef.current = false;
      setPdfExportProgress(null);
      setIsExportingPdf(false);
    }
  };

  // Apply the page translation directly to the DOM, bypassing React re-renders for smoothness.
  // Uses DOM-measured offsetTop values so inter-page gaps are handled correctly.
  const applyPerformanceTranslation = (index: number, scale: number) => {
    if (!performanceTranslatorRef.current) return;
    const offset = performancePageOffsetsRef.current[index] ?? index * PREVIEW_PAGE_HEIGHT;
    performanceTranslatorRef.current.style.transform =
      `scale(${scale}) translateY(-${offset}px)`;
  };

  const focusPerformanceKeyboardCapture = () => {
    const focusTarget = performanceKeyboardCaptureRef.current ?? performanceOverlayRef.current;
    if (!focusTarget || document.activeElement === focusTarget) return;

    focusTarget.focus({ preventScroll: true });
  };

  // Show the performance-mode chrome and (re)arm the 2s idle timer that hides it.
  // Purely visual — it never blocks taps, so page turning is unaffected.
  const revealPerformanceChrome = React.useCallback(() => {
    setPerformanceChromeVisible(true);
    if (performanceChromeHideTimerRef.current !== null) {
      window.clearTimeout(performanceChromeHideTimerRef.current);
    }
    performanceChromeHideTimerRef.current = window.setTimeout(() => {
      setPerformanceChromeVisible(false);
      performanceChromeHideTimerRef.current = null;
    }, 2000);
  }, []);

  const handleEnterPerformanceMode = () => {
    if (previewEditSession?.dirty) {
      pendingPreviewTransitionRef.current = () => {
        setPreviewEditSession(null);
        performancePageIndexRef.current = 0;
        setPerformancePageIndex(0);
        setIsPerformanceMode(true);
      };
      setIsPreviewEditExitPromptOpen(true);
      return;
    }
    if (previewEditSession) setPreviewEditSession(null);
    performancePageIndexRef.current = 0;
    setPerformancePageIndex(0);
    setIsPerformanceMode(true);
  };

  const handleExitPerformanceMode = () => {
    setIsPerformanceMode(false);
  };

  const handlePerformanceNextPage = () => {
    revealPerformanceChrome();
    const current = performancePageIndexRef.current;
    if (current < performanceTotalPages - 1) {
      const next = current + 1;
      performancePageIndexRef.current = next;
      applyPerformanceTranslation(next, performanceScale);
      setPerformancePageIndex(next); // update indicator only
      return;
    }
    if (isSetlistMode) {
      const items = setlistSongsWithSource.map(({ item }) => item);
      const idx = items.findIndex((s) => s.id === selectedSetlistSongId);
      const nextSong = items[idx + 1];
      if (nextSong) {
        performancePageIndexRef.current = 0;
        setSelectedSetlistSongId(nextSong.id);
        setPerformancePageIndex(0);
      }
    }
  };

  const handlePerformancePrevPage = () => {
    revealPerformanceChrome();
    const current = performancePageIndexRef.current;
    if (current > 0) {
      const prev = current - 1;
      performancePageIndexRef.current = prev;
      applyPerformanceTranslation(prev, performanceScale);
      setPerformancePageIndex(prev); // update indicator only
      return;
    }
    if (isSetlistMode) {
      const items = setlistSongsWithSource.map(({ item }) => item);
      const idx = items.findIndex((s) => s.id === selectedSetlistSongId);
      const prevSong = items[idx - 1];
      if (prevSong) {
        performancePageIndexRef.current = Infinity;
        setSelectedSetlistSongId(prevSong.id);
        setPerformancePageIndex(Infinity); // clamped after render
      }
    }
  };

  const handlePerformanceTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    revealPerformanceChrome();
    const t = e.touches[0];
    if (!t) return;
    performanceTouchRef.current = { x: t.clientX, y: t.clientY };
  };

  const handlePerformanceTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = performanceTouchRef.current;
    performanceTouchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 44 || Math.abs(dy) >= Math.abs(dx)) return;
    if (dx < 0) handlePerformanceNextPage();
    else handlePerformancePrevPage();
  };

  useEffect(() => {
    if (songs.length > 0 && song.id !== selectedSongId) {
      setSelectedSongId(song.id);
    }
  }, [selectedSongId, song]);

  useEffect(() => {
    if (!isExportingPdf) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      pdfExportCancelRequestedRef.current = true;
      setPdfExportProgress((current) => current ? { ...current, cancelRequested: true } : current);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportingPdf]);

  // Sync performanceTotalPages and clamp page index after song/mode changes.
  // Uses RAF to wait for ChordSheet to render, then reads page count from DOM.
  useEffect(() => {
    if (!isPerformanceMode) return;
    const rAF = window.requestAnimationFrame(() => {
      const container = performanceSheetRef.current;
      const pageEls: HTMLElement[] = container
        ? Array.from(container.querySelectorAll('[data-print-page]'))
        : [];
      const total = Math.max(1, pageEls.length);
      setPerformanceTotalPages(total);
      // Store the layout offsetTop of each page (relative to the clip container, pre-transform).
      // This accounts for any inter-page gap in the ChordSheet flex wrapper.
      performancePageOffsetsRef.current = pageEls.map((el) => el.offsetTop);
      const clampedIndex = Math.min(performancePageIndexRef.current, total - 1);
      performancePageIndexRef.current = clampedIndex;
      setPerformancePageIndex(clampedIndex);
      applyPerformanceTranslation(clampedIndex, performanceScale);
    });
    return () => window.cancelAnimationFrame(rAF);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPerformanceMode, selectedSetlistSongId, selectedSongId]);

  // Keep refs to latest handlers so the keyboard effect never has stale closures.
  const handlePerformanceNextPageRef = useRef(handlePerformanceNextPage);
  const handlePerformancePrevPageRef = useRef(handlePerformancePrevPage);
  handlePerformanceNextPageRef.current = handlePerformanceNextPage;
  handlePerformancePrevPageRef.current = handlePerformancePrevPage;

  // Keyboard navigation in performance mode
  useEffect(() => {
    if (!isPerformanceMode) return;
    const handler = (e: KeyboardEvent) => {
      const direction = getPerformancePageDirection(e);
      const signature = getPerformanceKeyboardSignature(e);
      const now = window.performance.now();
      const lastHandled = lastPerformanceKeyboardEventRef.current;

      if (
        e.type === 'keyup' &&
        lastHandled?.signature === signature &&
        now - lastHandled.handledAt < 350
      ) {
        return;
      }

      if (direction === 'next') {
        e.preventDefault();
        lastPerformanceKeyboardEventRef.current = { signature, handledAt: now };
        handlePerformanceNextPageRef.current();
      } else if (direction === 'prev') {
        e.preventDefault();
        lastPerformanceKeyboardEventRef.current = { signature, handledAt: now };
        handlePerformancePrevPageRef.current();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        lastPerformanceKeyboardEventRef.current = { signature, handledAt: now };
        handleExitPerformanceMode();
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPerformanceMode]);

  useEffect(() => {
    if (!isPerformanceMode) return;
    const rafId = window.requestAnimationFrame(focusPerformanceKeyboardCapture);
    // iOS can silently blur the hidden input after a period of inactivity, which
    // stops Bluetooth page-turner / hardware keyboard events from reaching the
    // webview. Re-assert focus periodically so the page turner keeps working.
    const intervalId = window.setInterval(focusPerformanceKeyboardCapture, 1500);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPerformanceMode]);

  // Prevent background scroll on iOS when performance mode is active
  useEffect(() => {
    if (!isPerformanceMode) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isPerformanceMode]);

  // Show the chrome when entering performance mode, then let the idle timer hide
  // it after 2s. Reset to visible (and drop any timer) on exit for next time.
  useEffect(() => {
    if (!isPerformanceMode) {
      if (performanceChromeHideTimerRef.current !== null) {
        window.clearTimeout(performanceChromeHideTimerRef.current);
        performanceChromeHideTimerRef.current = null;
      }
      setPerformanceChromeVisible(true);
      return;
    }
    revealPerformanceChrome();
    return () => {
      if (performanceChromeHideTimerRef.current !== null) {
        window.clearTimeout(performanceChromeHideTimerRef.current);
        performanceChromeHideTimerRef.current = null;
      }
    };
  }, [isPerformanceMode, revealPerformanceChrome]);

  useEffect(() => {
    if (!authenticatedUser) {
      cloudRepositoryRef.current = null;
      setCloudLibraries([]);
      setActiveLibraryId(null);
      setTeamManagement(null);
      setIsTeamManagementOpen(false);
      setIsWorkspacePanelOpen(false);
      setIsCreateTeamOpen(false);
      setNewTeamName('');
      setTeamFeatureError(null);
      setIsLoadingCloudWorkspace(false);
      setIsImportPromptOpen(false);
      setSyncStatus('saved');
      return;
    }

    cloudRepositoryRef.current = createCloudRepository({
      userId: authenticatedUser.id,
      email: authenticatedUser.email,
      name: authenticatedUser.name,
      picture: authenticatedUser.picture
    });
  }, [authenticatedUser]);

  useEffect(() => {
    if (!authenticatedUser || !cloudRepositoryRef.current) {
      return;
    }

    let isCancelled = false;

    const loadCloudWorkspace = async () => {
      try {
        setIsLoadingCloudWorkspace(true);
        const repository = cloudRepositoryRef.current!;
        let libraries: CloudLibrarySummary[] = [];
        let libraryListError: string | null = null;
        try {
          libraries = await repository.listLibraries();
        } catch (error) {
          libraryListError = getTeamFeatureErrorMessage(error, language);
          const personalLibraryId = await repository.getPersonalLibraryId();
          libraries = [{
            id: personalLibraryId,
            name: language === 'zh' ? '個人區' : 'Personal',
            kind: 'personal',
            ownerUserId: authenticatedUser.id,
            role: 'owner',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }];
        }
        const requestedTeamId = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('team')
          : null;
        const personalLibrary = libraries.find((library) => library.kind === 'personal') ?? null;
        const requestedTeam = requestedTeamId
          ? libraries.find((library) => library.id === requestedTeamId && library.kind === 'team') ?? null
          : null;
        const targetLibrary = requestedTeam ?? personalLibrary ?? libraries[0] ?? null;
        if (targetLibrary) {
          repository.setActiveLibrary(targetLibrary.id);
        }
        const cloudWorkspace = targetLibrary
          ? await repository.loadLibraryWorkspace(targetLibrary.id)
          : await repository.loadWorkspace();
        if (isCancelled) {
          return;
        }

        const hasLocalData = initialLibraryRef.current.songs.length > 0 || initialSetlistsRef.current.setlists.length > 0;
        const migrationCompleted = hasCompletedMigration(authenticatedUser.id);
        const loadingTeamWorkspace = targetLibrary?.kind === 'team';
        const shouldUseCloudWorkspace = loadingTeamWorkspace || cloudWorkspace.songs.length > 0 || cloudWorkspace.setlists.length > 0 || cloudWorkspace.joinedSetlists.length > 0 || (cloudWorkspace.joinedProjects ?? []).length > 0 || migrationCompleted || !hasLocalData;
        let openedSharedSetlistFromLink = false;
        setCloudLibraries(libraries);
        setTeamFeatureError(libraryListError);
        setAuthUiError(null);
        setActiveLibraryId(targetLibrary?.id ?? null);

        if (shouldUseCloudWorkspace) {
          const nextSongs = cloudWorkspace.songs.length > 0 || loadingTeamWorkspace ? cloudWorkspace.songs : initialLibraryRef.current.songs;
          const nextSetlists = cloudWorkspace.setlists;
          const nextJoinedSetlists = cloudWorkspace.joinedSetlists;
          const requestedSetlistId = typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('setlist')
            : null;
          const requestedSetlist = requestedSetlistId
            ? nextSetlists.find((item) => item.id === requestedSetlistId) ?? nextJoinedSetlists.find((item) => item.id === requestedSetlistId) ?? null
            : null;
          const nextProjects = cloudWorkspace.projects;
          const nextJoinedProjects = cloudWorkspace.joinedProjects ?? [];
          const firstJoinedProject = nextJoinedProjects.find((project) => project.setlists.length > 0) ?? null;
          const firstJoinedProjectSetlist = firstJoinedProject?.setlists[0] ?? null;
          setSongs(nextSongs);
          setSavedSongs(cloneSong(nextSongs));
          setSetlists(nextSetlists);
          setSavedSetlists(cloneSong(nextSetlists));
          setProjects(nextProjects);
          setSavedProjects(cloneSong(nextProjects));
          setJoinedSetlists(nextJoinedSetlists);
          setJoinedProjects(nextJoinedProjects);
          setLastSavedAt(cloudWorkspace.lastSavedAt);
          // The cloud repository is ready now, so populate the notification
          // inbox + share contacts (the auth-keyed effect may have run before
          // the repository ref was assigned).
          void refreshNotificationsAndContacts();
          const storedSelectedSongId = getStoredSelectedSongId(targetLibrary?.id ?? null);
          const requestedSongId = typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('song')
            : null;
          setSelectedSongId((currentId) => pickAvailableSongId(nextSongs, [
            requestedSongId,
            storedSelectedSongId,
            currentId
          ]));
          if (targetLibrary?.kind === 'personal') {
            try {
              window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(nextSongs));
              window.localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(nextSetlists));
              if (cloudWorkspace.lastSavedAt !== null) {
                window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(cloudWorkspace.lastSavedAt));
              } else {
                window.localStorage.removeItem(LAST_SAVED_AT_STORAGE_KEY);
              }
            } catch {
              // Ignore local cache failures; the cloud workspace is already loaded in memory.
            }
          }
          setSelectedSetlistId((currentId) => {
            if (requestedSetlist) return requestedSetlist.id;
            if (nextSetlists.some((item) => item.id === currentId)) return currentId;
            if (nextJoinedSetlists.some((item) => item.id === currentId)) return currentId;
            if (nextJoinedProjects.some((project) => project.setlists.some((item) => item.id === currentId))) return currentId;
            return nextSetlists[0]?.id ?? nextJoinedSetlists[0]?.id ?? firstJoinedProjectSetlist?.id ?? null;
          });
          setSetlistProjectFilter((currentFilter) => validateSetlistProjectFilter(
            currentFilter,
            nextProjects,
            nextJoinedProjects
          ));
          if (requestedSetlist) {
            openedSharedSetlistFromLink = true;
            setWorkspaceMode('setlists');
            setSelectedSetlistSongId(requestedSetlist.songs[0]?.id ?? null);
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
          } else if (requestedTeam) {
            setWorkspaceMode(nextSetlists.length > 0 ? 'setlists' : 'songs');
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
          } else if (nextSetlists.length === 0 && (nextJoinedSetlists.length > 0 || firstJoinedProjectSetlist)) {
            setWorkspaceMode('setlists');
          }
        }

        if (!loadingTeamWorkspace && hasLocalData && !migrationCompleted && !openedSharedSetlistFromLink) {
          setIsImportPromptOpen(true);
        } else {
          setIsImportPromptOpen(false);
        }

        setSyncStatus('saved');
      } catch (error) {
        if (!isCancelled) {
          const message = getTeamFeatureErrorMessage(error, language);
          setAuthUiError(message);
          setTeamFeatureError(message);
          setSyncStatus(navigator.onLine ? 'failed' : 'offline');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCloudWorkspace(false);
        }
      }
    };

    void loadCloudWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [authenticatedUser, language]);

  useEffect(() => {
    if (!authenticatedUser || !cloudRepositoryRef.current) {
      return;
    }

    const flushPending = async () => {
      const pending = loadPendingSync();
      if (!pending || !navigator.onLine) {
        return;
      }

      try {
        const repository = cloudRepositoryRef.current!;
        setSyncStatus('syncing');
        const remoteWorkspace = await repository.loadWorkspace();
        const mergedWorkspace = mergeWorkspaceByUpdatedAt(pending, remoteWorkspace);
        const savedAt = Math.max(
          pending.savedAt,
          remoteWorkspace.lastSavedAt ?? 0,
          ...mergedWorkspace.songs.map((songItem) => songItem.updatedAt),
          ...mergedWorkspace.setlists.map((setlistItem) => setlistItem.updatedAt),
          ...mergedWorkspace.projects.map((projectItem) => projectItem.updatedAt)
        ) || Date.now();

        await syncWorkspaceDiff({
          repository,
          songs: mergedWorkspace.songs,
          setlists: mergedWorkspace.setlists,
          projects: mergedWorkspace.projects,
          savedSongs: remoteWorkspace.songs,
          savedSetlists: remoteWorkspace.setlists,
          savedProjects: remoteWorkspace.projects
        });

        savePendingSync(null);
        try {
          window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(mergedWorkspace.songs));
          window.localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(mergedWorkspace.setlists));
          window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(mergedWorkspace.projects));
          window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
        } catch {
          // Ignore local cache failures and keep the synced state in memory.
        }
        setSongs(mergedWorkspace.songs);
        setSavedSongs(cloneSong(mergedWorkspace.songs));
        setSetlists(mergedWorkspace.setlists);
        setSavedSetlists(cloneSong(mergedWorkspace.setlists));
        setProjects(mergedWorkspace.projects);
        setSavedProjects(cloneSong(mergedWorkspace.projects));
        setJoinedSetlists(remoteWorkspace.joinedSetlists);
        setJoinedProjects(remoteWorkspace.joinedProjects ?? []);
        setLastSavedAt(savedAt);
        setSyncStatus('saved');
      } catch {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      }
    };

    const handleOnline = () => {
      void flushPending();
    };

    void flushPending();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [authenticatedUser]);

  useEffect(() => {
    if (!isAutoSaveEnabled || !workspaceIsDirty) {
      return;
    }

    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      void persistWorkspace(songs, setlists).catch(() => {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      });
      autoSaveTimeoutRef.current = null;
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [isAutoSaveEnabled, setlists, songs, workspaceIsDirty]);

  // Latest-snapshot ref read by the exit flush below. Updated every render so
  // the (once-registered) listeners always see the current workspace.
  const exitFlushRef = useRef({ songs, setlists, projects, isDirty: workspaceIsDirty, isTeam: isTeamWorkspace, isCloud: isCloudMode });
  exitFlushRef.current = { songs, setlists, projects, isDirty: workspaceIsDirty, isTeam: isTeamWorkspace, isCloud: isCloudMode };

  // Persist unsaved edits when the tab/app is hidden or closed. Without this,
  // leaving while the workspace is dirty (and before the next save or song
  // switch) drops the change: the cloud-first reload has nothing local to
  // reconcile against. Queuing it to pendingSync lets the existing
  // merge-by-updatedAt path fold it back in on the next load. Mirrors
  // persistWorkspace: team workspaces never queue offline, so skip them.
  useEffect(() => {
    const flushOnExit = () => {
      const snapshot = exitFlushRef.current;
      if (!snapshot.isDirty || snapshot.isTeam) {
        return;
      }
      const savedAt = Date.now();
      // Cloud users: queue for the merge-by-updatedAt path on next load. (For
      // anonymous users the local cache below is enough, and a pending blob
      // would otherwise muddy the sign-in import flow.)
      if (snapshot.isCloud) {
        savePendingSync({
          songs: cloneSong(snapshot.songs),
          setlists: cloneSong(snapshot.setlists),
          projects: cloneSong(snapshot.projects),
          savedAt
        });
      }
      // Refresh the local cache so the next launch (and the pre-auth first
      // render) reflects the unsaved edits instead of stale last-saved data.
      try {
        window.localStorage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(snapshot.songs));
        window.localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(snapshot.setlists));
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot.projects));
        window.localStorage.setItem(LAST_SAVED_AT_STORAGE_KEY, String(savedAt));
      } catch {
        // Ignore cache write failures; pendingSync still carries the edits.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushOnExit();
      }
    };

    window.addEventListener('pagehide', flushOnExit);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushOnExit);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (authenticatedUser && !activeLibraryId) {
      return;
    }

    try {
      persistSelectedSongId(activeLibraryId, selectedSongId);
      if (activeCloudLibrary?.kind === 'personal') {
        persistSelectedSongId(null, selectedSongId);
      }
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [activeCloudLibrary?.kind, activeLibraryId, authenticatedUser, selectedSongId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SETLIST_PROJECT_FILTER_STORAGE_KEY,
        serializeSetlistProjectFilter(setlistProjectFilter)
      );
      if (setlistProjectFilter.kind === 'owned-project') {
        window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, setlistProjectFilter.projectId);
      } else {
        window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [setlistProjectFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GUITARIST_MODE_STORAGE_KEY, guitaristMode ? 'true' : 'false');
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [guitaristMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREVIEW_QUICK_EDIT_STORAGE_KEY, isPreviewQuickEditEnabled ? 'true' : 'false');
    } catch {
      // Preference persistence is optional; editing remains usable in memory.
    }
  }, [isPreviewQuickEditEnabled]);

  useEffect(() => {
    try {
      if (selectedSetlistId) {
        window.localStorage.setItem(SELECTED_SETLIST_STORAGE_KEY, selectedSetlistId);
      } else {
        window.localStorage.removeItem(SELECTED_SETLIST_STORAGE_KEY);
      }

      if (selectedSetlistSongId) {
        window.localStorage.setItem(SELECTED_SETLIST_SONG_STORAGE_KEY, selectedSetlistSongId);
      } else {
        window.localStorage.removeItem(SELECTED_SETLIST_SONG_STORAGE_KEY);
      }

      window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, workspaceMode);
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }, [selectedSetlistId, selectedSetlistSongId, workspaceMode]);

  useEffect(() => {
    setSelectedLibrarySongIds((currentIds) =>
      currentIds.filter((id) => songs.some((item) => item.id === id))
    );
  }, [songs]);

  useEffect(() => {
    setSelectedSetlistId((currentId) => {
      if (!currentId) {
        return firstAvailableSetlist?.id ?? null;
      }

      const inOwned = setlists.some((item) => item.id === currentId);
      const inJoined = joinedSetlists.some((item) => item.id === currentId);
      const inJoinedProject = allJoinedProjectSetlists.some((item) => item.id === currentId);
      return inOwned || inJoined || inJoinedProject
        ? currentId
        : firstAvailableSetlist?.id ?? null;
    });
  }, [allJoinedProjectSetlists, firstAvailableSetlist?.id, joinedSetlists, setlists]);

  useEffect(() => {
    const activeSetlist = setlists.find((item) => item.id === selectedSetlistId)
      ?? joinedSetlists.find((item) => item.id === selectedSetlistId)
      ?? allJoinedProjectSetlists.find((item) => item.id === selectedSetlistId)
      ?? null;
    if (!activeSetlist) {
      setSelectedSetlistSongId(null);
      return;
    }

    setSelectedSetlistSongId((currentId) => (
      currentId && activeSetlist.songs.some((item) => item.id === currentId)
        ? currentId
        : activeSetlist.songs[0]?.id ?? null
    ));
  }, [allJoinedProjectSetlists, joinedSetlists, selectedSetlistId, setlists]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (googleUser) {
      window.localStorage.setItem(GOOGLE_SESSION_STORAGE_KEY, JSON.stringify(googleUser));
      return;
    }

    window.localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
  }, [googleUser]);

  useEffect(() => {
    if (!isLibraryEditing && selectedLibrarySongIds.length > 0) {
      setSelectedLibrarySongIds([]);
    }
  }, [isLibraryEditing, selectedLibrarySongIds.length]);

  useEffect(() => {
    if (isEditing && !canOpenEditor) {
      setIsEditing(false);
    }
  }, [canOpenEditor, isEditing]);

  useEffect(() => {
    const handleSaveKeyDown = (event: KeyboardEvent) => {
      const isMetaKey = event.ctrlKey || event.metaKey;

      if (isMetaKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSaveLibrary();
      }
    };

    window.addEventListener('keydown', handleSaveKeyDown);
    return () => window.removeEventListener('keydown', handleSaveKeyDown);
  }, [songs, song, selectedSongId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (setlistActionsMenuRef.current && !setlistActionsMenuRef.current.contains(event.target as Node)) {
        setIsSetlistActionsMenuOpen(false);
      }

      if (toolbarOverflowMenuRef.current && !toolbarOverflowMenuRef.current.contains(event.target as Node)) {
        setIsToolbarOverflowMenuOpen(false);
      }

      if (googleAccountMenuRef.current && !googleAccountMenuRef.current.contains(event.target as Node)) {
        setIsGoogleAccountMenuOpen(false);
      }
    };

    const handleEscapeKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setIsSetlistActionsMenuOpen(false);
      setIsToolbarOverflowMenuOpen(false);
      setIsGoogleAccountMenuOpen(false);
      setIsMobileActionsSheetOpen(false);
      setIsMobileMetadataOpen(false);
      setIsMobileNavOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscapeKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscapeKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isSheetView || isSetlistMode || !isToolbarSecondaryCollapsed) {
      setIsToolbarOverflowMenuOpen(false);
    }
  }, [isSetlistMode, isSheetView, isToolbarSecondaryCollapsed]);

  useEffect(() => {
    if (!usesDenseDesktopHeader) {
      setIsGoogleAccountMenuOpen(false);
    }
  }, [usesDenseDesktopHeader]);

  useEffect(() => {
    if (isPhoneViewport) {
      setIsToolbarOverflowMenuOpen(false);
      setIsGoogleAccountMenuOpen(false);
      return;
    }

    setIsMobileNavOpen(false);
    setIsMobileActionsSheetOpen(false);
    setIsMobileMetadataOpen(false);
  }, [isPhoneViewport]);

  useEffect(() => {
    if (!isEditing) {
      setIsMobileMetadataOpen(false);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isSheetView) {
      setIsMobileActionsSheetOpen(false);
      setIsMobileMetadataOpen(false);
    }
  }, [isSheetView]);

  useEffect(() => {
    if (!isPhoneViewport) {
      return;
    }

    if (activeAppView === 'sheet') {
      return;
    }

    setIsMobileNavOpen(false);
  }, [activeAppView, isPhoneViewport, selectedSongId, workspaceMode]);

  useEffect(() => {
    return () => {
      if (editorFocusTimeoutRef.current !== null) {
        window.clearTimeout(editorFocusTimeoutRef.current);
      }
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showGoogleAuth) {
      setGoogleAuthError(null);
      return;
    }

    let isCancelled = false;

    const setupGoogleIdentity = async () => {
      try {
        await loadGoogleIdentityScript();

        if (isCancelled || !window.google?.accounts?.id) {
          return;
        }

        if (!googleIdentityInitializedRef.current) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (response) => {
              const nextSession = response.credential ? parseGoogleCredential(response.credential) : null;
              if (!nextSession) {
                setGoogleAuthError(copy.googleCredentialError);
                return;
              }

              setGoogleUser(nextSession);
              setGoogleAuthError(null);
            },
            auto_select: false,
            cancel_on_tap_outside: true
          });
          googleIdentityInitializedRef.current = true;
        }

        if (googleSignInRef.current) {
          googleSignInRef.current.innerHTML = '';

          if (!googleUser) {
            window.google.accounts.id.renderButton(googleSignInRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'medium',
              shape: 'pill',
              text: 'signin_with',
              width: 220
            });
          }
        }

        setGoogleAuthError(null);
      } catch {
        if (!isCancelled) {
          setGoogleAuthError(copy.googleLoadError);
        }
      }
    };

    setupGoogleIdentity();

    return () => {
      isCancelled = true;
    };
  }, [copy.googleCredentialError, copy.googleLoadError, googleClientId, googleUser, isMobileActionsSheetOpen, isPhoneViewport, showGoogleAuth]);

  const focusEditorField = React.useCallback((sIdx: number, bIdx: number, field: EditorFocusField, instant = false) => {
    setEditorFocusRequest({
      sIdx,
      bIdx,
      field,
      requestId: editorFocusRequestIdRef.current += 1,
      instant
    });
  }, []);

  const findPreviewAnchorRect = React.useCallback((anchorKey: string): PreviewAnchorRect | null => {
    const root = sheetRef.current;
    if (!root) return null;
    const anchors = Array.from(root.querySelectorAll('[data-preview-edit-anchor]')) as HTMLElement[];
    const node = anchors
      .find((candidate) => candidate.dataset.previewEditAnchor === anchorKey);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }, []);

  const refreshPreviewEditAnchorRect = React.useCallback(() => {
    setPreviewMetaEditTarget((current) => {
      if (!current) return current;
      const anchorRect = findPreviewAnchorRect(current.anchorKey);
      if (!anchorRect) return null;
      return { ...current, anchorRect };
    });
    setPreviewEditSession((current) => {
      if (!current) return current;
      const anchorRect = findPreviewAnchorRect(current.target.anchorKey);
      return anchorRect
        ? { ...current, target: { ...current.target, anchorRect } }
        : current;
    });
    setPreviewSectionActionTarget((current) => {
      if (!current) return current;
      const anchorRect = findPreviewAnchorRect(current.anchorKey);
      return anchorRect ? { ...current, anchorRect } : null;
    });
  }, [findPreviewAnchorRect]);

  const getPreviewIdentityForCurrentMode = React.useCallback(() => (
    isSetlistMode ? (selectedSetlistSong?.id ?? null) : (song?.id ?? null)
  ), [isSetlistMode, selectedSetlistSong?.id, song?.id]);

  const commitPreviewEditSession = React.useCallback((session: PreviewEditSession | null = previewEditSession) => {
    if (!session?.dirty) {
      setPreviewEditSession(null);
      return;
    }
    if (isSetlistMode && session.previewIdentity === selectedSetlistSong?.id) {
      handleSetlistSongContentChange(session.draftSong);
    } else if (!isSetlistMode && session.previewIdentity === song?.id) {
      handleSongChange(session.draftSong);
    }
    setPreviewEditSession(null);
  }, [handleSetlistSongContentChange, handleSongChange, isSetlistMode, previewEditSession, selectedSetlistSong?.id, song?.id]);

  const openPreviewSectionTitleEditor = React.useCallback((target: PreviewSectionActionTarget) => {
    const editorSong = activeEditorSong;
    if (!editorSong || target.previewIdentity !== activePreviewIdentity) return;
    const editableSong = ensureSongEditingIds(editorSong);
    const section = editableSong.sections.find((candidate) => candidate.id === target.sectionId);
    if (!section?.id) return;

    if (!hasFinePointer) {
      const proxyInput = mobileWysiwygKeyboardProxyInputRef.current;
      if (proxyInput) {
        proxyInput.setAttribute('inputmode', 'text');
        proxyInput.focus({ preventScroll: true });
      }
    }

    const nextSession = createPreviewEditSession({
      song: editableSong,
      target: {
        kind: 'section',
        previewIdentity: target.previewIdentity,
        sectionId: section.id,
        barId: section.bars[0]?.id ?? '',
        field: 'sectionName',
        slotIndex: 0,
        rawChordIndex: null,
        anchorKey: target.anchorKey,
        anchorRect: findPreviewAnchorRect(target.anchorKey) ?? target.anchorRect
      },
      inputMode: 'letters'
    });
    setPreviewSectionActionTarget(null);
    setPreviewEditSession(nextSession);
    window.requestAnimationFrame(refreshPreviewEditAnchorRect);
  }, [activeEditorSong, activePreviewIdentity, findPreviewAnchorRect, hasFinePointer, refreshPreviewEditAnchorRect]);

  const finishPreviewSectionAction = React.useCallback((action: 'duplicate' | 'delete') => {
    const target = previewSectionActionTarget;
    const editorSong = activeEditorSong;
    if (!target || !editorSong || target.previewIdentity !== activePreviewIdentity) return;
    if (action === 'delete' && editorSong.sections.length <= 1) return;
    if (action === 'delete') {
      const confirmed = window.confirm(
        language === 'zh'
          ? `要刪除「${target.title.trim() || '未命名段落'}」嗎？`
          : `Delete "${target.title.trim() || 'Untitled section'}"?`
      );
      if (!confirmed) return;
    }

    const editableSong = ensureSongEditingIds(editorSong);
    const result = action === 'duplicate'
      ? duplicateSection(editableSong, target.sectionId)
      : null;
    const nextSong = result?.song ?? deleteSection(editableSong, target.sectionId);
    if (nextSong === editableSong) return;

    if (isSetlistMode) {
      handleSetlistSongContentChange(nextSong);
    } else {
      handleSongChange(nextSong);
    }

    const nextActiveSectionId = result?.sectionId
      ?? nextSong.sections.find((section) => section.id === target.sectionId)?.id
      ?? nextSong.sections[Math.max(0, editorSong.sections.findIndex((section) => section.id === target.sectionId) - 1)]?.id
      ?? nextSong.sections[0]?.id
      ?? null;
    setPreviewSectionActionTarget(null);
    setPreviewEditSession(null);
    setActiveSectionId(nextActiveSectionId);
    if (nextActiveSectionId) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        sheetRef.current
          ?.querySelector<HTMLElement>(`[data-preview-section-id="${CSS.escape(nextActiveSectionId)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
    }
  }, [activeEditorSong, activePreviewIdentity, handleSetlistSongContentChange, handleSongChange, isSetlistMode, language, previewSectionActionTarget]);

  React.useEffect(() => {
    if (previewSectionActionTarget && previewSectionActionTarget.previewIdentity !== activePreviewIdentity) {
      setPreviewSectionActionTarget(null);
    }
  }, [activePreviewIdentity, previewSectionActionTarget]);

  React.useEffect(() => {
    if (!activePreviewEditSession || activePreviewEditSession.target.field === 'sectionName') return;
    const finishOnPreviewBlankClick = (event: MouseEvent) => {
      if (suppressPreviewClickRef.current || !(event.target instanceof Element)) return;
      if (!event.target.closest('[data-print-preview-container]')) return;
      const keepsEditing = event.target.closest(
        '.sheet-bar, [data-preview-edit-anchor], [data-preview-edit-hit], button, a, input, textarea, select, [role="button"]'
      );
      if (!keepsEditing) commitPreviewEditSession(activePreviewEditSession);
    };
    document.addEventListener('click', finishOnPreviewBlankClick, true);
    return () => document.removeEventListener('click', finishOnPreviewBlankClick, true);
  }, [activePreviewEditSession, commitPreviewEditSession]);

  const applyPreviewEditDraft = React.useCallback((nextSong: Song, options?: { mergeKey?: string }) => {
    setPreviewEditSession((current) => {
      if (!current) return current;
      const nextSession = applyPreviewDraft(current, nextSong, options);
      if (current.target.kind !== 'bar' || current.target.field !== 'chords') return nextSession;
      const located = findSongBar(nextSong, current.target);
      if (!located) return nextSession;
      const beatCount = getBeatCount(nextSong, located.bar);
      const ownerSlotIndex = getChordDisplaySlotOwnership(located.bar.chords, beatCount)[current.target.slotIndex]?.ownerSlotIndex;
      if (ownerSlotIndex === undefined || ownerSlotIndex === current.target.slotIndex) return nextSession;
      const anchorKey = `${current.previewIdentity}|${current.target.sectionId}|${current.target.barId}|chords|${ownerSlotIndex}`;
      return retargetPreviewEditSession(nextSession, {
        ...current.target,
        slotIndex: ownerSlotIndex,
        rawChordIndex: getChordBeatSlots(located.bar, beatCount)[ownerSlotIndex]?.rawChordIndex ?? null,
        anchorKey,
        anchorRect: findPreviewAnchorRect(anchorKey) ?? current.target.anchorRect
      });
    });
    window.requestAnimationFrame(refreshPreviewEditAnchorRect);
  }, [findPreviewAnchorRect, refreshPreviewEditAnchorRect]);

  const handleActiveEditorSongChange = React.useCallback((nextSong: Song) => {
    if (activePreviewEditSession) {
      applyPreviewEditDraft(nextSong);
    } else if (isSetlistMode) {
      handleSetlistSongContentChange(nextSong);
    } else {
      handleSongChange(nextSong);
    }
  }, [activePreviewEditSession, applyPreviewEditDraft, handleSetlistSongContentChange, handleSongChange, isSetlistMode]);

  const handlePreviewSectionTitleChange = React.useCallback((title: string) => {
    setPreviewEditSession((current) => {
      if (!current || current.target.field !== 'sectionName') return current;
      const nextSong = updateSectionTitle(current.draftSong, current.target.sectionId, title);
      return applyPreviewDraft(current, nextSong, {
        mergeKey: `section-title:${current.target.sectionId}`
      });
    });
  }, []);

  const finishPreviewSectionTitleEdit = React.useCallback((title: string) => {
    const session = previewEditSession;
    if (!session || session.target.field !== 'sectionName') return;
    const nextSong = finalizeSectionTitleEdit({
      baseSong: session.baseSong,
      draftSong: session.draftSong,
      sectionId: session.target.sectionId,
      title
    });

    const nextSession = applyPreviewDraft(session, nextSong);
    commitPreviewEditSession(nextSession);
  }, [commitPreviewEditSession, previewEditSession]);

  const makePreviewTargetAnchorKey = React.useCallback((previewIdentity: string, sectionId: string, barId: string, slotIndex: number) => (
    `${previewIdentity}|${sectionId}|${barId}|chords|${slotIndex}`
  ), []);

  const handlePreviewEditNavigate = React.useCallback((direction: 'previous' | 'next') => {
    setPreviewEditSession((current) => {
      if (!current || current.target.kind !== 'bar') return current;
      const located = findSongBar(current.draftSong, current.target);
      if (!located) return current;
      const beatCount = getBeatCount(current.draftSong, located.bar);
      if (direction === 'previous' && current.target.slotIndex > 0) {
        const requestedSlotIndex = current.target.slotIndex - 1;
        const slotIndex = getChordDisplaySlotOwnership(located.bar.chords, beatCount)[requestedSlotIndex]?.ownerSlotIndex
          ?? requestedSlotIndex;
        const anchorKey = makePreviewTargetAnchorKey(current.previewIdentity, current.target.sectionId, current.target.barId, slotIndex);
        return retargetPreviewEditSession(current, {
          ...current.target,
          slotIndex,
          rawChordIndex: null,
          anchorKey,
          anchorRect: findPreviewAnchorRect(anchorKey) ?? current.target.anchorRect
        });
      }
      const currentOwnership = getChordDisplaySlotOwnership(located.bar.chords, beatCount)[current.target.slotIndex];
      const nextSlotIndex = current.target.slotIndex + (currentOwnership?.span ?? 1);
      if (direction === 'next' && nextSlotIndex < beatCount) {
        const slotIndex = getChordDisplaySlotOwnership(located.bar.chords, beatCount)[nextSlotIndex]?.ownerSlotIndex
          ?? nextSlotIndex;
        const anchorKey = makePreviewTargetAnchorKey(current.previewIdentity, current.target.sectionId, current.target.barId, slotIndex);
        return retargetPreviewEditSession(current, {
          ...current.target,
          slotIndex,
          rawChordIndex: null,
          anchorKey,
          anchorRect: findPreviewAnchorRect(anchorKey) ?? current.target.anchorRect
        });
      }

      if (direction === 'previous') {
        const previousSection = current.draftSong.sections[located.sectionIndex - 1];
        const previousBar = located.section.bars[located.barIndex - 1]
          ?? previousSection?.bars.at(-1);
        if (!previousBar?.id) return current;
        const previousSectionId = located.barIndex > 0 ? current.target.sectionId : previousSection?.id;
        if (!previousSectionId) return current;
        const previousBeatCount = getBeatCount(current.draftSong, previousBar);
        const lastSlotIndex = previousBeatCount - 1;
        const slotIndex = getChordDisplaySlotOwnership(previousBar.chords, previousBeatCount)[lastSlotIndex]?.ownerSlotIndex
          ?? lastSlotIndex;
        const anchorKey = makePreviewTargetAnchorKey(current.previewIdentity, previousSectionId, previousBar.id, slotIndex);
        return retargetPreviewEditSession(current, {
          ...current.target,
          sectionId: previousSectionId,
          barId: previousBar.id,
          slotIndex,
          rawChordIndex: null,
          anchorKey,
          anchorRect: findPreviewAnchorRect(anchorKey) ?? current.target.anchorRect
        });
      }

      let draftSong = current.draftSong;
      const followingSection = current.draftSong.sections[located.sectionIndex + 1];
      let nextSectionId = current.target.sectionId;
      let nextBar = located.section.bars[located.barIndex + 1];
      if (!nextBar && followingSection?.bars[0]) {
        nextBar = followingSection.bars[0];
        nextSectionId = followingSection.id ?? nextSectionId;
      }
      if (!nextBar) {
        nextBar = createEmptyBar();
        draftSong = insertBar(draftSong, current.target, 'after', nextBar);
      }
      if (!nextBar.id) return current;
      const anchorKey = makePreviewTargetAnchorKey(current.previewIdentity, nextSectionId, nextBar.id, 0);
      const withDraft = draftSong === current.draftSong ? current : applyPreviewDraft(current, draftSong);
      return retargetPreviewEditSession(withDraft, {
        ...current.target,
        sectionId: nextSectionId,
        barId: nextBar.id,
        slotIndex: 0 as const,
        rawChordIndex: null as null,
        anchorKey,
        anchorRect: findPreviewAnchorRect(anchorKey) ?? current.target.anchorRect
      });
    });
    window.requestAnimationFrame(() => {
      refreshPreviewEditAnchorRect();
    });
  }, [findPreviewAnchorRect, makePreviewTargetAnchorKey, refreshPreviewEditAnchorRect]);

  const handlePreviewEditStructure = React.useCallback((action: 'insert-before' | 'insert-after' | 'duplicate' | 'delete' | 'split-section') => {
    if (action === 'split-section') {
      const current = previewEditSession;
      if (!current || current.target.kind !== 'bar') return;
      const located = findSongBar(current.draftSong, current.target);
      if (!located) return;

      const settledSong = current.draftSong;
      if (current.dirty) commitPreviewEditSession(current);
      const result = splitSectionAtBar(settledSong, current.target);
      const sectionId = result.sectionId;
      const section = result.song.sections.find((candidate) => candidate.id === sectionId);
      if (!section?.id) return;
      const anchorKey = `${current.previewIdentity}|${section.id}|section|sectionName|title`;
      const sectionTarget = {
        kind: 'section' as const,
        previewIdentity: current.previewIdentity,
        sectionId: section.id,
        barId: result.firstBarId ?? section.bars[0]?.id ?? '',
        field: 'sectionName' as const,
        slotIndex: 0 as const,
        rawChordIndex: null as null,
        anchorKey,
        anchorRect: findPreviewAnchorRect(anchorKey) ?? current.target.anchorRect
      };
      let nextSession = createPreviewEditSession({ song: settledSong, target: sectionTarget, inputMode: 'letters' });
      if (result.created) nextSession = applyPreviewDraft(nextSession, result.song);
      setPreviewEditSession(nextSession);
      setActiveSectionId(section.id);
      window.requestAnimationFrame(refreshPreviewEditAnchorRect);
      return;
    }

    setPreviewEditSession((current) => {
      if (!current || current.target.kind !== 'bar') return current;
      const located = findSongBar(current.draftSong, current.target);
      if (!located) return current;
      let draftSong = current.draftSong;
      let targetBarId = current.target.barId;

      if (action === 'insert-before' || action === 'insert-after') {
        const newBar = createEmptyBar();
        draftSong = insertBar(draftSong, current.target, action === 'insert-before' ? 'before' : 'after', newBar);
        targetBarId = newBar.id!;
      } else if (action === 'duplicate') {
        draftSong = duplicateBar(draftSong, current.target);
        const nextLocated = findSongBar(draftSong, current.target);
        targetBarId = nextLocated?.section.bars[nextLocated.barIndex + 1]?.id ?? targetBarId;
      } else {
        draftSong = deleteBar(draftSong, current.target);
        const sameSection = draftSong.sections.find((section) => section.id === current.target.sectionId);
        targetBarId = sameSection?.bars[Math.max(0, Math.min(located.barIndex - 1, sameSection.bars.length - 1))]?.id
          ?? draftSong.sections.flatMap((section) => section.bars).find((candidate) => candidate.id)?.id
          ?? targetBarId;
      }

      const nextSession = applyPreviewDraft(current, draftSong);
      const targetSection = draftSong.sections.find((section) => section.bars.some((candidate) => candidate.id === targetBarId));
      if (!targetSection?.id || !targetBarId) return markPreviewTargetDeleted(nextSession);
      const anchorKey = makePreviewTargetAnchorKey(current.previewIdentity, targetSection.id, targetBarId, 0);
      return retargetPreviewEditSession(nextSession, {
        ...current.target,
        sectionId: targetSection.id,
        barId: targetBarId,
        slotIndex: 0 as const,
        rawChordIndex: null as null,
        anchorKey,
        anchorRect: findPreviewAnchorRect(anchorKey) ?? current.target.anchorRect
      });
    });
    window.requestAnimationFrame(refreshPreviewEditAnchorRect);
  }, [commitPreviewEditSession, findPreviewAnchorRect, makePreviewTargetAnchorKey, previewEditSession, refreshPreviewEditAnchorRect]);

  const handlePreviewSectionReorder = React.useCallback((
    sourceSectionId: string,
    targetSectionId: string,
    placement: 'before' | 'after'
  ) => {
    const editableSong = activePreviewEditSession?.draftSong ?? activeEditorSong;
    if (!editableSong) return;

    if (isSetlistMode) {
      if (!canEditSelectedSetlist || !selectedSetlistSong || !activeSetlistEditableSong) return;
      const displayedSong = activeDraftNavigationPreviewSong ?? activeNavigationPreviewSong ?? editableSong;
      const displayedOrder = getDefaultSectionOrder(displayedSong);
      const nextOrder = reorderSetlistSectionOrder(displayedOrder, sourceSectionId, targetSectionId, placement);
      if (nextOrder === displayedOrder || nextOrder.every((sectionId, index) => sectionId === displayedOrder[index])) return;

      pushSetlistSongHistory(selectedSetlistSong.id, activeSetlistEditableSong, selectedSetlistSong.sectionOrder);
      handleUpdateSetlistSong(selectedSetlistSong.id, (currentSetlistSong) => ({
        ...currentSetlistSong,
        overrideKey: currentSetlistSong.overrideKey ?? editableSong.currentKey,
        capo: editableSong.capo ?? 0,
        sectionOrder: nextOrder,
        songData: cloneSong(normalizeSongBars(editableSong))
      }));
      setPreviewEditSession(null);
      setActiveSectionId(sourceSectionId);
      return;
    }

    if (!canEditTeamSongs) return;
    const nextSong = reorderSection(editableSong, sourceSectionId, targetSectionId, placement);
    if (nextSong === editableSong) return;
    handleSongChange(nextSong);
    setPreviewEditSession(null);
    setActiveSectionId(sourceSectionId);
  }, [activeDraftNavigationPreviewSong, activeEditorSong, activeNavigationPreviewSong, activePreviewEditSession, activeSetlistEditableSong, canEditSelectedSetlist, canEditTeamSongs, handleSongChange, handleUpdateSetlistSong, isSetlistMode, selectedSetlistSong]);

  const handleElementClick = React.useCallback((sIdx: number, bIdx: number, field: ChordSheetElementField, target?: ChordSheetElementTarget) => {
    const editorSong = activeDraftEditorSong ?? activeEditorSong;
    const navigationSong = activeDraftNavigationPreviewSong ?? activeNavigationPreviewSong;
    if (!editorSong || !navigationSong) {
      return;
    }

    const previewSection = navigationSong.sections[sIdx] ?? null;
    const nextSectionId = previewSection?.id ?? null;
    const mappedSectionIndex = nextSectionId
      ? editorSong.sections.findIndex((section) => section.id === nextSectionId)
      : sIdx;
    const nextSectionIndex = mappedSectionIndex >= 0 ? mappedSectionIndex : sIdx;

    setActiveSectionId(nextSectionId ?? editorSong.sections[nextSectionIndex]?.id ?? null);
    setActiveBar({ sIdx: nextSectionIndex, bIdx });
    setPreviewMetaEditTarget(null);
    if (!canOpenEditor) {
      return;
    }

    if (isPreviewQuickEditEnabled && field === 'sectionName') {
      const previewIdentity = target?.previewIdentity ?? getPreviewIdentityForCurrentMode();
      if (!previewIdentity) return;
      if (bIdx < 0 && target?.sectionId) {
        if (activePreviewEditSession) commitPreviewEditSession(activePreviewEditSession);
        const section = editorSong.sections.find((candidate) => candidate.id === target.sectionId)
          ?? editorSong.sections[nextSectionIndex];
        if (!section?.id) return;
        setPreviewSectionActionTarget({
          previewIdentity,
          sectionId: section.id,
          title: section.title,
          anchorKey: target.anchorKey,
          anchorRect: target.anchorRect
        });
        return;
      }
      if (!hasFinePointer) {
        const proxyInput = mobileWysiwygKeyboardProxyInputRef.current;
        if (proxyInput) {
          proxyInput.setAttribute('inputmode', 'text');
          proxyInput.focus({ preventScroll: true });
        }
      }

      if (activePreviewEditSession) commitPreviewEditSession(activePreviewEditSession);
      const editableSong = ensureSongEditingIds(editorSong);
      const sourceSection = (target?.sectionId
        ? editableSong.sections.find((section) => section.id === target.sectionId)
        : null) ?? editableSong.sections[nextSectionIndex];
      if (!sourceSection?.id) return;
      const splitBar = bIdx >= 0
        ? (target?.barId ? sourceSection.bars.find((bar) => bar.id === target.barId) : null)
          ?? sourceSection.bars[bIdx]
        : null;
      const baseTarget = {
        kind: 'section' as const,
        previewIdentity,
        sectionId: sourceSection.id,
        barId: splitBar?.id ?? sourceSection.bars[0]?.id ?? '',
        field: 'sectionName' as const,
        slotIndex: 0 as const,
        rawChordIndex: null as null,
        anchorKey: target?.anchorKey ?? `${previewIdentity}|${sourceSection.id}|section|sectionName|title`,
        anchorRect: target?.anchorRect ?? { left: 16, top: 16, right: 136, bottom: 50, width: 120, height: 34 }
      };
      let nextSession = createPreviewEditSession({ song: editableSong, target: baseTarget, inputMode: 'letters' });

      if (splitBar?.id) {
        const result = splitSectionAtBar(editableSong, { sectionId: sourceSection.id, barId: splitBar.id });
        if (result.created) {
          nextSession = applyPreviewDraft(nextSession, result.song);
          const anchorKey = `${previewIdentity}|${result.sectionId}|section|sectionName|title`;
          nextSession = retargetPreviewEditSession(nextSession, {
            ...baseTarget,
            sectionId: result.sectionId,
            barId: result.firstBarId ?? '',
            anchorKey,
            anchorRect: findPreviewAnchorRect(anchorKey) ?? baseTarget.anchorRect
          });
          setActiveSectionId(result.sectionId);
        }
      }

      setPreviewEditSession(nextSession);
      window.requestAnimationFrame(refreshPreviewEditAnchorRect);
      return;
    }

    const previewField: PreviewEditField | null = field === 'chords'
      ? 'chords'
      : field === 'marker'
        ? 'symbols'
        : field === 'label' || field === 'annotation'
          ? 'text'
          : null;
    if (isPreviewQuickEditEnabled && previewField && bIdx >= 0) {
      const previewIdentity = target?.previewIdentity ?? getPreviewIdentityForCurrentMode();
      if (previewIdentity) {
        const requestedSlotIndex = target?.slotIndex ?? 0;
        const previewBar = previewSection?.bars[bIdx];
        const tappedSlotIndex = previewField === 'chords' && previewBar
          ? resolvePreviewChordSlotIndex(previewBar, getBeatCount(navigationSong, previewBar), requestedSlotIndex)
          : requestedSlotIndex;
        setPreviewEditSession((current) => {
          const currentDraft = current?.previewIdentity === previewIdentity ? current : null;
          const editableSong = currentDraft ? currentDraft.draftSong : ensureSongEditingIds(editorSong);
          const sectionById = target?.sectionId
            ? editableSong.sections.find((section) => section.id === target.sectionId)
            : null;
          const editableSection = sectionById
            ?? editableSong.sections.find((section) => section.id === nextSectionId)
            ?? editableSong.sections[nextSectionIndex];
          const editableBar = (target?.barId
            ? editableSection?.bars.find((bar) => bar.id === target.barId)
              ?? editableSong.sections.flatMap((section) => section.bars).find((bar) => bar.id === target.barId)
            : null)
            ?? editableSection?.bars[bIdx];
          const actualSection = editableBar
            ? editableSong.sections.find((section) => section.bars.some((bar) => bar.id === editableBar.id))
            : null;
          if (!actualSection?.id || !editableBar?.id) return current;

          const editableBeatCount = getBeatCount(editableSong, editableBar);
          const slotIndex = previewField === 'chords'
            ? resolvePreviewChordSlotIndex(editableBar, editableBeatCount, tappedSlotIndex)
            : tappedSlotIndex;
          const anchorKey = makePreviewTargetAnchorKey(previewIdentity, actualSection.id, editableBar.id, slotIndex);
          const nextTarget = {
            kind: 'bar' as const,
            previewIdentity,
            sectionId: actualSection.id,
            barId: editableBar.id,
            field: previewField,
            slotIndex,
            rawChordIndex: previewField === 'chords'
              ? getChordBeatSlots(editableBar, editableBeatCount)[slotIndex]?.rawChordIndex ?? null
              : target?.rawChordIndex ?? null,
            anchorKey,
            anchorRect: findPreviewAnchorRect(anchorKey) ?? target?.anchorRect ?? {
              left: 16, top: 16, right: 32, bottom: 32, width: 16, height: 16
            }
          };
          return currentDraft
            ? retargetPreviewEditSession(currentDraft, nextTarget)
            : createPreviewEditSession({
                song: editableSong,
                target: nextTarget,
                inputMode: getChordStorageModeForTarget(editableSong, nextTarget)
              });
        });
        return;
      }
    }

    if (editorFocusTimeoutRef.current !== null) {
      window.clearTimeout(editorFocusTimeoutRef.current);
      editorFocusTimeoutRef.current = null;
    }

    if (!isEditing) {
      setIsEditing(true);
      editorFocusTimeoutRef.current = window.setTimeout(() => {
        focusEditorField(nextSectionIndex, bIdx, field, true);
        editorFocusTimeoutRef.current = null;
      }, 500);
    } else {
      focusEditorField(nextSectionIndex, bIdx, field);
    }
  }, [activeDraftEditorSong, activeDraftNavigationPreviewSong, activeEditorSong, activeNavigationPreviewSong, activePreviewEditSession, canOpenEditor, commitPreviewEditSession, findPreviewAnchorRect, focusEditorField, getPreviewIdentityForCurrentMode, hasFinePointer, isEditing, isPreviewQuickEditEnabled, makePreviewTargetAnchorKey, previewEditorDeviceLayout, refreshPreviewEditAnchorRect]);

  const handleMetaClick = React.useCallback((field: ChordSheetMetaField, meta: ChordSheetElementClickMeta) => {
    if (!canOpenEditor) {
      return;
    }

    if (previewEditSession?.dirty) {
      pendingPreviewTransitionRef.current = () => {
        const previewIdentity = getPreviewIdentityForCurrentMode();
        const anchorKey = meta.anchorKey ?? getChordSheetMetaAnchorKey(previewIdentity, field);
        const anchorRect = meta.anchorRect ?? findPreviewAnchorRect(anchorKey);
        if (!anchorRect) return;
        if (!hasFinePointer && (field === 'title' || field === 'credits' || field === 'tempo' || field === 'timeSignature')) {
          const proxyInput = mobileWysiwygKeyboardProxyInputRef.current;
          proxyInput?.focus({ preventScroll: true });
        }
        setPreviewEditSession(null);
        setPreviewMetaEditTarget({ field, anchorKey, anchorRect, previewIdentity });
      };
      setIsPreviewEditExitPromptOpen(true);
      return;
    }
    if (previewEditSession) {
      setPreviewEditSession(null);
    }

    // iOS only opens the software keyboard when focus happens inside the
    // original touch/click gesture. The real WYSIWYG input mounts after state
    // changes, so prime the keyboard with a tiny proxy input first and then let
    // PreviewWysiwygEditor move focus to the actual field.
    if (!hasFinePointer && (field === 'title' || field === 'credits' || field === 'tempo' || field === 'timeSignature')) {
      const proxyInput = mobileWysiwygKeyboardProxyInputRef.current;
      if (proxyInput) {
        proxyInput.setAttribute('inputmode', field === 'tempo' || field === 'timeSignature' ? 'numeric' : 'text');
        proxyInput.value = '';
        proxyInput.focus({ preventScroll: true });
        try {
          proxyInput.setSelectionRange(0, 0);
        } catch {
          // Some mobile browsers reject selection changes on non-text modes.
        }
      }
    }

    const previewIdentity = getPreviewIdentityForCurrentMode();
    const anchorKey = meta.anchorKey ?? getChordSheetMetaAnchorKey(previewIdentity, field);
    const anchorRect = meta.anchorRect ?? findPreviewAnchorRect(anchorKey);
    if (!anchorRect) {
      return;
    }

    setPreviewMetaEditTarget({
      field,
      anchorKey,
      anchorRect,
      previewIdentity
    });
  }, [canOpenEditor, findPreviewAnchorRect, getPreviewIdentityForCurrentMode, hasFinePointer, previewEditSession]);

  // In setlist mode the preview stacks every song. Clicking a section/chord of a
  // song that isn't the currently focused one should (1) switch the focused
  // setlist song and (2) jump the editor to that exact section/bar — mirroring
  // the same-song behaviour of handleElementClick. The song switch is async, so
  // we stash the target and let the effect below apply the focus once it lands.
  const handleSetlistElementClick = React.useCallback((
    itemId: string,
    previewSong: Song,
    sIdx: number,
    bIdx: number,
    field: ChordSheetElementField,
    target?: ChordSheetElementTarget
  ) => {
    if (itemId === selectedSetlistSong?.id) {
      handleElementClick(sIdx, bIdx, field, target);
      return;
    }

    pendingSetlistElementFocusRef.current = {
      itemId,
      sectionId: previewSong.sections[sIdx]?.id ?? null,
      sIdx,
      bIdx,
      field,
      target
    };
    setPreviewMetaEditTarget(null);
    if (canOpenEditor && !isPreviewQuickEditEnabled) {
      setIsEditing(true);
    }
    handleSelectSetlistSong(itemId);
  }, [canOpenEditor, handleElementClick, handleSelectSetlistSong, isPreviewQuickEditEnabled, selectedSetlistSong?.id]);

  const handleScrollPreviewToTop = React.useCallback(() => {
    const scrollRoot = previewRef.current;
    if (!scrollRoot) return;
    scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePreviewScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const shouldShow = event.currentTarget.scrollTop > 240;
    setShowPreviewBackToTop((prev) => (prev === shouldShow ? prev : shouldShow));
    refreshPreviewEditAnchorRect();
  }, [refreshPreviewEditAnchorRect]);

  // Clicking the empty "+" slot after a section's last bar in the preview adds a
  // new bar to that section (works in both song-library and setlist modes).
  const handleAddBarToSection = React.useCallback((previewSIdx: number) => {
    const canEdit = isSetlistMode ? canEditSelectedSetlist : canEditTeamSongs;
    if (!canEdit || !activeEditorSong || !activeNavigationPreviewSong) {
      return;
    }

    const previewSection = activeNavigationPreviewSong.sections[previewSIdx] ?? null;
    const nextSectionId = previewSection?.id ?? null;
    const mappedIndex = nextSectionId
      ? activeEditorSong.sections.findIndex((section) => section.id === nextSectionId)
      : previewSIdx;
    const targetIndex = mappedIndex >= 0 ? mappedIndex : previewSIdx;
    const targetSection = activeEditorSong.sections[targetIndex];
    if (!targetSection) {
      return;
    }

    const newBarIndex = targetSection.bars.length;
    const newBar = { chords: [] as string[] };
    const nextSections = activeEditorSong.sections.map((section, index) => (
      index === targetIndex ? { ...section, bars: [...section.bars, newBar] } : section
    ));
    const nextSong = { ...activeEditorSong, sections: nextSections };

    if (isSetlistMode) {
      handleSetlistSongContentChange(nextSong);
    } else {
      handleSongChange(nextSong);
    }

    setPreviewMetaEditTarget(null);

    // Move focus to the freshly added bar so chords can be typed right away.
    setActiveSectionId(nextSectionId ?? targetSection.id ?? null);
    setActiveBar({ sIdx: targetIndex, bIdx: newBarIndex });

    if (editorFocusTimeoutRef.current !== null) {
      window.clearTimeout(editorFocusTimeoutRef.current);
      editorFocusTimeoutRef.current = null;
    }

    const openedEditor = !isEditing;
    const focusNewBar = () => {
      focusEditorField(targetIndex, newBarIndex, 'chords', openedEditor);
      editorFocusTimeoutRef.current = null;
    };

    if (!isEditing) {
      setIsEditing(true);
      editorFocusTimeoutRef.current = window.setTimeout(focusNewBar, 500);
    } else {
      editorFocusTimeoutRef.current = window.setTimeout(focusNewBar, 60);
    }
  }, [activeEditorSong, activeNavigationPreviewSong, canEditSelectedSetlist, canEditTeamSongs, focusEditorField, handleSetlistSongContentChange, handleSongChange, isEditing, isSetlistMode]);

  const handlePreviewWysiwygEditorChange = React.useCallback((nextSong: Song) => {
    if (isSetlistMode) {
      handleSetlistSongContentChange(nextSong);
    } else {
      handleSongChange(nextSong);
    }
  }, [handleSetlistSongContentChange, handleSongChange, isSetlistMode]);

  const previewSheet = React.useMemo(() => {
    if (!hasSongs) {
      return (
        <div className="flex h-[720px] w-[794px] max-w-full items-center justify-center bg-white px-8 text-center shadow-sm">
          <div className="max-w-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Music2 size={24} />
            </div>
            <h2 className="mt-5 text-xl font-bold text-gray-900">
              {language === 'zh' ? '這個團隊還沒有歌曲' : 'This team has no songs yet'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {language === 'zh'
                ? '從左側歌曲庫新增第一首歌，或切回個人區整理後再轉存到團隊。'
                : 'Add the first song from the library sidebar, or switch back to your personal workspace and copy songs into the team.'}
            </p>
            {canEditTeamSongs ? (
              <button
                type="button"
                onClick={handleCreateSong}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-500"
              >
                <Plus size={16} />
                <span>{copy.newSong}</span>
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    if (isLyricsMode && song) {
      return <LyricsSheet song={song} language={language} />;
    }

    const renderedSong = (activePreviewEditSession && activeDraftNavigationPreviewSong
      ? activeDraftNavigationPreviewSong
      : activeNavigationPreviewSong ?? song) as StoredSong;

    return (
      <ChordSheet
        song={renderedSong}
        language={language}
        currentKey={renderedSong.currentKey}
        onElementClick={canOpenEditor ? handleElementClick : undefined}
        onMetaClick={canOpenEditor ? handleMetaClick : undefined}
        onAddBarClick={canEditTeamSongs && !activePreviewEditSession ? handleAddBarToSection : undefined}
        highlightedSectionIds={highlightedSectionIds}
        activeSectionId={isEditing || activePreviewEditSession ? activeSectionId : null}
        activeBar={isEditing || activePreviewEditSession ? activeBar : null}
        activeChordSlot={activePreviewEditSession?.target.kind === 'bar' ? activePreviewEditSession.target : null}
        previewIdentity={song.id}
        onSectionReorder={canEditTeamSongs ? handlePreviewSectionReorder : undefined}
      />
    );
  }, [activeBar, activeDraftNavigationPreviewSong, activeNavigationPreviewSong, activePreviewEditSession, activeSectionId, canEditTeamSongs, canOpenEditor, copy.newSong, handleAddBarToSection, handleCreateSong, handleElementClick, handleMetaClick, handlePreviewSectionReorder, hasSongs, highlightedSectionIds, isEditing, isLyricsMode, language, song]);

  const setlistPreviewSongs = React.useMemo(() => {
    if (!effectiveSelectedSetlist || setlistSongsWithSource.length === 0) {
      return [];
    }

    return setlistSongsWithSource.map(({ item, sourceSong }) => {
      const isSelected = item.id === selectedSetlistSong?.id;
      const previewSong = isSelected && activeDraftNavigationPreviewSong
        ? activeDraftNavigationPreviewSong
        : {
            ...applySetlistSongOverrides(sourceSong, effectiveSelectedSetlist, item, guitaristMode),
            references: sourceSong.references,
            ...(isJoinedSetlist && joinedSetlistDisplayPreference.barNumberMode
              ? { barNumberMode: joinedSetlistDisplayPreference.barNumberMode }
              : {})
          };

      return {
        item,
        isSelected,
        song: previewSong
      };
    });
  }, [
    activeDraftNavigationPreviewSong,
    effectiveSelectedSetlist,
    guitaristMode,
    isJoinedSetlist,
    joinedSetlistDisplayPreference.barNumberMode,
    selectedSetlistSong?.id,
    setlistSongsWithSource
  ]);

  const setlistPreviewSheet = React.useMemo(() => {
    if (setlistPreviewSongs.length === 0) {
      return null;
    }

    if (isLyricsMode) {
      const selected = setlistPreviewSongs.find((entry) => entry.isSelected) ?? setlistPreviewSongs[0];
      if (!selected) {
        return null;
      }
      return <LyricsSheet song={selected.song} language={language} />;
    }

    return (
      <div className="flex flex-col gap-8">
        {setlistPreviewSongs.map(({ item, isSelected, song: previewSong }) => (
          <div
            key={item.id}
            data-setlist-preview-song-id={item.id}
            className={`w-full rounded-[18px] transition-shadow duration-200 ${
              // Use a ring (box-shadow) rather than `outline` for the selection
              // frame: iOS WebKit mis-scales `outline` on transform:scale()'d
              // elements, which made this frame the wrong size in iPad landscape.
              // box-shadow scales correctly under the preview's transform.
              isSelected ? 'ring-2 ring-indigo-300 shadow-[0_0_0_8px_rgba(199,210,254,0.22)]' : 'ring-2 ring-transparent'
            }`}
          >
            <ChordSheet
              song={previewSong}
              language={language}
              currentKey={previewSong.currentKey}
              onElementClick={canOpenEditor ? (sIdx, bIdx, field, target) => handleSetlistElementClick(item.id, previewSong, sIdx, bIdx, field, target) : undefined}
              onMetaClick={isSelected && canOpenEditor ? handleMetaClick : undefined}
              onAddBarClick={isSelected && canEditSelectedSetlist && !activePreviewEditSession ? handleAddBarToSection : undefined}
              highlightedSectionIds={isSelected ? highlightedSectionIds : []}
              activeSectionId={isSelected && (isEditing || activePreviewEditSession) ? activeSectionId : null}
              activeBar={isSelected && (isEditing || activePreviewEditSession) ? activeBar : null}
              activeChordSlot={isSelected && activePreviewEditSession?.target.kind === 'bar' ? activePreviewEditSession.target : null}
              previewIdentity={item.id}
              onSectionReorder={isSelected && canEditSelectedSetlist ? handlePreviewSectionReorder : undefined}
            />
          </div>
        ))}
      </div>
    );
  }, [activeBar, activePreviewEditSession, activeSectionId, canEditSelectedSetlist, canOpenEditor, handleAddBarToSection, handleMetaClick, handlePreviewSectionReorder, handleSetlistElementClick, highlightedSectionIds, isEditing, isLyricsMode, language, selectedSetlistSong?.id, setlistPreviewSongs]);
  const activePreviewSheet = isSetlistMode ? setlistPreviewSheet : previewSheet;
  const currentPreviewIdentity = isSetlistMode
    ? (selectedSetlistSong?.id ?? null)
    : (song?.id ?? null);

  useEffect(() => {
    setHighlightedSectionIds([]);
    setActiveBar(null);
    setPreviewMetaEditTarget(null);
    setActiveSectionId(activeEditorSong?.sections[0]?.id ?? null);
  }, [currentPreviewIdentity]);

  useEffect(() => {
    if (!activePreviewEditSession) return;
    if (activePreviewEditSession.target.kind === 'section') {
      setActiveSectionId(activePreviewEditSession.target.sectionId);
      return;
    }
    const located = findSongBar(activePreviewEditSession.draftSong, activePreviewEditSession.target);
    if (!located) return;
    setActiveSectionId(located.section.id ?? null);
    setActiveBar({ sIdx: located.sectionIndex, bIdx: located.barIndex });
  }, [activePreviewEditSession?.target.barId, activePreviewEditSession?.target.kind, activePreviewEditSession?.target.sectionId]);

  useEffect(() => {
    if (
      !activePreviewEditSession
      || activePreviewEditSession.target.kind !== 'bar'
      || activePreviewEditSession.target.field !== 'chords'
      || previewEditorDeviceLayout === 'desktop'
    ) {
      return;
    }

    // Touch chord entry is handled entirely by the visual keyboard. Clear any
    // previous text-field focus so iPadOS cannot stack its software keyboard
    // underneath the custom dock.
    mobileWysiwygKeyboardProxyInputRef.current?.blur();
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement
      || activeElement instanceof HTMLTextAreaElement
      || activeElement instanceof HTMLSelectElement
      || (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    ) {
      activeElement.blur();
    }
  }, [activePreviewEditSession?.previewIdentity, activePreviewEditSession?.target.barId, activePreviewEditSession?.target.field, activePreviewEditSession?.target.kind, previewEditorDeviceLayout]);

  useEffect(() => {
    if (!activePreviewEditSession) return;
    const frame = window.requestAnimationFrame(() => {
      const root = sheetRef.current;
      if (!root) return;
      const anchors = root.querySelectorAll('[data-preview-edit-anchor]') as NodeListOf<HTMLElement>;
      let selectedAnchor: HTMLElement | null = null;
      anchors.forEach((candidate) => {
        if (candidate.dataset.previewEditAnchor === activePreviewEditSession.target.anchorKey) {
          selectedAnchor = candidate;
        }
      });
      selectedAnchor?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      window.requestAnimationFrame(() => {
        const anchor = selectedAnchor as HTMLElement | null;
        const preview = previewRef.current;
        if (anchor && preview && previewEditorDeviceLayout !== 'desktop') {
          // Keep the complete bar visible, not only the much shorter active
          // beat anchor. This matters most for the final row, where the docked
          // keyboard otherwise leaves the bar pressed against its top edge.
          const scrollTarget = anchor.closest<HTMLElement>('.sheet-bar') ?? anchor;
          const targetRect = scrollTarget.getBoundingClientRect();
          const previewRect = preview.getBoundingClientRect();
          const safeTop = previewRect.top + 16;
          const safeBottom = previewRect.bottom - previewEditorBottomInset;
          if (targetRect.bottom > safeBottom) {
            preview.scrollBy({ top: targetRect.bottom - safeBottom, behavior: 'smooth' });
          } else if (targetRect.top < safeTop) {
            preview.scrollBy({ top: targetRect.top - safeTop, behavior: 'smooth' });
          }
        }
        refreshPreviewEditAnchorRect();
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePreviewEditSession?.target.anchorKey, previewEditorBottomInset, previewEditorDeviceLayout, refreshPreviewEditAnchorRect]);

  useEffect(() => {
    if (isLyricsMode) {
      setPreviewMetaEditTarget(null);
    }
  }, [isLyricsMode]);

  // Resolve a pending cross-song setlist click once the freshly selected song
  // becomes the active editor song. We schedule the focus on a timeout so it
  // runs after the currentPreviewIdentity reset effect above (which clears the
  // active bar/section on every song switch) and after the editor mounts.
  useEffect(() => {
    const pending = pendingSetlistElementFocusRef.current;
    if (!pending || !isSetlistMode) {
      return;
    }
    if (selectedSetlistSongId !== pending.itemId || !activeEditorSong) {
      return;
    }

    pendingSetlistElementFocusRef.current = null;

    const sectionIndexById = pending.sectionId
      ? activeEditorSong.sections.findIndex((section) => section.id === pending.sectionId)
      : -1;
    const targetIndex = sectionIndexById >= 0 ? sectionIndexById : pending.sIdx;

    if (isPreviewQuickEditEnabled && pending.target) {
      const section = activeEditorSong.sections[targetIndex];
      const bar = section?.bars[pending.bIdx];
      if (section?.id && bar?.id) {
        const slotIndex = pending.target.slotIndex ?? 0;
        const anchorKey = makePreviewTargetAnchorKey(pending.itemId, section.id, bar.id, slotIndex);
        window.requestAnimationFrame(() => {
          handleElementClick(targetIndex, pending.bIdx, pending.field, {
            ...pending.target!,
            previewIdentity: pending.itemId,
            sectionId: section.id!,
            barId: bar.id!,
            slotIndex,
            anchorKey,
            anchorRect: findPreviewAnchorRect(anchorKey) ?? pending.target!.anchorRect
          });
        });
        return;
      }
    }

    if (editorFocusTimeoutRef.current !== null) {
      window.clearTimeout(editorFocusTimeoutRef.current);
    }
    editorFocusTimeoutRef.current = window.setTimeout(() => {
      setActiveSectionId(activeEditorSong.sections[targetIndex]?.id ?? null);
      setActiveBar({ sIdx: targetIndex, bIdx: pending.bIdx });
      focusEditorField(targetIndex, pending.bIdx, pending.field, true);
      editorFocusTimeoutRef.current = null;
    }, 520);
  }, [activeEditorSong, findPreviewAnchorRect, focusEditorField, handleElementClick, isPreviewQuickEditEnabled, isSetlistMode, makePreviewTargetAnchorKey, selectedSetlistSongId]);

  useEffect(() => {
    if (isPerformanceMode || !isSetlistMode || !selectedSetlistSongId || setlistPreviewSongs.length === 0) {
      return;
    }

    if (skipNextSetlistPreviewAutoScrollRef.current) {
      skipNextSetlistPreviewAutoScrollRef.current = false;
      return;
    }

    let frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        const scrollRoot = previewRef.current;
        if (!scrollRoot) return;

        const target = scrollRoot.querySelector<HTMLElement>(`[data-setlist-preview-song-id="${selectedSetlistSongId}"]`);
        if (!target) return;

        const rootRect = scrollRoot.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offsetTop = targetRect.top - rootRect.top + scrollRoot.scrollTop;
        const desiredTop = Math.max(0, offsetTop - Math.min(120, rootRect.height * 0.16));

        if (Math.abs(scrollRoot.scrollTop - desiredTop) < 12) return;

        scrollRoot.scrollTo({
          top: desiredTop,
          behavior: 'smooth'
        });
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isPerformanceMode, isSetlistMode, selectedSetlistSongId, setlistPreviewSongs.length]);

  useEffect(() => {
    // The scroll observer auto-selects the setlist song nearest the preview
    // activation line as the user scrolls. Disabling it in edit mode is
    // intentional: with the split editor pane open, the preview can be
    // narrow and any reflow/scroll (including the auto-scroll-to-selected
    // effect itself) would otherwise ping-pong the selection between two
    // adjacent songs and re-mount the editor on each swap.
    if (isPerformanceMode || !isSetlistMode || isEditing || previewEditSession || setlistPreviewSongs.length === 0) {
      return;
    }

    const scrollRoot = previewRef.current;
    if (!scrollRoot) {
      return;
    }

    let frameId: number | null = null;
    const updateActiveSetlistSongFromScroll = () => {
      frameId = null;
      if (preserveSetlistPreviewSelectionUntilRef.current > performance.now()) {
        return;
      }

      const rootRect = scrollRoot.getBoundingClientRect();
      const activationY = rootRect.top + Math.min(180, Math.max(72, rootRect.height * 0.28));
      const songCards = Array.from(scrollRoot.querySelectorAll('[data-setlist-preview-song-id]')) as HTMLElement[];

      let nextSetlistSongId: string | null = null;
      let smallestDistance = Number.POSITIVE_INFINITY;

      for (const card of songCards) {
        const cardRect = card.getBoundingClientRect();
        const containsActivationLine = cardRect.top <= activationY && cardRect.bottom >= activationY;
        const distance = containsActivationLine
          ? 0
          : Math.min(Math.abs(cardRect.top - activationY), Math.abs(cardRect.bottom - activationY));

        if (distance < smallestDistance) {
          smallestDistance = distance;
          nextSetlistSongId = card.dataset.setlistPreviewSongId ?? null;
        }
      }

      if (nextSetlistSongId && nextSetlistSongId !== selectedSetlistSongId) {
        skipNextSetlistPreviewAutoScrollRef.current = true;
        setSelectedSetlistSongId(nextSetlistSongId);
      }
    };

    const requestScrollUpdate = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(updateActiveSetlistSongFromScroll);
    };

    requestScrollUpdate();
    scrollRoot.addEventListener('scroll', requestScrollUpdate, { passive: true });
    window.addEventListener('resize', requestScrollUpdate);

    return () => {
      scrollRoot.removeEventListener('scroll', requestScrollUpdate);
      window.removeEventListener('resize', requestScrollUpdate);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [isPerformanceMode, isSetlistMode, isEditing, previewEditSession, selectedSetlistSongId, setlistPreviewSongs.length]);

  const clearLivePreviewScaleStyles = () => {
    sheetRef.current?.style.removeProperty('--preview-live-scale');
    previewCanvasRef.current?.style.removeProperty('--preview-live-canvas-width');
    previewCanvasRef.current?.style.removeProperty('--preview-live-canvas-height');
  };

  const scheduleLivePreviewScaleCleanup = () => {
    if (previewScaleCleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(previewScaleCleanupFrameRef.current);
    }

    // Wait for React to commit the matching scale before removing the temporary
    // CSS variables. Keeping the live and committed values identical prevents a
    // one-frame snap at the end of a pinch or toolbar zoom.
    previewScaleCleanupFrameRef.current = window.requestAnimationFrame(() => {
      previewScaleCleanupFrameRef.current = window.requestAnimationFrame(() => {
        previewScaleCleanupFrameRef.current = null;
        clearLivePreviewScaleStyles();
        refreshPreviewEditAnchorRect();
      });
    });
  };

  const applyLivePreviewScale = ({
    scale,
    contentRatioX,
    contentRatioY,
    focalX,
    focalY,
    preserveVerticalPosition = true
  }: {
    scale: number;
    contentRatioX: number;
    contentRatioY: number;
    focalX: number;
    focalY: number;
    preserveVerticalPosition?: boolean;
  }) => {
    const scrollRoot = previewRef.current;
    const canvas = previewCanvasRef.current;
    const sheet = sheetRef.current;
    if (!scrollRoot || !canvas || !sheet) {
      return;
    }

    if (previewScaleCleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(previewScaleCleanupFrameRef.current);
      previewScaleCleanupFrameRef.current = null;
    }

    const scaledSheetWidth = sheetMetrics.width * scale;
    const scaledSheetHeight = sheetMetrics.height * scale;
    const canvasWidth = Math.max(scaledSheetWidth, previewViewportWidth);

    sheet.style.setProperty('--preview-live-scale', String(scale));
    canvas.style.setProperty('--preview-live-canvas-width', `${canvasWidth}px`);
    canvas.style.setProperty('--preview-live-canvas-height', `${scaledSheetHeight}px`);

    // Force just the preview shell to settle, then compensate by the observed
    // on-screen delta. This handles responsive padding and the centered canvas
    // correctly without guessing at scrollbar or safe-area geometry.
    const sheetRect = sheet.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    const position = resolvePreviewZoomScrollPosition({
      currentScrollLeft: scrollRoot.scrollLeft,
      currentScrollTop: scrollRoot.scrollTop,
      sheetClientLeft: sheetRect.left,
      sheetClientTop: sheetRect.top,
      scaledSheetWidth,
      scaledSheetHeight,
      contentRatioX,
      contentRatioY,
      focalClientX: rootRect.left + focalX,
      focalClientY: rootRect.top + focalY,
      preserveVerticalPosition
    });

    // These writes affect only the preview shell. They avoid re-rendering the
    // full App/ChordSheet tree for every touchmove on iPad.
    if (previewZoomLabelRef.current) {
      previewZoomLabelRef.current.textContent = `${Math.round((scale / previewFitHeightScale) * 100)}%`;
    }

    scrollRoot.scrollTo({
      left: position.scrollLeft,
      top: position.scrollTop,
      behavior: 'auto'
    });
  };

  const setPreviewScale = (nextScale: number, mode: 'preserve' | 'fit-width' | 'fit-height' = 'preserve') => {
    const clampedScale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, nextScale));
    const scrollRoot = previewRef.current;
    const shouldPreserveViewportPosition = mode === 'preserve' || isSetlistMode;

    if (!scrollRoot) {
      setPreviewZoom(clampedScale / previewBaseScale);
      window.requestAnimationFrame(refreshPreviewEditAnchorRect);
      return;
    }

    const rootRect = scrollRoot.getBoundingClientRect();
    const sheetRect = sheetRef.current?.getBoundingClientRect() ?? null;
    const focalX = scrollRoot.clientWidth / 2;
    const focalY = shouldPreserveViewportPosition ? scrollRoot.clientHeight / 2 : 0;
    const focalClientX = rootRect.left + focalX;
    const focalClientY = rootRect.top + focalY;
    const contentRatioX = mode === 'fit-width' || mode === 'fit-height'
      ? 0.5
      : sheetRect
        ? getPreviewZoomContentRatio(focalClientX, sheetRect.left, sheetRect.width, 0.5)
        : 0.5;
    const contentRatioY = shouldPreserveViewportPosition && sheetRect
      ? getPreviewZoomContentRatio(focalClientY, sheetRect.top, sheetRect.height, 0)
      : 0;

    if (isSetlistMode) {
      preserveSetlistPreviewSelectionUntilRef.current = performance.now() + 900;
    }

    applyLivePreviewScale({
      scale: clampedScale,
      contentRatioX,
      contentRatioY,
      focalX,
      focalY,
      preserveVerticalPosition: shouldPreserveViewportPosition
    });
    setPreviewZoom(clampedScale / previewBaseScale);
    scheduleLivePreviewScaleCleanup();
  };

  const handleZoomInPreview = () => {
    setPreviewScale(previewScale + PREVIEW_ZOOM_STEP);
  };

  const handleZoomOutPreview = () => {
    setPreviewScale(previewScale - PREVIEW_ZOOM_STEP);
  };

  const handleResetPreviewZoom = () => {
    const isAtPageFitHeight = Math.abs(previewScale - previewFitHeightScale) < 0.01;

    if (isAtPageFitHeight) {
      setPreviewScale(previewFitWidthScale, 'fit-width');
      return;
    }

    setPreviewScale(previewFitHeightScale, 'fit-height');
  };

  const getTouchDistance = (touches: TouchList) => {
    const firstTouch = touches[0];
    const secondTouch = touches[1];
    if (!firstTouch || !secondTouch) {
      return 0;
    }

    return Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY);
  };

  const getTouchCenter = (touches: TouchList) => {
    const firstTouch = touches[0];
    const secondTouch = touches[1];
    if (!firstTouch || !secondTouch) {
      return null;
    }

    return {
      x: (firstTouch.clientX + secondTouch.clientX) / 2,
      y: (firstTouch.clientY + secondTouch.clientY) / 2
    };
  };

  const handlePreviewTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !previewRef.current) {
      return;
    }

    const distance = getTouchDistance(event.touches);
    const center = getTouchCenter(event.touches);
    if (!distance || !center) {
      return;
    }

    event.preventDefault();
    endPreviewDrag();

    const scrollRoot = previewRef.current;
    const rootRect = scrollRoot.getBoundingClientRect();
    const sheetRect = sheetRef.current?.getBoundingClientRect() ?? null;
    const focalX = center.x - rootRect.left;
    const focalY = center.y - rootRect.top;

    previewPinchStateRef.current = {
      startDistance: distance,
      startScale: previewScale,
      baseScale: previewBaseScale,
      contentRatioX: sheetRect
        ? getPreviewZoomContentRatio(center.x, sheetRect.left, sheetRect.width, 0.5)
        : 0.5,
      contentRatioY: sheetRect
        ? getPreviewZoomContentRatio(center.y, sheetRect.top, sheetRect.height, 0)
        : 0,
      currentScale: previewScale,
      focalX,
      focalY
    };

    if (isSetlistMode) {
      preserveSetlistPreviewSelectionUntilRef.current = performance.now() + 1200;
    }
  };

  const flushPreviewPinchFrame = () => {
    previewPinchFrameRef.current = null;
    const pinchState = previewPinchStateRef.current;
    if (!pinchState) {
      return;
    }

    applyLivePreviewScale({
      scale: pinchState.currentScale,
      contentRatioX: pinchState.contentRatioX,
      contentRatioY: pinchState.contentRatioY,
      focalX: pinchState.focalX,
      focalY: pinchState.focalY
    });
  };

  const handlePreviewTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const pinchState = previewPinchStateRef.current;
    const scrollRoot = previewRef.current;
    if (!pinchState || !scrollRoot || event.touches.length !== 2) {
      return;
    }

    const distance = getTouchDistance(event.touches);
    const center = getTouchCenter(event.touches);
    if (!distance || !center) {
      return;
    }

    event.preventDefault();

    const nextScale = Math.min(
      PREVIEW_MAX_SCALE,
      Math.max(PREVIEW_MIN_SCALE, pinchState.startScale * (distance / pinchState.startDistance))
    );
    const rootRect = scrollRoot.getBoundingClientRect();
    const focalX = center.x - rootRect.left;
    const focalY = center.y - rootRect.top;

    pinchState.currentScale = nextScale;
    pinchState.focalX = focalX;
    pinchState.focalY = focalY;

    // Touch events can arrive faster than the display refresh rate. Keep only
    // the latest geometry and perform at most one DOM update per frame.
    if (previewPinchFrameRef.current === null) {
      previewPinchFrameRef.current = window.requestAnimationFrame(flushPreviewPinchFrame);
    }
  };

  const handlePreviewTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      const pinchState = previewPinchStateRef.current;
      if (previewPinchFrameRef.current !== null) {
        window.cancelAnimationFrame(previewPinchFrameRef.current);
        previewPinchFrameRef.current = null;
        flushPreviewPinchFrame();
      }
      previewPinchStateRef.current = null;

      if (pinchState) {
        setPreviewZoom(pinchState.currentScale / pinchState.baseScale);
        scheduleLivePreviewScaleCleanup();
      }
    }
  };

  const endPreviewDrag = () => {
    const dragState = previewDragStateRef.current;
    previewDragStateRef.current = null;
    setIsPreviewDragging(false);
    document.body.style.userSelect = '';
    window.requestAnimationFrame(refreshPreviewEditAnchorRect);

    if (dragState?.moved) {
      suppressPreviewClickRef.current = true;
      if (previewSuppressClickTimeoutRef.current !== null) {
        window.clearTimeout(previewSuppressClickTimeoutRef.current);
      }
      previewSuppressClickTimeoutRef.current = window.setTimeout(() => {
        suppressPreviewClickRef.current = false;
        previewSuppressClickTimeoutRef.current = null;
      }, 120);
    }
  };

  const handlePreviewMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !previewRef.current) {
      return;
    }

    previewDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: previewRef.current.scrollLeft,
      startScrollTop: previewRef.current.scrollTop,
      moved: false
    };
  };

  const handlePreviewClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressPreviewClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressPreviewClickRef.current = false;

      if (previewSuppressClickTimeoutRef.current !== null) {
        window.clearTimeout(previewSuppressClickTimeoutRef.current);
        previewSuppressClickTimeoutRef.current = null;
      }
      return;
    }
  };

  if (!song) {
    return null;
  }

  const handleSidebarHoverTrigger = (event: React.MouseEvent<HTMLElement>) => {
    if (isPhoneViewport) {
      return;
    }

    if (isSidebarPinned || isSidebarHovered) {
      return;
    }

    const sidebarRect = event.currentTarget.getBoundingClientRect();
    const pointerY = event.clientY - sidebarRect.top;

    if (pointerY <= sidebarRect.height / 3) {
      setIsSidebarHovered(true);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      setIsGoogleAccountMenuOpen(false);
      setAuthUiError(null);
      setAuthUiMessage(null);
      await signOut();
      cloudRepositoryRef.current = null;
      setGoogleUser(null);
      setSyncStatus('saved');
      window.location.assign(import.meta.env.BASE_URL);
    } catch (error) {
      setAuthUiError(error instanceof Error ? error.message : copy.cloudSyncFailed);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthUiError(null);
      setAuthUiMessage(null);

      if (isLineInAppBrowser()) {
        setAuthUiError(copy.lineInAppBrowserAuthBlocked);
        return;
      }

      await signInWithGoogle();
    } catch (error) {
      setAuthUiError(error instanceof Error ? error.message : copy.authUnavailable);
    }
  };

  const ensureShareResourceIsSynced = async (resourceType: 'song' | 'setlist' | 'project', projectIdForShare?: string) => {
    const repository = cloudRepositoryRef.current;
    if (!repository) {
      throw new Error(copy.authUnavailable);
    }

    if (!navigator.onLine) {
      throw new Error(language === 'zh' ? '目前離線，無法建立分享連結。' : 'You are offline. Share links cannot be created right now.');
    }

    setSyncStatus('syncing');

    if (resourceType === 'song') {
      if (!song) {
        throw new Error(language === 'zh' ? '找不到目前歌曲。' : 'Current song was not found.');
      }

      await repository.saveSong(song);
      setSavedSongs((current) => {
        const nextSong = cloneSong(song);
        return current.some((item) => item.id === song.id)
          ? current.map((item) => item.id === song.id ? nextSong : item)
          : [...current, nextSong];
      });
      setSyncStatus('saved');
      return;
    }

    if (resourceType === 'project') {
      const projectId = projectIdForShare;
      const project = projectId ? projects.find((item) => item.id === projectId) : null;
      if (!project) {
        throw new Error(language === 'zh' ? '找不到要分享的專案。' : 'Project to share was not found.');
      }

      const projectSetlists = setlists.filter((item) => (item.projectId ?? null) === project.id);
      const requiredSongs = projectSetlists
        .flatMap((sl) => sl.songs.map((ss) => songs.find((item) => item.id === ss.songId)))
        .filter((item): item is StoredSong => Boolean(item));

      await repository.saveProject(project);
      await Promise.all(requiredSongs.map((requiredSong) => repository.saveSong(requiredSong)));
      await Promise.all(projectSetlists.map((sl) => repository.saveSetlist(sl)));

      setSavedSongs((current) => {
        const syncedById = new Map(requiredSongs.map((item) => [item.id, cloneSong(item)] as const));
        const merged = current.map((item) => syncedById.get(item.id) ?? item);
        const existingIds = new Set(merged.map((item) => item.id));
        return [
          ...merged,
          ...requiredSongs.filter((item) => !existingIds.has(item.id)).map((item) => cloneSong(item))
        ];
      });
      setSavedSetlists((current) => {
        const syncedById = new Map(projectSetlists.map((item) => [item.id, cloneSong(item)] as const));
        const merged = current.map((item) => syncedById.get(item.id) ?? item);
        const existingIds = new Set(merged.map((item) => item.id));
        return [
          ...merged,
          ...projectSetlists.filter((item) => !existingIds.has(item.id)).map((item) => cloneSong(item))
        ];
      });
      setSavedProjects((current) => {
        const nextProject = cloneSong(project);
        return current.some((item) => item.id === project.id)
          ? current.map((item) => item.id === project.id ? nextProject : item)
          : [...current, nextProject];
      });
      setSyncStatus('saved');
      return;
    }

    if (!selectedSetlist) {
      throw new Error(language === 'zh' ? '找不到目前歌單。' : 'Current setlist was not found.');
    }

    if ((selectedSetlist as JoinedSetlist).isJoined) {
      throw new Error(language === 'zh' ? '目前不能重新分享別人分享給你的歌單。' : 'Setlists shared with you cannot be reshared yet.');
    }

    if (!canShareSelectedSetlist) {
      throw new Error(language === 'zh' ? '你沒有分享這份團隊歌單的權限。' : 'You do not have permission to share this team setlist.');
    }

    const requiredSongs = selectedSetlist.songs
      .map((setlistSong) => songs.find((item) => item.id === setlistSong.songId))
      .filter((item): item is StoredSong => Boolean(item));

    for (const requiredSong of requiredSongs) {
      await repository.saveSong(requiredSong);
    }

    await repository.saveSetlist(selectedSetlist);
    setSavedSongs((current) => {
      const syncedById = new Map(requiredSongs.map((item) => [item.id, cloneSong(item)] as const));
      const merged = current.map((item) => syncedById.get(item.id) ?? item);
      const existingIds = new Set(merged.map((item) => item.id));
      return [
        ...merged,
        ...requiredSongs.filter((item) => !existingIds.has(item.id)).map((item) => cloneSong(item))
      ];
    });
    setSavedSetlists((current) => {
      const nextSetlist = cloneSong(selectedSetlist);
      return current.some((item) => item.id === selectedSetlist.id)
        ? current.map((item) => item.id === selectedSetlist.id ? nextSetlist : item)
        : [...current, nextSetlist];
    });
    setSyncStatus('saved');
  };

  const handleCreateProjectShareLink = async (projectId: string) => {
    if (creatingProjectShareLinkId) {
      // Already in flight for some project — ignore the repeat tap so we don't
      // spam create-share-link or race the clipboard write.
      return;
    }
    if (!cloudRepositoryRef.current) {
      toast.error(copy.authUnavailable);
      return;
    }
    const ownedProject = projects.find((item) => item.id === projectId) ?? null;
    const joinedProject = joinedProjects.find((item) => item.id === projectId) ?? null;
    if (!ownedProject && !joinedProject) return;
    const canShareTargetProject = ownedProject ? canShareProject : joinedProject?.role === 'manager';
    if (!canShareTargetProject) {
      toast.error(language === 'zh' ? '你沒有分享這個專案的權限。' : 'You do not have permission to share this project.');
      return;
    }

    setCreatingProjectShareLinkId(projectId);
    try {
      if (ownedProject) {
        await ensureShareResourceIsSynced('project', projectId);
      }
      const token = await cloudRepositoryRef.current.createShareLink('project', projectId);
      setPendingShareUrl(buildShareUrl(token));
      setShareDialogContext({ resourceType: 'project', resourceId: projectId });
      void refreshShareContacts();
      // Reflect the (possibly new) link/participants in the open "who joined" panel.
      void loadProjectShareStatus(projectId);
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      const reason = error instanceof Error ? error.message.trim() : '';
      if (!reason) {
        toast.error(copy.shareFailed);
        return;
      }
      const localizedReason = isShareAuthErrorMessage(reason) ? copy.shareAuthRequired : reason;
      toast.error(copy.shareFailedWithReason.replace('{reason}', localizedReason));
    } finally {
      setCreatingProjectShareLinkId(null);
    }
  };

  const handleCreateShareLink = async (resourceType: 'song' | 'setlist') => {
    if (!cloudRepositoryRef.current) {
      toast.error(copy.authUnavailable);
      return;
    }

    const resourceId = resourceType === 'song' ? song?.id : selectedSetlist?.id;
    if (!resourceId) {
      return;
    }

    if (resourceType === 'song' && isTeamWorkspace && !canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有分享團隊歌曲的權限。' : 'You do not have permission to share team songs.');
      return;
    }

    try {
      await ensureShareResourceIsSynced(resourceType);

      if (resourceType === 'setlist') {
        // Reuse the existing active token when there is one so reopening the
        // dialog doesn't mint duplicate links.
        const token = selectedSetlistShareStatus?.activeToken
          ?? await cloudRepositoryRef.current.createShareLink(resourceType, resourceId);
        setPendingShareUrl(buildShareUrl(token));
        setShareDialogContext({ resourceType: 'setlist', resourceId });
        void refreshShareContacts();
        void loadSetlistShareStatus(resourceId);
        return;
      }

      const token = await cloudRepositoryRef.current.createShareLink(resourceType, resourceId);
      const shareUrl = buildShareUrl(token);
      setPendingShareUrl(shareUrl);
      setShareDialogContext(null);
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      const reason = error instanceof Error ? error.message.trim() : '';
      if (!reason) {
        toast.error(copy.shareFailed);
        return;
      }

      const localizedReason = isShareAuthErrorMessage(reason)
        ? copy.shareAuthRequired
        : reason;

      toast.error(copy.shareFailedWithReason.replace('{reason}', localizedReason));
    }
	  };

  const handleShareSelectedSongs = async () => {
    const repository = cloudRepositoryRef.current;
    if (!repository || selectedLibrarySongIds.length === 0 || isCreatingSongShare) return;
    if (isTeamWorkspace && !canEditTeamSongs) {
      toast.error(language === 'zh' ? '你沒有分享團隊歌曲的權限。' : 'You do not have permission to share team songs.');
      return;
    }
    if (!navigator.onLine) {
      toast.error(language === 'zh' ? '目前離線，無法建立分享連結。' : 'You are offline. Share links cannot be created right now.');
      return;
    }

    const selectedIds = new Set(selectedLibrarySongIds);
    const orderedSongs = filteredSongs.filter((item) => selectedIds.has(item.id));
    if (orderedSongs.length === 0) return;

    try {
      setIsCreatingSongShare(true);
      setSyncStatus('syncing');
      await Promise.all(orderedSongs.map((item) => repository.saveSong(item)));
      setSavedSongs((current) => {
        const synced = new Map(orderedSongs.map((item) => [item.id, cloneSong(item)] as const));
        const merged = current.map((item) => synced.get(item.id) ?? item);
        const existingIds = new Set(merged.map((item) => item.id));
        return [
          ...merged,
          ...orderedSongs.filter((item) => !existingIds.has(item.id)).map((item) => cloneSong(item))
        ];
      });
      const token = orderedSongs.length === 1
        ? await repository.createShareLink('song', orderedSongs[0].id)
        : await repository.createSongBundleShare(orderedSongs.map((item) => item.id));
      setPendingShareUrl(buildShareUrl(token));
      setShareDialogContext(null);
      setSyncStatus('saved');
      setSelectedLibrarySongIds([]);
      setIsLibraryEditing(false);
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
      const reason = error instanceof Error && error.message.trim() ? error.message.trim() : copy.shareFailed;
      toast.error(copy.shareFailedWithReason.replace('{reason}', reason));
    } finally {
      setIsCreatingSongShare(false);
    }
  };

  const handleCopyActiveSetlistShareLink = async () => {
    if (!selectedSetlistShareStatus?.activeToken) return;

    const shareUrl = buildShareUrl(selectedSetlistShareStatus.activeToken);
    const didCopy = await copyShareUrlToClipboard(shareUrl);
    if (didCopy) {
      toast.success(copy.shareCopied);
      return;
    }

    toast.error(copy.shareCopyFailed);
  };

  const handleRevokeSetlistSharing = async (setlistId: string) => {
    const repository = cloudRepositoryRef.current;
    if (!repository) return;

    try {
      setIsRevokingSetlistShare(true);
      await repository.revokeSetlistSharing(setlistId);
      setSelectedSetlistShareStatus({
        activeToken: null,
        activeCreatedAt: null,
        participantCount: 0,
        participants: []
      });
      setPendingRevokeShareSetlistId(null);
      toast.success(copy.setlistSharingCancelled);
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim() : '';
      const message = reason ? `${copy.setlistSharingCancelError}\n\n${reason}` : copy.setlistSharingCancelError;
      setAuthUiError(message);
      toast.error(message);
    } finally {
      setIsRevokingSetlistShare(false);
    }
  };

  const handleImportLocalWorkspaceToCloud = async () => {
    if (!authenticatedUser || !cloudRepositoryRef.current) {
      return;
    }

    try {
      setIsImportingLocalWorkspace(true);
      const nextWorkspace = await cloudRepositoryRef.current.importLocalWorkspace({
        songs,
        setlists,
        joinedSetlists: [],
        projects,
        joinedProjects: [],
        lastSavedAt
      });
      setSongs(nextWorkspace.songs);
      setSavedSongs(cloneSong(nextWorkspace.songs));
      setSetlists(nextWorkspace.setlists);
      setSavedSetlists(cloneSong(nextWorkspace.setlists));
      setProjects(nextWorkspace.projects);
      setSavedProjects(cloneSong(nextWorkspace.projects));
      setJoinedSetlists(nextWorkspace.joinedSetlists);
      setJoinedProjects(nextWorkspace.joinedProjects ?? []);
      setLastSavedAt(nextWorkspace.lastSavedAt);
      markMigrationCompleted(authenticatedUser.id);
      setIsImportPromptOpen(false);
      setSyncStatus('saved');
    } catch (error) {
      setAuthUiError(error instanceof Error ? error.message : copy.cloudSyncFailed);
      setSyncStatus(navigator.onLine ? 'failed' : 'offline');
    } finally {
      setIsImportingLocalWorkspace(false);
    }
  };

  const handleDismissImportPrompt = () => {
    if (authenticatedUser) {
      markMigrationCompleted(authenticatedUser.id);
    }
    setIsImportPromptOpen(false);
  };

  const handleSidebarResizeStart = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsSidebarPinned(true);
    setIsSidebarHovered(true);
    setIsSidebarResizing(true);
  };

  const handleEditorResizeStart = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const pane = (event.currentTarget as HTMLElement).closest('[data-editor-pane]');
    editorPaneLeftRef.current = pane ? pane.getBoundingClientRect().left : 0;
    setIsEditorResizing(true);
  };

  const handleEditorResizeReset = () => {
    setEditorWidthPreference(null);
  };

  const metadataSuggestions = React.useMemo(() => {
    const versions = new Set<string>();
    const translators = new Set<string>();

    songs.forEach((item) => {
      const version = getSongVersionSummary(item).trim();
      const translator = item.translator?.trim();

      if (version) versions.add(version);
      if (translator) translators.add(translator);
    });

    return {
      versions: Array.from(versions).sort((a, b) => a.localeCompare(b, language === 'zh' ? 'zh-Hant' : 'en')),
      translators: Array.from(translators).sort((a, b) => a.localeCompare(b, language === 'zh' ? 'zh-Hant' : 'en'))
    };
  }, [language, songs]);

  const metadataPanelContent = isSetlistMode
    ? (selectedSetlist && effectiveSelectedSetlist && selectedSetlistSong && selectedSetlistSourceSong ? (
        <SongMetadataPanel
          song={isJoinedSetlist
            ? {
                ...(activeDraftEditorSong ?? activeSetlistEditableSong ?? selectedSetlistSourceSong),
                barNumberMode: joinedSetlistDisplayPreference.barNumberMode
                  ?? activeSetlistPreviewSong?.barNumberMode
                  ?? (activeDraftEditorSong ?? activeSetlistEditableSong ?? selectedSetlistSourceSong).barNumberMode
                  ?? 'none'
              }
            : activeDraftEditorSong ?? activeSetlistEditableSong ?? selectedSetlistSourceSong}
          language={language}
          metadataSuggestions={metadataSuggestions}
          title={copy.setlistEditor.instanceSettings}
          onChange={(nextSong) => {
            if (isJoinedSetlist) {
              handleJoinedSetlistDisplayPreferenceChange(selectedSetlist.id, {
                barNumberMode: nextSong.barNumberMode ?? 'none'
              });
              return;
            }

            handleActiveEditorSongChange(nextSong);
          }}
          keyValue={currentSetlistKey}
          capoValue={currentSetlistCapo}
          onKeyChange={isJoinedSetlist ? undefined : handleSetlistKeyChange}
          onCapoChange={handleSelectedSetlistCapoChange}
          displayMode={effectiveSelectedSetlist.displayMode}
          onDisplayModeChange={(mode) => {
            if (isJoinedSetlist) {
              handleJoinedSetlistDisplayPreferenceChange(selectedSetlist.id, { displayMode: mode });
              return;
            }

            handleSetlistDisplaySettingsChange(selectedSetlist.id, { displayMode: mode });
          }}
          showReferenceFields={false}
        />
      ) : null)
    : hasSongs ? (
        <SongMetadataPanel
          song={(activeDraftEditorSong ?? song) as StoredSong}
          language={language}
          metadataSuggestions={metadataSuggestions}
          title={language === 'zh' ? '編輯歌曲' : 'Edit Song'}
          onChange={handleActiveEditorSongChange}
          jianpuInputAbsolute={(activeDraftEditorSong ?? song).jianpuInputAbsolute ?? false}
          onJianpuInputAbsoluteChange={(value) => handleActiveEditorSongChange(
            value === Boolean((activeDraftEditorSong ?? song).jianpuInputAbsolute)
              ? { ...(activeDraftEditorSong ?? song), jianpuInputAbsolute: value }
              : reinterpretSongJianpuInput({ ...(activeDraftEditorSong ?? song), jianpuInputAbsolute: value }, value)
          )}
        />
      ) : null;

  const mobileMetadataSummaryCard = isPhoneViewport && isEditing && isSheetView && mobileMetadataSong && metadataPanelContent ? (
    <button
      type="button"
      onClick={() => {
        setIsMobileMetadataOpen(true);
        setIsMobileActionsSheetOpen(false);
      }}
      className="w-full rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{mobileMetadataTitle}</div>
          <div className="mt-1 truncate text-base font-bold text-gray-900">
            {mobileMetadataSong.title || copy.untitledSong}
          </div>
          {(mobileMetadataVersion || mobileMetadataTranslator) ? (
            <div className="mt-1 truncate text-xs font-medium text-gray-500">
              {[mobileMetadataVersion, mobileMetadataTranslator].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
          {language === 'zh' ? '編輯' : 'Edit'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[
          { label: copy.key, value: mobileMetadataKey },
          { label: 'Capo', value: String(mobileMetadataCapo) },
          { label: copy.editor.tempo, value: mobileMetadataTempo },
          { label: copy.editor.timeSignature, value: mobileMetadataTime }
        ].map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-2 py-2">
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400">{item.label}</div>
            <div className="mt-1 truncate text-sm font-semibold text-gray-800">{item.value}</div>
          </div>
        ))}
      </div>
    </button>
  ) : null;

  // Shared "who joined" list, reused by both the setlist and project panels.
  // When onToggleManager is supplied (project panel, owner view), each participant
  // gets a control to promote them to manager (edit shared key + order) or demote.
  const renderShareParticipantList = (
    participants: ProjectShareStatus['participants'] | undefined,
    maxHeightClass: string,
    onToggleManager?: (participant: ShareParticipant) => void,
    onRemove?: (participant: ShareParticipant) => void
  ) => (
    participants && participants.length ? (
      <div className={`mt-3 ${maxHeightClass} space-y-2 overflow-y-auto`}>
        {participants.map((participant) => {
          const isManager = participant.role === 'manager';
          const rowContent = (
            <>
              {participant.picture ? (
                <img src={participant.picture} alt={participant.name} className="h-7 w-7 rounded-full border border-gray-200 object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                  {(participant.name || participant.email || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-gray-900">{participant.name || participant.email}</div>
                <div className="truncate text-[11px] text-gray-500">{participant.email}</div>
              </div>
              {onToggleManager ? (
                <button
                  type="button"
                  onClick={() => {
                    if (mobileMemberSwipeHandledRef.current) {
                      mobileMemberSwipeHandledRef.current = false;
                      return;
                    }
                    onToggleManager(participant);
                  }}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition-colors ${
                    isManager
                      ? 'bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-500'
                      : 'bg-white text-gray-600 ring-gray-200 hover:ring-indigo-300 hover:text-indigo-600'
                  }`}
                  title={language === 'zh'
                    ? (isManager ? '管理員（可改 key/順序）— 點擊改回唯讀' : '唯讀 — 點擊設為管理員')
                    : (isManager ? 'Manager (can edit key/order) — tap to make viewer' : 'Viewer — tap to make manager')}
                >
                  {language === 'zh' ? (isManager ? '管理員' : '唯讀') : (isManager ? 'Manager' : 'Viewer')}
                </button>
              ) : null}
            </>
          );

          // No remove capability → plain, non-swipe row.
          if (!onRemove) {
            return (
              <div key={participant.userId} className="flex min-w-0 items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-2">
                {rowContent}
              </div>
            );
          }

          // Owner view: swipe the row left to reveal the "remove" action,
          // reusing the shared swipe engine (left swipe only).
          const swipeAction = mobileSwipeMember?.id === participant.userId ? mobileSwipeMember.action : null;
          const dragOffset = draggingMember?.id === participant.userId ? draggingMember.dx : null;
          const translateClass = dragOffset !== null
            ? ''
            : swipeAction === 'delete' ? '-translate-x-20' : 'translate-x-0';
          return (
            <div key={participant.userId} className="relative overflow-hidden rounded-xl">
              <div className="absolute inset-y-0 right-0 flex items-stretch">
                <button
                  type="button"
                  onClick={() => {
                    setMobileSwipeMember(null);
                    onRemove(participant);
                  }}
                  className="flex w-20 items-center justify-center rounded-r-xl bg-rose-500 px-3 text-xs font-bold text-white"
                  aria-label={`${copy.removeMember} ${participant.name || participant.email}`}
                  title={copy.removeMember}
                >
                  {copy.removeMember}
                </button>
              </div>
              <div
                onTouchStart={(event) => memberSwipe.touchStart(participant.userId, event)}
                onTouchMove={memberSwipe.touchMove}
                onTouchEnd={(event) => memberSwipe.touchEnd(participant.userId, event)}
                onTouchCancel={memberSwipe.reset}
                onPointerDown={(event) => memberSwipe.pointerDown(participant.userId, event)}
                onPointerMove={memberSwipe.pointerMove}
                onPointerUp={(event) => memberSwipe.pointerEnd(participant.userId, event)}
                onPointerCancel={memberSwipe.reset}
                style={dragOffset !== null ? { transform: `translateX(${dragOffset}px)`, transition: 'none' } : undefined}
                className={`relative flex min-w-0 select-none items-center gap-2 bg-gray-50 px-2.5 py-2 transition-transform duration-200 ease-out [touch-action:pan-y] ${translateClass}`}
              >
                {rowContent}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
        {copy.setlistSharingNoParticipants}
      </div>
    )
  );

  // Collapsible on every viewport (incl. desktop) so the participant list never
  // permanently covers the setlist area — closed by default.
  // Mirror the project panel: only surface once the setlist is actually shared
  // (active link) or someone has joined. Starting a share still works from the
  // "…" menu, which reloads the status and brings this panel back.
  const hasSetlistShareActivity = Boolean(selectedSetlistShareStatus?.activeToken)
    || (selectedSetlistShareStatus?.participantCount ?? 0) > 0;
  const setlistSharingPanel = selectedSetlist && canShareSelectedSetlist && hasSetlistShareActivity ? (
    <details className="group rounded-2xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 sm:text-xs">{copy.setlistSharingTitle}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
              selectedSetlistShareStatus?.activeToken
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'
            }`}>
              {isLoadingSetlistShareStatus
                ? copy.cloudSyncSyncing
                : selectedSetlistShareStatus?.activeToken
                  ? copy.setlistSharingActive
                  : copy.setlistSharingInactive}
            </span>
            <span className="text-xs font-semibold text-gray-500">
              {copy.setlistSharingParticipants}: {selectedSetlistShareStatus?.participantCount ?? 0}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void loadSetlistShareStatus(selectedSetlist.id); }}
            disabled={isLoadingSetlistShareStatus}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-60"
            title={copy.setlistSharingRefresh}
            aria-label={copy.setlistSharingRefresh}
          >
            <RefreshCw size={13} className={isLoadingSetlistShareStatus ? 'animate-spin' : ''} />
          </button>
          <ChevronRight size={16} className="text-gray-400 transition-transform group-open:rotate-90" />
        </div>
      </summary>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {renderShareParticipantList(
          selectedSetlistShareStatus?.participants,
          'max-h-48',
          undefined,
          selectedSetlist ? (participant) => { void handleRemoveSharedMember('setlist', selectedSetlist.id, participant); } : undefined
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void handleCreateShareLink('setlist')}
            disabled={isExportingPdf || isRevokingSetlistShare}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60"
          >
            <Share2 size={13} />
            <span>{selectedSetlistShareStatus?.activeToken ? copy.setlistSharingCopyLink : copy.shareCurrentSetlist}</span>
          </button>
          <button
            type="button"
            onClick={() => setPendingRevokeShareSetlistId(selectedSetlist.id)}
            disabled={!selectedSetlistShareStatus?.activeToken || isRevokingSetlistShare}
            className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.setlistSharingCancel}
          </button>
        </div>
      </div>
    </details>
  ) : null;

  // Project mode "who joined" — same idea as the setlist panel, scoped to the
  // whole project. Read-only list + refresh (the project header already hosts
  // the share button). Collapsible and closed by default. Only surfaces once the
  // project is actually shared (active link) or someone has joined — otherwise
  // it's just empty chrome taking up space.
  const hasProjectShareActivity = Boolean(selectedProjectShareStatus?.activeToken)
    || (selectedProjectShareStatus?.participantCount ?? 0) > 0;
  const projectSharingPanel = isSetlistMode && selectedProject && !selectedJoinedProject && canShareProject && hasProjectShareActivity ? (
    <details className="group rounded-2xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 sm:text-xs">
            {language === 'zh' ? '專案共享' : 'Project sharing'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
              selectedProjectShareStatus?.activeToken
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'
            }`}>
              {isLoadingProjectShareStatus
                ? copy.cloudSyncSyncing
                : selectedProjectShareStatus?.activeToken
                  ? copy.setlistSharingActive
                  : copy.setlistSharingInactive}
            </span>
            <span className="text-xs font-semibold text-gray-500">
              {copy.setlistSharingParticipants}: {selectedProjectShareStatus?.participantCount ?? 0}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void loadProjectShareStatus(selectedProject.id); }}
            disabled={isLoadingProjectShareStatus}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-60"
            title={copy.setlistSharingRefresh}
            aria-label={copy.setlistSharingRefresh}
          >
            <RefreshCw size={13} className={isLoadingProjectShareStatus ? 'animate-spin' : ''} />
          </button>
          <ChevronRight size={16} className="text-gray-400 transition-transform group-open:rotate-90" />
        </div>
      </summary>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {renderShareParticipantList(
          selectedProjectShareStatus?.participants,
          'max-h-48',
          selectedProject ? (participant) => { void handleToggleProjectMemberRole(selectedProject.id, participant); } : undefined,
          selectedProject ? (participant) => { void handleRemoveSharedMember('project', selectedProject.id, participant); } : undefined
        )}
      </div>
    </details>
  ) : null;

  const joinedSetlistDisplayPreferencePanel = isJoinedSetlist && selectedSetlist && effectiveSelectedSetlist ? (
    isPhoneViewport ? (
      <details className="group rounded-2xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">
              {language === 'zh' ? '個人顯示' : 'Personal View'}
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-indigo-700">
              {setlistDisplayModeOptions.find((option) => option.value === currentSetlistDisplayMode)?.label}
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-indigo-400 transition-transform group-open:rotate-90" />
        </summary>

        <div className="mt-3 border-t border-indigo-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-100">
              {language === 'zh' ? '只影響你' : 'Local'}
            </span>
          </div>

          <div className="mt-2.5 space-y-2">
            <CompactSegmentedControl
              value={currentSetlistDisplayMode}
              options={setlistDisplayModeOptions}
              onChange={handleSetlistDisplayModeChange}
              size="xs"
              stretch
              className="bg-white"
              buttonClassName="min-w-0"
            />

            <CompactSegmentedControl
              value={currentSetlistBarNumberMode}
              options={barNumberModeOptions}
              onChange={(mode) => handleJoinedSetlistDisplayPreferenceChange(selectedSetlist.id, { barNumberMode: mode })}
              size="xs"
              stretch
              className="bg-white"
              buttonClassName="min-w-0"
            />
          </div>
        </div>
      </details>
    ) : (
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">
          {language === 'zh' ? '個人顯示' : 'Personal View'}
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-100">
          {language === 'zh' ? '只影響你' : 'Local'}
        </span>
      </div>

      <div className="mt-2.5 space-y-2">
        <CompactSegmentedControl
          value={currentSetlistDisplayMode}
          options={setlistDisplayModeOptions}
          onChange={handleSetlistDisplayModeChange}
          size="xs"
          stretch
          className="bg-white"
          buttonClassName="min-w-0"
        />

        <CompactSegmentedControl
          value={currentSetlistBarNumberMode}
          options={barNumberModeOptions}
          onChange={(mode) => handleJoinedSetlistDisplayPreferenceChange(selectedSetlist.id, { barNumberMode: mode })}
          size="xs"
          stretch
          className="bg-white"
          buttonClassName="min-w-0"
        />
      </div>
    </section>
    )
  ) : null;

  const activeWorkspaceLabel = activeCloudLibrary?.kind === 'personal'
    ? (language === 'zh' ? '個人區' : 'Personal')
    : activeCloudLibrary?.name ?? (language === 'zh' ? '個人區' : 'Personal');
  const librarySwitcherPanel = isAuthenticated ? (
    <div className="border-b border-gray-200 bg-white px-3 py-1.5">
      <button
        type="button"
        onClick={() => setIsWorkspacePanelOpen((current) => !current)}
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50"
        aria-expanded={isWorkspacePanelOpen}
        aria-label={language === 'zh' ? '顯示工作區選項' : 'Show workspace options'}
        title={`${language === 'zh' ? '工作區' : 'Workspace'} · ${activeWorkspaceLabel}`}
      >
        <Users size={14} className="shrink-0 text-indigo-600" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-800">{activeWorkspaceLabel}</span>
        {isWorkspacePanelOpen ? (
          <ChevronUp size={14} className="shrink-0 text-gray-400" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-gray-400" />
        )}
      </button>

      {isWorkspacePanelOpen ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              setIsWorkspacePanelOpen(true);
              setIsCreateTeamOpen((current) => !current);
            }}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
              isCreateTeamOpen
                ? 'border-indigo-200 bg-indigo-100 text-indigo-700'
                : 'border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
            title={language === 'zh' ? '建立團隊' : 'Create team'}
            aria-label={language === 'zh' ? '建立團隊' : 'Create team'}
            aria-expanded={isCreateTeamOpen}
          >
            <UserPlus size={14} />
            <span>{language === 'zh' ? '建立團隊' : 'Create team'}</span>
          </button>

          {shouldShowCreateTeamForm ? (
            <form onSubmit={handleCreateTeam} className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/70 p-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500">
                {language === 'zh' ? '團隊名稱' : 'Team name'}
              </label>
              <input
                type="text"
                value={newTeamName}
                onChange={(event) => setNewTeamName(event.target.value)}
                placeholder={language === 'zh' ? '例如：主日敬拜團' : 'e.g. Sunday Worship Team'}
                className="mt-1 h-9 w-full rounded-lg border border-indigo-100 bg-white px-2.5 text-sm font-semibold text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-300"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateTeamOpen(false);
                    setNewTeamName('');
                  }}
                  disabled={isCreatingTeam}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTeam || !newTeamName.trim()}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-indigo-600 px-2 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {isCreatingTeam ? copy.cloudSyncSyncing : (language === 'zh' ? '建立' : 'Create')}
                </button>
              </div>
            </form>
          ) : null}

          {hasTeamLibraries ? (
            <div className="mt-2 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
              {workspaceLibraryButtons.map((library) => {
                const isPlaceholder = cloudLibraries.length === 0;
                const isActive = isPlaceholder || library.id === activeCloudLibrary?.id;
                return (
                  <button
                    key={library.id}
                    type="button"
                    onClick={() => {
                      if (!isPlaceholder) {
                        void handleSwitchCloudLibrary(library.id);
                      }
                    }}
                    disabled={isPlaceholder || isSwitchingLibrary || isActive}
                    className={`inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:cursor-default ${
                      isActive
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:text-indigo-700'
                    }`}
                    title={library.name}
                  >
                    <Users size={12} />
                    <span className="max-w-[120px] truncate">{library.kind === 'personal' ? (language === 'zh' ? '個人區' : 'Personal') : library.name}</span>
                    {library.kind === 'team' ? (
                      <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] text-gray-500">
                        {getRoleLabel(library.role, language)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {teamFeatureError ? (
            <div className="mt-2 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800">
              {teamFeatureError}
            </div>
          ) : null}

          {canManageActiveTeam ? (
            <button
              type="button"
              onClick={() => setIsTeamManagementOpen((current) => !current)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
            >
              <Users size={14} />
              <span>{language === 'zh' ? '成員與邀請' : 'Members & Invites'}</span>
            </button>
          ) : isTeamWorkspace ? (
            <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-500">
              {language === 'zh' ? `目前權限：${getRoleLabel(activeLibraryRole, language)}` : `Role: ${getRoleLabel(activeLibraryRole, language)}`}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  const teamManagementPanel = isWorkspacePanelOpen && isTeamManagementOpen && canManageActiveTeam ? (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
            {language === 'zh' ? '團隊管理' : 'Team Management'}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-gray-600">
            {activeCloudLibrary?.name}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadTeamManagement()}
          disabled={isLoadingTeamManagement}
          className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600 disabled:cursor-wait disabled:opacity-60"
        >
          {isLoadingTeamManagement ? copy.cloudSyncSyncing : copy.setlistSharingRefresh}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <input
          value={teamInviteEmail}
          onChange={(event) => setTeamInviteEmail(event.target.value)}
          placeholder={language === 'zh' ? '受邀 Gmail / Email' : 'Invitee Gmail / Email'}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:bg-white"
        />
        <div className="flex gap-2">
          <select
            value={teamInviteRole}
            onChange={(event) => setTeamInviteRole(event.target.value as Exclude<LibraryRole, 'owner'>)}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-indigo-300"
          >
            <option value="editor">{getRoleLabel('editor', language)}</option>
            <option value="setlist_manager">{getRoleLabel('setlist_manager', language)}</option>
            <option value="viewer">{getRoleLabel('viewer', language)}</option>
          </select>
          <button
            type="button"
            onClick={() => void handleCreateTeamInvite()}
            disabled={isCreatingTeamInvite || !teamInviteEmail.trim()}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {language === 'zh' ? '邀請' : 'Invite'}
          </button>
        </div>
        {teamInviteShareUrl ? (
          <div className="break-all rounded-xl bg-indigo-50 px-3 py-2 text-[11px] font-medium text-indigo-700">
            {teamInviteShareUrl}
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
          {language === 'zh' ? '成員' : 'Members'}
        </div>
        {(teamManagement?.members ?? []).map((member) => (
          <div key={member.userId} className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-gray-900">{member.name || member.email}</div>
              <div className="truncate text-[11px] text-gray-500">{member.email}</div>
            </div>
            {member.role === 'owner' ? (
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-gray-600">{getRoleLabel(member.role, language)}</span>
            ) : (
              <>
                <select
                  value={member.role}
                  onChange={(event) => void handleUpdateTeamMemberRole(member.userId, event.target.value as Exclude<LibraryRole, 'owner'>)}
                  className="max-w-[130px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700"
                >
                  <option value="editor">{getRoleLabel('editor', language)}</option>
                  <option value="setlist_manager">{getRoleLabel('setlist_manager', language)}</option>
                  <option value="viewer">{getRoleLabel('viewer', language)}</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleRemoveTeamMember(member.userId)}
                  className="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                >
                  {copy.delete}
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {(teamManagement?.invites ?? []).length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
            {language === 'zh' ? '待接受邀請' : 'Pending Invites'}
          </div>
          {teamManagement!.invites.map((invite) => (
            <div key={invite.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-gray-900">{invite.email}</div>
                <div className="truncate text-[11px] text-gray-500">{getRoleLabel(invite.role, language)}</div>
              </div>
              <button
                type="button"
                onClick={() => void handleRevokeTeamInvite(invite.id)}
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
              >
                {copy.cancel}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  const setlistSortOptions: Array<{ value: SetlistSortMode; label: string }> = [
    { value: 'updated-desc', label: copy.setlistSortUpdated },
    { value: 'created-desc', label: copy.setlistSortCreated },
    { value: 'name-asc', label: copy.setlistSortName }
  ];

  const desktopSetlistSavedFooter = (
    <div className="border-t border-gray-200 px-5 py-4">
      <div className={`text-xs font-medium ${workspaceIsDirty ? 'text-amber-600' : 'text-gray-500'}`}>
        {workspaceIsDirty ? copy.unsavedChanges : formatSavedAt(lastSavedAt, language)}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        {isAutoSaveEnabled ? copy.autoSavedHint : copy.manualSaveHint}
      </div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
        v{APP_VERSION}
      </div>
    </div>
  );

  const renderProjectCard = (project: Project | null, options: { isUngrouped?: boolean }) => {
    const isUngrouped = options.isUngrouped ?? false;
    const projectId = project?.id ?? null;
    const name = isUngrouped ? copy.ungroupedProject : (project?.name || copy.untitledProject);
    const count = isUngrouped ? ungroupedSetlistCount : (project ? projectSetlistCount(project.id) : 0);
    const archived = !isUngrouped && Boolean(project?.archived);
    const canManage = project ? canManageProject(project) : false;

    // Manageable projects get the same swipe-to-archive/delete row as setlists:
    // right swipe → archive (indigo, left), left swipe → delete (rose, right).
    // Rename stays as a pencil inside the foreground card (no swipe equivalent).
    if (project && !isUngrouped && canManage) {
      const swipeAction = mobileSwipeProject?.id === project.id ? mobileSwipeProject.action : null;
      const dragOffset = draggingProject?.id === project.id ? draggingProject.dx : null;
      const translateClass = dragOffset !== null
        ? ''
        : swipeAction === 'delete' ? '-translate-x-20' : swipeAction === 'archive' ? 'translate-x-20' : 'translate-x-0';
      const baseStyle = archived ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white';
      return (
        <div key={project.id} className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-y-0 left-0 flex items-stretch">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleSetProjectArchived(project.id, !project.archived);
              }}
              className="flex w-20 items-center justify-center rounded-l-2xl bg-indigo-500 px-3 text-center text-sm font-bold leading-tight text-white"
              aria-label={`${project.archived ? copy.unarchiveProject : copy.archiveProject} ${name}`}
              title={project.archived ? copy.unarchiveProject : copy.archiveProject}
            >
              {project.archived ? copy.unarchiveSetlist : copy.archiveSetlist}
            </button>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-stretch">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteProject(project.id);
              }}
              className="flex w-20 items-center justify-center rounded-r-2xl bg-rose-500 px-3 text-sm font-bold text-white"
              aria-label={`${copy.delete} ${name}`}
              title={copy.delete}
            >
              {copy.delete}
            </button>
          </div>
          <div
            onTouchStart={(event) => projectSwipe.touchStart(project.id, event)}
            onTouchMove={projectSwipe.touchMove}
            onTouchEnd={(event) => projectSwipe.touchEnd(project.id, event)}
            onTouchCancel={projectSwipe.reset}
            onPointerDown={(event) => projectSwipe.pointerDown(project.id, event)}
            onPointerMove={projectSwipe.pointerMove}
            onPointerUp={(event) => projectSwipe.pointerEnd(project.id, event)}
            onPointerCancel={projectSwipe.reset}
            style={dragOffset !== null ? { transform: `translateX(${dragOffset}px)`, transition: 'none' } : undefined}
            className={`relative flex select-none items-start gap-2 border p-3 transition-transform duration-200 ease-out [touch-action:pan-y] ${baseStyle} ${translateClass}`}
          >
            <button
              type="button"
              onClick={() => {
                if (mobileProjectSwipeHandledRef.current) {
                  mobileProjectSwipeHandledRef.current = false;
                  return;
                }
                if (swipeAction) {
                  setMobileSwipeProject(null);
                  return;
                }
                handleSelectProject(project.id);
              }}
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 truncate text-sm font-bold text-gray-900">{name}</div>
                  {archived && (
                    <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">{copy.archivedProjectBadge}</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-500">{count} {copy.setlists}</div>
              </div>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const nextName = window.prompt(copy.renameProjectPrompt, project.name);
                  if (nextName !== null) handleRenameProject(project.id, nextName);
                }}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                title={copy.renameProject}
                aria-label={copy.renameProject}
              >
                <Edit3 size={15} />
              </button>
              {project.archived && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSetProjectArchived(project.id, false);
                  }}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                  title={copy.unarchiveProject}
                  aria-label={copy.unarchiveProject}
                >
                  <ArchiveRestore size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Ungrouped pseudo-project and non-manageable projects: plain, non-swipe card.
    return (
      <div
        key={projectId ?? '__ungrouped__'}
        className={`rounded-2xl border border-gray-200 p-3 transition-all ${archived ? 'bg-gray-50' : 'bg-white'}`}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => handleSelectProject(projectId)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 truncate text-sm font-bold text-gray-900">{name}</div>
              {archived && (
                <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">{copy.archivedProjectBadge}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500">{count} {copy.setlists}</div>
          </button>
        </div>
      </div>
    );
  };

  const desktopSetlistProjectsPanel = (
    <>
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSetlistPanelView('list')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
            title={language === 'zh' ? '返回歌單總覽' : 'Back to setlists'}
            aria-label={language === 'zh' ? '返回歌單總覽' : 'Back to setlists'}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-gray-900">{language === 'zh' ? '專案管理' : 'Manage projects'}</div>
            <div className="mt-0.5 text-xs text-gray-500">{language === 'zh' ? '整理歌單，不影響目前譜面' : 'Organize setlists without changing the current sheet'}</div>
          </div>
        </div>
        {canCreateProject && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleCreateProject}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
            >
              <Plus size={16} />
              <span>{copy.newProject}</span>
            </button>
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
          <span>{copy.projects}</span>
          <span>{visibleProjects.length}</span>
        </div>
        {archivedProjectsCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchivedProjects((current) => !current)}
            className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
              showArchivedProjects ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Archive size={13} />
            {showArchivedProjects ? copy.hideArchivedProjects : `${copy.showArchivedProjects} (${archivedProjectsCount})`}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {renderProjectCard(null, { isUngrouped: true })}
          {visibleProjects.map((project) => renderProjectCard(project, { isUngrouped: false }))}
        </div>

        {joinedProjects.length > 0 && (
          <div className="mt-5 space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              {language === 'zh' ? '別人分享的專案' : 'Shared with me'}
            </div>
            {joinedProjects.map((jp) => (
              <button
                key={jp.id}
                type="button"
                onClick={() => {
                  handleSetlistProjectFilterChange({ kind: 'shared-project', projectId: jp.id });
                  setSetlistPanelView('list');
                }}
                className="block w-full rounded-2xl border border-indigo-100 bg-white p-3 text-left transition-colors hover:bg-indigo-50/40"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{jp.name}</div>
                  <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {language === 'zh' ? '已加入' : 'Joined'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {jp.setlists.length} {copy.setlistItems}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const desktopSetlistListPanel = (
    <>
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-h-9 min-w-0 flex-1 items-center">
            <div className="flex min-w-0 items-center gap-2">
              <ListMusic size={16} className="shrink-0 text-indigo-500" />
              <span className="text-base font-bold text-gray-900 dark:text-[color:var(--color-text)]">
                {language === 'zh' ? '歌單總覽' : 'Setlists'}
              </span>
            </div>
          </div>
          {selectedProjectShareTarget && canShareSelectedProject && (
            <button
              type="button"
              onClick={() => void handleCreateProjectShareLink(selectedProjectShareTarget.id)}
              disabled={creatingProjectShareLinkId === selectedProjectShareTarget.id}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-60"
              title={language === 'zh' ? '分享專案' : 'Share project'}
              aria-label={language === 'zh' ? '分享專案' : 'Share project'}
            >
              {creatingProjectShareLinkId === selectedProjectShareTarget.id ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-500" aria-hidden />
              ) : (
                <Share2 size={15} />
              )}
            </button>
          )}
        </div>
        {projectSharingPanel ? <div className="mt-3">{projectSharingPanel}</div> : null}
        <div className="mt-3 flex min-w-0 items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{language === 'zh' ? '專案篩選' : 'Project filter'}</span>
            <select
              value={serializeSetlistProjectFilter(setlistProjectFilter)}
              onChange={(event) => {
                const nextFilter = parseSetlistProjectFilter(event.target.value);
                if (nextFilter) handleSetlistProjectFilterChange(nextFilter);
              }}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition-colors focus:border-indigo-300"
              aria-label={language === 'zh' ? '專案篩選' : 'Project filter'}
            >
              <option value="all">{language === 'zh' ? '全部歌單' : 'All setlists'}</option>
              <option value="ungrouped">{copy.ungroupedProject}</option>
              {activeProjects.length > 0 && (
                <optgroup label={language === 'zh' ? '我的專案' : 'My projects'}>
                  {activeProjects.map((project) => (
                    <option key={project.id} value={`owned-project:${project.id}`}>{project.name}</option>
                  ))}
                </optgroup>
              )}
              {joinedProjects.length > 0 && (
                <optgroup label={language === 'zh' ? '共享專案' : 'Shared projects'}>
                  {joinedProjects.map((project) => (
                    <option key={project.id} value={`shared-project:${project.id}`}>{project.name}</option>
                  ))}
                </optgroup>
              )}
              {joinedSetlists.length > 0 && (
                <option value="shared-setlists">{copy.sharedWithMe}</option>
              )}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSetlistPanelView('manageProjects')}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 transition-colors hover:border-indigo-200 hover:text-indigo-700"
            title={language === 'zh' ? '管理專案' : 'Manage projects'}
          >
            <FolderTree size={15} />
            <span>{language === 'zh' ? '管理' : 'Manage'}</span>
          </button>
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
            <Search size={15} className="shrink-0 text-gray-400" />
            <input
              type="text"
              value={setlistSearchQuery}
              onChange={(event) => setSetlistSearchQuery(event.target.value)}
              placeholder={copy.searchSetlists}
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
            />
          </label>
        </div>
        {canCreateTeamSetlists && (
            <button
              type="button"
              onClick={handleCreateSetlist}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
            >
              <Plus size={18} />
              <span>{copy.newSetlist}</span>
            </button>
        )}
        <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
            <span>{selectedProjectFilterLabel}</span>
            <span>{normalizedSetlistSearchQuery
              ? `${filteredSetlists.length + filteredJoinedSetlists.length}/${visibleSetlists.length + joinedSetlistsInScope.length}`
              : visibleSetlists.length + joinedSetlistsInScope.length}</span>
          </div>
          <select
            value={setlistSortMode}
            onChange={(event) => setSetlistSortMode(event.target.value as SetlistSortMode)}
            className="h-8 min-w-0 max-w-[9rem] shrink-0 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 outline-none transition-colors focus:border-indigo-300"
            aria-label={copy.setlistSort}
          >
            {setlistSortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {archivedSetlistCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchivedSetlists((current) => !current)}
            className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
              showArchivedSetlists ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Archive size={13} />
            {showArchivedSetlists ? copy.hideArchivedSetlists : `${copy.showArchivedSetlists} (${archivedSetlistCount})`}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {filteredSetlists.length === 0 && filteredJoinedSetlists.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              {showArchivedSetlists && archivedSetlistCount === 0 ? copy.noArchivedSetlists : copy.noSetlists}
            </div>
          )}
          {filteredSetlists.map((item) => {
            const isActive = item.id === selectedSetlist?.id;
            const previewTitles = getSetlistPreviewTitles(item, songs);
            const hiddenSongCount = Math.max(0, item.songs.length - previewTitles.length);
            const projectName = item.projectId
              ? projects.find((project) => project.id === item.projectId)?.name ?? copy.untitledProject
              : copy.ungroupedProject;
            const swipeAction = mobileSwipeSetlist?.id === item.id ? mobileSwipeSetlist.action : null;
            const dragOffset = draggingSetlist?.id === item.id ? draggingSetlist.dx : null;
            const canManage = canManageSetlist(item);
            const baseStyle = isActive
              ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100'
              : item.archived ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white';
            const translateClass = dragOffset !== null
              ? ''
              : swipeAction === 'delete' ? '-translate-x-20' : swipeAction === 'archive' ? 'translate-x-20' : 'translate-x-0';
            return (
              <div key={item.id} className="relative overflow-hidden rounded-2xl">
                {canManage && (
                  <div className="absolute inset-y-0 left-0 flex items-stretch">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSetSetlistArchived(item.id, !item.archived);
                      }}
                      className="flex w-20 items-center justify-center rounded-l-2xl bg-indigo-500 px-3 text-center text-sm font-bold leading-tight text-white"
                      aria-label={`${item.archived ? copy.unarchiveSetlist : copy.archiveSetlist} ${item.name || copy.untitledSetlist}`}
                      title={item.archived ? copy.unarchiveSetlist : copy.archiveSetlist}
                    >
                      {item.archived ? copy.unarchiveSetlist : copy.archiveSetlist}
                    </button>
                  </div>
                )}
                <div className="absolute inset-y-0 right-0 flex items-stretch">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteSetlist(item.id);
                    }}
                    className="flex w-20 items-center justify-center rounded-r-2xl bg-rose-500 px-3 text-sm font-bold text-white"
                    aria-label={`${copy.delete} ${item.name || copy.untitledSetlist}`}
                    title={copy.delete}
                  >
                    {copy.delete}
                  </button>
                </div>
                <div
                  onTouchStart={(event) => {
                    handleMobileSetlistTouchStart(item.id, event);
                    handleMobileLongPressStart('setlist', item.id, event);
                  }}
                  onTouchMove={(event) => {
                    handleMobileLongPressMove(event);
                    handleMobileSetlistTouchMove(event);
                  }}
                  onTouchEnd={(event) => {
                    if (mobileLongPressTriggeredRef.current) {
                      mobileLongPressTriggeredRef.current = false;
                      mobileSetlistSwipeHandledRef.current = true;
                      handleMobileLongPressEnd();
                      event.preventDefault();
                      return;
                    }
                    handleMobileLongPressEnd();
                    handleMobileSetlistTouchEnd(item.id, event);
                  }}
                  onTouchCancel={() => {
                    handleMobileLongPressEnd();
                    resetSetlistSwipe();
                  }}
                  onPointerDown={(event) => handleSetlistMousePointerDown(item.id, event)}
                  onPointerMove={handleSetlistMousePointerMove}
                  onPointerUp={(event) => handleSetlistMousePointerEnd(item.id, event)}
                  onPointerCancel={resetSetlistSwipe}
                  style={dragOffset !== null ? { transform: `translateX(${dragOffset}px)`, transition: 'none' } : undefined}
                  className={`relative flex select-none items-start gap-2 border p-3 transition-transform duration-200 ease-out [touch-action:pan-y] ${baseStyle} ${translateClass}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (mobileSetlistSwipeHandledRef.current) {
                        mobileSetlistSwipeHandledRef.current = false;
                        return;
                      }
                      if (swipeAction) {
                        setMobileSwipeSetlist(null);
                        return;
                      }
                      if (isMultiSelectMode) {
                        toggleMultiSelect(item.id);
                        return;
                      }
                      handleSelectSetlist(item.id);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    {isMultiSelectMode && (
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        multiSelectedSetlistIds.includes(item.id)
                          ? 'border-indigo-500 bg-indigo-500'
                          : 'border-gray-300 bg-white'
                      }`}>
                        {multiSelectedSetlistIds.includes(item.id) && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        )}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 truncate text-sm font-bold text-gray-900">{item.name || copy.untitledSetlist}</div>
                        {isActive && (
                          <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white">
                            {language === 'zh' ? '目前顯示' : 'Current'}
                          </span>
                        )}
                        {item.archived && (
                          <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">{copy.archivedSetlistBadge}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">{projectName}</span>
                        <span>{item.songs.length} {copy.setlistItems}</span>
                      </div>
                      {previewTitles.length > 0 && (
                        <div className="mt-2 space-y-0.5 rounded-xl bg-white/70 px-2.5 py-2 text-[11px] text-gray-600">
                          {previewTitles.map((title, index) => (
                            <div key={`${item.id}-${index}`} className="truncate">{index + 1}. {title}</div>
                          ))}
                          {hiddenSongCount > 0 && (
                            <div className="font-semibold text-gray-400">+{hiddenSongCount} {language === 'zh' ? '首' : 'more'}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                  {item.archived && canManage && !isMultiSelectMode && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSetSetlistArchived(item.id, false);
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                      title={copy.unarchiveSetlist}
                      aria-label={copy.unarchiveSetlist}
                    >
                      <ArchiveRestore size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {joinedSetlistsInScope.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              <span>{copy.sharedWithMe}</span>
              <span>{normalizedSetlistSearchQuery ? `${filteredJoinedSetlists.length}/${joinedSetlistsInScope.length}` : joinedSetlistsInScope.length}</span>
            </div>
            {filteredJoinedSetlists.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                {copy.noSetlists}
              </div>
            )}
            {filteredJoinedSetlists.map((item) => {
              const isActive = item.id === selectedSetlist?.id;
              const joinedSongSummaries = getSetlistCardSongSummaries(item);
              const joinedProject = joinedProjects.find((project) => project.setlists.some((setlist) => setlist.id === item.id)) ?? null;
              const hiddenSongCount = Math.max(0, item.songs.length - joinedSongSummaries.length);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3 transition-all ${
                    isActive ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100' : 'border-gray-200 bg-white'
                  }`}
                >
                  <button type="button" onClick={() => handleSelectJoinedSetlist(item.id)} className="w-full text-left">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{item.name || copy.untitledSetlist}</div>
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white">
                          {language === 'zh' ? '目前顯示' : 'Current'}
                        </span>
                      )}
                      <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{copy.joinedSetlistBadge}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700">
                        {joinedProject?.name ?? copy.sharedWithMe}
                      </span>
                      <span>{item.songs.length} {copy.setlistItems}</span>
                    </div>
                    {joinedSongSummaries.length > 0 ? (
                      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-indigo-100 bg-white/70 p-2">
                        {joinedSongSummaries.map((summary, index) => (
                          <div key={summary.id} className="min-w-0">
                            <div className="truncate text-[11px] font-bold text-gray-800">{index + 1}. {summary.title}</div>
                            <div className="break-words text-[10px] font-medium leading-4 text-gray-500">{summary.summary}</div>
                          </div>
                        ))}
                        {hiddenSongCount > 0 && (
                          <div className="text-[10px] font-semibold text-gray-400">+{hiddenSongCount} {language === 'zh' ? '首' : 'more'}</div>
                        )}
                      </div>
                    ) : null}
                  </button>
                  {!joinedProject && (
                    <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => requestLeaveSharedSetlist(item.id)}
                      disabled={leavingSharedSetlistId === item.id}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      {leavingSharedSetlistId === item.id ? copy.leavingSetlist : copy.leaveSetlist}
                    </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {desktopSetlistSavedFooter}
    </>
  );

  const desktopSetlistDetailPanel = selectedSetlist ? (
    <>
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsSetlistActionsMenuOpen(false);
              setSetlistSongSearchQuery('');
              setSetlistPanelView('list');
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
            title={copy.backToSetlists}
            aria-label={copy.backToSetlists}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{copy.setlistDetails}</div>
            {isJoinedSetlist || !canEditSelectedSetlist ? (
              <div className="mt-1 truncate text-base font-bold text-gray-900 dark:text-[color:var(--color-text)]">{selectedSetlist.name || copy.untitledSetlist}</div>
            ) : (
              <input
                value={selectedSetlist.name}
                onChange={(event) => handleSetlistNameChange(selectedSetlist.id, event.target.value)}
                className="mt-1 w-full rounded-lg bg-transparent text-base font-bold text-gray-900 outline-none placeholder:text-gray-400 focus:bg-indigo-50/50 dark:text-[color:var(--color-text)] dark:focus:bg-[color:var(--color-surface-raised)]"
                placeholder={copy.untitledSetlist}
              />
            )}
            <div className="mt-0.5 text-xs font-medium text-gray-500">{setlistSongsWithSource.length} {copy.setlistItems}</div>
          </div>
          {isJoinedSetlist ? (
            <div ref={setlistActionsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsSetlistActionsMenuOpen((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                title={language === 'zh' ? '歌單操作' : 'Setlist Actions'}
              >
                <MoreHorizontal size={16} />
              </button>
              {isSetlistActionsMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                  {selectedSetlistJoinedProject ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSetlistActionsMenuOpen(false);
                        requestLeaveSharedProject(selectedSetlistJoinedProject.id);
                      }}
                      disabled={leavingSharedProjectId === selectedSetlistJoinedProject.id}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <LogOut size={15} />
                      {copy.leaveProject}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSetlistActionsMenuOpen(false);
                        requestLeaveSharedSetlist(selectedSetlist.id);
                      }}
                      disabled={leavingSharedSetlistId === selectedSetlist.id}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <LogOut size={15} />
                      {copy.leaveSetlist}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : canEditSelectedSetlist ? (
            <div ref={setlistActionsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsSetlistActionsMenuOpen((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                title={language === 'zh' ? '歌單操作' : 'Setlist Actions'}
              >
                <MoreHorizontal size={16} />
              </button>
              {isSetlistActionsMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSetlistActionsMenuOpen(false);
                      setProjectPicker({ mode: 'move', setlistIds: [selectedSetlist.id] });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <FileText size={15} />
                    {copy.moveSetlistToProject}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSetlistActionsMenuOpen(false);
                      setProjectPicker({ mode: 'copy', setlistIds: [selectedSetlist.id] });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <Copy size={15} />
                    {copy.copySetlistToProject}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetSetlistArchived(selectedSetlist.id, !selectedSetlist.archived)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {selectedSetlist.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    {selectedSetlist.archived ? copy.unarchiveSetlist : copy.archiveSetlist}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSetlist(selectedSetlist.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    <Trash2 size={15} />
                    {copy.delete}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600">
              {getRoleLabel(activeLibraryRole, language)}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {canShareSelectedSetlist && setlistSharingPanel ? <div className="mb-3">{setlistSharingPanel}</div> : null}
        {joinedSetlistDisplayPreferencePanel ? <div className="mb-3">{joinedSetlistDisplayPreferencePanel}</div> : null}

        <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{copy.setlistItems}</div>
        {setlistSongsWithSource.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            {copy.noSetlistSongs}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {setlistSongsWithSource.map(({ item, sourceSong }, index) => {
              const isActive = item.id === selectedSetlistSong?.id;
              const effectiveKey = item.overrideKey ?? sourceSong.currentKey;
              const effectiveCapo = resolveSetlistSongCapo(item, sourceSong, guitaristMode);
              const displaySong = item.songData ?? sourceSong;
              const songInfoSummary = getSetlistSongInfoSummary(item, sourceSong);
              const isDropTarget = dragOverSetlistSongId === item.id;
              const isDragging = draggingSetlistSongId === item.id;

              return (
                <div
                  key={item.id}
                  data-setlist-song-id={item.id}
                  className={`group select-none rounded-xl border px-2.5 py-2 transition-all ${
                    isActive
                      ? 'border-indigo-200 bg-indigo-50/80 shadow-sm shadow-indigo-100/60'
                      : isDropTarget
                        ? 'border-indigo-200 bg-indigo-50/70'
                        : 'border-gray-200 bg-white hover:bg-gray-50/70'
                  } ${isDragging ? 'scale-[0.99] ring-2 ring-indigo-200' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                          isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {index + 1}
                        </span>
                        {canReorderSelectedSetlist && (
                          <button
                            type="button"
                            onPointerDown={(event) => handleSetlistSongDragHandlePointerDown(event, item.id)}
                            onPointerMove={handleSetlistSongDragHandlePointerMove}
                            onPointerUp={finishSetlistSongPointerDrag}
                            onPointerCancel={finishSetlistSongPointerDrag}
                            className="touch-pan-y cursor-grab rounded-lg border border-gray-200 bg-white p-2 text-gray-400 transition-colors group-hover:border-indigo-200 group-hover:text-indigo-500 active:cursor-grabbing"
                            title={language === 'zh' ? '拖動排序' : 'Drag to reorder'}
                            aria-label={language === 'zh' ? '拖動排序' : 'Drag to reorder'}
                          >
                            <GripVertical size={14} />
                          </button>
                        )}
                        <button type="button" onClick={() => handleSelectSetlistSong(item.id)} className="min-w-0 flex-1 text-left">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="min-w-0 truncate text-sm font-bold text-gray-900">{displaySong.title || sourceSong.title || copy.untitledSong}</div>
                            {isActive && (
                              <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-bold text-indigo-700">
                                {language === 'zh' ? '目前顯示' : 'Current'}
                              </span>
                            )}
                          </div>
                          {songInfoSummary ? (
                            <div className="mt-0.5 break-words text-[11px] font-medium leading-4 text-gray-400">
                              {songInfoSummary}
                            </div>
                          ) : null}
                        </button>
                        {canEditSelectedSetlist && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSetlistSong(item.id)}
                            className="rounded-full p-1.5 text-gray-300 opacity-70 transition-all group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                            title={copy.removeFromSetlist}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="flex min-w-0 items-end gap-2 pl-9">
                        <div className="w-[92px] shrink-0">
                          <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400">
                            {language === 'zh' ? '歌單 Key' : 'Setlist Key'}
                          </div>
                          <KeyPicker
                            value={effectiveKey}
                            onChange={(key) => {
                              if (!key) return;
                              handleSetlistSongKeyChange(item.id, effectiveKey, effectiveCapo, key);
                            }}
                            label={copy.key}
                            originalKey={sourceSong.currentKey}
                            align="left"
                            disabled={!canEditSelectedSetlistKey}
                            buttonClassName={`!h-8 !w-[92px] !min-w-0 !gap-1 !rounded-lg !border-gray-200 !bg-gray-50 !px-2 ${!canEditSelectedSetlistKey ? '!cursor-default !opacity-100' : ''}`}
                            valueTextClassName="!text-xs !leading-none"
                            triggerIconSize={12}
                            touchOptimized={!hasFinePointer}
                          />
                        </div>
                        <div className="w-[92px] shrink-0">
                          <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400">Capo</div>
                          <CapoPicker
                            value={effectiveCapo}
                            currentKey={effectiveKey}
                            onChange={isJoinedSetlist
                              ? (capo) => handleJoinedSetlistCapoChange(item.id, capo)
                              : isCloudMode
                                ? (capo) => handlePersonalSetlistCapoChange(item.id, capo)
                              : (capo) => handleUpdateSetlistSong(item.id, (currentSetlistSong) => ({ ...currentSetlistSong, capo }))}
                            label="Capo"
                            align="right"
                            buttonClassName="!h-8 !w-[92px] !min-w-0 !gap-1 !rounded-lg !border-gray-200 !bg-gray-50 !px-2"
                            valueTextClassName="!text-xs !leading-none"
                            showPlayKey={false}
                            triggerIconSize={12}
                            touchOptimized={!hasFinePointer}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedSetlist && canEditSelectedSetlist && (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setIsSetlistActionsMenuOpen(false);
              setSetlistAddSongSelection([]);
              setSetlistPanelView('addSongs');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
          >
            <Plus size={16} />
            <span>{copy.addToSetlist}</span>
          </button>
        </div>
      )}

      {desktopSetlistSavedFooter}
    </>
  ) : desktopSetlistListPanel;

  const desktopSetlistAddSongsPanel = selectedSetlist ? (
    <>
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsSetlistActionsMenuOpen(false);
              setSetlistSongSearchQuery('');
              setSetlistAddSongSelection([]);
              setSetlistPanelView('detail');
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
            title={copy.backToPreview}
            aria-label={copy.backToPreview}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-gray-900">{copy.addToSetlist}</div>
            <div className="mt-0.5 truncate text-xs font-medium text-gray-500">
              {setlistAddSongSelection.length > 0
                ? (language === 'zh' ? `已選 ${setlistAddSongSelection.length} 首` : `${setlistAddSongSelection.length} selected`)
                : (language === 'zh' ? '可勾選多首，同一首可加多份' : 'Tap to select; +/- adds repeats')}
            </div>
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            value={setlistSongSearchQuery}
            onChange={(event) => setSetlistSongSearchQuery(event.target.value)}
            placeholder={copy.searchSongsToAdd}
            className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {filteredSongsForSetlist.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
              {copy.noSongsMatch}
            </div>
          ) : (
            filteredSongsForSetlist.map((librarySong) => {
              const libraryMeta = getSongLibraryMeta(librarySong, copy.editor.shuffle);
              const addedCount = selectedSetlist?.songs.filter((item) => item.songId === librarySong.id).length ?? 0;
              const selectedCount = setlistAddSongSelection.filter((id) => id === librarySong.id).length;
              const isSelected = selectedCount > 0;
              return (
                <div
                  key={`setlist-add-${librarySong.id}`}
                  className={`flex items-center gap-2 rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSetlistAddSongSelection(librarySong.id)}
                    aria-pressed={isSelected}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition-colors ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-gray-300 bg-white text-transparent'
                      }`}
                    >
                      {selectedCount > 1 ? selectedCount : <Check size={14} strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-gray-900">
                          {librarySong.title || copy.untitledSong}
                        </div>
                        {addedCount > 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            {language === 'zh' ? '已加入' : 'Added'}{addedCount > 1 ? ` ×${addedCount}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-gray-500" title={libraryMeta.tooltip}>
                        {libraryMeta.primary}
                      </div>
                      {libraryMeta.secondary && (
                        <div className="truncate text-[11px] text-gray-400" title={libraryMeta.tooltip}>
                          {libraryMeta.secondary}
                        </div>
                      )}
                    </div>
                  </button>
                  {isSelected && (
                    <div className="mr-2 flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => decrementSetlistAddSongSelection(librarySong.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 transition-colors hover:bg-indigo-50"
                        aria-label={language === 'zh' ? `減少一份 ${librarySong.title || copy.untitledSong}` : `Remove one ${librarySong.title || copy.untitledSong}`}
                      >
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <span className="min-w-[1.25rem] text-center text-sm font-bold text-indigo-700">{selectedCount}</span>
                      <button
                        type="button"
                        onClick={() => incrementSetlistAddSongSelection(librarySong.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 transition-colors hover:bg-indigo-50"
                        aria-label={language === 'zh' ? `多加一份 ${librarySong.title || copy.untitledSong}` : `Add one more ${librarySong.title || copy.untitledSong}`}
                      >
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          disabled={setlistAddSongSelection.length === 0}
          onClick={() => handleAddSongsToSetlist(setlistAddSongSelection)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
        >
          <Plus size={16} />
          <span>
            {setlistAddSongSelection.length > 0
              ? (language === 'zh' ? `加入 ${setlistAddSongSelection.length} 首` : `Add ${setlistAddSongSelection.length}`)
              : (language === 'zh' ? '加入歌曲' : 'Add songs')}
          </span>
        </button>
      </div>

      {desktopSetlistSavedFooter}
    </>
  ) : desktopSetlistListPanel;

  const showSidebarWorkspacePanels = !isPhoneViewport
    || !isSetlistMode
    || setlistPanelView === 'list'
    || setlistPanelView === 'manageProjects';

  return (
    <div
      data-app-root
      className="relative flex h-[100dvh] min-h-[100dvh] min-w-0 overflow-hidden bg-[#F5F5F4] font-sans text-[#1C1917] selection:bg-indigo-100 selection:text-indigo-900 dark:bg-[color:var(--color-surface-muted)] dark:text-[color:var(--color-text)] dark:selection:bg-[color:var(--color-indigo-800)] dark:selection:text-[color:var(--color-indigo-100)]"
      style={{
        // Keep the app clear of the iOS status bar / notch (Capacitor). These are
        // 0 in a normal browser, so the web build is unaffected.
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)'
      }}
    >
      {usesOverlaySidebar && isSidebarExpanded && (
        <button
          type="button"
          onClick={() => {
            if (isPhoneViewport) {
              setIsMobileNavOpen(false);
            } else {
              setIsSidebarPinned(false);
              setIsSidebarHovered(false);
            }
          }}
          className="absolute inset-0 z-40 bg-stone-950/10 backdrop-blur-[1px]"
          aria-label={copy.collapseSongList}
        />
      )}

      {/* Navigation Rail / Sidebar */}
      <motion.aside
        data-sidebar
        initial={false}
        animate={isPhoneViewport ? { width: phoneSidebarShellWidth } : { width: sidebarShellWidth }}
        transition={isSidebarResizing ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.32 }}
        className={isPhoneViewport ? 'absolute inset-y-0 left-0 z-50 overflow-hidden' : 'relative z-50 flex-shrink-0 overflow-visible'}
        style={isPhoneViewport ? { pointerEvents: isMobileNavOpen ? 'auto' : 'none' } : undefined}
      >
        <motion.div
          initial={false}
          animate={isPhoneViewport
            ? { x: isMobileNavOpen ? 0 : -phoneSidebarHiddenOffset, opacity: isMobileNavOpen ? 1 : 0.96 }
            : { width: currentSidebarWidth }}
          transition={isSidebarResizing
            ? { duration: 0 }
            : isPhoneViewport
              ? { type: 'spring', bounce: 0, duration: 0.28 }
              : { type: 'spring', bounce: 0, duration: 0.32 }}
          onMouseEnter={handleSidebarHoverTrigger}
          onMouseMove={handleSidebarHoverTrigger}
          onMouseLeave={() => {
            if (!isSidebarPinned) {
              setIsSidebarHovered(false);
            }
          }}
          className={`absolute inset-y-0 left-0 flex overflow-hidden border-r border-gray-200 bg-white dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface)] ${
            isPhoneViewport
              ? 'rounded-r-[28px] shadow-[0_24px_60px_rgba(15,23,42,0.18)]'
              : usesOverlaySidebar && isSidebarExpanded
              ? 'rounded-r-[28px] shadow-[0_24px_60px_rgba(15,23,42,0.18)]'
              : ''
          }`}
          style={isPhoneViewport ? { width: `${resolvedSidebarWidth}px` } : undefined}
        >
          {isSidebarExpanded && !usesOverlaySidebar && !isPhoneViewport && (
            <button
              type="button"
              onMouseDown={handleSidebarResizeStart}
              className="absolute right-0 top-1/2 z-50 h-14 w-5 -translate-y-1/2 cursor-col-resize bg-transparent"
              title={copy.resizeSongList}
              aria-label={copy.resizeSongList}
            >
              <span className="absolute right-[2px] top-1/2 h-12 w-[8px] -translate-y-1/2 rounded-full border border-indigo-100 bg-white shadow-sm" />
            </button>
          )}
          {!isPhoneViewport && (
            <div
              className="flex h-full shrink-0 flex-col items-center gap-3 border-r border-gray-200 bg-white py-4 sm:py-5 dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface)]"
              style={{ width: `${collapsedSidebarWidth}px` }}
            >
              <div className="w-11 h-11 rounded-2xl overflow-hidden shadow-lg shadow-emerald-900/10 ring-1 ring-gray-200">
                <img src={logoSrc} alt="ChordMaster" className="h-full w-full object-cover" />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (isSidebarPinned) {
                    setIsSidebarPinned(false);
                    setIsSidebarHovered(false);
                  } else {
                    setIsSidebarPinned(true);
                    setIsSidebarHovered(true);
                  }
                }}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                  isSidebarPinned
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                    : isSidebarExpanded
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={isSidebarPinned ? copy.collapseSongList : copy.pinSongList}
              >
                {isSidebarExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>

              <div className="flex w-full flex-col items-center gap-2 px-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode('songs')}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                    !isSetlistMode ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={copy.songs}
                >
                  <FileText size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMode('setlists');
                    setSetlistPanelView(selectedSetlist ? 'detail' : 'list');
                    if (usesOverlaySidebar && !hasFinePointer) {
                      setIsSidebarPinned(true);
                      setIsSidebarHovered(true);
                    }
                  }}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                    isSetlistMode ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={copy.setlists}
                >
                  <ListMusic size={18} />
                </button>
                {!isSetlistMode && canEditTeamSongs && (
                  <button
                    type="button"
                    onClick={handleCreateSong}
                    className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100"
                    title={copy.newSong}
                  >
                    <Plus size={18} />
                  </button>
                )}
                {isSetlistMode && (
                  <button
                    type="button"
                    onClick={() => setGuitaristMode((current) => !current)}
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${
                      guitaristMode ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={language === 'zh'
                      ? (guitaristMode ? '吉他手模式（開啟中）：自動為未設定的歌補上 Capo，點擊關閉' : '吉他手模式：自動為未設定的歌補上吉他友善 Capo')
                      : (guitaristMode ? 'Guitarist mode (on): auto-fills capo for unset songs — click to turn off' : 'Guitarist mode: auto-fill guitar-friendly capo for unset songs')}
                    aria-label={language === 'zh' ? '吉他手模式' : 'Guitarist mode'}
                    aria-pressed={guitaristMode}
                  >
                    <Guitar size={18} />
                  </button>
                )}
              </div>

              <div className="mt-auto flex w-full flex-col items-center gap-3 px-2">
                <div className="flex flex-col items-center gap-1 text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                  <span>{isSetlistMode ? copy.setlists : copy.songs}</span>
                  <div className="min-w-10 rounded-full bg-gray-100 px-2 py-1 text-center text-xs text-gray-700">
                    {isSetlistMode ? setlists.length : songs.length}
                  </div>
                </div>
                <div className="flex w-full flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAppViewChange('about')}
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                      activeAppView === 'about'
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title={activeAppView === 'about' ? copy.backToPreview : copy.about}
                    aria-label={activeAppView === 'about' ? copy.backToPreview : copy.about}
                  >
                    <Info size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAppViewChange('help')}
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                      activeAppView === 'help'
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title={activeAppView === 'help' ? copy.backToPreview : copy.help}
                    aria-label={activeAppView === 'help' ? copy.backToPreview : copy.help}
                  >
                    <BookOpen size={18} />
                  </button>
                  {isAuthenticated ? (
                    <button
                      type="button"
                      onClick={() => (syncStatus === 'failed' || syncStatus === 'offline' ? toast.error(syncStatusLabel) : toast.success(syncStatusLabel))}
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ring-inset transition-colors ${syncStatusTone}`}
                      title={`${language === 'zh' ? '同步狀態' : 'Sync status'}: ${syncStatusLabel}`}
                      aria-label={`${language === 'zh' ? '同步狀態' : 'Sync status'}: ${syncStatusLabel}`}
                    >
                      {syncStatus === 'syncing'
                        ? <LoaderCircle size={18} className="animate-spin" />
                        : syncStatus === 'offline'
                          ? <CloudOff size={18} />
                          : syncStatus === 'failed'
                            ? <CloudAlert size={18} />
                            : <CloudCheck size={18} />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toast.info(copy.localModeWarning)}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200/70 transition-colors hover:bg-gray-200"
                      title={`${language === 'zh' ? '同步狀態' : 'Sync status'}: ${language === 'zh' ? '本地模式（未連線雲端）' : 'Local mode (not synced)'}`}
                      aria-label={`${language === 'zh' ? '同步狀態' : 'Sync status'}: ${language === 'zh' ? '本地模式（未連線雲端）' : 'Local mode (not synced)'}`}
                    >
                      <HardDrive size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <motion.div
            initial={false}
            animate={{
              opacity: isSidebarExpanded ? 1 : 0,
              x: isSidebarExpanded ? 0 : -20
            }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="min-w-0 min-h-0 flex-1 flex flex-col"
            style={{ pointerEvents: isSidebarExpanded ? 'auto' : 'none' }}
          >
            {isPhoneViewport && (
              <div className="border-b border-gray-200 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <img src={logoSrc} alt="ChordMaster" className="h-10 w-10 rounded-xl shadow-sm ring-1 ring-gray-200" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-gray-900 dark:text-[color:var(--color-text)]">{APP_NAME}</div>
                      <div className="mt-0.5 truncate text-xs font-medium text-gray-500">
                        {mobileDrawerContextLabel}
                        {mobileDrawerContextValue ? ` · ${mobileDrawerContextValue}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(false)}
                    className="rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                  >
                    {copy.done}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMode('songs');
                      setActiveAppView('sheet');
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      !isSetlistMode && isSheetView
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.songs}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMode('setlists');
                      setActiveAppView('sheet');
                      setSetlistPanelView(selectedSetlist ? 'detail' : 'list');
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      isSetlistMode && isSheetView
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.setlists}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleAppViewChange('about');
                      setIsMobileNavOpen(false);
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      activeAppView === 'about'
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.about}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleAppViewChange('help');
                      setIsMobileNavOpen(false);
                    }}
                    className={`min-w-0 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                      activeAppView === 'help'
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                        : 'border border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {copy.help}
                  </button>
                </div>
              </div>
            )}

            {showSidebarWorkspacePanels ? librarySwitcherPanel : null}
            {showSidebarWorkspacePanels ? teamManagementPanel : null}

            {isSetlistMode ? (
              <SetlistNavigator
                view={setlistPanelView}
                list={desktopSetlistListPanel}
                detail={desktopSetlistDetailPanel}
                addSongs={desktopSetlistAddSongsPanel}
                manageProjects={desktopSetlistProjectsPanel}
              />
            ) : (
              <>
                <div className="shrink-0">
                <div className="px-5 py-4 border-b border-gray-200">
                  {isPhoneViewport ? (
                    <div className="flex items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                        <Search size={15} className="shrink-0 text-gray-400" />
                        <input
                          type="text"
                          value={librarySearchQuery}
                          onChange={(event) => setLibrarySearchQuery(event.target.value)}
                          placeholder={copy.searchSongs}
                          className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                        />
                      </label>
                      {canEditTeamSongs && (
                        <>
                          <button
                            type="button"
                            onClick={handleCreateSong}
                            aria-label={copy.newSong}
                            title={copy.newSong}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                          >
                            <Plus size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={handleToggleLibraryEditing}
                            aria-label={isLibraryEditing ? copy.done : copy.manage}
                            title={isLibraryEditing ? copy.done : copy.manage}
                            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              isLibraryEditing ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            <Edit3 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {canEditTeamSongs && <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={handleCreateSong}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500"
                        >
                          <Plus size={16} />
                          <span>{copy.newSong}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleLibraryEditing}
                          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                            isLibraryEditing ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Edit3 size={16} />
                          <span>{isLibraryEditing ? copy.done : copy.manage}</span>
                        </button>
                      </div>}
                      <div className="mt-3 flex items-center gap-1.5">
                        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                          <Search size={15} className="shrink-0 text-gray-400" />
                          <input
                            type="text"
                            value={librarySearchQuery}
                            onChange={(event) => setLibrarySearchQuery(event.target.value)}
                            placeholder={copy.searchSongs}
                            className="w-full min-w-0 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleExportSongLibraryJson}
                          aria-label={copy.exportJson}
                          title={copy.exportJson}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                        >
                          <Download size={15} />
                        </button>
                        {canEditTeamSongs && (
                          <button
                            type="button"
                            onClick={handleImportSongLibraryClick}
                            aria-label={copy.importJson}
                            title={copy.importJson}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                          >
                            <Upload size={15} />
                          </button>
                        )}
                        {isTeamWorkspace && canEditTeamSongs && personalCloudLibrary && personalCloudLibrary.id !== activeLibraryId ? (
                          <button
                            type="button"
                            onClick={() => void handleImportPersonalSongsToTeam()}
                            disabled={isImportingPersonalSongs}
                            aria-label={language === 'zh' ? '從個人區批量匯入' : 'Import personal songs'}
                            title={language === 'zh' ? '從個人區批量匯入' : 'Import personal songs'}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Copy size={15} />
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                  <input
                    ref={importLibraryInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportSongLibrary}
                    className="hidden"
                  />
                  {isLibraryEditing && (
                    <>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-gray-500">
                        <span>{language === 'zh' ? `已選 ${selectedLibrarySongIds.length} 首` : `${selectedLibrarySongIds.length} selected`}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={handleToggleSelectAllFilteredSongs}
                            className="rounded-lg px-2 py-1 text-indigo-600 transition-colors hover:bg-indigo-50"
                          >
                            {filteredSongs.length > 0 && filteredSongs.every((item) => selectedLibrarySongIds.includes(item.id))
                              ? (language === 'zh' ? '取消全選' : 'Deselect all')
                              : (language === 'zh' ? '全選目前結果' : 'Select results')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsLibraryEditing(false)}
                            className="rounded-lg px-2 py-1 text-gray-500 transition-colors hover:bg-gray-100"
                          >
                            {copy.cancel}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleShareSelectedSongs()}
                        disabled={selectedLibrarySongIds.length === 0 || isCreatingSongShare}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-indigo-100 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isCreatingSongShare ? <LoaderCircle size={16} className="animate-spin" /> : <Share2 size={16} />}
                        <span>{language === 'zh' ? `分享所選 (${selectedLibrarySongIds.length})` : `Share selected (${selectedLibrarySongIds.length})`}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSelectedSongs}
                        disabled={selectedLibrarySongIds.length === 0}
                        className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                        <span>{`${copy.deleteSelected} (${selectedLibrarySongIds.length})`}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveLibrarySongDuplicates}
                        className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50"
                      >
                        <Copy size={16} />
                        <span>{language === 'zh' ? '移除重複歌曲' : 'Remove duplicate songs'}</span>
                      </button>
                    </>
                  )}
                </div>
                </div>

                <div className="px-3 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                    <span>{copy.songs}</span>
                    <span>{normalizedLibrarySearchQuery ? `${filteredSongs.length}/${songs.length}` : songs.length}</span>
                  </div>
                  <select
                    value={librarySortMode}
                    onChange={(event) => setLibrarySortMode(event.target.value as LibrarySortMode)}
                    className="mt-2 h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 outline-none transition-colors focus:border-indigo-300"
                    aria-label={language === 'zh' ? '歌曲排序' : 'Sort songs'}
                  >
                    <option value="updated-desc">{language === 'zh' ? '最近更新' : 'Recently updated'}</option>
                    <option value="created-desc">{language === 'zh' ? '最近添加' : 'Recently added'}</option>
                    <option value="name-asc">{language === 'zh' ? '名稱 A→Z' : 'Name A→Z'}</option>
                  </select>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredSongs.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                      {copy.noSongsMatch}
                    </div>
                  )}
                  {filteredSongs.map((item) => {
                    const isActive = item.id === song.id;
                    const libraryMeta = getSongLibraryMeta(item, copy.editor.shuffle);
                    const teamSourceStatus = teamSourceStatuses[item.id];
                    const hasLinkedTeamUpdate = !isTeamWorkspace
                      && Boolean(item.teamSource)
                      && typeof teamSourceStatus?.latestUpdatedAt === 'number'
                      && teamSourceStatus.latestUpdatedAt > (item.teamSource?.updatedAt ?? 0);
                    const teamSourceLabel = item.teamSource
                      ? hasLinkedTeamUpdate
                        ? (language === 'zh' ? '團隊版有更新' : 'Team version updated')
                        : teamSourceStatus?.missing
                          ? (language === 'zh' ? '團隊來源找不到' : 'Team source missing')
                          : teamSourceStatus?.error
                            ? (language === 'zh' ? '無法檢查團隊來源' : 'Unable to check team source')
                            : `${language === 'zh' ? '連結' : 'Linked'}: ${item.teamSource.libraryName ?? (language === 'zh' ? '團隊歌曲' : 'Team song')}`
                      : null;

                    return (
                      <div
                        key={item.id}
                        className={`relative rounded-xl border transition-all ${
                          isActive
                            ? 'border-indigo-200 bg-indigo-50 shadow-sm shadow-indigo-100'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {isLibraryEditing ? (
                          <div className="px-3 py-3 pr-14">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedLibrarySongIds.includes(item.id)}
                                onChange={() => handleToggleSongBulkSelection(item.id)}
                                className="mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className={`mt-0.5 rounded-lg p-2 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <FileText size={14} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <input
                                  value={item.title}
                                  onChange={(event) => handleSongListTitleChange(item.id, event.target.value)}
                                  onBlur={(event) => handleSongListTitleCommit(item.id, event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  className={`w-full rounded-md border px-2 py-1 text-sm font-bold outline-none transition-colors ${
                                    isActive
                                      ? 'border-indigo-200 bg-white text-indigo-900 focus:border-indigo-400'
                                      : 'border-gray-200 bg-white text-gray-800 focus:border-gray-400'
                                  }`}
                                  placeholder={copy.untitledSong}
                                />
                                <div className="mt-1 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                                  {libraryMeta.primary}
                                </div>
                                {libraryMeta.secondary && (
                                  <div className="mt-0.5 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                                    {libraryMeta.secondary}
                                  </div>
                                )}
                                {teamSourceLabel ? (
                                  <div className={`mt-1 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    hasLinkedTeamUpdate
                                      ? 'bg-amber-100 text-amber-700'
                                      : teamSourceStatus?.missing || teamSourceStatus?.error
                                        ? 'bg-rose-50 text-rose-600'
                                        : 'bg-emerald-50 text-emerald-700'
                                  }`}>
                                    <span className="truncate">{teamSourceLabel}</span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (mobileLongPressTriggeredRef.current) {
                                mobileLongPressTriggeredRef.current = false;
                                return;
                              }

                              handleSelectSong(item.id);
                            }}
                            onTouchStart={(event) => handleMobileLongPressStart('song', item.id, event)}
                            onTouchMove={(event) => handleMobileLongPressMove(event)}
                            onTouchEnd={(event) => {
                              if (mobileLongPressTriggeredRef.current) {
                                event.preventDefault();
                              }
                              handleMobileLongPressEnd();
                            }}
                            onTouchCancel={() => handleMobileLongPressEnd()}
                            className="w-full px-3 py-3 pr-14 text-left [touch-action:pan-y]"
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 rounded-lg p-2 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <FileText size={14} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`text-sm font-bold leading-snug whitespace-normal break-words ${isActive ? 'text-indigo-900' : 'text-gray-800'}`}>
                                  {item.title || copy.untitledSong}
                                </div>
                                <div className="mt-1 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                                  {libraryMeta.primary}
                                </div>
                                {libraryMeta.secondary && (
                                  <div className="mt-0.5 truncate text-xs text-gray-500" title={libraryMeta.tooltip}>
                                    {libraryMeta.secondary}
                                  </div>
                                )}
                                {teamSourceLabel ? (
                                  <div className={`mt-1 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    hasLinkedTeamUpdate
                                      ? 'bg-amber-100 text-amber-700'
                                      : teamSourceStatus?.missing || teamSourceStatus?.error
                                        ? 'bg-rose-50 text-rose-600'
                                        : 'bg-emerald-50 text-emerald-700'
                                  }`}>
                                    <span className="truncate">{teamSourceLabel}</span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        )}
                        {!isLibraryEditing && (
                          <div className="absolute right-2 top-1/2 flex w-6 -translate-y-1/2 flex-col items-center justify-center gap-0">
                            {canEditTeamSongs ? (
                              <>
                                {hasLinkedTeamUpdate ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleSyncPersonalSongFromTeam(item.id);
                                    }}
                                    className="rounded-md p-0.5 text-amber-600 transition-colors hover:bg-white hover:text-amber-700"
                                    aria-label={language === 'zh' ? `同步 ${item.title || copy.untitledSong} 到團隊最新版` : `Sync ${item.title || copy.untitledSong} to latest team version`}
                                    title={language === 'zh' ? '同步團隊最新版' : 'Sync latest team version'}
                                  >
                                    <Download size={13} />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDuplicateSong(item.id);
                                  }}
                                  className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-white hover:text-indigo-600"
                                  aria-label={`${copy.duplicate} ${item.title || copy.untitledSong}`}
                                  title={`${copy.duplicate} ${item.title || copy.untitledSong}`}
                                >
                                  <Copy size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSelectSong(item.id);
                                    setIsEditing(true);
                                  }}
                                  className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-white hover:text-indigo-600"
                                  aria-label={`${copy.edit} ${item.title || copy.untitledSong}`}
                                  title={`${copy.edit} ${item.title || copy.untitledSong}`}
                                >
                                  <Edit3 size={13} />
                                </button>
                              </>
                            ) : isTeamWorkspace ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCopyTeamSongToPersonal(item.id);
                                }}
                                className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-white hover:text-indigo-600"
                                aria-label={language === 'zh' ? `轉存 ${item.title || copy.untitledSong}` : `Copy ${item.title || copy.untitledSong} to personal library`}
                                title={language === 'zh' ? '轉存到個人區' : 'Copy to personal'}
                              >
                                <Copy size={13} />
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-gray-200 px-5 py-4">
                  <div className={`text-xs font-medium ${workspaceIsDirty ? 'text-amber-600' : 'text-gray-500'}`}>
                    {workspaceIsDirty ? copy.unsavedChanges : formatSavedAt(lastSavedAt, language)}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {isAutoSaveEnabled ? copy.autoSavedHint : copy.manualSaveHint}
                  </div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    v{APP_VERSION}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      </motion.aside>

      {/* Main Content */}
      <main data-main-panel className="flex min-w-0 flex-1 flex-col">
        {(!isAuthenticated || authUiError || authUiMessage || isLoadingCloudWorkspace) && (
          <div className={`flex-shrink-0 border-b ${
            authUiError
              ? 'border-rose-200 bg-rose-50'
              : isAuthenticated
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-sky-200 bg-sky-50'
          } ${isPhoneViewport ? 'px-3 py-1.5' : 'px-4 py-2 sm:px-6 xl:px-8'}`}>
            <p
              className={`font-medium ${
                authUiError
                  ? 'text-rose-700'
                  : isAuthenticated
                    ? 'text-emerald-700'
                    : 'text-sky-800'
              } ${isPhoneViewport ? 'text-xs leading-5' : 'text-sm'}`}
            >
              {authUiError
                ?? authUiMessage
                ?? (isLoadingCloudWorkspace
                  ? copy.cloudSyncSyncing
                  : (!isAuthenticated ? copy.localModeWarning : syncStatusLabel))}
            </p>
          </div>
        )}

        {/* Top Control Bar */}
        <header data-topbar className={`z-40 flex-shrink-0 border-b border-gray-200 bg-white/80 backdrop-blur-md dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface)]/85 ${
          isPhoneViewport
            ? 'px-3 py-2.5'
            : usesDenseDesktopHeader
              ? 'px-4 py-2.5 sm:px-5 xl:px-6'
              : 'px-4 py-3 sm:px-6 sm:py-4 xl:px-8'
        }`}>
          {isPhoneViewport ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileNavOpen((current) => !current);
                    setIsMobileActionsSheetOpen(false);
                    setIsMobileMetadataOpen(false);
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  aria-label={isMobileNavOpen ? copy.collapseSongList : copy.pinSongList}
                  title={isMobileNavOpen ? copy.collapseSongList : copy.pinSongList}
                >
                  <ChevronRight size={18} className={`transition-transform ${isMobileNavOpen ? 'rotate-180' : ''}`} />
                </button>

                <img src={logoSrc} alt="ChordMaster" className="h-9 w-9 rounded-xl shadow-sm ring-1 ring-gray-200" />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold tracking-tight text-gray-900">{APP_NAME}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    {isSheetView ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${
                        isSetlistMode
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                          : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                      }`}>
                        {workspaceModeBadge}
                      </span>
                    ) : null}
                    <span className="truncate text-[11px] font-medium text-gray-500">{activeAppViewLabel}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileActionsSheetOpen(true);
                    setIsMobileNavOpen(false);
                    setIsMobileMetadataOpen(false);
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  aria-label={copy.editor.more}
                  title={copy.editor.more}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>

              {isSheetView ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={handleToggleEditor}
                    className={`${getMobileTopbarActionClassName(isEditing ? 'primary' : 'default')} shrink-0`}
                    title={isEditing ? copy.closeEditor : copy.openEditor}
                    aria-label={isEditing ? copy.closeEditor : copy.openEditor}
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleLyricsMode}
                    className={`${getMobileTopbarActionClassName(isLyricsMode ? 'accent' : 'default')} shrink-0`}
                    title={copy.lyricsMode}
                    aria-label={copy.lyricsMode}
                  >
                    <FileText size={16} />
                  </button>

                  {renderReferenceButtons(`${getMobileTopbarActionClassName('default')} shrink-0`, {
                    activeClassName: `${getMobileTopbarActionClassName('primary')} shrink-0`
                  })}

                  <KeyPicker
                    value={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(key) => {
                      if (!key) {
                        return;
                      }

                      if (isSetlistMode) {
                        handleSetlistKeyChange(key);
                      } else {
                        handleKeyChange(key);
                      }
                    }}
                    label={copy.key}
                    originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                    panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    triggerDensity="compact"
                    disabled={isSetlistMode && !canEditSelectedSetlistKey}
                    buttonClassName="h-10 min-w-[58px] shrink-0 rounded-xl px-2.5 disabled:!cursor-default disabled:!opacity-100"
                    metaTextClassName="hidden"
                    triggerIconSize={14}
                  />

                  <CapoPicker
                    value={isSetlistMode ? currentSetlistCapo : currentCapo}
                    currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(capo) => {
                      if (isSetlistMode) {
                        handleSelectedSetlistCapoChange(capo);
                      } else {
                        handleSongChange({ ...song, capo });
                      }
                    }}
                    label="Capo"
                    triggerDensity="compact"
                    buttonClassName="h-10 min-w-[58px] shrink-0 rounded-xl px-2.5"
                    showPlayKey={false}
                    triggerIconSize={14}
                  />

                  {renderSetlistDisplayModeControl()}

                  {!isSetlistMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                        className={`${mobileTopbarToggleChipClassName(song.showNashvilleNumbers)} shrink-0`}
                        title={copy.nashvilleModeLabel}
                        aria-label={copy.nashvilleModeLabel}
                      >
                        <span className={inlineModeBadgeClassName(song.showNashvilleNumbers)}>123</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                        className={`${mobileTopbarToggleChipClassName(song.showAbsoluteJianpu)} shrink-0`}
                        title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                        aria-label={copy.fixedDoModeLabel}
                      >
                        <span className={inlineModeBadgeClassName(song.showAbsoluteJianpu)}>1=C</span>
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : usesDenseDesktopHeader ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <img src={logoSrc} alt="ChordMaster" className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-gray-200" />
                  <h2 className="truncate font-display text-lg font-bold tracking-tight text-gray-900 dark:text-[color:var(--color-text)]">{APP_NAME}</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">
                    v{APP_VERSION}
                  </span>
                </div>

                <div className="h-4 w-px shrink-0 bg-gray-200" />

                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold tracking-[0.08em] ${
                    isSetlistMode
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                      : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                  }`}>
                    {workspaceModeBadge}
                  </span>
                  {denseHeaderShowsContextLabel ? (
                    <span className="max-w-[24rem] truncate text-sm font-medium text-gray-500">
                      {activeAppViewLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2">
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={handleToggleEditor}
                    title={isEditing ? copy.closeEditor : copy.openEditor}
                    aria-label={isEditing ? copy.closeEditor : copy.openEditor}
                    className={isEditing ? denseToolbarPrimaryActionClassName : denseToolbarActionClassName}
                  >
                    <Edit3 size={14} />
                    {denseToolbarShowsLabels ? <span>{compactEditorToggleLabel}</span> : null}
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleLyricsMode}
                    title={copy.lyricsMode}
                    aria-label={copy.lyricsMode}
                    className={denseToolbarToggleClassName(isLyricsMode, 'accent')}
                  >
                    <FileText size={14} />
                    {denseToolbarShowsLabels ? <span>{compactLyricsToggleLabel}</span> : null}
                  </button>

                  <button
                    type="button"
                    onClick={handleEnterPerformanceMode}
                    title={copy.performanceMode}
                    aria-label={copy.performanceMode}
                    className={denseToolbarActionClassName}
                  >
                    <Play size={14} />
                    {denseToolbarShowsLabels ? <span>{copy.performanceMode}</span> : null}
                  </button>

                  {renderReferenceButtons(denseToolbarActionClassName, {
                    showLabels: denseToolbarShowsLabels,
                    activeClassName: denseToolbarShowsLabels
                      ? desktopToolbarPrimaryActionClassName
                      : denseToolbarPrimaryActionClassName
                  })}

                  <KeyPicker
                    value={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(key) => {
                      if (!key) {
                        return;
                      }

                      if (isSetlistMode) {
                        handleSetlistKeyChange(key);
                      } else {
                        handleKeyChange(key);
                      }
                    }}
                    label={copy.key}
                    originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                    panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    triggerDensity="compact"
                    disabled={isSetlistMode && !canEditSelectedSetlistKey}
                    buttonClassName={`${denseToolbarShowsLabels ? 'min-w-[60px]' : 'min-w-[56px]'} h-9 shrink-0 whitespace-nowrap rounded-lg px-2.5 disabled:!cursor-default disabled:!opacity-100`}
                    metaTextClassName="hidden"
                    triggerIconSize={14}
                  />

                  <CapoPicker
                    value={isSetlistMode ? currentSetlistCapo : currentCapo}
                    currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(capo) => {
                      if (isSetlistMode) {
                        handleSelectedSetlistCapoChange(capo);
                      } else {
                        handleSongChange({ ...song, capo });
                      }
                    }}
                    label="Capo"
                    triggerDensity="compact"
                    buttonClassName={`${denseToolbarShowsLabels ? 'min-w-[70px]' : 'min-w-[58px]'} h-9 shrink-0 whitespace-nowrap rounded-lg px-2.5`}
                    showPlayKey={denseToolbarShowsLabels && mainViewportWidth >= 1820}
                    triggerIconSize={14}
                  />

                  {renderSetlistDisplayModeControl()}

                  {!isSetlistMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                        title={copy.nashvilleModeLabel}
                        aria-label={copy.nashvilleModeLabel}
                        className={denseToolbarToggleClassName(song.showNashvilleNumbers)}
                      >
                        <span className={`inline-flex min-w-[24px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-black leading-none ${
                          song.showNashvilleNumbers
                            ? 'border-indigo-200 bg-white/70 text-current'
                            : 'border-gray-200 bg-gray-50 text-gray-600'
                        }`}>
                          123
                        </span>
                        {denseToolbarShowsLabels ? <span>{copy.nashvilleModeLabel}</span> : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                        title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                        aria-label={copy.fixedDoModeLabel}
                        className={denseToolbarToggleClassName(song.showAbsoluteJianpu)}
                      >
                        <span className={`inline-flex min-w-[28px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-black leading-none ${
                          song.showAbsoluteJianpu
                            ? 'border-indigo-200 bg-white/70 text-current'
                            : 'border-gray-200 bg-gray-50 text-gray-600'
                        }`}>
                          1=C
                        </span>
                        {denseToolbarShowsLabels ? <span>{copy.fixedDoModeLabel}</span> : null}
                      </button>
                    </>
                  )}
                </div>

                <div ref={toolbarOverflowMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsToolbarOverflowMenuOpen((current) => !current)}
                    className={denseToolbarMenuButtonClassName}
                    aria-haspopup="menu"
                    aria-expanded={isToolbarOverflowMenuOpen}
                    aria-label={copy.editor.more}
                    title={copy.editor.more}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {toolbarOverflowPanel}
                </div>

                {notificationBell}
                {isAuthenticated ? (
                  <div ref={googleAccountMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                        isGoogleAccountMenuOpen
                          ? 'border-indigo-300 ring-2 ring-indigo-100'
                          : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                      aria-haspopup="menu"
                      aria-expanded={isGoogleAccountMenuOpen}
                      aria-label={authenticatedUser.name}
                      title={authenticatedUser.name}
                    >
                      {authenticatedUser.picture ? (
                        <img
                          src={authenticatedUser.picture}
                          alt={authenticatedUser.name}
                          className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                          {authenticatedUser.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </button>

                    {isGoogleAccountMenuOpen && (
                      <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <div className="truncate text-sm font-semibold text-gray-800">{authenticatedUser.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-gray-500">{authenticatedUser.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGoogleSignOut}
                          className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  showGoogleAuth && googleUser ? (
                    <div ref={googleAccountMenuRef} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                          isGoogleAccountMenuOpen
                            ? 'border-indigo-300 ring-2 ring-indigo-100'
                            : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                        }`}
                        aria-haspopup="menu"
                        aria-expanded={isGoogleAccountMenuOpen}
                        aria-label={googleUser.name}
                        title={googleUser.name}
                      >
                        {googleUser.picture ? (
                          <img
                            src={googleUser.picture}
                            alt={googleUser.name}
                            className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                            {googleUser.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </button>

                      {isGoogleAccountMenuOpen && (
                        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <div className="truncate text-sm font-semibold text-gray-800">{googleUser.name}</div>
                            <div className="mt-0.5 truncate text-[11px] text-gray-500">{googleUser.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={handleGoogleSignOut}
                            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <LogOut size={14} />
                            <span>{copy.signOut}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : showGoogleAuth ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <div ref={googleSignInRef} className="flex min-h-9 min-w-0 items-center justify-end" />
                      {googleAuthError ? (
                        <span className="text-[10px] font-medium text-amber-600" title={googleAuthError}>!</span>
                      ) : null}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          ) : usesTabletHeader ? (
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <img src={logoSrc} alt="ChordMaster" className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-gray-200" />
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-bold tracking-tight text-gray-900 dark:text-[color:var(--color-text)]">{APP_NAME}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${
                      isSetlistMode
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                    }`}>
                      {workspaceModeBadge}
                    </span>
                    {mainViewportWidth >= 840 ? (
                      <span className="truncate text-[12px] font-medium text-gray-500">{activeAppViewLabel}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 items-center justify-end">
                <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={handleToggleEditor}
                    title={isEditing ? copy.closeEditor : copy.openEditor}
                    aria-label={isEditing ? copy.closeEditor : copy.openEditor}
                    className={isEditing ? denseToolbarPrimaryActionClassName : denseToolbarActionClassName}
                  >
                    <Edit3 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleLyricsMode}
                    title={copy.lyricsMode}
                    aria-label={copy.lyricsMode}
                    className={denseToolbarToggleClassName(isLyricsMode, 'accent')}
                  >
                    <FileText size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={handleEnterPerformanceMode}
                    title={copy.performanceMode}
                    aria-label={copy.performanceMode}
                    className={denseToolbarActionClassName}
                  >
                    <Play size={14} />
                  </button>

                  {renderReferenceButtons(denseToolbarActionClassName, {
                    activeClassName: denseToolbarPrimaryActionClassName
                  })}

                  <KeyPicker
                    value={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(key) => {
                      if (!key) {
                        return;
                      }

                      if (isSetlistMode) {
                        handleSetlistKeyChange(key);
                      } else {
                        handleKeyChange(key);
                      }
                    }}
                    label={copy.key}
                    originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                    panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    triggerDensity="compact"
                    disabled={isSetlistMode && !canEditSelectedSetlistKey}
                    buttonClassName="h-9 min-w-[60px] shrink-0 rounded-lg px-2.5 disabled:!cursor-default disabled:!opacity-100"
                    metaTextClassName="hidden"
                    triggerIconSize={14}
                  />

                  <CapoPicker
                    value={isSetlistMode ? currentSetlistCapo : currentCapo}
                    currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(capo) => {
                      if (isSetlistMode) {
                        handleSelectedSetlistCapoChange(capo);
                      } else {
                        handleSongChange({ ...song, capo });
                      }
                    }}
                    label="Capo"
                    triggerDensity="compact"
                    buttonClassName="h-9 min-w-[62px] shrink-0 rounded-lg px-2.5"
                    showPlayKey={mainViewportWidth >= 1080}
                    triggerIconSize={14}
                  />

                  {renderSetlistDisplayModeControl()}

                  {!isSetlistMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                        title={copy.nashvilleModeLabel}
                        aria-label={copy.nashvilleModeLabel}
                        className={denseToolbarToggleClassName(song.showNashvilleNumbers)}
                      >
                        <span className={inlineModeBadgeClassName(song.showNashvilleNumbers)}>123</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                        title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                        aria-label={copy.fixedDoModeLabel}
                        className={denseToolbarToggleClassName(song.showAbsoluteJianpu)}
                      >
                        <span className={inlineModeBadgeClassName(song.showAbsoluteJianpu)}>1=C</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div ref={toolbarOverflowMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsToolbarOverflowMenuOpen((current) => !current)}
                    className={denseToolbarMenuButtonClassName}
                    aria-haspopup="menu"
                    aria-expanded={isToolbarOverflowMenuOpen}
                    aria-label={copy.editor.more}
                    title={copy.editor.more}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {toolbarOverflowPanel}
                </div>

                {notificationBell}
                {isAuthenticated ? (
                  <div ref={googleAccountMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                        isGoogleAccountMenuOpen
                          ? 'border-indigo-300 ring-2 ring-indigo-100'
                          : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                      aria-haspopup="menu"
                      aria-expanded={isGoogleAccountMenuOpen}
                      aria-label={authenticatedUser.name}
                      title={authenticatedUser.name}
                    >
                      {authenticatedUser.picture ? (
                        <img
                          src={authenticatedUser.picture}
                          alt={authenticatedUser.name}
                          className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                          {authenticatedUser.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </button>

                    {isGoogleAccountMenuOpen && (
                      <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <div className="truncate text-sm font-semibold text-gray-800">{authenticatedUser.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-gray-500">{authenticatedUser.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGoogleSignOut}
                          className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  showGoogleAuth && googleUser ? (
                    <div ref={googleAccountMenuRef} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsGoogleAccountMenuOpen((current) => !current)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm transition-colors ${
                          isGoogleAccountMenuOpen
                            ? 'border-indigo-300 ring-2 ring-indigo-100'
                            : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                        }`}
                        aria-haspopup="menu"
                        aria-expanded={isGoogleAccountMenuOpen}
                        aria-label={googleUser.name}
                        title={googleUser.name}
                      >
                        {googleUser.picture ? (
                          <img
                            src={googleUser.picture}
                            alt={googleUser.name}
                            className="h-7 w-7 rounded-full border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                            {googleUser.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </button>

                      {isGoogleAccountMenuOpen && (
                        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                          <div className="rounded-xl bg-gray-50 px-3 py-2">
                            <div className="truncate text-sm font-semibold text-gray-800">{googleUser.name}</div>
                            <div className="mt-0.5 truncate text-[11px] text-gray-500">{googleUser.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={handleGoogleSignOut}
                            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <LogOut size={14} />
                            <span>{copy.signOut}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : showGoogleAuth ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <div ref={googleSignInRef} className="flex min-h-9 min-w-0 items-center justify-end" />
                      {googleAuthError ? (
                        <span className="text-[10px] font-medium text-amber-600" title={googleAuthError}>!</span>
                      ) : null}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <img src={logoSrc} alt="ChordMaster" className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-gray-200" />
                    <h2 className="truncate font-display text-lg font-bold tracking-tight">{APP_NAME}</h2>
                    <span className="hidden rounded-full bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-500 sm:inline-flex">
                      v{APP_VERSION}
                    </span>
                  </div>
                  <div className="hidden h-4 w-px bg-gray-200 sm:block" />
                  <div className="flex min-w-0 items-center gap-2">
                    {activeAppView === 'sheet' && (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] ${
                        isSetlistMode
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                          : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
                      }`}>
                        {workspaceModeBadge}
                      </span>
                    )}
                    <span className="max-w-[min(40vw,18rem)] truncate text-sm font-medium text-gray-500 sm:max-w-[22rem]">
                      {activeAppViewLabel}
                    </span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 self-stretch sm:self-auto">
                  {isAuthenticated ? (
                    <>
                      <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm ${
                        syncStatus === 'failed'
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                          : syncStatus === 'offline'
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      }`}>
                        {syncStatus === 'offline' ? <CloudOff size={15} /> : <Cloud size={15} />}
                        <span>{syncStatusLabel}</span>
                      </div>
                      {activeAppView === 'sheet' && !isSetlistMode && hasSongs && (!isTeamWorkspace || canEditTeamSongs) && (
                        <button
                          type="button"
                          onClick={() => void handleCreateShareLink('song')}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50"
                        >
                          <Share2 size={15} />
                          <span>{copy.shareCurrentSong}</span>
                        </button>
                      )}
                      {activeAppView === 'sheet' && isSetlistMode && selectedSetlist && canShareSelectedSetlist && (
                        <button
                          type="button"
                          onClick={() => void handleCreateShareLink('setlist')}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50"
                        >
                          <Share2 size={15} />
                          <span>{copy.shareCurrentSetlist}</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleGoogleSignIn()}
                        disabled={!isAuthConfigured}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ExternalLink size={15} />
                        <span>{copy.continueWithGoogle}</span>
                      </button>
                    </div>
                  )}

                  {showGoogleAuth && googleUser ? (
                    <div className="flex max-w-full min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                      {googleUser.picture ? (
                        <img
                          src={googleUser.picture}
                          alt={googleUser.name}
                          className="h-8 w-8 rounded-full border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {googleUser.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <div className="max-w-[180px] truncate text-sm font-bold text-gray-800">{googleUser.name}</div>
                        <div className="max-w-[180px] truncate text-[11px] text-gray-500">{googleUser.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleGoogleSignOut}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        title={copy.signOut}
                        aria-label={copy.signOut}
                      >
                        <LogOut size={14} />
                      </button>
                    </div>
                  ) : showGoogleAuth ? (
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-1 sm:w-auto">
                      <div ref={googleSignInRef} className="flex min-h-10 min-w-0 items-center justify-end sm:min-w-[220px]" />
                      {googleAuthError && (
                        <div className="text-right text-[11px] font-medium text-amber-600">{googleAuthError}</div>
                      )}
                    </div>
                  ) : null}

                  <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setLanguage('zh')}
                      className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                        language === 'zh' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      中文
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                        language === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      EN
                    </button>
                  </div>
                </div>
              </div>

              {isSheetView ? (
              <div className="flex min-w-0 flex-col gap-2.5">
                <div className="flex min-w-0 flex-col gap-2.5">
                  <div className={`grid min-w-0 gap-2 ${toolbarPrimaryGridClassName}`}>
                    <button
                      type="button"
                      onClick={handleToggleEditor}
                      className={isEditing ? toolbarPrimaryEmphasisActionClassName : toolbarPrimaryActionClassName}
                    >
                      <Edit3 size={16} />
                      <span>{isEditing ? copy.closeEditor : copy.openEditor}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleLyricsMode}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold shadow-sm transition-all ${
                        isLyricsMode
                          ? 'bg-amber-500 text-white shadow-amber-100'
                          : 'border border-gray-200 bg-white text-gray-700 hover:border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      <FileText size={16} />
                      <span>{copy.lyricsMode}</span>
                    </button>

                    <KeyPicker
                      value={isSetlistMode ? currentSetlistKey : song.currentKey}
                      onChange={(key) => {
                        if (!key) {
                          return;
                        }

                        if (isSetlistMode) {
                          handleSetlistKeyChange(key);
                        } else {
                          handleKeyChange(key);
                        }
                      }}
                    label={copy.key}
                    originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                    triggerMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    panelMetaText={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? '' : getKeyOptionMeta(song.currentKey)}
                    disabled={isSetlistMode && !canEditSelectedSetlistKey}
                    buttonClassName="h-11 w-full min-w-0 disabled:!cursor-default disabled:!opacity-100"
                  />

                    <CapoPicker
                    value={isSetlistMode ? currentSetlistCapo : currentCapo}
                    currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                    onChange={(capo) => {
                      if (isSetlistMode) {
                        handleSelectedSetlistCapoChange(capo);
                      } else {
                        handleSongChange({ ...song, capo });
                      }
                      }}
                      label="Capo"
                      buttonClassName="h-11 w-full min-w-0"
                    />

                    {renderSetlistDisplayModeControl('w-full', 'sm')}

                    <button
                      type="button"
                      onClick={handleSaveLibrary}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold shadow-sm transition-all ${
                        workspaceIsDirty
                          ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-400'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Save size={16} />
                      <span>{workspaceIsDirty ? copy.saveChanges : copy.saved}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={isExportingPdf}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold shadow-sm transition-all ${
                        isExportingPdf
                          ? 'cursor-wait bg-gray-400 text-white'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      <Save size={16} />
                      <span>{isExportingPdf ? copy.preparingPdf : isSetlistMode ? copy.exportSetlistPdf : copy.exportPdf}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEnterPerformanceMode}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                    >
                      <Play size={16} />
                      <span>{copy.performanceMode}</span>
                    </button>

                    {renderReferenceButtons(toolbarPrimaryActionClassName, {
                      showLabels: true,
                      activeClassName: toolbarPrimaryEmphasisActionClassName
                    })}
                  </div>

                  {!isSetlistMode && (
                    <div className="flex min-w-0 items-center justify-end gap-2">
                      {isToolbarSecondaryCollapsed ? (
                        <div ref={toolbarOverflowMenuRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setIsToolbarOverflowMenuOpen((current) => !current)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600"
                            aria-haspopup="menu"
                            aria-expanded={isToolbarOverflowMenuOpen}
                          >
                            <MoreHorizontal size={16} />
                            <span>{language === 'zh' ? '更多' : 'More'}</span>
                          </button>
                          {isToolbarOverflowMenuOpen && (
                            <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-48 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers });
                                  setIsToolbarOverflowMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                                  song.showNashvilleNumbers
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'
                                }`}
                                role="menuitemcheckbox"
                                aria-checked={song.showNashvilleNumbers}
                              >
                                <span className="flex items-center gap-2">
                                  <Hash size={14} />
                                  <span>{copy.nashvilleModeLabel}</span>
                                </span>
                                <span className="text-[11px] font-bold">{song.showNashvilleNumbers ? copy.on : copy.off}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu });
                                  setIsToolbarOverflowMenuOpen(false);
                                }}
                                className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                                  song.showAbsoluteJianpu
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'
                                }`}
                                role="menuitemcheckbox"
                                aria-checked={song.showAbsoluteJianpu}
                              >
                                <span className="flex items-center gap-2">
                                  <Music2 size={14} />
                                  <span>{copy.fixedDoModeLabel}</span>
                                </span>
                                <span className="text-[11px] font-bold">{song.showAbsoluteJianpu ? copy.on : copy.off}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                            className={toolbarSecondaryToggleClassName(song.showNashvilleNumbers)}
                          >
                            <Hash size={14} />
                            <span>{copy.nashvilleModeLabel}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                            title={song.showAbsoluteJianpu ? copy.showRelativeJianpu : copy.showAbsoluteJianpu}
                            className={toolbarSecondaryToggleClassName(song.showAbsoluteJianpu)}
                          >
                            <Music2 size={14} />
                            <span>{copy.fixedDoModeLabel}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <p className="hidden text-[11px] font-medium text-gray-400 min-[860px]:block min-[1240px]:text-gray-300">
                  {isSheetView ? (isSetlistMode ? copy.previewSetlistHint : copy.previewHint) : copy.infoHint}
                </p>
              </div>
              ) : (
              <div className="text-right">
                <div className="text-sm font-bold text-gray-700">
                  {activeAppView === 'about'
                    ? (language === 'zh' ? '關於 ChordMaster' : 'About ChordMaster')
                    : (language === 'zh' ? '使用說明' : 'Help')}
                </div>
                <div className="text-[11px] font-medium text-gray-400">
                  {copy.version} {APP_VERSION}
                </div>
              </div>
              )}
            </div>
          )}
        </header>

        {/* Content Area - Split View */}
        {isSheetView ? (
        <div data-content-area className="relative flex min-h-0 flex-1 overflow-hidden">
          {!shouldUseSplitEditor && isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 z-20 bg-stone-950/10 backdrop-blur-[1px]"
              aria-label={copy.closeEditor}
            />
          )}

          {/* Editor Pane */}
          <AnimatePresence initial={false}>
            {isEditing && (
              <motion.div 
                data-editor-pane
                initial={shouldUseSplitEditor ? { width: 0, opacity: 0 } : { x: -32, opacity: 0 }}
                animate={shouldUseSplitEditor ? { width: splitEditorWidth, opacity: 1 } : { x: 0, opacity: 1 }}
                exit={shouldUseSplitEditor ? { width: 0, opacity: 0 } : { x: -32, opacity: 0 }}
                transition={isEditorResizing ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.4 }}
                className={`overflow-hidden border-r border-gray-200 bg-white shadow-xl ${
                  shouldUseSplitEditor
                    ? 'relative z-10 flex-shrink-0'
                    : isPhoneViewport
                      ? 'absolute inset-0 z-30 max-w-full shadow-none'
                      : 'absolute inset-y-0 left-0 z-30 max-w-full rounded-r-[28px] shadow-[0_24px_60px_rgba(15,23,42,0.18)]'
                }`}
                style={shouldUseSplitEditor ? undefined : { width: overlayEditorWidth > 0 ? `${overlayEditorWidth}px` : '100%' }}
              >
                {shouldUseSplitEditor && !isPhoneViewport && hasFinePointer && (
                  <div
                    onMouseDown={handleEditorResizeStart}
                    onDoubleClick={handleEditorResizeReset}
                    role="separator"
                    aria-orientation="vertical"
                    title={language === 'zh' ? '拖曳調整編輯區寬度（雙擊還原自動）' : 'Drag to resize editor (double-click to reset)'}
                    className="group absolute inset-y-0 right-0 z-30 flex w-3 cursor-col-resize touch-none items-center justify-center"
                  >
                    <span className={`h-12 w-1 rounded-full transition-colors ${isEditorResizing ? 'bg-indigo-400' : 'bg-gray-200 group-hover:bg-indigo-300'}`} />
                  </div>
                )}
                <div data-editor-scroll-root className="h-full overflow-y-auto">
                  <div className="min-w-0 p-4 pb-24 sm:p-6 lg:p-8">
                    {isSetlistMode && selectedSetlist && selectedSetlistSong && selectedSetlistSourceSong ? (
                      <div className="space-y-5">
                        {isPhoneViewport ? mobileMetadataSummaryCard : <div>{metadataPanelContent}</div>}
                        {isLyricsMode ? (
                          <LyricsDocEditor
                            key={`${selectedSetlistSong.id}-lyrics`}
                            song={activeSetlistEditableSong ?? selectedSetlistSourceSong}
                            language={language}
                            onChange={handleSetlistSongContentChange}
                          />
                        ) : (
                          <SongEditor
                            key={`${selectedSetlistSong.id}-song`}
                            song={activeDraftEditorSong ?? activeSetlistEditableSong ?? selectedSetlistSourceSong}
                            language={language}
                            isPhoneViewport={isPhoneViewport}
                            history={activePreviewEditSession
                              ? { past: activePreviewEditSession.past, future: activePreviewEditSession.future }
                              : {
                                  past: currentSetlistSongHistory.past.map((snapshot) => snapshot.song),
                                  future: currentSetlistSongHistory.future.map((snapshot) => snapshot.song)
                                }}
                            onUndo={activePreviewEditSession ? () => setPreviewEditSession((current) => current ? undoPreviewDraft(current) : current) : handleSetlistUndo}
                            onRedo={activePreviewEditSession ? () => setPreviewEditSession((current) => current ? redoPreviewDraft(current) : current) : handleSetlistRedo}
                            onChange={handleActiveEditorSongChange}
                            metadataMode="setlist"
                            hideMetadataPanel
                            hideBarNumberControls
                            hideBottomAddSectionButton
                            showInlineAddSectionButton
                            activeSectionId={activeSectionId}
                            onActiveSectionChange={setActiveSectionId}
                            activeBar={activeBar}
                            onActiveBarChange={setActiveBar}
                            focusRequest={editorFocusRequest}
                            onFocusRequestHandled={(requestId) => {
                              setEditorFocusRequest(current => current?.requestId === requestId ? null : current);
                            }}
                          />
                        )}
                      </div>
                    ) : isSetlistMode ? (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-sm text-gray-500">
                        {selectedSetlist ? copy.selectSetlistSong : copy.noSetlists}
                      </div>
                    ) : !hasSongs ? (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-sm leading-6 text-gray-500">
                        {language === 'zh' ? '這個團隊還沒有歌曲。請先新增第一首歌。' : 'This team has no songs yet. Add the first song before editing.'}
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {isPhoneViewport ? mobileMetadataSummaryCard : metadataPanelContent}
                        {isLyricsMode ? (
                          <LyricsDocEditor
                            key={`${song.id}-lyrics`}
                            song={song}
                            language={language}
                            onChange={handleSongChange}
                          />
                        ) : (
                          <SongEditor
                            key={song.id}
                            song={(activeDraftEditorSong ?? song) as StoredSong}
                            language={language}
                            isPhoneViewport={isPhoneViewport}
                            history={activePreviewEditSession ? { past: activePreviewEditSession.past, future: activePreviewEditSession.future } : currentSongHistory}
                            onUndo={activePreviewEditSession ? () => setPreviewEditSession((current) => current ? undoPreviewDraft(current) : current) : handleUndo}
                            onRedo={activePreviewEditSession ? () => setPreviewEditSession((current) => current ? redoPreviewDraft(current) : current) : handleRedo}
                            onChange={handleActiveEditorSongChange}
                            hideMetadataPanel
                            showInlineAddSectionButton
                            activeSectionId={activeSectionId}
                            onActiveSectionChange={setActiveSectionId}
                            activeBar={activeBar}
                            onActiveBarChange={setActiveBar}
                            focusRequest={editorFocusRequest}
                            onFocusRequestHandled={(requestId) => {
                              setEditorFocusRequest(current => current?.requestId === requestId ? null : current);
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className={`absolute z-40 pointer-events-none ${isPhoneViewport ? 'bottom-4 left-4' : 'left-6 bottom-6'}`}>
                  <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur-sm">
                    <button
                      onClick={handleScrollEditorToTop}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                      title={copy.backToTop}
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      onClick={activePreviewEditSession ? () => setPreviewEditSession((current) => current ? undoPreviewDraft(current) : current) : isSetlistMode ? handleSetlistUndo : handleUndo}
                      disabled={activePreviewEditSession ? activePreviewEditSession.past.length === 0 : isSetlistMode ? currentSetlistSongHistory.past.length === 0 : currentSongHistory.past.length === 0}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:border-gray-200 transition-all shadow-sm"
                      title={copy.undo}
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      onClick={activePreviewEditSession ? () => setPreviewEditSession((current) => current ? redoPreviewDraft(current) : current) : isSetlistMode ? handleSetlistRedo : handleRedo}
                      disabled={activePreviewEditSession ? activePreviewEditSession.future.length === 0 : isSetlistMode ? currentSetlistSongHistory.future.length === 0 : currentSongHistory.future.length === 0}
                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:border-gray-200 transition-all shadow-sm"
                      title={copy.redo}
                    >
                      <Redo2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sheet Preview Pane */}
          <div className="relative flex-1 min-w-0 bg-[#F5F5F4] dark:bg-[color:var(--color-surface-muted)]">
            <div
              ref={previewRef}
              data-print-preview-container
              onMouseDown={handlePreviewMouseDown}
              onTouchStart={handlePreviewTouchStart}
              onTouchMove={handlePreviewTouchMove}
              onTouchEnd={handlePreviewTouchEnd}
              onTouchCancel={handlePreviewTouchEnd}
              onClickCapture={handlePreviewClickCapture}
              onScroll={handlePreviewScroll}
              style={{
                scrollPaddingBottom: previewEditorBottomInset ? `${previewEditorBottomInset}px` : undefined,
                paddingBottom: previewEditorBottomInset ? `${previewEditorBottomInset}px` : undefined
              }}
              className={`h-full overflow-auto p-3 sm:p-4 lg:p-8 xl:p-12 [overflow-anchor:none] [scrollbar-gutter:stable_both-edges] [touch-action:pan-x_pan-y] ${isPreviewDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            >
              <div
                ref={previewCanvasRef}
                className="relative flex min-h-full min-w-full items-start justify-center"
                style={{
                  width: `var(--preview-live-canvas-width, ${previewCanvasWidth}px)`,
                  height: `var(--preview-live-canvas-height, ${previewSheetHeight}px)`
                }}
              >
                <div
                  ref={sheetRef}
                  data-print-preview
                  style={{ 
                    transform: `scale(var(--preview-live-scale, ${previewScale}))`,
                    transformOrigin: 'top center',
                    width: `${sheetMetrics.width}px`,
                    minWidth: `${sheetMetrics.width}px`,
                    willChange: 'transform',
                    marginLeft: 'auto',
                    marginRight: 'auto'
                  }}
                  className="select-none"
                >
                  {activePreviewSheet}
                </div>
              </div>
            </div>
            <input
              ref={mobileWysiwygKeyboardProxyInputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              tabIndex={-1}
              aria-hidden="true"
              className="fixed left-0 top-0 h-px w-px opacity-0 pointer-events-none"
            />
            {activePreviewEditSession && activePreviewEditSession.target.field !== 'sectionName' && activeDraftNavigationPreviewSong && canOpenEditor && !isLyricsMode && (() => {
              const storedKey = getSectionStoredKey(activePreviewEditSession.draftSong, activePreviewEditSession.target.sectionId);
              const globalOffset = getTransposeOffset(activePreviewEditSession.draftSong.originalKey, activeDraftNavigationPreviewSong.currentKey);
              const displayedChartKey = transposeKeyWithPreference(storedKey, globalOffset, activeDraftNavigationPreviewSong.currentKey);
              const displayedKey = getPlayKey(displayedChartKey, activeDraftNavigationPreviewSong.capo ?? 0);
              const storageMode = getChordStorageModeForTarget(
                activePreviewEditSession.draftSong,
                activePreviewEditSession.target
              );
              return (
                <PreviewBarEditor
                  session={activePreviewEditSession}
                  language={language}
                  deviceLayout={previewEditorDeviceLayout}
                  storedKey={storedKey}
                  displayedKey={displayedKey}
                  storageMode={storageMode}
                  onApplyDraft={applyPreviewEditDraft}
                  onInputModeChange={(mode) => setPreviewEditSession((current) => current ? setPreviewEditInputMode(current, mode) : current)}
                  onNavigate={handlePreviewEditNavigate}
                  onStructure={handlePreviewEditStructure}
                  onUndo={() => setPreviewEditSession((current) => current ? undoPreviewDraft(current) : current)}
                  onRedo={() => setPreviewEditSession((current) => current ? redoPreviewDraft(current) : current)}
                  onDone={() => commitPreviewEditSession()}
                  onCancel={() => setPreviewEditSession(null)}
                  onPanelHeightChange={handlePreviewEditorPanelHeightChange}
                />
              );
            })()}
            {activePreviewEditSession?.target.field === 'sectionName' && canOpenEditor && !isLyricsMode && (
              <PreviewSectionTitleEditor
                session={activePreviewEditSession}
                language={language}
                isMobile={isPhoneViewport || !hasFinePointer}
                onChange={handlePreviewSectionTitleChange}
                onDone={finishPreviewSectionTitleEdit}
                onCancel={() => setPreviewEditSession(null)}
              />
            )}
            {previewSectionActionTarget && canOpenEditor && !isLyricsMode && activeEditorSong && (
              <PreviewSectionActionMenu
                language={language}
                deviceLayout={previewEditorDeviceLayout}
                title={previewSectionActionTarget.title}
                anchorRect={previewSectionActionTarget.anchorRect}
                canDelete={activeEditorSong.sections.length > 1}
                onRename={() => openPreviewSectionTitleEditor(previewSectionActionTarget)}
                onDuplicate={() => finishPreviewSectionAction('duplicate')}
                onDelete={() => finishPreviewSectionAction('delete')}
                onClose={() => setPreviewSectionActionTarget(null)}
              />
            )}
            {activeEditorSong && previewMetaEditTarget && canOpenEditor && !isLyricsMode && (
              <PreviewWysiwygEditor
                song={activeEditorSong}
                language={language}
                target={previewMetaEditTarget}
                deviceLayout={previewEditorDeviceLayout}
                currentKey={isSetlistMode ? currentSetlistKey : song.currentKey}
                currentCapo={isSetlistMode ? currentSetlistCapo : currentCapo}
                originalKey={isSetlistMode ? selectedSetlistSourceSong?.currentKey ?? null : song.originalKey}
                canEditKey={isSetlistMode ? canEditSelectedSetlistKey : canEditTeamSongs}
                metadataSuggestions={metadataSuggestions}
                onChange={handlePreviewWysiwygEditorChange}
                onKeyChange={(key) => {
                  if (isSetlistMode) {
                    handleSetlistKeyChange(key);
                  } else {
                    handleKeyChange(key);
                  }
                }}
                onCapoChange={(capo) => {
                  if (isSetlistMode) {
                    handleSelectedSetlistCapoChange(capo);
                  } else {
                    handleSongChange({ ...song, capo });
                  }
                }}
                onClose={() => setPreviewMetaEditTarget(null)}
              />
            )}
            {isSetlistMode && showPreviewBackToTop && (
              <div className={`pointer-events-none absolute z-40 ${
                isPhoneViewport ? 'bottom-3 left-3' : 'bottom-2 left-2 sm:bottom-4 sm:left-4 lg:bottom-6 lg:left-6'
              }`}>
                <button
                  type="button"
                  onClick={handleScrollPreviewToTop}
                  className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white/95 text-gray-600 shadow-lg backdrop-blur-sm transition-colors hover:border-indigo-200 hover:text-indigo-600 sm:h-10 sm:w-10"
                  title={copy.backToTop}
                  aria-label={copy.backToTop}
                >
                  <ChevronUp size={18} />
                </button>
              </div>
            )}
            {!(isPhoneViewport && isEditing) && (
              <div className={`pointer-events-none absolute z-40 ${
                isPhoneViewport ? 'bottom-3 right-3' : 'bottom-2 right-2 sm:bottom-4 sm:right-4 lg:bottom-6 lg:right-6'
              }`}>
                <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-gray-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm">
                  {canOpenEditor && !activePreviewEditSession && !isLyricsMode && (
                    <>
                      <button
                        type="button"
                        data-preview-undo
                        onClick={isSetlistMode ? handleSetlistUndo : handleUndo}
                        disabled={isSetlistMode ? currentSetlistSongHistory.past.length === 0 : currentSongHistory.past.length === 0}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9"
                        title={copy.undo}
                        aria-label={copy.undo}
                      >
                        <Undo2 size={16} />
                      </button>
                      <button
                        type="button"
                        data-preview-redo
                        onClick={isSetlistMode ? handleSetlistRedo : handleRedo}
                        disabled={isSetlistMode ? currentSetlistSongHistory.future.length === 0 : currentSongHistory.future.length === 0}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-35 sm:h-9 sm:w-9"
                        title={copy.redo}
                        aria-label={copy.redo}
                      >
                        <Redo2 size={16} />
                      </button>
                      <span className="mx-0.5 h-6 w-px bg-gray-200" aria-hidden="true" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleZoomOutPreview}
                    disabled={previewScale <= PREVIEW_MIN_SCALE + 0.001}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
                    title={copy.zoomOutPreview}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    ref={previewZoomLabelRef}
                    onClick={handleResetPreviewZoom}
                    className="inline-flex min-w-[4rem] items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 sm:min-w-[4.25rem]"
                    title={copy.resetPreviewZoom}
                  >
                    {previewScalePercent}%
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomInPreview}
                    disabled={previewScale >= PREVIEW_MAX_SCALE - 0.001}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
                    title={copy.zoomInPreview}
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        ) : (
        <div data-content-area className="flex-1 overflow-y-auto bg-[#F5F5F4] px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8 dark:bg-[color:var(--color-surface-muted)]">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <section className="rounded-[28px] border border-gray-200 bg-white px-6 py-7 shadow-sm md:px-8 md:py-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-500">
                    {activeAppView === 'about' ? copy.about : copy.help}
                  </div>
                  <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-gray-900">
                    {activeAppView === 'about'
                      ? (language === 'zh' ? 'ChordMaster 關於頁' : 'ChordMaster About')
                      : (language === 'zh' ? 'ChordMaster 使用說明' : 'ChordMaster Help')}
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-gray-600">
                    {activeAppView === 'about'
                      ? (language === 'zh'
                        ? '這裡集中放目前版本、產品定位與近期更新。之後每次加新功能，只要更新專案版本號，介面會同步顯示。'
                        : 'This page centralizes the current version, product framing, and recent changes. Future features only need a version bump to stay reflected in the UI.')
                      : (language === 'zh'
                        ? '這裡放目前最重要的操作方式，方便你快速回顧編輯流程、快速鍵與備份方法。'
                        : 'This page summarizes the most important operating flow so you can quickly review editing, shortcuts, and backup habits.')}
                  </p>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-right">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">{copy.currentVersion}</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-900">v{APP_VERSION}</div>
                </div>
              </div>
            </section>

            {(activeAppView === 'about' ? aboutSections : helpSections).map((section) => (
              <section
                key={section.title}
                className="rounded-[24px] border border-gray-200 bg-white px-6 py-6 shadow-sm md:px-7"
              >
                <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900">{section.title}</h2>
                <p className="mt-2 text-sm leading-7 text-gray-600">{section.description}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-1">
                  {section.bullets.map((bullet) => (
                    <div
                      key={bullet}
                      className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-7 text-gray-700"
                    >
                      {bullet}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {activeAppView === 'help' && (
              <section className="rounded-[24px] border border-gray-200 bg-white px-6 py-6 shadow-sm md:px-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="max-w-2xl">
                    <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900">{copy.github}</h2>
                    <p className="mt-2 text-sm leading-7 text-gray-600">
                      {language === 'zh'
                        ? '如果你想看原始碼、追蹤更新，或之後要整理 release note，這裡可以直接跳到 GitHub repository。'
                        : 'Use this link to inspect the source, track updates, or review release notes in the GitHub repository.'}
                    </p>
                  </div>
                  <a
                    href={APP_GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <span>{copy.openGithub}</span>
                    <ExternalLink size={16} />
                  </a>
                </div>
                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {APP_GITHUB_URL}
                </div>
              </section>
            )}

            {activeAppView === 'about' && (
              <section className="rounded-[24px] border border-gray-200 bg-white px-6 py-6 shadow-sm md:px-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900">{copy.changelog}</h2>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
                    {copy.bumpVersionHint}
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {changelogEntries.map((entry) => (
                    <div key={`${entry.version}-${entry.title}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-600 shadow-sm">
                          v{entry.version}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">{entry.date}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-bold text-gray-900">{entry.title}</h3>
                      <div className="mt-3 grid gap-3">
                        {entry.bullets.map((bullet) => (
                          <div key={bullet} className="rounded-xl bg-white px-4 py-3 text-sm leading-7 text-gray-700">
                            {bullet}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
        )}
      </main>

      {isPhoneViewport && (
        <>
          <AnimatePresence initial={false}>
            {isMobileActionsSheetOpen && (
              <>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMobileActionsSheetOpen(false)}
                  className="absolute inset-0 z-[70] bg-stone-950/30 backdrop-blur-[1px]"
                  aria-label={copy.editor.more}
                />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                  className="absolute inset-x-0 bottom-0 z-[80] max-h-[82dvh] overflow-hidden rounded-t-[28px] border-t border-gray-200 bg-white shadow-[0_-24px_60px_rgba(15,23,42,0.18)]"
                >
                  <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-200" />
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <div className="text-sm font-bold text-gray-900">{copy.editor.more}</div>
                    <button
                      type="button"
                      onClick={() => setIsMobileActionsSheetOpen(false)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      {copy.done}
                    </button>
                  </div>

                  <div className="max-h-[calc(82dvh-4.5rem)] space-y-4 overflow-y-auto px-4 py-4">
                    {isSheetView ? (
                      <>
                        <div className="grid grid-cols-1 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleExportPdf();
                              setIsMobileActionsSheetOpen(false);
                            }}
                            disabled={isExportingPdf}
                            className={`rounded-2xl px-3 py-3 text-left transition-colors ${
                              isExportingPdf
                                ? 'bg-gray-400 text-white'
                                : 'bg-gray-900 text-white'
                            }`}
                          >
                            <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">PDF</div>
                            <div className="mt-1 text-sm font-bold">
                              {isExportingPdf ? copy.preparingPdf : (isSetlistMode ? copy.exportSetlistPdf : copy.exportPdf)}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileActionsSheetOpen(false);
                              handleEnterPerformanceMode();
                            }}
                            className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                          >
                            <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-gray-400"><Play size={11} /><span>Live</span></div>
                            <div className="mt-1 text-sm font-bold text-gray-900">{copy.performanceMode}</div>
                          </button>
                        </div>

                        {!isSetlistMode && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleSongChange({ ...song, showNashvilleNumbers: !song.showNashvilleNumbers })}
                              className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                                song.showNashvilleNumbers
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : 'border-gray-200 bg-white text-gray-700'
                              }`}
                            >
                              <div className="text-xs font-bold tracking-[0.14em] text-gray-400">{copy.nashvilleModeLabel}</div>
                              <div className="mt-1 text-sm font-bold">{song.showNashvilleNumbers ? copy.on : copy.off}</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSongChange({ ...song, showAbsoluteJianpu: !song.showAbsoluteJianpu })}
                              className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                                song.showAbsoluteJianpu
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : 'border-gray-200 bg-white text-gray-700'
                              }`}
                            >
                              <div className="text-xs font-bold tracking-[0.14em] text-gray-400">{copy.fixedDoModeLabel}</div>
                              <div className="mt-1 text-sm font-bold">{song.showAbsoluteJianpu ? copy.on : copy.off}</div>
                            </button>
                          </div>
                        )}
                      </>
                    ) : null}

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{language === 'zh' ? '語言' : 'Language'}</div>
                      <div className="mt-3 inline-flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setLanguage('zh')}
                          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                            language === 'zh' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          中文
                        </button>
                        <button
                          type="button"
                          onClick={() => setLanguage('en')}
                          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                            language === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          EN
                        </button>
                      </div>
                    </div>

                    {isAuthenticated ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                          syncStatus === 'failed'
                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                            : syncStatus === 'offline'
                              ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        }`}>
                          {syncStatus === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />}
                          <span>{syncStatusLabel}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          {authenticatedUser?.picture ? (
                            <img
                              src={authenticatedUser.picture}
                              alt={authenticatedUser.name}
                              className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                              {authenticatedUser?.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-gray-900">{authenticatedUser?.name}</div>
                            <div className="truncate text-xs text-gray-500">{authenticatedUser?.email}</div>
                          </div>
                        </div>
                        {activeAppView === 'sheet' && !isSetlistMode && hasSongs && (!isTeamWorkspace || canEditTeamSongs) && (
                          <button
                            type="button"
                            onClick={() => void handleCreateShareLink('song')}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100"
                          >
                            <Share2 size={14} />
                            <span>{copy.shareCurrentSong}</span>
                          </button>
                        )}
                        {activeAppView === 'sheet' && isSetlistMode && selectedSetlist && canShareSelectedSetlist && (
                          <button
                            type="button"
                            onClick={() => void handleCreateShareLink('setlist')}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100"
                          >
                            <Share2 size={14} />
                            <span>{copy.shareCurrentSetlist}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            handleGoogleSignOut();
                            setIsMobileActionsSheetOpen(false);
                          }}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <button
                          type="button"
                          onClick={() => void handleGoogleSignIn()}
                          disabled={!isAuthConfigured}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ExternalLink size={14} />
                          <span>{copy.continueWithGoogle}</span>
                        </button>
                      </div>
                    )}

                    {showGoogleAuth && googleUser ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          {googleUser.picture ? (
                            <img
                              src={googleUser.picture}
                              alt={googleUser.name}
                              className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                              {googleUser.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-gray-900">{googleUser.name}</div>
                            <div className="truncate text-xs text-gray-500">{googleUser.email}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleGoogleSignOut();
                            setIsMobileActionsSheetOpen(false);
                          }}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
                        >
                          <LogOut size={14} />
                          <span>{copy.signOut}</span>
                        </button>
                      </div>
                    ) : showGoogleAuth ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Google</div>
                        <div ref={googleSignInRef} className="mt-3 flex min-h-10 min-w-0 items-center justify-start" />
                        {googleAuthError ? (
                          <div className="mt-2 text-xs font-medium text-amber-600">{googleAuthError}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {isMobileMetadataOpen && metadataPanelContent && (
              <>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMobileMetadataOpen(false)}
                  className="absolute inset-0 z-[70] bg-stone-950/30 backdrop-blur-[1px]"
                  aria-label={mobileMetadataTitle}
                />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                  className="absolute inset-x-0 bottom-0 z-[80] max-h-[86dvh] overflow-hidden rounded-t-[28px] border-t border-gray-200 bg-[#F5F5F4] shadow-[0_-24px_60px_rgba(15,23,42,0.18)] dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface)]"
                >
                  <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-300" />
                  <div className="flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur-sm">
                    <div className="text-sm font-bold text-gray-900">{mobileMetadataTitle}</div>
                    <button
                      type="button"
                      onClick={() => setIsMobileMetadataOpen(false)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      {copy.done}
                    </button>
                  </div>

                  <div className="max-h-[calc(86dvh-4.5rem)] overflow-y-auto px-4 py-4">
                    {metadataPanelContent}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}

      <AnimatePresence initial={false}>
        {isCreateSetlistOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[115] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.form
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onSubmit={(event) => {
                event.preventDefault();
                handleConfirmCreateSetlist();
              }}
              className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">
                {language === 'zh' ? '新增歌單' : 'New setlist'}
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
                {language === 'zh' ? '先確認名稱與專案' : 'Name and organize this setlist'}
              </h2>

              <label className="mt-5 block">
                <span className="text-xs font-bold text-gray-600">{language === 'zh' ? '歌單名稱' : 'Setlist name'}</span>
                <input
                  value={newSetlistName}
                  onChange={(event) => setNewSetlistName(event.target.value)}
                  autoFocus
                  className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-indigo-300 focus:bg-white"
                  placeholder={copy.untitledSetlist}
                />
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-bold text-gray-600">{language === 'zh' ? '所屬專案' : 'Project'}</span>
                <select
                  value={newSetlistProjectId}
                  onChange={(event) => setNewSetlistProjectId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none focus:border-indigo-300"
                >
                  <option value="">{copy.ungroupedProject}</option>
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateSetlistOpen(false)}
                  className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={!newSetlistName.trim()}
                  className="h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {language === 'zh' ? '建立歌單' : 'Create setlist'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isImportPromptOpen && authenticatedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">{APP_NAME}</div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{copy.importLocalTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">{copy.importLocalDescription}</p>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                {importSummaryLabel}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleDismissImportPrompt}
                  disabled={isImportingLocalWorkspace}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copy.importLater}
                </button>
                <button
                  type="button"
                  onClick={() => void handleImportLocalWorkspaceToCloud()}
                  disabled={isImportingLocalWorkspace}
                  className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImportingLocalWorkspace ? copy.cloudSyncSyncing : copy.importNow}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isExportingPdf && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-[120] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
            aria-live="polite"
            aria-busy="true"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-sm rounded-[28px] border border-gray-200 bg-white/95 px-6 py-6 text-center shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur-sm"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
                <div className="h-7 w-7 rounded-full border-[3px] border-indigo-200 border-t-indigo-600 animate-spin" />
              </div>
              <div className="mt-4 text-lg font-bold text-gray-900">{copy.exportingPdfTitle}</div>
              <div className="mt-2 text-sm leading-6 text-gray-500">
                {pdfExportProgress?.cancelRequested ? copy.exportingPdfCancelling : copy.exportingPdfHint}
              </div>

              {pdfExportProgress ? (
                <div className="mt-5 text-left">
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-200 ${
                        pdfExportProgress.cancelRequested ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${exportProgressPercent}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs font-semibold text-gray-500">
                    <span>{copy.exportingPdfPageLabel}</span>
                    <span>{pdfExportProgress.completedPages} / {pdfExportProgress.totalPages}</span>
                  </div>

                  <div className="mt-3 grid gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-gray-500">{copy.exportingPdfSongLabel}</span>
                      <div className="min-w-0 text-right">
                        <div className="font-bold text-gray-900">
                          {pdfExportProgress.songIndex} / {pdfExportProgress.totalSongs}
                        </div>
                        <div className="truncate text-xs text-gray-500">{pdfExportProgress.songTitle}</div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-gray-500">{copy.exportingPdfSectionLabel}</span>
                      <div className="min-w-0 text-right">
                        <div className="font-bold text-gray-900">{exportSectionLabel}</div>
                        <div className="text-xs text-gray-500">
                          {copy.exportingPdfPageLabel} {pdfExportProgress.pageInSong} / {pdfExportProgress.totalPagesInSong}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                {pdfExportProgress?.cancelRequested ? (
                  <div className="text-xs font-semibold tracking-[0.08em] text-gray-400">{copy.exportingPdfCancelling}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      pdfExportCancelRequestedRef.current = true;
                      setPdfExportProgress((current) => current ? { ...current, cancelRequested: true } : current);
                    }}
                    className="rounded-full bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200 active:bg-gray-300"
                  >
                    {copy.exportingPdfCancelButton}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {pendingLeaveSharedSetlist && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-[125] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">{copy.sharedWithMe}</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-gray-900">{copy.leaveSetlistConfirm}</h2>
              <p className="mt-3 text-sm font-semibold text-gray-600">{pendingLeaveSharedSetlist.name || copy.untitledSetlist}</p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPendingLeaveSharedSetlistId(null)}
                  disabled={Boolean(leavingSharedSetlistId)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLeaveSharedSetlist(pendingLeaveSharedSetlist.id)}
                  disabled={leavingSharedSetlistId === pendingLeaveSharedSetlist.id}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {leavingSharedSetlistId === pendingLeaveSharedSetlist.id ? copy.leavingSetlist : copy.leaveSetlist}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {pendingLeaveSharedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-[125] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">{copy.sharedWithMe}</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-gray-900">{copy.leaveProjectConfirm}</h2>
              <p className="mt-3 text-sm font-semibold text-gray-600">{pendingLeaveSharedProject.name || copy.untitledProject}</p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPendingLeaveSharedProjectId(null)}
                  disabled={Boolean(leavingSharedProjectId)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLeaveSharedProject(pendingLeaveSharedProject.id)}
                  disabled={leavingSharedProjectId === pendingLeaveSharedProject.id}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {leavingSharedProjectId === pendingLeaveSharedProject.id ? copy.leavingProject : copy.leaveProject}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isMultiSelectMode && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex justify-center px-3"
          >
            <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-[0_18px_44px_rgba(15,23,42,0.18)]">
              <div className="px-2 text-sm font-bold text-gray-700">
                {language === 'zh'
                  ? `已選 ${multiSelectedSetlistIds.length}`
                  : `${multiSelectedSetlistIds.length} selected`}
              </div>
              <button
                type="button"
                onClick={() => setProjectPicker({ mode: 'move', setlistIds: multiSelectedSetlistIds })}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
              >
                <FileText size={14} />
                <span>{copy.moveSetlistToProject}</span>
              </button>
              <button
                type="button"
                onClick={() => setProjectPicker({ mode: 'copy', setlistIds: multiSelectedSetlistIds })}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
              >
                <Copy size={14} />
                <span>{copy.copySetlistToProject}</span>
              </button>
              {(() => {
                const targets = setlists.filter((item) => multiSelectedSetlistIds.includes(item.id));
                const allArchived = targets.length > 0 && targets.every((item) => item.archived);
                return (
                  <button
                    type="button"
                    onClick={() => handleBatchArchiveSelectedSetlists(!allArchived)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    {allArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    <span>{allArchived ? copy.unarchiveSetlist : copy.archiveSetlist}</span>
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={handleBatchDeleteSelectedSetlists}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100"
              >
                <Trash2 size={14} />
                <span>{copy.delete}</span>
              </button>
              <button
                type="button"
                onClick={exitMultiSelect}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50"
              >
                {copy.cancel}
              </button>
            </div>
          </motion.div>
        )}
        {projectPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-[125] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">{copy.projects}</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-gray-900">
                {projectPicker.mode === 'move' ? copy.projectPickerMoveTitle : copy.projectPickerCopyTitle}
              </h2>
              <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleProjectPickerSelect(null)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
                >
                  <div className="text-sm font-bold text-gray-900">{copy.ungroupedProject}</div>
                  <div className="text-xs text-gray-500">{ungroupedSetlistCount} {copy.setlists}</div>
                </button>
                {activeProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleProjectPickerSelect(project.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
                  >
                    <div className="min-w-0 truncate text-sm font-bold text-gray-900">{project.name}</div>
                    <div className="shrink-0 text-xs text-gray-500">{projectSetlistCount(project.id)} {copy.setlists}</div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setProjectPicker(null)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {copy.cancel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {pendingShareUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-[125] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-lg rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">{APP_NAME}</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-gray-900">
                {shareDialogContext ? copy.shareDialogTitle : (language === 'zh' ? '分享歌曲' : 'Share Songs')}
              </h2>
              <input
                type="text"
                readOnly
                value={pendingShareUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              />
              {shareDialogContext && (
                <>
                  <p className="mt-3 text-[11px] leading-relaxed text-gray-500">{copy.shareDialogContactsHint}</p>
                  {renderShareContactPicker(shareDialogContext.resourceType, shareDialogContext.resourceId)}
                </>
              )}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => { setPendingShareUrl(null); setShareDialogContext(null); }}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {copy.done}
                </button>
                {(Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && typeof navigator.share === 'function')) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const didShare = await openSystemShareSheet(
                        pendingShareUrl,
                        language === 'zh' ? `來自 ${APP_NAME} 的歌曲` : `Songs from ${APP_NAME}`
                      );
                      if (didShare) {
                        setPendingShareUrl(null);
                        setShareDialogContext(null);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                  >
                    <Share2 size={14} />
                    <span>{language === 'zh' ? '系統分享' : 'Share'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const didCopy = await copyShareUrlToClipboard(pendingShareUrl);
                    if (didCopy) {
                      setPendingShareUrl(null);
                      setShareDialogContext(null);
                      toast.success(copy.shareCopied);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
                >
                  <Copy size={14} />
                  <span>{language === 'zh' ? '複製連結' : 'Copy Link'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {pendingRevokeShareSetlist && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-[125] flex items-center justify-center bg-stone-950/35 px-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">{copy.setlistSharingTitle}</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-gray-900">{copy.setlistSharingCancelConfirm}</h2>
              <p className="mt-3 text-sm font-semibold text-gray-600">{pendingRevokeShareSetlist.name || copy.untitledSetlist}</p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPendingRevokeShareSetlistId(null)}
                  disabled={isRevokingSetlistShare}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRevokeSetlistSharing(pendingRevokeShareSetlist.id)}
                  disabled={isRevokingSetlistShare}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {isRevokingSetlistShare ? copy.cloudSyncSyncing : copy.setlistSharingCancel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPreviewEditExitPromptOpen && previewEditSession?.dirty && (
          <motion.div
            className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-label={language === 'zh' ? '預覽編輯尚未完成' : 'Preview edit is unfinished'}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.3)]"
            >
              <h2 className="text-lg font-black text-slate-900">{language === 'zh' ? '預覽編輯尚未完成' : 'Preview edit is unfinished'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{language === 'zh' ? '要先完成這次修改、捨棄草稿，還是留在目前位置繼續編輯？' : 'Finish this edit, discard the draft, or stay here and keep editing?'}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    pendingPreviewTransitionRef.current = null;
                    pendingSetlistElementFocusRef.current = null;
                    setIsPreviewEditExitPromptOpen(false);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  {language === 'zh' ? '繼續編輯' : 'Keep editing'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = pendingPreviewTransitionRef.current;
                    pendingPreviewTransitionRef.current = null;
                    setPreviewEditSession(null);
                    setIsPreviewEditExitPromptOpen(false);
                    action?.();
                  }}
                  className="rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50"
                >
                  {language === 'zh' ? '捨棄草稿' : 'Discard'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = pendingPreviewTransitionRef.current;
                    pendingPreviewTransitionRef.current = null;
                    commitPreviewEditSession(previewEditSession);
                    setIsPreviewEditExitPromptOpen(false);
                    action?.();
                  }}
                  className="rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
                >
                  {language === 'zh' ? '完成' : 'Finish'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeReferenceKind && activeReferenceSong && (
        <ReferencePlayer
          song={activeReferenceSong}
          currentKey={activeReferenceCurrentKey}
          activeKind={activeReferenceKind}
          language={language}
          onKindChange={setActiveReferenceKind}
          onClose={() => setActiveReferenceKind(null)}
        />
      )}

      {isPerformanceMode && (
        <div
          ref={performanceOverlayRef}
          tabIndex={-1}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-950 select-none"
          onPointerDownCapture={focusPerformanceKeyboardCapture}
          onMouseDownCapture={focusPerformanceKeyboardCapture}
          onTouchStartCapture={focusPerformanceKeyboardCapture}
          onTouchStart={handlePerformanceTouchStart}
          onTouchEnd={handlePerformanceTouchEnd}
          onMouseMove={revealPerformanceChrome}
        >
          <input
            ref={performanceKeyboardCaptureRef}
            data-performance-keyboard-capture
            aria-label="Performance keyboard capture"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            inputMode="none"
            spellCheck={false}
            tabIndex={-1}
            onBlur={() => {
              // Keep the hidden input focused so the page turner keeps receiving
              // hardware-keyboard events; re-focus on the next tick after a blur.
              window.setTimeout(focusPerformanceKeyboardCapture, 0);
            }}
            className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
          />

          {/* Clip container: shows exactly one A4 page at performanceScale */}
          <div style={{
            width: PREVIEW_TARGET_WIDTH * performanceScale,
            height: PREVIEW_PAGE_HEIGHT * performanceScale,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div
              ref={performanceTranslatorRef}
              style={{
                transform: `scale(${performanceScale}) translateY(-${(performancePageOffsetsRef.current[performancePageIndexRef.current] ?? performancePageIndexRef.current * PREVIEW_PAGE_HEIGHT)}px)`,
                transformOrigin: 'top left',
                width: PREVIEW_TARGET_WIDTH,
                willChange: 'transform',
              }}
            >
              <div ref={performanceSheetRef}>
                {isSetlistMode ? (
                  activeSetlistPreviewSong && (
                    <ChordSheet
                      song={activeSetlistPreviewSong}
                      language={language}
                      currentKey={activeSetlistPreviewSong.currentKey}
                      previewIdentity={selectedSetlistSong?.id ?? null}
                    />
                  )
                ) : (
                  <ChordSheet
                    song={song}
                    language={language}
                    currentKey={song.currentKey}
                    previewIdentity={song.id}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Reference buttons — top left. Dark pills so they stay legible over the
              white sheet; indigo for the active one (never plain white). */}
          <div className={`absolute left-4 top-4 z-10 flex items-center gap-2 transition-opacity duration-500 ${performanceChromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {renderReferenceButtons(
              'inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-900/70 px-3 text-xs font-bold text-stone-50 ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-stone-900/85',
              {
                showLabels: true,
                activeClassName: 'inline-flex h-9 items-center gap-1.5 rounded-full bg-indigo-500 px-3 text-xs font-bold text-white shadow-sm ring-1 ring-indigo-300/40 transition-colors hover:bg-indigo-500'
              }
            )}
          </div>

          {/* Exit button — top right */}
          <button
            type="button"
            onClick={handleExitPerformanceMode}
            className={`absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-stone-900/70 px-4 py-2 text-sm font-bold text-stone-50 ring-1 ring-white/10 backdrop-blur-sm transition-[opacity,background-color] duration-500 hover:bg-stone-900/85 ${performanceChromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {copy.exitPerformanceMode}
          </button>

          {/* Page / song indicator — bottom center, above safe-area */}
          <div className={`absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none rounded-2xl bg-stone-900/70 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur-sm transition-opacity duration-500 ${performanceChromeVisible ? 'opacity-100' : 'opacity-0'}`} style={{ bottom: 'max(20px, env(safe-area-inset-bottom, 0px))' }}>
            {isSetlistMode && activeSetlistPreviewSong && (
              <div className="max-w-[80vw] truncate text-center text-xs font-semibold text-stone-300">
                {copy.performanceModeSongIndicator}{' '}
                {setlistSongsWithSource.findIndex(({ item }) => item.id === selectedSetlistSongId) + 1}
                {' / '}
                {setlistSongsWithSource.length}
                {'  ·  '}
                {activeSetlistPreviewSong.title}
              </div>
            )}
            <div className="text-sm font-bold text-stone-50">
              {copy.performanceModePageIndicator}{' '}{performancePageIndex + 1} / {performanceTotalPages}
            </div>
          </div>

          {/* Left tap area — the button stays clickable at all times so page turning
              is never blocked; only the arrow hint fades with the rest of the chrome. */}
          <button
            type="button"
            onClick={handlePerformancePrevPage}
            className="absolute bottom-0 left-0 top-0 z-[1] flex w-1/2 touch-manipulation items-center justify-start pl-3"
            aria-label="Previous page"
            aria-keyshortcuts="ArrowLeft ArrowUp PageUp Shift+Space"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-stone-900/55 text-stone-100 ring-1 ring-white/10 backdrop-blur-sm transition-opacity duration-500 ${performanceChromeVisible ? 'opacity-100' : 'opacity-0'}`}>
              <ChevronLeft size={28} />
            </span>
          </button>

          {/* Right tap area */}
          <button
            type="button"
            onClick={handlePerformanceNextPage}
            className="absolute bottom-0 right-0 top-0 z-[1] flex w-1/2 touch-manipulation items-center justify-end pr-3"
            aria-label="Next page"
            aria-keyshortcuts="ArrowRight ArrowDown PageDown Space Enter"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-stone-900/55 text-stone-100 ring-1 ring-white/10 backdrop-blur-sm transition-opacity duration-500 ${performanceChromeVisible ? 'opacity-100' : 'opacity-0'}`}>
              <ChevronRight size={28} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
