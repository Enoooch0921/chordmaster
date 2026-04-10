import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Key } from '../types';
import { getPlayKey } from '../utils/musicUtils';

interface CapoPickerProps {
  value: number;
  currentKey: Key;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  align?: 'left' | 'center' | 'right';
  buttonClassName?: string;
  valueTextClassName?: string;
  showPlayKey?: boolean;
  triggerIconSize?: number;
  triggerDensity?: 'default' | 'compact';
}

const CapoPicker: React.FC<CapoPickerProps> = ({
  value,
  currentKey,
  onChange,
  disabled = false,
  label = 'Capo',
  align = 'right',
  buttonClassName = '',
  valueTextClassName = '',
  showPlayKey = true,
  triggerIconSize = 16,
  triggerDensity = 'default'
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const playKey = getPlayKey(currentKey, value);

  const closePanel = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
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

    window.requestAnimationFrame(() => {
      optionRefs.current[value]?.focus();
    });
  }, [isOpen, value]);

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, capo: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChange(capo);
      closePanel();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      triggerRef.current?.focus();
      return;
    }

    if (event.key === 'ArrowDown' && capo < 11) {
      event.preventDefault();
      optionRefs.current[capo + 1]?.focus();
    }

    if (event.key === 'ArrowUp' && capo > 0) {
      event.preventDefault();
      optionRefs.current[capo - 1]?.focus();
    }
  };

  const panelPositionClassName = align === 'left'
    ? 'left-0'
    : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'right-0';
  const isCompactTrigger = triggerDensity === 'compact';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((open) => !open)}
        className={`flex items-center justify-between gap-2 border border-gray-300 bg-white text-left outline-none transition-colors ${
          isCompactTrigger
            ? 'h-9 min-w-[82px] rounded-lg px-2.5'
            : 'h-10 min-w-[104px] rounded-xl px-3'
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
        <span className={`min-w-0 truncate ${isCompactTrigger ? 'text-[13px]' : 'text-sm'} font-semibold text-gray-800 ${valueTextClassName}`}>
          {value}{showPlayKey ? <> <span className="text-gray-400">({playKey})</span></> : null}
        </span>
        <ChevronDown size={triggerIconSize} className={`shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute top-full z-50 mt-2 w-[132px] overflow-hidden rounded-[20px] border border-gray-200 bg-white p-2 shadow-xl ${panelPositionClassName}`}>
          <div className="mb-2 px-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
            {label}
          </div>
          <div className="space-y-0.5">
            {Array.from({ length: 12 }).map((_, capo) => {
              const optionPlayKey = getPlayKey(currentKey, capo);
              const isSelected = value === capo;
              const useIndigo = !optionPlayKey.includes('#') && !optionPlayKey.includes('b') && ['C', 'D', 'E', 'G', 'A'].includes(optionPlayKey);

              return (
                <button
                  key={capo}
                  ref={(node) => {
                    optionRefs.current[capo] = node;
                  }}
                  type="button"
                  onClick={() => {
                    onChange(capo);
                    closePanel();
                  }}
                  onKeyDown={(event) => handleOptionKeyDown(event, capo)}
                  className={`flex w-full items-center rounded-xl px-2 py-1.5 text-left transition-colors ${
                    isSelected
                      ? useIndigo
                        ? 'bg-indigo-50'
                        : 'bg-slate-100'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`inline-flex min-w-[1.15em] justify-end text-[13px] font-bold ${isSelected && useIndigo ? 'text-indigo-700' : 'text-gray-700'}`}>
                    {capo}
                  </span>
                  <span className={`ml-1.5 text-[13px] font-semibold ${isSelected && useIndigo ? 'text-indigo-700' : optionPlayKey.includes('#') || optionPlayKey.includes('b') ? 'text-gray-400' : 'text-gray-900'}`}>
                    ({optionPlayKey})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CapoPicker;
