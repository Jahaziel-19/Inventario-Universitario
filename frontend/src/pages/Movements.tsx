import React, { useEffect, useMemo, useState } from 'react';
import { Plus, FileSpreadsheet, FileDown, Search, RefreshCw, X, Check } from 'lucide-react';
import SearchableSelect, { type SearchableOption } from '../components/SearchableSelect';
import Modal from '../components/Modal';
import { buildApiUrl, buildMediaUrl, getAuthHeaders } from '../lib/api';

interface MovementsProps {
    token: string;
    preset?: string;
    onPresetConsumed?: () => void;
}

interface MovementItem {
    id: number;
    product: number;
    product_code: string;
    product_description: string;
    type: string;
    type_display: string;
    quantity: number;
    datetime: string;
    responsible_name: string;
    motive_name: string;
    observations?: string;
    related_document?: string | null;
    previous_stock: number;
    result_stock: number;
}

interface ProductLookupItem {
    id: number;
    code: string;
    description: string;
    stock: number;
    unit_name: string;
}

interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export default function Movements({ token, preset, onPresetConsumed }: MovementsProps) {
    const [movements, setMovements] = useState<MovementItem[]>([]);
    const [productSearchResults, setProductSearchResults] = useState<ProductLookupItem[]>([]);
    const [motives, setMotives] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingProductSearch, setLoadingProductSearch] = useState(false);
    const [error, setError] = useState('');

    // Search & Filter
    const [filterType, setFilterType] = useState('');
    const [searchProduct, setSearchProduct] = useState('');
    const [debouncedSearchProduct, setDebouncedSearchProduct] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [hasPreviousPage, setHasPreviousPage] = useState(false);

    // Form registration state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductLookupItem | null>(null);
    const [searchProdInput, setSearchProdInput] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [type, setType] = useState('ENT');
    const [motive, setMotive] = useState('');
    const [motiveQuery, setMotiveQuery] = useState('');
    const [observations, setObservations] = useState('');
    const [relatedDoc, setRelatedDoc] = useState<File | null>(null);

    const headers = getAuthHeaders(token);
    const motiveOptions = useMemo<SearchableOption[]>(
        () => motives.map((motiveItem) => ({
            value: motiveItem.id.toString(),
            label: motiveItem.name,
            description: motiveItem.description || 'Motivo registrado',
        })),
        [motives]
    );

    const buildMovementsUrl = () => {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('page_size', pageSize.toString());
        if (filterType) params.set('type', filterType);
        if (debouncedSearchProduct) params.set('product_code', debouncedSearchProduct);
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        return buildApiUrl(`/api/movements/?${params.toString()}`);
    };

    const fetchMovements = async ({ signal }: { signal?: AbortSignal } = {}) => {
        setLoading(true);
        setError('');

        try {
            const res = await fetch(buildMovementsUrl(), { headers, signal });
            if (!res.ok) throw new Error('Error al cargar movimientos');
            const data = await res.json();

            if (Array.isArray(data)) {
                setMovements(data);
                setTotalCount(data.length);
                setHasNextPage(false);
                setHasPreviousPage(false);
                return;
            }

            const paginatedData = data as PaginatedResponse<MovementItem>;
            setMovements(paginatedData.results || []);
            setTotalCount(paginatedData.count || 0);
            setHasNextPage(Boolean(paginatedData.next));
            setHasPreviousPage(Boolean(paginatedData.previous));
        } catch (err: any) {
            if (err.name === 'AbortError') {
                return;
            }
            setError(err.message || 'Error de conexión.');
        } finally {
            setLoading(false);
        }
    };

    const fetchMotives = async () => {
        try {
            const mRes = await fetch(buildApiUrl('/api/motives/'), { headers });
            if (mRes.ok) setMotives((await mRes.json()).filter((m: any) => m.is_active));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchProductSearchResults = async (query: string, signal?: AbortSignal) => {
        setLoadingProductSearch(true);
        try {
            const params = new URLSearchParams();
            params.set('page', '1');
            params.set('page_size', '20');
            if (query.trim()) {
                params.set('search', query.trim());
            }

            const res = await fetch(buildApiUrl(`/api/products/?${params.toString()}`), { headers, signal });
            if (!res.ok) {
                throw new Error('Error al buscar productos');
            }

            const data = await res.json();
            const results = Array.isArray(data) ? data : (data.results || []);
            setProductSearchResults(results);
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error(err);
            }
        } finally {
            setLoadingProductSearch(false);
        }
    };

    useEffect(() => {
        fetchMotives();
    }, [token]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearchProduct(searchProduct.trim());
            setPage(1);
        }, 350);

        return () => window.clearTimeout(timeoutId);
    }, [searchProduct]);

    useEffect(() => {
        setPage(1);
    }, [filterType, dateFrom, dateTo, pageSize]);

    useEffect(() => {
        const controller = new AbortController();
        fetchMovements({ signal: controller.signal });
        return () => controller.abort();
    }, [token, filterType, debouncedSearchProduct, dateFrom, dateTo, page, pageSize]);

    useEffect(() => {
        if (!isModalOpen || selectedProduct) {
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => {
            fetchProductSearchResults(searchProdInput, controller.signal);
        }, 250);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [isModalOpen, searchProdInput, selectedProduct, token]);

    useEffect(() => {
        if (!preset) {
            return;
        }
        if (preset === 'entries') {
            setFilterType('ENT');
        } else if (preset === 'exits') {
            setFilterType('SAL');
        }
        onPresetConsumed?.();
    }, [preset, onPresetConsumed]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedCustomMotive = motiveQuery.trim();
        if (!selectedProduct || !quantity || !type || (!motive && !trimmedCustomMotive)) {
            setError('Por favor complete todos los campos');
            return;
        }

        if (quantity <= 0) {
            setError('La cantidad debe ser mayor a cero');
            return;
        }

        // Client-side stock check for validation
        if (type === 'SAL' || type === 'AJN') {
            if (selectedProduct.stock < quantity) {
                setError(`Stock insuficiente. Disponible: ${selectedProduct.stock} ${selectedProduct.unit_name}, Solicitada: ${quantity}`);
                return;
            }
        }

        setLoading(true);

        // We send payload as FormData in case files are attached.
        const formData = new FormData();
        formData.append('product', selectedProduct.id.toString());
        formData.append('type', type);
        formData.append('quantity', quantity.toString());
        if (motive) {
            formData.append('motive', motive);
        }
        if (!motive && trimmedCustomMotive) {
            formData.append('custom_motive', trimmedCustomMotive);
        }
        formData.append('observations', observations);
        if (relatedDoc) {
            formData.append('related_document', relatedDoc);
        }

        try {
            const res = await fetch(buildApiUrl('/api/movements/'), {
                method: 'POST',
                headers,
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.quantity || 'Error al guardar movimiento');
            }

            setIsModalOpen(false);

            // Reset form
            setSelectedProduct(null);
            setSearchProdInput('');
            setProductSearchResults([]);
            setQuantity(1);
            setType('ENT');
            setMotive('');
            setMotiveQuery('');
            setObservations('');
            setRelatedDoc(null);
            setError('');

            // Reload lists
            void fetchMovements();
        } catch (err: any) {
            setError(err.message || 'Error al conectar.');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async (format: 'excel' | 'csv') => {
        let url = buildApiUrl(`/api/movements/export/?format=${format}&`);
        if (filterType) url += `type=${filterType}&`;
        if (searchProduct) url += `product_code=${searchProduct}&`;
        if (dateFrom) url += `date_from=${dateFrom}&`;
        if (dateTo) url += `date_to=${dateTo}&`;

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error('No se pudo exportar la información.');
            }
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `movimientos.${format === 'excel' ? 'xlsx' : 'csv'}`;
            link.click();
            URL.revokeObjectURL(blobUrl);
        } catch (err: any) {
            setError(err.message || 'Error al exportar movimientos.');
        }
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const visibleStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const visibleEnd = totalCount === 0 ? 0 : visibleStart + movements.length - 1;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Movimientos de Inventario</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Consulta la bitácora completa de kardex físico y registra entradas o salidas de materiales</p>
                </div>
                <button
                    onClick={() => {
                        setIsModalOpen(true);
                        setSelectedProduct(null);
                        setSearchProdInput('');
                        setProductSearchResults([]);
                        setMotiveQuery('');
                        setMotive('');
                    }}
                    className="btn btn-primary"
                >
                    <Plus size={18} />
                    Registrar Operación
                </button>
            </div>

            {error && (
                <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    {error}
                </div>
            )}

            {/* Filter Options */}
            <div className="search-filter-bar section-card" style={{ padding: '1rem', flexDirection: 'row', alignItems: 'center' }}>
                <div style={{ position: 'relative', minWidth: '150px' }}>
                    <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: '2rem' }}
                        placeholder="Material / Código..."
                        value={searchProduct}
                        onChange={(e) => setSearchProduct(e.target.value)}
                    />
                    <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>

                <select className="filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="">Todos los Tipos</option>
                    <option value="ENT">Entrada</option>
                    <option value="SAL">Salida</option>
                    <option value="AJP">Ajuste Positivo</option>
                    <option value="AJN">Ajuste Negativo</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Desde:</span>
                    <input type="date" className="filter-select" style={{ padding: '0.5rem' }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Hasta:</span>
                    <input type="date" className="filter-select" style={{ padding: '0.5rem' }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>

                <div className="movements-filter-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleExport('excel')} className="btn btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
                        <FileSpreadsheet size={16} />
                        Exportar Excel
                    </button>
                    <button onClick={() => handleExport('csv')} className="btn btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
                        <FileDown size={16} />
                        Exportar CSV
                    </button>
                </div>
            </div>

            {/* Movements Table */}
            <div className="section-card">
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '1rem 1.25rem 0',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {loading
                            ? 'Actualizando movimientos...'
                            : totalCount > 0
                                ? `Mostrando ${visibleStart}-${visibleEnd} de ${totalCount} movimientos`
                                : 'Sin movimientos para mostrar'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Por página</span>
                        <select
                            className="filter-select"
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            style={{ width: 'auto', minWidth: '88px' }}
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>
                <div className="table-container mobile-cards">
                    <table className="custom-table">
                        <thead>
                            <tr>
                                <th>Fecha y Hora</th>
                                
                                <th>Material</th>
                                <th>Tipo</th>
                                <th>Cantidad</th>
                                <th>Stock Anterior</th>
                                <th>Stock Final</th>
                                <th>Motivo</th>
                                <th>Responsable</th>
                                <th>Doc.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={10} className="table-row-message">
                                        <RefreshCw size={24} className="spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                                    </td>
                                </tr>
                            )}
                            {!loading && movements.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="table-row-message">
                                        No se encontraron movimientos.
                                    </td>
                                </tr>
                            )}
                            {!loading && movements.map((m) => (
                                <tr key={m.id}>
                                    <td data-label="Fecha y Hora" style={{ fontSize: '0.85rem' }}>{new Date(m.datetime).toLocaleString()}</td>
                                    <td data-label="Código" >
                                        {m.product_description}
                                        <br />
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}> {m.product_code}</span>

                                    </td>
                                    
                                    <td data-label="Tipo">
                                        <span className={`badge ${m.type === 'ENT' || m.type === 'AJP' ? 'badge-success' : 'badge-danger'
                                            }`}>
                                            {m.type_display}
                                        </span>
                                    </td>
                                    <td data-label="Cantidad" style={{ fontWeight: 700 }}>{m.quantity}</td>
                                    <td data-label="Stock Anterior" style={{ color: 'var(--text-secondary)' }}>{m.previous_stock}</td>
                                    <td data-label="Stock Final" style={{ fontWeight: 600, color: 'var(--primary)' }}>{m.result_stock}</td>
                                    <td data-label="Motivo">{m.motive_name}</td>
                                    <td data-label="Responsable" style={{ fontSize: '0.85rem' }}>{m.responsible_name}</td>
                                    <td data-label="Documento">
                                        {m.related_document ? (
                                            <a href={buildMediaUrl(m.related_document)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                <FileDown size={14} />
                                                Descargar
                                            </a>
                                        ) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="importer-pagination" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border-color)' }}>
                    <span>
                        Pagina {page} de {totalPages}
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

            {/* Register Operation Dialog Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} variant="drawer">
                    <form onSubmit={handleRegister} className="modal-content drawer-content drawer-content--wide fade-in">
                        <div className="modal-header drawer-header">
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Registrar Operación Física</h2>
                            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '0.35rem' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Buscar Material / Producto</label>
                                {selectedProduct ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.75rem',
                                        background: 'var(--primary-glow)',
                                        border: '1px solid rgba(59, 130, 246, 0.2)',
                                        borderRadius: '8px'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700, display: 'block' }}>{selectedProduct.code}</span>
                                            <strong style={{ fontSize: '0.90rem' }}>{selectedProduct.description}</strong>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Stock Disponible: {selectedProduct.stock} {selectedProduct.unit_name}</span>
                                        </div>
                                        <button type="button" onClick={() => setSelectedProduct(null)} className="btn btn-secondary" style={{ padding: '0.25rem' }}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Escriba código o descripción..."
                                            value={searchProdInput}
                                            onChange={(e) => setSearchProdInput(e.target.value)}
                                        />
                                        {(searchProdInput || loadingProductSearch || productSearchResults.length > 0) && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                background: '#0f172a',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '0 0 8px 8px',
                                                maxHeight: '180px',
                                                overflowY: 'auto',
                                                zIndex: 200
                                            }}>
                                                {loadingProductSearch ? (
                                                    <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                        Buscando productos...
                                                    </div>
                                                ) : productSearchResults.length > 0 ? (
                                                    productSearchResults.map((p) => (
                                                        <div
                                                            key={p.id}
                                                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                                                            onClick={() => {
                                                                setSelectedProduct(p);
                                                                if (motives[0]) {
                                                                    setMotive(motives[0].id.toString());
                                                                    setMotiveQuery(motives[0].name);
                                                                }
                                                            }}
                                                            className="menu-item"
                                                        >
                                                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>[{p.code}]</span> {p.description}
                                                            <span style={{ float: 'right', color: 'var(--text-muted)' }}>Stock: {p.stock}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                        No se encontraron productos.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Tipo de Movimiento</label>
                                    <select className="filter-select" style={{ width: '100%' }} value={type} onChange={(e) => setType(e.target.value)}>
                                        <option value="ENT">Entrada (+)</option>
                                        <option value="SAL">Salida (-)</option>
                                        <option value="AJP">Ajuste Positivo (+)</option>
                                        <option value="AJN">Ajuste Negativo (-)</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Cantidad</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={quantity}
                                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                                        min="1"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Motivo Operación</label>
                                <SearchableSelect
                                    value={motive}
                                    query={motiveQuery}
                                    options={motiveOptions}
                                    placeholder="Selecciona o escribe un motivo..."
                                    emptyText="No hay coincidencias. Se registrará como motivo personalizado."
                                    allowCustomValue
                                    onQueryChange={setMotiveQuery}
                                    onValueChange={setMotive}
                                />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Al abrir el campo se muestran los motivos registrados; si escribes otro, se guardará como personalizado.
                                </span>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Observaciones</label>
                                <textarea
                                    className="form-input"
                                    style={{ resize: 'vertical', minHeight: '80px' }}
                                    value={observations}
                                    onChange={(e) => setObservations(e.target.value)}
                                    placeholder="Detalles sobre la entrega, compra o ajuste..."
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Documento de Respaldo (Opcional)</label>
                                <input
                                    type="file"
                                    className="form-input"
                                    onChange={(e) => setRelatedDoc(e.target.files ? e.target.files[0] : null)}
                                    style={{ padding: '0.45rem' }}
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                                Cancelar
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                <Check size={16} />
                                Registrar Movimiento
                            </button>
                        </div>
                    </form>
            </Modal>
        </div>
    );
}
