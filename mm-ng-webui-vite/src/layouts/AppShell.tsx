import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { displayUsername } from '../utils/authDisplay';

const primaryNav = [
  { to: '/status', label: 'Dashboard' },
  { to: '/nodes', label: 'Nodes' },
  { to: '/prototypes', label: 'Prototypes' },
  { to: '/config', label: 'Config' },
  { to: '/logs', label: 'Logs' },
  { to: '/system/dashboard', label: 'System' },
  { to: '/admin/users', label: 'Admin' },
];

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'active' : undefined;
}

export function AppShell() {
  const auth = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await auth.logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>mm-ng</strong>
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          {primaryNav.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>{displayUsername(auth.user)}</strong>
            <span className="access-label">{auth.access ?? 'unknown'}</span>
          </div>
          <button className="button secondary" type="button" onClick={logout}>
            Logout
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
