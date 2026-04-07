import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Home', icon: '⌂', visible: true },
  { path: '/upload', label: 'Initiate CIA', icon: '+', visible: true },
  { path: '/preview', label: 'Preview', icon: '◷', visible: false },
  { path: '/launch', label: 'Launch Interview', icon: '▤', visible: false },
  { path: '/all-cias', label: 'All CIAs', icon: '▤', visible: true },
];

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, isCollapsed, onToggleCollapse, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <>
      <div
        className={`sidebar-overlay ${isOpen ? 'sidebar-overlay-visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''} ${isOpen ? 'sidebar-open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-inner">
          <div className="sidebar-brand">
            <p className="sidebar-brand-pill">AI for Change Impact Assessment</p>
            <h1 className="sidebar-brand-title">
              <span className="sidebar-brand-ci">CIMMIE</span>
            </h1>
          </div>

          <nav className="sidebar-nav">
            {navItems.filter((item) => item.visible).map(({ path, label, icon }) => (
              <Link
                key={path}
                to={path}
                className={`sidebar-link ${isActive(path) ? 'active' : ''}`}
                onClick={onClose}
                title={isCollapsed ? label : undefined}
              >
                <span className="sidebar-link-icon" aria-hidden="true">{icon}</span>
                {!isCollapsed && <span className="sidebar-link-label">{label}</span>}
              </Link>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button
              type="button"
              className="sidebar-link sidebar-link-logout"
              onClick={() => { logout(); onClose?.(); }}
              title="Sign out"
            >
              <span className="sidebar-link-icon" aria-hidden="true">⎋</span>
              {!isCollapsed && <span className="sidebar-link-label">Sign out</span>}
            </button>
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expand' : 'Collapse'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? '→' : '← Collapse'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
