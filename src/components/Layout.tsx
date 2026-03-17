import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import './Layout.css';

const SIDEBAR_STORAGE_KEY = 'ciassist_sidebar_collapsed';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {}
  }, [sidebarCollapsed]);

  const toggleCollapse = () => setSidebarCollapsed((c) => !c);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapse}
        onClose={closeSidebar}
      />
      <div className="app-body" data-sidebar-collapsed={sidebarCollapsed}>
        <header className="app-header">
          <button
            type="button"
            className="app-header-menu"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 900) {
                setSidebarCollapsed((c) => !c);
              } else {
                setSidebarOpen((o) => !o);
              }
            }}
            aria-label="Toggle navigation menu"
          >
            <span className="app-header-menu-icon">☰</span>
          </button>
          <img
            src="/Ey-Logo-PNG-Image.png"
            alt="EY"
            className="app-header-logo"
          />
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
