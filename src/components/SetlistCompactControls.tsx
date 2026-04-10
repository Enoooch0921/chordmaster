import React from 'react';

interface CompactSegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface CompactSegmentedControlProps<T extends string> {
  value: T;
  options: Array<CompactSegmentedControlOption<T>>;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  buttonClassName?: string;
  stretch?: boolean;
  wrap?: boolean;
}

export const CompactSegmentedControl = <T extends string,>({
  value,
  options,
  onChange,
  size = 'md',
  className = '',
  buttonClassName = '',
  stretch = false,
  wrap = false
}: CompactSegmentedControlProps<T>) => {
  const isExtraSmall = size === 'xs';
  const isSmall = size === 'sm';

  return (
    <div
      className={`items-center border border-gray-200 bg-gray-50 ${
        isExtraSmall ? 'h-7 rounded-xl p-[3px]' : 'h-8 rounded-2xl p-0.5'
      } ${
        stretch ? 'flex w-full' : 'inline-flex'
      } ${wrap ? 'flex-wrap' : ''} ${isSmall ? 'gap-1' : 'gap-1'} ${className}`}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full font-bold transition-colors ${
              isExtraSmall
                ? 'whitespace-nowrap px-2 py-1 text-[9px] leading-none'
                : isSmall
                  ? 'whitespace-nowrap px-2 py-1 text-[10px] leading-none'
                  : 'whitespace-nowrap px-3 py-1 text-[11px] leading-none'
            } ${
              stretch ? 'flex-1 text-center' : ''
            } ${
              isActive
                ? 'bg-white text-indigo-700'
                : 'text-gray-500 hover:text-indigo-600'
            } ${buttonClassName}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

interface CompactToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
}

export const CompactToggleSwitch: React.FC<CompactToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  size = 'md',
  showLabel = true
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`inline-flex items-center rounded-xl border border-gray-200 bg-white transition-colors hover:border-indigo-200 ${
      size === 'xs'
        ? showLabel ? 'h-7 gap-1.5 px-2' : 'h-7 justify-center px-1'
        : size === 'sm'
          ? showLabel ? 'h-8 gap-1.5 px-2' : 'h-8 justify-center px-1.5'
          : showLabel ? 'h-8 gap-2 px-2.5' : 'h-8 justify-center px-2'
    }`}
    aria-pressed={checked}
    title={label}
  >
    <span
      className={`relative rounded-full transition-colors ${
        size === 'xs' ? 'h-4 w-7' : 'h-5 w-9'
      } ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute rounded-full bg-white shadow-sm transition-transform ${
          size === 'xs' ? 'left-0.5 top-0.5 h-3 w-3' : 'left-0.5 top-0.5 h-4 w-4'
        } ${
          checked
            ? (size === 'xs' ? 'translate-x-3' : 'translate-x-4')
            : 'translate-x-0'
        }`}
      />
    </span>
    {showLabel && <span className={`${size === 'xs' ? 'text-[10px]' : 'text-[11px]'} font-bold text-gray-700`}>{label}</span>}
  </button>
);
