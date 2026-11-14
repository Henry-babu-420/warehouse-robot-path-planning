import React from 'react';
import { 
  LayoutDashboard, 
  Warehouse, 
  Truck, 
  ClipboardList, 
  Route, 
  BarChart2, 
  SlidersHorizontal,
  CheckCircle2,
  Clock
} from 'lucide-react';

export type NavTab = 
  | 'DASHBOARD'
  | 'WAREHOUSE'
  | 'FLEET'
  | 'TASKS'
  | 'ALGORITHMS'
  | 'ANALYTICS'
  | 'SETTINGS';

interface SidebarNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  robotCount: number;
  preventedCollisions: number;
  activeDeadlocks: number;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentTab,
  onSelectTab,
  robotCount,
  preventedCollisions,
  activeDeadlocks,
}) => {
  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: string | number }> = [
    { id: 'DASHBOARD', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { id: 'WAREHOUSE', label: 'Warehouse Layout', icon: <Warehouse size={16} /> },
    { id: 'FLEET', label: 'Robot Fleet', icon: <Truck size={16} />, badge: robotCount },
    { id: 'TASKS', label: 'Task Dispatcher', icon: <ClipboardList size={16} /> },
    { id: 'ALGORITHMS', label: 'Path Planning', icon: <Route size={16} /> },
    { id: 'ANALYTICS', label: 'Performance Analysis', icon: <BarChart2 size={16} /> },
    { id: 'SETTINGS', label: 'Settings', icon: <SlidersHorizontal size={16} /> },
  ];

  return (
    <aside className="sidebar-nav">
      <div className="sidebar-header-section">
        <span className="sidebar-heading">Navigation</span>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`nav-button ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge !== undefined && (
                <span className="nav-badge">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="system-status-indicator">
          <CheckCircle2 size={13} className="text-emerald-700" />
          <span>Cooperative A* Active</span>
        </div>
        <div className="version-meta">
          <span>Deterministic Discrete Sim • v2.4</span>
        </div>
      </div>
    </aside>
  );
};
