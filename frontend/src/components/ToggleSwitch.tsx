interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
}

export default function ToggleSwitch({ checked, onChange, label, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || (checked ? 'Activo' : 'Inactivo')}
      className={`toggle-switch ${checked ? 'is-checked' : ''}`}
      onClick={onChange}
      disabled={disabled}
    >
      <span className="toggle-switch__track">
        <span className="toggle-switch__thumb" />
      </span>
      {label ? <span className="toggle-switch__label">{label}</span> : null}
    </button>
  );
}
