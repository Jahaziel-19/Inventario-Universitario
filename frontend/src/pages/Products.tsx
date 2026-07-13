import React, { useEffect, useState } from 'react';
import { Search, Plus, Edit2, RefreshCw, X, Check, FileText, Image as ImageIcon } from 'lucide-react';
import HierarchicalLocationSelect from '../components/HierarchicalLocationSelect';
import Modal from '../components/Modal';
import SearchableSelect, { type SearchableOption } from '../components/SearchableSelect';
import { buildApiUrl, buildMediaUrl, getAuthHeaders } from '../lib/api';

interface ProductsProps {
    token: string;
    preset?: string;
    onPresetConsumed?: () => void;
}

interface ProductItem {
    id: number;
    code: string;
    description: string;
    category: number;
    category_name: string;
    brand: number;
    brand_name: string;
    unit: number;
    unit_name: string;
    location: number;
    location_name: string;
    min_stock: number;
    status: string;
    status_display: string;
    stock: number;
    product_image?: string | null;
    observations?: string;
    qr_code?: string | null;
    barcode?: string | null;
}

interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

interface BrandItem {
    id: number;
    name: string;
    is_active?: boolean;
}

export default function Products({ token, preset, onPresetConsumed }: ProductsProps) {
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [brandFilterOptions, setBrandFilterOptions] = useState<SearchableOption[]>([]);
    const [brandFormOptions, setBrandFormOptions] = useState<SearchableOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingProductDetail, setLoadingProductDetail] = useState(false);
    const [error, setError] = useState('');

    // Search & Filter state
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [filterBrand, setFilterBrand] = useState('');
    const [filterBrandQuery, setFilterBrandQuery] = useState('');
    const [filterLoc, setFilterLoc] = useState('');
    const [filterStock, setFilterStock] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalCount, setTotalCount] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [hasPreviousPage, setHasPreviousPage] = useState(false);

    const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
    const [kardex, setKardex] = useState<any[]>([]);
    const [loadingKardex, setLoadingKardex] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [brand, setBrand] = useState('');
    const [brandQuery, setBrandQuery] = useState('');
    const [unit, setUnit] = useState('');
    const [location, setLocation] = useState('');
    const [minStock, setMinStock] = useState(5);
    const [statusVal, setStatusVal] = useState('ACT');
    const [observations, setObservations] = useState('');
    const [productImage, setProductImage] = useState<File | null>(null);
    const [productImagePreview, setProductImagePreview] = useState('');

    const headers = getAuthHeaders(token);

    const resetForm = () => {
        setEditId(null);
        setCode('');
        setDescription('');
        setCategory(categories[0]?.id?.toString() || '');
        setBrand('');
        setBrandQuery('');
        setUnit(units[0]?.id?.toString() || '');
        setLocation('');
        setMinStock(5);
        setStatusVal('ACT');
        setObservations('');
        setProductImage(null);
        setProductImagePreview('');
    };

    const fetchCatalogs = async () => {
        try {
            const [cRes, uRes, lRes] = await Promise.all([
                fetch(buildApiUrl('/api/categories/'), { headers }),
                fetch(buildApiUrl('/api/units/'), { headers }),
                fetch(buildApiUrl('/api/locations/'), { headers }),
            ]);

            if (cRes.ok) setCategories(await cRes.json());
            if (uRes.ok) setUnits(await uRes.json());
            if (lRes.ok) setLocations(await lRes.json());
        } catch (err) {
            console.error('Error fetching catalogs', err);
        }
    };

    const mapBrandOptions = (items: BrandItem[]) =>
        items.map((item) => ({
            value: item.id.toString(),
            label: item.name,
            description: item.is_active === false ? 'Marca inactiva' : 'Marca activa',
        }));

    const fetchBrandOptions = async (
        query: string,
        setOptions: React.Dispatch<React.SetStateAction<SearchableOption[]>>,
        signal?: AbortSignal
    ) => {
        try {
            const params = new URLSearchParams();
            params.set('page', '1');
            params.set('page_size', '10');
            params.set('ordering', 'name');
            if (query.trim()) {
                params.set('search', query.trim());
            }

            const res = await fetch(buildApiUrl(`/api/brands/?${params.toString()}`), { headers, signal });
            if (!res.ok) {
                throw new Error('Error al cargar marcas');
            }

            const data = await res.json();
            const items: BrandItem[] = Array.isArray(data) ? data : (data.results || []);
            setOptions(mapBrandOptions(items));
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error(err);
            }
        }
    };

    const buildProductsUrl = (pageValue = page, pageSizeValue = pageSize) => {
        const params = new URLSearchParams();
        params.set('page', pageValue.toString());
        params.set('page_size', pageSizeValue.toString());

        if (debouncedSearch) params.set('search', debouncedSearch);
        if (filterCat) params.set('category', filterCat);
        if (filterBrand) params.set('brand', filterBrand);
        if (filterLoc) params.set('location', filterLoc);
        if (filterStock === 'low') params.set('low_stock', 'true');
        if (filterStock === 'out') params.set('out_of_stock', 'true');

        return buildApiUrl(`/api/products/?${params.toString()}`);
    };

    const fetchProductDetail = async (productId: number, signal?: AbortSignal): Promise<ProductItem> => {
        const res = await fetch(buildApiUrl(`/api/products/${productId}/`), { headers, signal });
        if (!res.ok) {
            throw new Error('No se pudo cargar el detalle del producto');
        }
        return res.json();
    };

    const fetchProducts = async ({ signal }: { signal?: AbortSignal } = {}) => {
        setLoading(true);
        setError('');

        try {
            const res = await fetch(buildProductsUrl(), { headers, signal });
            if (!res.ok) throw new Error('Error al cargar productos');
            const data = await res.json();

            if (Array.isArray(data)) {
                setProducts(data);
                setTotalCount(data.length);
                setHasNextPage(false);
                setHasPreviousPage(false);
                return;
            }

            const paginatedData = data as PaginatedResponse<ProductItem>;
            setProducts(paginatedData.results || []);
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

    useEffect(() => {
        fetchCatalogs();
    }, [token]);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => {
            void fetchBrandOptions(filterBrandQuery, setBrandFilterOptions, controller.signal);
        }, 250);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [filterBrandQuery, token]);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => {
            void fetchBrandOptions(brandQuery, setBrandFormOptions, controller.signal);
        }, 250);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [brandQuery, token]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 350);

        return () => window.clearTimeout(timeoutId);
    }, [search]);

    useEffect(() => {
        setPage(1);
    }, [filterCat, filterBrand, filterLoc, filterStock, pageSize]);

    useEffect(() => {
        const controller = new AbortController();
        fetchProducts({ signal: controller.signal });
        return () => controller.abort();
    }, [token, debouncedSearch, filterCat, filterBrand, filterLoc, filterStock, page, pageSize]);

    useEffect(() => {
        if (!preset) {
            return;
        }
        if (preset === 'low' || preset === 'out') {
            setFilterStock(preset);
        }
        onPresetConsumed?.();
    }, [preset, onPresetConsumed]);

    const selectProduct = async (prod: ProductItem) => {
        setSelectedProduct(prod);
        setIsDetailModalOpen(true);
        setLoadingProductDetail(true);
        setLoadingKardex(true);
        setKardex([]);
        try {
            const [productDetail, kardexData] = await Promise.all([
                fetchProductDetail(prod.id),
                fetch(buildApiUrl(`/api/products/${prod.id}/kardex/`), { headers }).then(async (res) => {
                    if (!res.ok) throw new Error('Error al cargar Kardex');
                    return res.json();
                }),
            ]);

            setSelectedProduct(productDetail);
            setKardex(kardexData);
        } catch (err: any) {
            console.error(err.message);
        } finally {
            setLoadingProductDetail(false);
            setLoadingKardex(false);
        }
    };

    const openAddModal = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const openEditModal = async (p: ProductItem, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setError('');

        try {
            const productDetail = p.observations !== undefined ? p : await fetchProductDetail(p.id);
            setEditId(productDetail.id);
            setCode(productDetail.code);
            setDescription(productDetail.description);
            setCategory(productDetail.category.toString());
            setBrand(productDetail.brand.toString());
            setBrandQuery(productDetail.brand_name);
            setUnit(productDetail.unit.toString());
            setLocation(productDetail.location.toString());
            setMinStock(productDetail.min_stock);
            setStatusVal(productDetail.status);
            setObservations(productDetail.observations || '');
            setProductImage(null);
            setProductImagePreview(buildMediaUrl(productDetail.product_image));
            setIsModalOpen(true);
        } catch (err: any) {
            setError(err.message || 'No se pudo cargar la información del producto.');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || !description || !category || !brand || !unit || !location) {
            setError('Por favor complete todos los datos requeridos');
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('code', code);
        formData.append('description', description);
        formData.append('category', category);
        formData.append('brand', brand);
        formData.append('unit', unit);
        formData.append('location', location);
        formData.append('min_stock', minStock.toString());
        formData.append('status', statusVal);
        formData.append('observations', observations);
        if (productImage) {
            formData.append('product_image', productImage);
        }

        let url = buildApiUrl('/api/products/');
        if (editId) url += `${editId}/`;

        try {
            const res = await fetch(url, {
                method: editId ? 'PATCH' : 'POST',
                headers,
                body: formData
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.detail || data.code || data.product_image?.[0] || 'Error al guardar producto');
            }

            setIsModalOpen(false);
            setError('');
            await fetchProducts();
            if (selectedProduct && (selectedProduct.id === editId || selectedProduct.id === data.id)) {
                setSelectedProduct(data);
            }
        } catch (err: any) {
            setError(err.message || 'Error al conectar.');
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const visibleStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const visibleEnd = totalCount === 0 ? 0 : visibleStart + products.length - 1;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Gestión de Productos</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Filtra, busca, crea etiquetas QR y audita el Kardex de existencias de cada artículo</p>
                </div>
                <button onClick={openAddModal} className="btn btn-primary">
                    <Plus size={18} />
                    Nuevo Producto
                </button>
            </div>

            {error && (
                <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    {error}
                </div>
            )}

            <div className="search-filter-bar section-card" style={{ padding: '1rem', flexDirection: 'row' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                    <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: '2.5rem' }}
                        placeholder="Buscar por código, descripción, ubicación o marca..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>

                <select className="filter-select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                    <option value="">Todas las Categorías</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <div style={{ minWidth: '240px', flex: 1 }}>
                    <SearchableSelect
                        value={filterBrand}
                        query={filterBrandQuery}
                        options={brandFilterOptions}
                        placeholder="Marca: primeras 10 y búsqueda..."
                        emptyText="No se encontraron marcas."
                        onQueryChange={setFilterBrandQuery}
                        onValueChange={(value) => {
                            setFilterBrand(value);
                            const selectedOption = brandFilterOptions.find((option) => option.value === value);
                            if (selectedOption) {
                                setFilterBrandQuery(selectedOption.label);
                            }
                        }}
                    />
                </div>

                <div style={{ minWidth: '260px', flex: 1 }}>
                    <HierarchicalLocationSelect
                        locations={locations}
                        value={filterLoc}
                        placeholder="Filtrar por ubicación..."
                        emptyText="No hay sububicaciones en este nivel."
                        onValueChange={(value) => setFilterLoc(value)}
                        onClear={() => setFilterLoc('')}
                    />
                </div>

                <select className="filter-select" value={filterStock} onChange={(e) => setFilterStock(e.target.value)}>
                    <option value="">Filtrar existencias</option>
                    <option value="low">⚠️ Stock Bajo</option>
                    <option value="out">🛑 Sin existencias</option>
                </select>
            </div>

            <div className="section-card" style={{ overflow: 'hidden' }}>
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
                            ? 'Actualizando listado...'
                            : totalCount > 0
                                ? `Mostrando ${visibleStart}-${visibleEnd} de ${totalCount} productos`
                                : 'Sin productos para mostrar'}
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
                                <th>Código</th>
                                <th>Descripción</th>
                                <th>Ubicación Física</th>
                                <th>Existencia</th>
                                <th>Estado</th>
                                <th style={{ width: '80px' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="table-row-message" style={{ color: 'var(--text-secondary)' }}>
                                        <RefreshCw size={24} className="spin" style={{ animation: 'spin 1.5s linear infinite', marginBottom: '0.5rem' }} />
                                        <p>Cargando productos...</p>
                                    </td>
                                </tr>
                            )}
                            {!loading && products.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="table-row-message">
                                        No se encontraron productos registrados.
                                    </td>
                                </tr>
                            )}
                            {!loading && products.map((p) => {
                                const isLow = p.stock > 0 && p.stock <= p.min_stock;
                                const isOut = p.stock === 0;

                                return (
                                    <tr key={p.id} onClick={() => selectProduct(p)} style={{ cursor: 'pointer' }}>
                                        <td data-label="Código" style={{ fontWeight: 700, color: 'var(--primary)' }}>{p.code}</td>
                                        <td data-label="Descripción">
                                            <div className="product-row-summary">
                                                <div className="product-row-summary__image">
                                                    {p.product_image ? (
                                                        <img src={buildMediaUrl(p.product_image)} alt={p.description} />
                                                    ) : (
                                                        <ImageIcon size={18} />
                                                    )}
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                                                        {p.category_name} • {p.brand_name}
                                                    </span>
                                                    <span style={{ fontWeight: 550 }}>{p.description}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td data-label="Ubicación Física" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.location_name}</td>
                                        <td data-label="Existencia">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p.stock}</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.unit_name}</span>
                                                {isOut && <span className="badge badge-danger" style={{ padding: '0.1rem 0.3rem', fontSize: '0.65rem' }}>Agotado</span>}
                                                {isLow && <span className="badge badge-warning" style={{ padding: '0.1rem 0.3rem', fontSize: '0.65rem' }}>Bajo Stock</span>}
                                            </div>
                                        </td>
                                        <td data-label="Estado">
                                            <span className={`badge ${p.status === 'ACT' ? 'badge-success' : p.status === 'INA' ? 'badge-secondary' : 'badge-warning'}`}>
                                                {p.status_display}
                                            </span>
                                        </td>
                                        <td data-label="Acciones">
                                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                <button onClick={(e) => void openEditModal(p, e)} className="btn btn-secondary" style={{ padding: '0.35rem' }}>
                                                    <Edit2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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

            {/* Add / Edit Product Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} variant="drawer">
                    <form onSubmit={handleSave} className="modal-content drawer-content drawer-content--wide fade-in">
                        <div className="modal-header drawer-header">
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                {editId ? `Editar Producto: ${code}` : 'Agregar Nuevo Producto'}
                            </h2>
                            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '0.35rem' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="modal-body drawer-body-grid">
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Código Interno</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="Ej. LAP-DELL-V35"
                                    disabled={!!editId}
                                />
                            </div>

                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Descripción</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Ej. Laptop Dell Vostro Core i7, 16GB RAM"
                                />
                            </div>

                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Imagen del Producto</label>
                                <input
                                    type="file"
                                    className="form-input"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        setProductImage(file);
                                        setProductImagePreview(file ? URL.createObjectURL(file) : (editId ? productImagePreview : ''));
                                    }}
                                    style={{ padding: '0.45rem' }}
                                />
                                {productImagePreview ? (
                                    <div className="product-image-preview">
                                        <img src={productImagePreview} alt="Vista previa" />
                                    </div>
                                ) : null}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Categoría</label>
                                <select className="filter-select" style={{ width: '100%' }} value={category} onChange={(e) => setCategory(e.target.value)}>
                                    <option value="">Seleccionar...</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Marca</label>
                                <SearchableSelect
                                    value={brand}
                                    query={brandQuery}
                                    options={brandFormOptions}
                                    placeholder="Selecciona marca o escribe para buscar..."
                                    emptyText="No se encontraron marcas."
                                    onQueryChange={setBrandQuery}
                                    onValueChange={(value) => {
                                        setBrand(value);
                                        const selectedOption = brandFormOptions.find((option) => option.value === value);
                                        if (selectedOption) {
                                            setBrandQuery(selectedOption.label);
                                        }
                                    }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Unidad de Medida</label>
                                <select className="filter-select" style={{ width: '100%' }} value={unit} onChange={(e) => setUnit(e.target.value)}>
                                    <option value="">Seleccionar...</option>
                                    {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Ubicación Física</label>
                                <HierarchicalLocationSelect
                                    locations={locations}
                                    value={location}
                                    placeholder="Selecciona una ubicación..."
                                    emptyText="No hay sububicaciones en este nivel."
                                    onValueChange={(value) => setLocation(value)}
                                    onClear={() => setLocation('')}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Stock Mínimo</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={minStock}
                                    onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                                    min="0"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Estado del Producto</label>
                                <select className="filter-select" style={{ width: '100%' }} value={statusVal} onChange={(e) => setStatusVal(e.target.value)}>
                                    <option value="ACT">Activo</option>
                                    <option value="INA">Inactivo</option>
                                    <option value="OBS">Obsoleto</option>
                                </select>
                            </div>

                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Observaciones</label>
                                <textarea
                                    className="form-input"
                                    style={{ resize: 'vertical', minHeight: '80px' }}
                                    value={observations}
                                    onChange={(e) => setObservations(e.target.value)}
                                    placeholder="Detalles técnicos adicionales, estado del insumo..."
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                                Cancelar
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                <Check size={16} />
                                {loading ? 'Guardando...' : 'Guardar Producto'}
                            </button>
                        </div>
                    </form>
            </Modal>

            <Modal isOpen={isDetailModalOpen && !!selectedProduct} onClose={() => setIsDetailModalOpen(false)} variant="drawer">
                    {selectedProduct ? (
                    <div className="modal-content drawer-content drawer-content--detail fade-in">
                        <div className="modal-header drawer-header">
                            <div className="drawer-header__meta">
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>CÓDIGO: {selectedProduct.code}</span>
                                <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>{selectedProduct.description}</h2>
                                <span className="drawer-header__location">{selectedProduct.location_name}</span>
                            </div>
                            <button type="button" onClick={() => setIsDetailModalOpen(false)} className="btn btn-secondary" style={{ padding: '0.3rem' }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="modal-body modal-body--detail">
                            {loadingProductDetail && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Cargando detalle completo del producto...
                                </div>
                            )}
                            <div className="product-detail-hero">
                                <div className="product-image-card product-image-card--detail">
                                    {selectedProduct.product_image ? (
                                        <img src={buildMediaUrl(selectedProduct.product_image)} alt={selectedProduct.description} className="product-image-card__image" />
                                    ) : (
                                        <div className="product-image-card__placeholder">
                                            <ImageIcon size={28} />
                                            <span>Sin imagen</span>
                                        </div>
                                    )}
                                </div>

                                <div className="product-detail-code-grid">
                                    <div className="codes-card codes-card--detail">
                                        {selectedProduct.qr_code ? (
                                            <div style={{ textAlign: 'center' }}>
                                                <img src={buildMediaUrl(selectedProduct.qr_code)} alt="QR" style={{ width: '132px', height: '132px', display: 'block', margin: '0 auto' }} />
                                                <span style={{ color: '#000', fontSize: '0.7rem', fontWeight: 650 }}>CÓDIGO QR</span>
                                            </div>
                                        ) : (
                                            <div className="codes-card__empty">QR no disponible</div>
                                        )}
                                    </div>
                                    <div className="codes-card codes-card--detail">
                                        {selectedProduct.barcode ? (
                                            <div style={{ textAlign: 'center' }}>
                                                <img src={buildMediaUrl(selectedProduct.barcode)} alt="Barcode" style={{ width: '220px', height: '84px', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                                                <span style={{ color: '#000', fontSize: '0.7rem', fontWeight: 650 }}>BARCODE</span>
                                            </div>
                                        ) : (
                                            <div className="codes-card__empty">Código de barras no disponible</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="product-stats-grid product-stats-grid--detail">
                                <div className="product-stat-card">
                                    <span>Existencia actual</span>
                                    <strong>{selectedProduct.stock} {selectedProduct.unit_name}</strong>
                                </div>
                                <div className="product-stat-card">
                                    <span>Stock mínimo</span>
                                    <strong>{selectedProduct.min_stock} {selectedProduct.unit_name}</strong>
                                </div>
                                <div className="product-stat-card">
                                    <span>Estado</span>
                                    <strong>{selectedProduct.status_display}</strong>
                                </div>
                                <div className="product-stat-card">
                                    <span>Categoría / Marca</span>
                                    <strong>{selectedProduct.category_name} / {selectedProduct.brand_name}</strong>
                                </div>
                            </div>

                            <div className="section-card drawer-kardex">
                                <span className="section-title" style={{ fontSize: '0.95rem' }}>
                                    <FileText size={16} style={{ color: 'var(--primary)' }} />
                                    Kardex (Historial Cronológico)
                                </span>

                                {loadingKardex && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cargando historial...</p>}

                                {!loadingKardex && kardex.length === 0 && (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                                        No hay movimientos registrados para este producto.
                                    </p>
                                )}

                                {!loadingKardex && kardex.length > 0 && (
                                    <div className="kardex-timeline">
                                        {kardex.map((k) => (
                                            <div key={k.id} className={`kardex-item ${k.type.toLowerCase()}`}>
                                                <div className="kardex-meta">
                                                    {new Date(k.datetime).toLocaleString().slice(0, 16)} • {k.responsible_name}
                                                </div>
                                                <div className="kardex-title">
                                                    {k.type_display} de <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{k.quantity}</span> {selectedProduct.unit_name}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    Stock: {k.previous_stock} ➔ {k.result_stock}
                                                </div>
                                                {k.observations && (
                                                    <div style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                                        "{k.observations}"
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="modal-footer drawer-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={async (event) => {
                                    await openEditModal(selectedProduct, event);
                                    setIsDetailModalOpen(false);
                                }}
                            >
                                <Edit2 size={16} />
                                Editar
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => setIsDetailModalOpen(false)}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                    ) : null}
            </Modal>
        </div>
    );
}
