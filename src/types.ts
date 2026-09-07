/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Key = 'C' | 'C#' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb' | 'G' | 'G#' | 'Ab' | 'A' | 'Bb' | 'B';
export type AppLanguage = 'en' | 'zh';
export type BarNumberMode = 'none' | 'line-start' | 'all';
export type NavigationMarker = 'segno' | 'coda' | 'ds' | 'dc' | 'fine' | 'ds-al-coda' | 'ds-al-fine';
export type NashvilleFontPreset =
  | 'ibm-plex-serif'
  | 'source-serif-4'
  | 'atkinson-hyperlegible-next'
  | 'source-sans-3';
export type ChordFontPreset =
  | 'classic-serif'
  | 'stage-sans';
export type SetlistDisplayMode =
  | 'nashville-number-system'
  | 'chord-fixed-key'
  | 'chord-movable-key';
export type LibraryKind = 'personal' | 'team';
export type LibraryRole = 'owner' | 'editor' | 'setlist_manager' | 'viewer';
// Role a user holds on a *shared project* they joined (distinct from team
// LibraryRole). A manager may edit the project's shared key + song order.
export type ProjectMemberRole = 'viewer' | 'manager';
export type SongReferenceKind = 'band' | 'vocal';
export type AnnotationColorId = 'amber' | 'emerald' | 'sky' | 'rose' | 'violet' | 'slate';
export type BarLabelLane = 'rhythm' | 'riff';

export interface ChordMark {
  color?: AnnotationColorId;
  special?: boolean;
}

export interface RhythmMark {
  color?: AnnotationColorId;
}

export interface UnisonMark {
  enabled: boolean;
  color?: AnnotationColorId;
}

export interface SongReference {
  url?: string;
  key?: Key;
  bpm?: number;
}

export interface SongReferences {
  band?: SongReference;
  vocal?: SongReference;
}

export interface Bar {
  id?: string; // Unique ID for bar animations and drag operations
  chords: string[]; // e.g., ["E", "C#m"]
  keyChangeTo?: Key; // Per-bar key change starting at this bar
  timeSignature?: string; // Per-bar override, e.g., "2/4"
  riff?: string;    // e.g., "3 - 4 - 5 - 7 1"
  rhythm?: string;  // e.g., "q e e qr"
  label?: string; // Shared lane label, e.g. "Pno", "Dr", "EG"
  labelLane?: BarLabelLane; // Three-line preview placement: rhythm = row 2, riff = row 3
  riffLabel?: string; // e.g., "Riff", "Pno", "EG"
  rhythmLabel?: string; // e.g., "Dr", "Rhythm", "Clap"
  annotation?: string; // e.g., "Kick In", "8 beat build"
  chordMarks?: Record<number, ChordMark>;
  rhythmMark?: RhythmMark;
  unisonMark?: UnisonMark;
  leftMarker?: NavigationMarker; // e.g., segno at bar start
  rightMarker?: NavigationMarker; // e.g., coda, D.S., D.C., Fine, or D.S. al Coda at bar end
  leftText?: string; // e.g., "Vocal only"
  rightText?: string; // e.g., "D.S. al Coda"
  repeatStart?: boolean; // |:
  repeatEnd?: boolean;   // :|
  finalBar?: boolean;    // ending double barline
  ending?: string; // e.g. "1", "2", or "1,2"
}

export interface Section {
  id?: string; // Unique ID for reordering
  title: string; // e.g., "Intro", "Verse 1"
  keyChangeTo?: Key;
  bars: Bar[];
}

export interface PickupMeasure {
  id?: string;
  riff?: string;
  rhythm?: string;
}

export interface Song {
  title: string;
  lyricist?: string;
  composer?: string;
  translator?: string;
  groove?: string;
  shuffle?: boolean;
  originalKey: Key;
  currentKey: Key;
  tempo?: number;
  timeSignature: string; // e.g., "4/4"
  useSectionColors?: boolean;
  showNashvilleNumbers?: boolean;
  showAbsoluteJianpu?: boolean;
  // How jianpu is *entered* in the editor (independent of the display toggle
  // above): true = absolute/fixed-do (固定), false/undefined = relative/movable (首調).
  jianpuInputAbsolute?: boolean;
  barNumberMode?: BarNumberMode;
  // Vertical chart density: 1 is chord-only compact, 2 keeps the standard
  // performance layout, while 3 reserves a third line of writable space in
  // every bar row and in PDF output.
  barRowCount?: 1 | 2 | 3;
  nashvilleFontPreset?: NashvilleFontPreset;
  chordFontPreset?: ChordFontPreset;
  capo?: number;
  references?: SongReferences;
  pickup?: PickupMeasure;
  lyricsDoc?: LyricsDoc;
  sections: Section[];
}

// Bilingual sections are the editable source; legacy text bodies remain populated
// for sharing with older clients. Layout preferences are independent of content.
export interface LyricsDoc {
  chinese: string;       // Serialized Chinese body including markers
  english?: string;      // Serialized English body including markers
  blocks?: LyricsBlock[];
  displayLanguage?: 'chinese' | 'english' | 'bilingual';
  fontSize?: number;
  lineHeight?: number;
}

export interface LyricsBlock {
  id: string;
  marker: string;
  chinese: string;
  english: string;
  pageBreakBefore?: boolean;
  needsPairingReview?: boolean;
}

export interface StoredSong extends Song {
  id: string;
  updatedAt: number;
  createdAt?: number;
  archivedAt?: number | null;
  archivedBy?: string | null;
  createdBy?: string;
  updatedBy?: string;
  teamSource?: {
    libraryId: string;
    libraryName?: string;
    songId: string;
    updatedAt: number;
    copiedAt: number;
  };
}

export interface SetlistSong {
  id: string;
  setlistId: string;
  songId: string;
  order: number;
  overrideKey?: Key;
  capo?: number;
  personalCapoOverride?: number;
  sourceArchivedAt?: number | null;
  sectionOrder: string[];
  songData?: Song;
}

export interface Setlist {
  id: string;
  name: string;
  displayMode: SetlistDisplayMode;
  createdBy?: string;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  projectId?: string | null;
  assignedToCurrentUser?: boolean;
  songs: SetlistSong[];
}

export interface Project {
  id: string;
  name: string;
  archived?: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JoinedSetlist extends Setlist {
  isJoined: true;
}

export interface WorkspaceSnapshot {
  songs: StoredSong[];
  setlists: Setlist[];
  joinedSetlists: JoinedSetlist[];
  projects: Project[];
  joinedProjects: JoinedProject[];
  lastSavedAt: number | null;
}

export interface JoinedProject extends Project {
  isJoined: true;
  // The current user's role on this shared project. 'manager' may edit the
  // project's shared key + song order; 'viewer' is read-only.
  role: ProjectMemberRole;
  setlists: Setlist[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export type ShareResourceType = 'song' | 'song_bundle' | 'setlist' | 'project';

export interface SharedSongPayload {
  id: string;
  title: string;
  song: Song;
  archivedAt?: string | null;
}

export interface SharedSetlistPayload {
  id: string;
  name: string;
  displayMode: SetlistDisplayMode;
  songs: Array<{
    id: string;
    title: string;
    song: Song;
    overrideKey?: Key | null;
    archivedAt?: string | null;
  }>;
}

export interface SharedSongBundlePayload {
  id: string;
  songs: SharedSongPayload[];
}

export interface SharedProjectPayload {
  id: string;
  name: string;
  setlists: SharedSetlistPayload[];
}

export interface SharedResourcePayload {
  resourceType: ShareResourceType;
  song?: SharedSongPayload;
  songBundle?: SharedSongBundlePayload;
  setlist?: SharedSetlistPayload;
  project?: SharedProjectPayload;
}

export type SongImportResolution = 'duplicate' | 'overwrite';

export interface SharedSongImportInspectionItem {
  sourceSongId: string;
  title: string;
  existingSongId: string | null;
  existingTitle: string | null;
}

export interface SharedSongImportInspection {
  songs: SharedSongImportInspectionItem[];
  conflictCount: number;
}

export interface SharedSongImportResultItem {
  sourceSongId: string;
  songId: string;
  action: 'created' | 'duplicated' | 'overwritten';
}

export interface SharedSongImportResult {
  createdCount: number;
  duplicatedCount: number;
  overwrittenCount: number;
  songs: SharedSongImportResultItem[];
}

export interface ShareParticipant {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  joinedAt: string;
  // Present for project participants: their role on the shared project. Lets the
  // owner UI show and toggle manager status. Undefined for setlist participants.
  role?: ProjectMemberRole;
}

export interface SetlistShareStatus {
  activeToken: string | null;
  activeCreatedAt: string | null;
  participantCount: number;
  participants: ShareParticipant[];
}

export interface ProjectShareStatus {
  activeToken: string | null;
  activeCreatedAt: string | null;
  participantCount: number;
  participants: ShareParticipant[];
}

// A person the current user has shared with before (joined one of their
// libraries). Used to re-share directly without sending a link again.
export interface ShareContact {
  userId: string;
  email: string;
  name: string;
  picture?: string;
}

export type NotificationResourceType = 'setlist' | 'project' | 'team';
export type ShareContactResourceType = Exclude<NotificationResourceType, 'team'>;

export type NotificationType = 'resource_shared' | 'member_promoted' | 'member_demoted' | 'access_removed' | 'team_invite';

export interface AppNotification {
  id: string;
  type: NotificationType;
  resourceType: NotificationResourceType;
  resourceId: string;
  resourceName: string;
  actorName: string;
  actorEmail: string;
  actorPicture?: string;
  createdAt: string;
  readAt: string | null;
}

export interface CloudLibrarySummary {
  id: string;
  name: string;
  kind: LibraryKind;
  ownerUserId: string;
  role: LibraryRole;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  role: LibraryRole;
  joinedAt: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: LibraryRole;
  token: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  notificationSent?: boolean;
}

export interface TeamManagementSnapshot {
  members: TeamMember[];
  invites: TeamInvite[];
}

export interface PendingTeamInvite extends TeamInvite {
  libraryId: string;
  libraryName: string;
  inviterName: string;
  inviterEmail: string;
  inviterPicture?: string;
}

export interface SetlistAssignableMember {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  role: Extract<LibraryRole, 'editor' | 'setlist_manager'>;
}

export interface SetlistEditorAssignment {
  userId: string;
  assignedBy: string;
  assignedAt: string;
}

export interface SetlistEditorAssignmentSnapshot {
  setlistId: string;
  assignableMembers: SetlistAssignableMember[];
  assignments: SetlistEditorAssignment[];
}

export type TeamSongImportResolution = 'create' | 'overwrite' | 'duplicate';

export interface TeamSongImportRequestItem {
  sourceSongId: string;
  resolution: TeamSongImportResolution;
  targetSongId?: string;
}

export interface TeamSongImportCandidate {
  songId: string;
  title: string;
  currentKey?: string;
  originalKey?: string;
  version?: string;
  lyricist?: string;
  composer?: string;
}

export interface TeamSongImportInspectionItem {
  sourceSongId: string;
  title: string;
  existingSongId: string | null;
  existingTitle: string | null;
  existingSong?: TeamSongImportCandidate | null;
  possibleMatches: TeamSongImportCandidate[];
}

export interface TeamSongImportInspection {
  songs: TeamSongImportInspectionItem[];
}

export interface TeamSongImportResultItem {
  sourceSongId: string;
  songId: string;
  title: string;
  resolution: TeamSongImportResolution;
  isPrimary: boolean;
}

export interface TeamSongImportResult {
  createdCount: number;
  overwrittenCount: number;
  duplicateCount: number;
  songs: TeamSongImportResultItem[];
}

export interface TeamSongArchiveResult {
  archivedCount: number;
  changedCount: number;
  songIds: string[];
  archived: boolean;
}

export interface TeamSongDeleteResult {
  deletedCount: number;
  songIds: string[];
}

export type LibraryChangeKind = 'songs' | 'membership' | 'assignments';
