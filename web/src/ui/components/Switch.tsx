// Công tắc bật/tắt, hình dạng theo <Switch> của react-native để web và app trông giống nhau.
export default function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={'relative h-8 w-13 shrink-0 rounded-pill transition-colors ' + (checked ? 'bg-primary' : 'bg-line')}
    >
      <span
        className={
          'absolute top-1 size-6 rounded-full bg-white shadow transition-[left] duration-200 ' +
          (checked ? 'left-6' : 'left-1')
        }
      />
    </button>
  );
}
