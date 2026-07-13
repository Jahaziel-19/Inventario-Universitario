import { useEffect, useState } from 'react';
import { Package, Layers, ArrowUpRight, ArrowDownRight, AlertTriangle, RefreshCw, FileText, ClipboardList } from 'lucide-react';
import { buildApiUrl, getAuthHeaders } from '../lib/api';

interface DashboardProps {
    token: string;
    onNavigate: (tab: string, preset?: string) => void;
}

export default function Dashboard({ token, onNavigate }: DashboardProps) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalProducts: 0,
        totalCategories: 0,
        entriesToday: 0,
        exitsToday: 0,
        lowStock: 0,
        outOfStock: 0,
    });
    const [recentMovements, setRecentMovements] = useState<any[]>([]);
    const [recentAudits, setRecentAudits] = useState<any[]>([]);
    const [fetchError, setFetchError] = useState('');

    const fetchDashboardData = async () => {
        setLoading(true);
        setFetchError('');
        try {
            const headers = getAuthHeaders(token);
            const res = await fetch(buildApiUrl('/api/dashboard/summary/'), { headers });
            if (!res.ok) throw new Error('Error al cargar dashboard');
            const data = await res.json();

            setStats(data.stats);
            setRecentMovements(data.recentMovements || []);
            setRecentAudits(data.recentAudits || []);
        } catch (err: any) {
            setFetchError(err.message || 'Error de conexión.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [token]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
                <RefreshCw size={40} className="spin" style={{ color: 'var(--primary)', animation: 'spin 1.5s linear infinite' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Cargando información del dashboard...</span>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>Dashboard General</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Resumen operativo actual del inventario de materiales e insumos</p>
                </div>
                <button onClick={fetchDashboardData} className="btn btn-secondary">
                    <RefreshCw size={16} />
                    Actualizar datos
                </button>
            </div>

            {fetchError && (
                <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    {fetchError} - Asegúrese de que el servidor Django del backend está activo.
                </div>
            )}

            {/* KPI Cards Grid */}
            <div className="metrics-grid">
                <button className="metric-card primary metric-card-button" onClick={() => onNavigate('products')}>
                    <div className="metric-info">
                        <h3>Productos Registrados</h3>
                        <div className="metric-value">{stats.totalProducts}</div>
                    </div>
                    <div className="metric-icon">
                        <Package size={24} />
                    </div>
                </button>

                <button className="metric-card primary metric-card-button" onClick={() => onNavigate('catalogs')}>
                    <div className="metric-info">
                        <h3>Categorías</h3>
                        <div className="metric-value">{stats.totalCategories}</div>
                    </div>
                    <div className="metric-icon">
                        <Layers size={24} />
                    </div>
                </button>

                <button className="metric-card success metric-card-button" onClick={() => onNavigate('movements', 'entries')}>
                    <div className="metric-info">
                        <h3>Entradas de Hoy</h3>
                        <div className="metric-value">+{stats.entriesToday}</div>
                    </div>
                    <div className="metric-icon">
                        <ArrowUpRight size={24} />
                    </div>
                </button>

                <button className="metric-card danger metric-card-button" onClick={() => onNavigate('movements', 'exits')}>
                    <div className="metric-info">
                        <h3>Salidas de Hoy</h3>
                        <div className="metric-value">-{stats.exitsToday}</div>
                    </div>
                    <div className="metric-icon">
                        <ArrowDownRight size={24} />
                    </div>
                </button>

                <button className="metric-card warning metric-card-button" onClick={() => onNavigate('products', 'low')}>
                    <div className="metric-info">
                        <h3>Inventario Bajo</h3>
                        <div className="metric-value">{stats.lowStock}</div>
                    </div>
                    <div className="metric-icon">
                        <AlertTriangle size={24} />
                    </div>
                </button>

                <button className="metric-card danger metric-card-button" onClick={() => onNavigate('products', 'out')}>
                    <div className="metric-info">
                        <h3>Productos Agotados</h3>
                        <div className="metric-value">{stats.outOfStock}</div>
                    </div>
                    <div className="metric-icon">
                        <AlertTriangle size={24} />
                    </div>
                </button>
            </div>


            {/* Main dashboard sections splits */}
            <div className="dashboard-sections">
                {/* Left Side: Recent Movements */}
                <div className="section-card">
                    <div className="section-header">
                        <span className="section-title">
                            <ClipboardList size={18} style={{ color: 'var(--primary)' }} />
                            Movimientos Recientes
                        </span>
                    </div>
                    <div className="table-container mobile-cards">
                        {recentMovements.length === 0 ? (
                            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay movimientos registrados hoy.</p>
                        ) : (
                            <table className="custom-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Producto</th>
                                        <th>Tipo</th>
                                        <th>Cant.</th>
                                        <th>Motivo</th>
                                        <th>Responsable</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentMovements.map((m) => (
                                        <tr key={m.id}>
                                            <td data-label="Fecha" style={{ fontSize: '0.85rem' }}>{new Date(m.datetime).toLocaleString().slice(0, 16)}</td>
                                            <td data-label="Producto" style={{ fontWeight: 500 }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>{m.product_code}</span>
                                                {m.product_description}
                                            </td>
                                            <td data-label="Tipo">
                                                <span className={`badge ${m.type === 'ENT' || m.type === 'AJP' ? 'badge-success' : 'badge-danger'
                                                    }`}>
                                                    {m.type_display}
                                                </span>
                                            </td>
                                            <td data-label="Cantidad" style={{ fontWeight: 600 }}>{m.quantity}</td>
                                            <td data-label="Motivo">{m.motive_name}</td>
                                            <td data-label="Responsable" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{m.responsible_name}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Right Side: Operations Log */}
                <div className="section-card">
                    <div className="section-header">
                        <span className="section-title">
                            <FileText size={18} style={{ color: 'var(--accent)' }} />
                            Bitácora de Auditoría
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {recentAudits.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No hay registros de auditoría.</p>
                        ) : (
                            recentAudits.map((a) => (
                                <div key={a.id} style={{
                                    padding: '0.75rem',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.2rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{a.action}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                            {new Date(a.timestamp).toLocaleString().slice(0, 16)}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)' }}>{a.details}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Responsable: {a.user_name}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
