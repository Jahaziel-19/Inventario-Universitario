import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  value: string;
  query: string;
  options: SearchableOption[];
  placeholder: string;
  emptyText: string;
  onQueryChange: (query: string) => void;
  onValueChange: (value: string) => void;
  allowCustomValue?: boolean;
  disabled?: boolean;
}

export default function SearchableSelect({
  value,
  query,
  options,
  placeholder,
  emptyText,
  onQueryChange,
  onValueChange,
  allowCustomValue = false,
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) =>
      option.label.toLowerCase().includes(normalized) ||
      option.description?.toLowerCase().includes(normalized)
    );
  }, [options, query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (nextValue: string) => {
    onQueryChange(nextValue);
    if (allowCustomValue) {
      onValueChange('');
    } else if (value) {
      const selectedOption = options.find((option) => option.value === value);
      if (selectedOption && selectedOption.label !== nextValue) {
        onValueChange('');
      }
    }
    setIsOpen(true);
  };

  const handleSelect = (option: SearchableOption) => {
    onValueChange(option.value);
    onQueryChange(option.label);
    setIsOpen(false);
  };

  return (
    <div className="searchable-select" ref={containerRef}>
      <div className={`searchable-select__control ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}>
        <Search size={16} className="searchable-select__icon" />
        <input
          type="text"
          className="searchable-select__input"
          value={query}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => handleInputChange(event.target.value)}
          disabled={disabled}
        />
        {query && !disabled ? (
          <button
            type="button"
            className="searchable-select__clear"
            onClick={() => {
              onQueryChange('');
              onValueChange('');
              setIsOpen(true);
            }}
          >
            <X size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className="searchable-select__toggle"
          onClick={() => setIsOpen((current) => !current)}
          disabled={disabled}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {isOpen && !disabled ? (
        <div className="searchable-select__menu">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`searchable-select__option ${value === option.value ? 'is-selected' : ''}`}
                onClick={() => handleSelect(option)}
              >
                <span className="searchable-select__label">{option.label}</span>
                {option.description ? (
                  <span className="searchable-select__description">{option.description}</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="searchable-select__empty">{emptyText}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
