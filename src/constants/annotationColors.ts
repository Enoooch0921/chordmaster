import type { AnnotationColorId } from '../types';

export interface AnnotationColorOption {
  id: AnnotationColorId;
  label: string;
  labelZh: string;
  text: string;
  border: string;
  soft: string;
}

export const DEFAULT_SPECIAL_CHORD_COLOR: AnnotationColorId = 'amber';
export const DEFAULT_RHYTHM_MARK_COLOR: AnnotationColorId = 'emerald';
export const DEFAULT_UNISON_MARK_COLOR: AnnotationColorId = 'sky';

export const ANNOTATION_COLOR_OPTIONS: AnnotationColorOption[] = [
  {
    id: 'amber',
    label: 'Amber',
    labelZh: '琥珀',
    text: '#b45309',
    border: '#f59e0b',
    soft: '#fef3c7'
  },
  {
    id: 'emerald',
    label: 'Emerald',
    labelZh: '翠綠',
    text: '#047857',
    border: '#10b981',
    soft: '#d1fae5'
  },
  {
    id: 'sky',
    label: 'Sky',
    labelZh: '天藍',
    text: '#0369a1',
    border: '#38bdf8',
    soft: '#e0f2fe'
  },
  {
    id: 'rose',
    label: 'Rose',
    labelZh: '玫瑰',
    text: '#be123c',
    border: '#fb7185',
    soft: '#ffe4e6'
  },
  {
    id: 'violet',
    label: 'Violet',
    labelZh: '紫羅蘭',
    text: '#7c3aed',
    border: '#a78bfa',
    soft: '#ede9fe'
  },
  {
    id: 'slate',
    label: 'Slate',
    labelZh: '石墨',
    text: '#475569',
    border: '#94a3b8',
    soft: '#f1f5f9'
  }
];

export const ANNOTATION_COLOR_IDS = new Set<AnnotationColorId>(
  ANNOTATION_COLOR_OPTIONS.map((option) => option.id)
);

export const isAnnotationColorId = (value: unknown): value is AnnotationColorId => (
  typeof value === 'string' && ANNOTATION_COLOR_IDS.has(value as AnnotationColorId)
);

export const getAnnotationColorOption = (id: AnnotationColorId): AnnotationColorOption => (
  ANNOTATION_COLOR_OPTIONS.find((option) => option.id === id) ?? ANNOTATION_COLOR_OPTIONS[0]
);
