import { useState, useEffect } from 'react';
import { LayoutDashboard, Package, Layers, ClipboardList, FileSpreadsheet, LogOut, Shield, Menu } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Catalogs from './pages/Catalogs';
import Movements from './pages/Movements';
import ImportExport from './pages/ImportExport';
import './App.css';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt_token'));
  const [username, setUsername] = useState<string>(localStorage.getItem('username') || '');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productPreset, setProductPreset] = useState<string>('');
  const [movementPreset, setMovementPreset] = useState<string>('');

  const handleLoginSuccess = (userToken: string, userVal: string) => {
    localStorage.setItem('jwt_token', userToken);
    localStorage.setItem('username', userVal);
    setToken(userToken);
    setUsername(userVal);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('username');
    setToken(null);
    setUsername('');
    setSidebarOpen(false);
  };

  // Automatically check token expiry or basic session checks
  useEffect(() => {
    if (token) {
      // Decode JWT token payload to check if expired
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = payload.exp * 1000;
        if (Date.now() >= exp) {
          handleLogout();
        }
      } catch (e) {
        handleLogout();
      }
    }
  }, [token]);

  if (!token) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const handleDashboardNavigation = (tab: string, preset = '') => {
    if (tab === 'products') {
      setProductPreset(preset);
    }
    if (tab === 'movements') {
      setMovementPreset(preset);
    }
    handleTabChange(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard token={token} onNavigate={handleDashboardNavigation} />;
      case 'products':
        return <Products token={token} preset={productPreset} onPresetConsumed={() => setProductPreset('')} />;
      case 'catalogs':
        return <Catalogs token={token} />;
      case 'movements':
        return <Movements token={token} preset={movementPreset} onPresetConsumed={() => setMovementPreset('')} />;
      case 'import':
        return <ImportExport token={token} />;
      default:
        return <Dashboard token={token} onNavigate={handleDashboardNavigation} />;
    }
  };

  return (
    <div className="app-container">
      {sidebarOpen ? <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Cerrar navegación" /> : null}

      {/* Dynamic Sidebar Navigation */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Shield size={22} style={{ color: 'var(--primary)' }} />
          <span>INVENTARIO TECNM</span>
        </div>

        <ul className="sidebar-menu">
          <li className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}>
            <button onClick={() => handleTabChange('dashboard')}>
              <LayoutDashboard size={18} />
              Dashboard
            </button>
          </li>

          <li className={`menu-item ${activeTab === 'products' ? 'active' : ''}`}>
            <button onClick={() => handleTabChange('products')}>
              <Package size={18} />
              Productos
            </button>
          </li>

          <li className={`menu-item ${activeTab === 'catalogs' ? 'active' : ''}`}>
            <button onClick={() => handleTabChange('catalogs')}>
              <Layers size={18} />
              Catálogos
            </button>
          </li>

          <li className={`menu-item ${activeTab === 'movements' ? 'active' : ''}`}>
            <button onClick={() => handleTabChange('movements')}>
              <ClipboardList size={18} />
              Movimientos
            </button>
          </li>

          <li className={`menu-item ${activeTab === 'import' ? 'active' : ''}`}>
            <button onClick={() => handleTabChange('import')}>
              <FileSpreadsheet size={18} />
              Importador
            </button>
          </li>
        </ul>

        {/* User Card Session info */}
        <div className="sidebar-user">
          <div className="user-info">
            <div className="user-avatar">
              {username ? username[0].toUpperCase() : 'U'}
            </div>
            <div className="user-details">
              <span style={{ fontWeight: 600 }}>{username}</span>
              <span className="user-role">Administrador</span>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%', padding: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main details display Area */}
      <main className="main-content">
        <div className="mobile-topbar">
          <button className="btn btn-secondary mobile-nav-toggle" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
            Menú
          </button>
          <span className="mobile-topbar__title">{activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'products' ? 'Productos' : activeTab === 'catalogs' ? 'Catálogos' : activeTab === 'movements' ? 'Movimientos' : 'Importador'}</span>
        </div>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
