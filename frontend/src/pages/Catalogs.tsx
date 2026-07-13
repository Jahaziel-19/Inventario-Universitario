import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Check, X, Folder, Layers, Tag, Ruler, Settings, MapPin, Search, ChevronRight, ChevronDown } from 'lucide-react';
import HierarchicalLocationSelect from '../components/HierarchicalLocationSelect';
import Modal from '../components/Modal';
import ToggleSwitch from '../components/ToggleSwitch';
import SearchableSelect, { type SearchableOption } from '../components/SearchableSelect';
import { buildApiUrl, getAuthHeaders } from '../lib/api';

interface CatalogsProps {
    token: string;
}

type CatalogTab = 'categories' | 'brands' | 'units' | 'motives' | 'locations';

interface CatalogItem {
    id: number;
    name: string;
    description?: string;
    abbreviation?: string;
    parent?: number | null;
    parent_name?: string;
    full_path?: string;
    is_active: boolean;
}

interface LocationCatalogItem extends CatalogItem {
    parent: number | null;
    full_path: string;
}

export default function Catalogs({ token }: CatalogsProps) {
    const [activeTab, setActiveTab] = useState<CatalogTab>('categories');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Data lists
    const [categories, setCategories] = useState<CatalogItem[]>([]);
    const [brands, setBrands] = useState<CatalogItem[]>([]);
    const [units, setUnits] = useState<CatalogItem[]>([]);
    const [motives, setMotives] = useState<CatalogItem[]>([]);
    const [locations, setLocations] = useState<LocationCatalogItem[]>([]);
    const [allLocations, setAllLocations] = useState<LocationCatalogItem[]>([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [ordering, setOrdering] = useState('name');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [hasPreviousPage, setHasPreviousPage] = useState(false);
    const [expandedLocationIds, setExpandedLocationIds] = useState<number[]>([]);

    // Form states
    const [nameInput, setNameInput] = useState('');
    const [descInput, setDescInput] = useState('');
    const [abbrInput, setAbbrInput] = useState('');
    const [parentInput, setParentInput] = useState('');
    const [brandQuery, setBrandQuery] = useState('');
    const [brandOptions, setBrandOptions] = useState<SearchableOption[]>([]);
    const [editId, setEditId] = useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const headers = getAuthHeaders(token, { 'Content-Type': 'application/json' });
    const currentItems = activeTab === 'categories'
        ? categories
        : activeTab === 'brands'
            ? brands
            : activeTab === 'units'
                ? units
                : activeTab === 'motives'
                    ? motives
                    : locations;

    const orderingOptions = useMemo(() => {
        const base = [
            { value: 'name', label: 'Nombre A-Z' },
            { value: '-name', label: 'Nombre Z-A' },
            { value: '-is_active', label: 'Activos primero' },
            { value: 'is_active', label: 'Inactivos primero' },
        ];

        if (activeTab === 'categories' || activeTab === 'motives') {
            base.splice(2, 0, { value: 'description', label: 'Descripción A-Z' });
        }

        if (activeTab === 'units') {
            base.splice(2, 0, { value: 'abbreviation', label: 'Abreviación A-Z' });
        }

        if (activeTab === 'locations') {
            base.splice(2, 0, { value: 'parent_name', label: 'Padre A-Z' });
        }

        return base;
    }, [activeTab]);

    const fetchLocationOptions = async (query = '') => {
        try {
            const params = new URLSearchParams();
            params.set('ordering', 'name');
            if (query.trim()) {
                params.set('search', query.trim());
            }

            const res = await fetch(buildApiUrl(`/api/locations/?${params.toString()}`), { headers });
            if (!res.ok) {
                throw new Error('Error al cargar ubicaciones');
            }

            const data = await res.json();
            const items = Array.isArray(data) ? data : (data.results || []);
            setAllLocations(items);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchBrandOptions = async (query = '') => {
        try {
            const params = new URLSearchParams();
            params.set('page', '1');
            params.set('page_size', '10');
            params.set('ordering', 'name');
            if (query.trim()) {
                params.set('search', query.trim());
            }

            const res = await fetch(buildApiUrl(`/api/brands/?${params.toString()}`), { headers });
            if (!res.ok) {
                throw new Error('Error al cargar marcas');
            }

            const data = await res.json();
            const items: CatalogItem[] = Array.isArray(data) ? data : (data.results || []);
            setBrandOptions(
                items.map((item) => ({
                    value: item.id.toString(),
                    label: item.name,
                    description: item.is_active ? 'Marca activa' : 'Marca inactiva',
                }))
            );
        } catch (err) {
            console.error(err);
        }
    };

    const fetchTab = async (tab: CatalogTab, { signal }: { signal?: AbortSignal } = {}) => {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('page_size', pageSize.toString());
        params.set('ordering', ordering);
        if (debouncedSearch) {
            params.set('search', debouncedSearch);
        }

        let url = buildApiUrl('/api/');
        if (tab === 'categories') url += `categories/?${params.toString()}`;
        if (tab === 'brands') url += `brands/?${params.toString()}`;
        if (tab === 'units') url += `units/?${params.toString()}`;
        if (tab === 'motives') url += `motives/?${params.toString()}`;
        if (tab === 'locations') url += `locations/?${params.toString()}`;

        try {
            const res = await fetch(url, { headers, signal });
            if (!res.ok) throw new Error('Error al cargar datos del catálogo');
            const data = await res.json();
            const results = Array.isArray(data) ? data : (data.results || []);
            const count = Array.isArray(data) ? data.length : (data.count || 0);

            if (tab === 'categories') setCategories(results);
            if (tab === 'brands') setBrands(results);
            if (tab === 'units') setUnits(results);
            if (tab === 'motives') setMotives(results);
            if (tab === 'locations') setLocations(results);

            setTotalCount(count);
            setHasNextPage(Boolean(data.next));
            setHasPreviousPage(Boolean(data.previous));
        } catch (err: any) {
            if (err.name === 'AbortError') {
                return;
            }
            setError(err.message || 'Error de conexión.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [search]);

    useEffect(() => {
        setPage(1);
    }, [activeTab, ordering, pageSize]);

    useEffect(() => {
        const controller = new AbortController();
        fetchTab(activeTab, { signal: controller.signal });
        return () => controller.abort();
    }, [activeTab, debouncedSearch, ordering, page, pageSize, token]);

    useEffect(() => {
        void fetchLocationOptions();
        void fetchBrandOptions();
    }, [token]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void fetchBrandOptions(brandQuery);
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [brandQuery]);

    const resetForm = () => {
        setNameInput('');
        setDescInput('');
        setAbbrInput('');
        setParentInput('');
        setBrandQuery('');
        setEditId(null);
        setIsModalOpen(false);
    };

    const openCreateModal = () => {
        setNameInput('');
        setDescInput('');
        setAbbrInput('');
        setParentInput('');
        setBrandQuery('');
        setEditId(null);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nameInput) {
            setError('El nombre es requerido');
            return;
        }

        setLoading(true);
        let url = buildApiUrl('/api/');
        let payload: any = { name: nameInput };

        if (activeTab === 'categories') {
            url += 'categories/';
            payload.description = descInput;
        } else if (activeTab === 'brands') {
            url += 'brands/';
        } else if (activeTab === 'units') {
            url += 'units/';
            payload.abbreviation = abbrInput || nameInput.slice(0, 3).toUpperCase();
        } else if (activeTab === 'motives') {
            url += 'motives/';
            payload.description = descInput;
        } else if (activeTab === 'locations') {
            url += 'locations/';
            payload.parent = parentInput ? parseInt(parentInput) : null;
        }

        if (editId) url += `${editId}/`;

        try {
            const res = await fetch(url, {
                method: editId ? 'PUT' : 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.name || 'Error al guardar elemento');
            }

            resetForm();
            void fetchTab(activeTab);
            if (activeTab === 'locations') {
                void fetchLocationOptions();
            }
            if (activeTab === 'brands') {
                void fetchBrandOptions(brandQuery);
            }
        } catch (err: any) {
            setError(err.message || 'Error de conexión.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleState = async (item: CatalogItem) => {
        setLoading(true);
        let url = buildApiUrl(`/api/${activeTab}/${item.id}/`);
        try {
            const res = await fetch(url, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ is_active: !item.is_active })
            });
            if (!res.ok) throw new Error('Error al modificar el estado');
            void fetchTab(activeTab);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (item: CatalogItem) => {
        setEditId(item.id);
        setNameInput(item.name);
        if (activeTab === 'categories' || activeTab === 'motives') {
            setDescInput(item.description || '');
        } else if (activeTab === 'units') {
            setAbbrInput(item.abbreviation || '');
        } else if (activeTab === 'locations') {
            setParentInput(item.parent ? item.parent.toString() : '');
        }
        setIsModalOpen(true);
    };

    const toggleLocationExpansion = (locationId: number) => {
        setExpandedLocationIds((current) =>
            current.includes(locationId)
                ? current.filter((id) => id !== locationId)
                : [...current, locationId]
        );
    };

    const renderLocationTree = (parentId: number | null = null, depth = 0): React.ReactNode => {
        const treeItems = debouncedSearch
            ? allLocations.filter((location) =>
                (location.full_path || location.name).toLowerCase().includes(debouncedSearch.toLowerCase())
            )
            : allLocations;
        const nodes = treeItems.filter((location) => (location.parent ?? null) === parentId);
        if (nodes.length === 0) return null;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginLeft: depth > 0 ? '1rem' : 0 }}>
                {nodes.map((node) => {
                    const children = treeItems.filter((location) => location.parent === node.id);
                    const hasChildren = children.length > 0;
                    const isExpanded = expandedLocationIds.includes(node.id);

                    return (
                        <div key={node.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.75rem',
                                    padding: '0.75rem 0.9rem',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem', minWidth: '36px', visibility: hasChildren ? 'visible' : 'hidden' }}
                                        onClick={() => hasChildren && toggleLocationExpansion(node.id)}
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    <Folder size={16} style={{ color: 'var(--primary)' }} />
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600 }}>{node.name}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{node.full_path}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button onClick={() => handleEdit(node)} className="btn btn-secondary" style={{ padding: '0.35rem' }}>
                                        <Edit2 size={14} />
                                    </button>
                                    <ToggleSwitch
                                        checked={node.is_active}
                                        label={node.is_active ? 'Activo' : 'Inactivo'}
                                        onChange={() => handleToggleState(node)}
                                    />
                                </div>
                            </div>
                            {hasChildren && isExpanded ? renderLocationTree(node.id, depth + 1) : null}
                        </div>
                    );
                })}
            </div>
        );
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const visibleStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const visibleEnd = totalCount === 0 ? 0 : visibleStart + currentItems.length - 1;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Catálogos Configurables</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Configura libremente las propiedades de existencias y la distribución física de la institución
                    </p>
                </div>
                <button onClick={openCreateModal} className="btn btn-primary">
                    <Plus size={16} />
                    Nuevo registro
                </button>
            </div>

            {error && (
                <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    {error}
                </div>
            )}

            {/* Tabs navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
                {[
                    { id: 'categories', label: 'Categorías', icon: <Layers size={16} /> },
                    { id: 'brands', label: 'Marcas', icon: <Tag size={16} /> },
                    { id: 'units', label: 'Unidades de Medida', icon: <Ruler size={16} /> },
                    { id: 'motives', label: 'Motivos de Movimiento', icon: <Settings size={16} /> },
                    { id: 'locations', label: 'Ubicaciones Jerárquicas', icon: <MapPin size={16} /> },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className="btn"
                        style={{
                            background: activeTab === tab.id ? 'var(--primary-glow)' : 'transparent',
                            border: activeTab === tab.id ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid transparent',
                            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem'
                        }}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            <div>
                <div className="section-card">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                Listado de Registros
                            </h2>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {loading
                                    ? 'Actualizando catálogo...'
                                    : totalCount > 0
                                        ? `Mostrando ${visibleStart}-${visibleEnd} de ${totalCount} registros`
                                        : 'Sin registros para mostrar'}
                            </div>
                        </div>

                        <div className="search-filter-bar" style={{ padding: 0, alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ paddingLeft: '2.5rem' }}
                                    placeholder={`Buscar en ${activeTab === 'categories' ? 'categorías' : activeTab === 'brands' ? 'marcas' : activeTab === 'units' ? 'unidades' : activeTab === 'motives' ? 'motivos' : 'ubicaciones'}...`}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            </div>

                            <select className="filter-select" value={ordering} onChange={(e) => setOrdering(e.target.value)}>
                                {orderingOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <select className="filter-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                                <option value={10}>10 por página</option>
                                <option value={25}>25 por página</option>
                                <option value={50}>50 por página</option>
                            </select>
                        </div>
                    </div>

                    {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando catálogo...</p>}

                    {!loading && activeTab === 'locations' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                    Estructura Física Jerárquica:
                                </span>
                                {renderLocationTree(null)}
                            </div>
                        </div>
                    ) : (
                        <div className="table-container mobile-cards">
                            <table className="custom-table">
                                <thead>
                                    <tr>
                                        <th>Nombre</th>
                                        {activeTab === 'categories' || activeTab === 'motives' ? <th>Descripción</th> : null}
                                        {activeTab === 'units' ? <th>Abreviación</th> : null}
                                        <th>Estado</th>
                                        <th style={{ width: '80px' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.map((item) => (
                                                    <tr key={item.id}>
                                                        <td data-label="Nombre" style={{ fontWeight: 600 }}>{item.name}</td>
                                                        {activeTab === 'categories' || activeTab === 'motives' ? (
                                                            <td data-label="Descripción" style={{ color: 'var(--text-secondary)' }}>{item.description || '-'}</td>
                                                        ) : null}
                                                        {activeTab === 'units' ? (
                                                            <td data-label="Abreviación" style={{ fontWeight: 600, color: 'var(--accent)' }}>{item.abbreviation}</td>
                                                        ) : null}
                                                        <td data-label="Estado">
                                                            <ToggleSwitch
                                                                checked={item.is_active}
                                                                label={item.is_active ? 'Activo' : 'Inactivo'}
                                                                onChange={() => handleToggleState(item)}
                                                            />
                                                        </td>
                                                        <td data-label="Acciones">
                                                            <button onClick={() => handleEdit(item)} className="btn btn-secondary" style={{ padding: '0.35rem' }}>
                                                                <Edit2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                    {!loading && currentItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={activeTab === 'units' || activeTab === 'categories' || activeTab === 'motives' ? 4 : 3} className="table-row-message">
                                                No se encontraron registros para esta búsqueda.
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="importer-pagination" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)', marginTop: '1rem' }}>
                        <span>
                            Página {page} de {totalPages}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                disabled={loading || !hasPreviousPage || page <= 1}
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setPage((current) => current + 1)}
                                disabled={loading || !hasNextPage}
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={resetForm} variant="drawer">
                    <form onSubmit={handleSave} className="modal-content drawer-content drawer-content--narrow fade-in">
                        <div className="modal-header drawer-header">
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 650 }}>
                                {editId ? 'Editar Elemento' : 'Nuevo Registro'}
                            </h2>
                            <button type="button" onClick={resetForm} className="btn btn-secondary" style={{ padding: '0.35rem' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Nombre</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={nameInput}
                                    onChange={(e) => setNameInput(e.target.value)}
                                    placeholder="Ej. Papelería, Estante 1, Dell"
                                />
                            </div>

                            {(activeTab === 'categories' || activeTab === 'motives') && (
                                <div className="form-group">
                                    <label className="form-label">Descripción</label>
                                    <textarea
                                        className="form-input"
                                        style={{ resize: 'vertical', minHeight: '80px' }}
                                        value={descInput}
                                        onChange={(e) => setDescInput(e.target.value)}
                                        placeholder="Breve descripción del elemento..."
                                    />
                                </div>
                            )}

                            {activeTab === 'units' && (
                                <div className="form-group">
                                    <label className="form-label">Abreviación</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={abbrInput}
                                        onChange={(e) => setAbbrInput(e.target.value)}
                                        placeholder="Ej. PZ, CJ, KG"
                                    />
                                </div>
                            )}

                            {activeTab === 'locations' && (
                                <div className="form-group">
                                    <label className="form-label">Ubicación Padre</label>
                                    <HierarchicalLocationSelect
                                        locations={allLocations}
                                        value={parentInput}
                                        excludedIds={editId ? [editId] : []}
                                        placeholder="Selecciona la ubicación padre..."
                                        emptyText="No hay sububicaciones en este nivel."
                                        onValueChange={(value) => setParentInput(value)}
                                        onClear={() => setParentInput('')}
                                    />
                                </div>
                            )}

                            {activeTab === 'brands' && (
                                <div className="form-group">
                                    <label className="form-label">Marcas sugeridas</label>
                                    <SearchableSelect
                                        value=""
                                        query={brandQuery}
                                        options={brandOptions}
                                        placeholder="Buscar entre las primeras 10 marcas..."
                                        emptyText="No hay coincidencias."
                                        onQueryChange={setBrandQuery}
                                        onValueChange={(value) => {
                                            const selectedOption = brandOptions.find((option) => option.value === value);
                                            if (selectedOption) {
                                                setNameInput(selectedOption.label);
                                                setBrandQuery(selectedOption.label);
                                            }
                                        }}
                                        allowCustomValue
                                    />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        Se muestran 10 marcas inicialmente y, al escribir, aparecen coincidencias dinámicas.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button type="button" onClick={resetForm} className="btn btn-secondary">
                                Cancelar
                            </button>
                            <button type="submit" className="btn btn-primary">
                                {editId ? <Check size={16} /> : <Plus size={16} />}
                                {editId ? 'Guardar' : 'Agregar'}
                            </button>
                        </div>
                    </form>
            </Modal>
        </div>
    );
}
