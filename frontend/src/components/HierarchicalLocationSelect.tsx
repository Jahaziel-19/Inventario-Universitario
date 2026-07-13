import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, X } from 'lucide-react';

interface LocationNode {
  id: number;
  name: string;
  parent: number | null;
  full_path: string;
  is_active?: boolean;
}

interface HierarchicalLocationSelectProps {
  locations: LocationNode[];
  value: string;
  placeholder: string;
  emptyText: string;
  onValueChange: (value: string, label: string) => void;
  onClear?: () => void;
  excludedIds?: number[];
}

export default function HierarchicalLocationSelect({
  locations,
  value,
  placeholder,
  emptyText,
  onValueChange,
  onClear,
  excludedIds = [],
}: HierarchicalLocationSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentParentId, setCurrentParentId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filteredLocations = useMemo(
    () => locations.filter((location) => !excludedIds.includes(location.id)),
    [excludedIds, locations]
  );

  const locationMap = useMemo(() => {
    const map = new Map<number, LocationNode>();
    filteredLocations.forEach((location) => map.set(location.id, location));
    return map;
  }, [filteredLocations]);

  const childrenMap = useMemo(() => {
    const map = new Map<number | null, LocationNode[]>();
    filteredLocations.forEach((location) => {
      const key = location.parent ?? null;
      const current = map.get(key) || [];
      current.push(location);
      map.set(key, current);
    });

    map.forEach((items, key) => {
      map.set(
        key,
        [...items].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      );
    });

    return map;
  }, [filteredLocations]);

  const selectedLocation = value ? locationMap.get(Number(value)) : null;
  const currentLevelLocations = childrenMap.get(currentParentId) || [];

  const breadcrumb = useMemo(() => {
    const items: LocationNode[] = [];
    if (currentParentId === null) {
      return items;
    }

    let pointer = locationMap.get(currentParentId) || null;
    while (pointer) {
      items.unshift(pointer);
      pointer = pointer.parent ? locationMap.get(pointer.parent) || null : null;
    }
    return items;
  }, [currentParentId, locationMap]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const selectedParentId = selectedLocation?.parent ?? null;
    setCurrentParentId(selectedParentId);
  }, [isOpen, selectedLocation]);

  return (
    <div className="hierarchical-select" ref={containerRef}>
      <button
        type="button"
        className={`hierarchical-select__trigger ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="hierarchical-select__trigger-content">
          <FolderTree size={16} />
          <span className={selectedLocation ? '' : 'hierarchical-select__placeholder'}>
            {selectedLocation?.full_path || placeholder}
          </span>
        </div>
        <div className="hierarchical-select__trigger-actions">
          {selectedLocation && onClear ? (
            <span
              className="hierarchical-select__clear"
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
            >
              <X size={14} />
            </span>
          ) : null}
          <ChevronDown size={16} />
        </div>
      </button>

      {isOpen ? (
        <div className="hierarchical-select__menu">
          <div className="hierarchical-select__breadcrumb">
            <button type="button" className={`hierarchical-select__crumb ${currentParentId === null ? 'is-active' : ''}`} onClick={() => setCurrentParentId(null)}>
              Raíz
            </button>
            {breadcrumb.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`hierarchical-select__crumb ${currentParentId === item.id ? 'is-active' : ''}`}
                onClick={() => setCurrentParentId(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="hierarchical-select__list">
            {currentLevelLocations.length > 0 ? (
              currentLevelLocations.map((location) => {
                const hasChildren = (childrenMap.get(location.id) || []).length > 0;
                const isSelected = selectedLocation?.id === location.id;

                return (
                  <div key={location.id} className={`hierarchical-select__item ${isSelected ? 'is-selected' : ''}`}>
                    <button
                      type="button"
                      className="hierarchical-select__select"
                      onClick={() => {
                        onValueChange(location.id.toString(), location.full_path);
                        if (!hasChildren) {
                          setIsOpen(false);
                        }
                      }}
                    >
                      <div>
                        <span className="hierarchical-select__item-name">{location.name}</span>
                        <span className="hierarchical-select__item-path">{location.full_path}</span>
                      </div>
                    </button>

                    {hasChildren ? (
                      <button
                        type="button"
                        className="hierarchical-select__drill"
                        onClick={() => setCurrentParentId(location.id)}
                        title="Ver sububicaciones"
                      >
                        <ChevronRight size={16} />
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="hierarchical-select__empty">{emptyText}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
