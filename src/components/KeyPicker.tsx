import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Key } from '../types';
import { type PanelAlign, useAnchoredPortalPanel } from './useAnchoredPortalPanel';

const KEY_PICKER_LAYOUT: Array<Array<Key | null>> = [
  ['Ab', 'A', null],
  ['Bb', 'B', null],
  [null, 'C', 'C#'],
  ['Db', 'D', null],
  ['Eb', 'E', null],
  [null, 'F', 'F#'],
  ['Gb', 'G', 'G#']
];

const KEY_OPTION_POSITIONS = new Map<Key, { row: number; column: number }>();
KEY_PICKER_LAYOUT.forEach((row, rowIndex) => {
  row.forEach((key, columnIndex) => {
    if (key) {
      KEY_OPTION_POSITIONS.set(key, { row: rowIndex, column: columnIndex });
    }
  });
});

interface KeyPickerProps {
  value: Key | null;
  onChange: (value: Key | null) => void;
  disabled?: boolean;
  label: string;
  originalKey?: Key | null;
  triggerMetaText?: string;
  panelMetaText?: string;
  clearLabel?: string;
  align?: PanelAlign;
  buttonClassName?: string;
  valueTextClassName?: string;
  metaTextClassName?: string;
  triggerIconSize?: number;
  triggerDensity?: 'default' | 'compact';
}

const findNextKey = (currentKey: Key, rowStep: number, columnStep: number): Key | null => {
  const position = KEY_OPTION_POSITIONS.get(currentKey);
  if (!position) {
    return null;
  }

  let nextRow = position.row + rowStep;
  let nextColumn = position.column + columnStep;

  while (nextRow >= 0 && nextRow < KEY_PICKER_LAYOUT.length && nextColumn >= 0 && nextColumn < 3) {
    const candidate = KEY_PICKER_LAYOUT[nextRow]?.[nextColumn] ?? null;
    if (candidate) {
      return candidate;
    }

    nextRow += rowStep;
    nextColumn += columnStep;
  }

  return null;
};

const KeyPicker: React.FC<KeyPickerProps> = ({
  value,
  onChange,
  disabled = false,
  label,
  originalKey = null,
  triggerMetaText,
  panelMetaText,
  clearLabel,
  align = 'center',
  buttonClassName = '',
  valueTextClassName = '',
  metaTextClassName = '',
  triggerIconSize = 16,
  triggerDensity = 'default'
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const optionRefs = React.useRef<Partial<Record<Key, HTMLButtonElement | null>>>({});
  const clearButtonRef = React.useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = React.useState(false);

  const closePanel = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      closePanel();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      closePanel();
      triggerRef.current?.focus();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePanel, isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusTarget = value ? optionRefs.current[value] : clearButtonRef.current;
    window.requestAnimationFrame(() => {
      (focusTarget ?? optionRefs.current[originalKey || 'C' as Key] ?? triggerRef.current)?.focus();
    });
  }, [isOpen, originalKey, value]);

  const handleSelect = React.useCallback((nextValue: Key | null) => {
    onChange(nextValue);
    closePanel();
  }, [closePanel, onChange]);

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, key: Key) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(key);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      triggerRef.current?.focus();
      return;
    }

    let nextKey: Key | null = null;

    if (event.key === 'ArrowLeft') {
      nextKey = findNextKey(key, 0, -1);
    } else if (event.key === 'ArrowRight') {
      nextKey = findNextKey(key, 0, 1);
    } else if (event.key === 'ArrowUp') {
      nextKey = findNextKey(key, -1, 0);
    } else if (event.key === 'ArrowDown') {
      nextKey = findNextKey(key, 1, 0);
    }

    if (!nextKey) {
      return;
    }

    event.preventDefault();
    optionRefs.current[nextKey]?.focus();
  };
  const isCompactTrigger = triggerDensity === 'compact';
  const resolvedAlign = align as PanelAlign;
  const { panelStyle, placement, isPositioned } = useAnchoredPortalPanel({
    isOpen,
    align: resolvedAlign,
    triggerRef,
    panelRef,
    onRequestClose: closePanel
  });

  const triggerValueText = value ?? clearLabel ?? label;
  const resolvedPanelMetaText = panelMetaText ?? triggerMetaText;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((open) => !open)}
        className={`flex items-center justify-between gap-2 border border-gray-300 bg-white text-left outline-none transition-colors ${
          isCompactTrigger
            ? 'h-9 min-w-[74px] rounded-lg px-2.5'
            : 'h-10 min-w-[92px] rounded-xl px-3'
        } ${
          disabled
            ? 'cursor-not-allowed text-gray-400'
            : isOpen
              ? 'border-indigo-500 ring-2 ring-indigo-500'
              : 'text-gray-700 hover:border-gray-400'
        } ${buttonClassName}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-1.5">
          <span className={`truncate ${isCompactTrigger ? 'text-[13px]' : 'text-sm'} font-semibold ${value ? 'text-gray-800' : 'text-gray-500'} ${valueTextClassName}`}>
            {triggerValueText}
          </span>
          {triggerMetaText ? (
            <span className={`truncate ${isCompactTrigger ? 'text-[10px]' : 'text-[11px]'} font-semibold text-gray-500 ${metaTextClassName}`}>{triggerMetaText}</span>
          ) : null}
        </span>
        {!disabled ? (
          <ChevronDown size={triggerIconSize} className={`shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        ) : null}
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="w-[184px] rounded-[20px] border border-gray-200 bg-white p-2.5 shadow-xl"
          style={panelStyle}
          data-placement={placement}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{label}</div>
            {resolvedPanelMetaText ? (
              <div className="text-[10px] font-bold text-gray-500">{resolvedPanelMetaText}</div>
            ) : null}
          </div>

          {clearLabel ? (
            <div className="mb-2">
              <button
                ref={clearButtonRef}
                type="button"
                onClick={() => handleSelect(null)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    (value ? optionRefs.current[value] : optionRefs.current['C'])?.focus();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    closePanel();
                    triggerRef.current?.focus();
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelect(null);
                  }
                }}
                className={`flex h-[34px] w-full items-center justify-center rounded-xl border text-[12px] font-semibold tracking-tight transition-all ${
                  value === null
                    ? 'border-indigo-400 bg-indigo-100 text-indigo-800 shadow-sm shadow-indigo-100'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-gray-50'
                }`}
              >
                {clearLabel}
              </button>
            </div>
          ) : null}

          <div className={`grid grid-cols-3 gap-1.5 transition-opacity ${isPositioned ? 'opacity-100' : 'opacity-0'}`}>
            {KEY_PICKER_LAYOUT.flatMap((row, rowIndex) =>
              row.map((key, columnIndex) => {
                if (!key) {
                  return <div key={`empty-${rowIndex}-${columnIndex}`} className="h-[42px]" />;
                }

                const isSelectedKey = value === key;
                const isOriginalKey = originalKey === key;

                return (
                  <button
                    key={key}
                    ref={(node) => {
                      optionRefs.current[key] = node;
                    }}
                    type="button"
                    onClick={() => handleSelect(key)}
                    onKeyDown={(event) => handleOptionKeyDown(event, key)}
                    className={`relative flex h-[42px] items-center justify-center rounded-[12px] border text-[14px] font-semibold tracking-tight transition-all ${
                      isSelectedKey
                        ? isOriginalKey
                          ? 'border-indigo-400 bg-indigo-100 text-indigo-800 shadow-sm shadow-indigo-100'
                          : 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100'
                        : isOriginalKey
                          ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:border-fuchsia-300 hover:bg-fuchsia-100'
                          : 'border-gray-200 bg-white text-gray-800 hover:border-indigo-200 hover:bg-gray-50'
                    }`}
                  >
                    {isOriginalKey ? (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                    ) : null}
                    {key}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default KeyPicker;
