import React from 'react';

interface CompactSegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface CompactSegmentedControlProps<T extends string> {
  value: T;
  options: Array<CompactSegmentedControlOption<T>>;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export const CompactSegmentedControl = <T extends string,>({
  value,
  options,
  onChange,
  size = 'md'
}: CompactSegmentedControlProps<T>) => {
  const isSmall = size === 'sm';

  return (
    <div className={`inline-flex h-8 items-center rounded-2xl border border-gray-200 bg-gray-50 p-0.5 ${isSmall ? 'gap-1' : 'gap-1'}`}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full font-bold transition-colors ${
              isSmall ? 'whitespace-nowrap px-2 py-1 text-[10px] leading-none' : 'whitespace-nowrap px-3 py-1 text-[11px] leading-none'
            } ${
              isActive
                ? 'bg-white text-indigo-700'
                : 'text-gray-500 hover:text-indigo-600'
            }`}
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
  size?: 'sm' | 'md';
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
      size === 'sm'
        ? showLabel ? 'h-8 gap-1.5 px-2' : 'h-8 justify-center px-1.5'
        : showLabel ? 'h-8 gap-2 px-2.5' : 'h-8 justify-center px-2'
    }`}
    aria-pressed={checked}
    title={label}
  >
    <span
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </span>
    {showLabel && <span className="text-[11px] font-bold text-gray-700">{label}</span>}
  </button>
);
