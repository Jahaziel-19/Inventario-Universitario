import { useState, useEffect } from 'react';
import { LayoutDashboard, Package, Layers, ClipboardList, FileSpreadsheet, LogOut, Shield, Menu, KeyRound, X, Check } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Catalogs from './pages/Catalogs';
import Movements from './pages/Movements';
import ImportExport from './pages/ImportExport';
import Modal from './components/Modal';
import { buildApiUrl, getAuthHeaders } from './lib/api';
import './App.css';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt_token'));
  const [username, setUsername] = useState<string>(localStorage.getItem('username') || '');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productPreset, setProductPreset] = useState<string>('');
  const [movementPreset, setMovementPreset] = useState<string>('');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);

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

  const resetPasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordChangeError('');
    setPasswordChangeSuccess('');
    setPasswordChangeLoading(false);
  };

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    resetPasswordModal();
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

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordChangeError('Completa todos los campos.');
      return;
    }

    setPasswordChangeError('');
    setPasswordChangeSuccess('');
    setPasswordChangeLoading(true);

    try {
      const response = await fetch(buildApiUrl('/api/users/change_password/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo actualizar la contraseña.');
      }

      setPasswordChangeSuccess(data.message || 'Contraseña actualizada correctamente.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setPasswordChangeError(error.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setPasswordChangeLoading(false);
    }
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
          <button
            onClick={() => {
              resetPasswordModal();
              setIsPasswordModalOpen(true);
            }}
            className="btn btn-secondary"
            style={{ width: '100%', padding: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.5rem' }}
          >
            <KeyRound size={16} />
            Cambiar contraseña
          </button>
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

      <Modal isOpen={isPasswordModalOpen} onClose={closePasswordModal}>
        <form onSubmit={handleChangePassword} className="modal-content fade-in">
          <div className="modal-header">
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Cambiar contraseña</h2>
            <button type="button" onClick={closePasswordModal} className="btn btn-secondary" style={{ padding: '0.35rem' }}>
              <X size={16} />
            </button>
          </div>

          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {passwordChangeError ? (
              <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {passwordChangeError}
              </div>
            ) : null}
            {passwordChangeSuccess ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                {passwordChangeSuccess}
              </div>
            ) : null}

            <div className="form-group">
              <label className="form-label">Contraseña actual</label>
              <input
                type="password"
                className="form-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa tu contraseña actual"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nueva contraseña</label>
              <input
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar nueva contraseña</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva contraseña"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={closePasswordModal} className="btn btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={passwordChangeLoading}>
              <Check size={16} />
              {passwordChangeLoading ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default App;
