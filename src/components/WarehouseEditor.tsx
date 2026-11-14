import React from 'react';
import { ToolMode, WarehouseLayout } from '../types/grid';
import { 
  MousePointer, 
  AlertTriangle, 
  Layers, 
  PackagePlus, 
  PackageCheck, 
  Eraser, 
  Truck, 
  RotateCcw, 
  Shuffle 
} from 'lucide-react';

interface WarehouseEditorProps {
  toolMode: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  warehouse: WarehouseLayout;
  onChangeDimensions: (width: number, height: number) => void;
  onGenerateRandom: () => void;
  onResetWarehouse: () => void;
  onSelectPreset?: (preset: 'STANDARD' | 'IMPROVED' | 'DUAL_LANE') => void;
}

export const WarehouseEditor: React.FC<WarehouseEditorProps> = ({
  toolMode,
  onSelectTool,
  warehouse,
  onChangeDimensions,
  onGenerateRandom,
  onResetWarehouse,
  onSelectPreset,
}) => {
  const tools: Array<{ mode: ToolMode; label: string; desc: string; icon: React.ReactNode }> = [
    { mode: 'SELECT', label: 'Select & Inspect', desc: 'Inspect cells or select active AGVs', icon: <MousePointer size={16} /> },
    { mode: 'DYNAMIC_OBSTACLE', label: 'Dynamic Hazard', desc: 'Simulate unexpected obstacle to test replanning', icon: <AlertTriangle size={16} /> },
    { mode: 'OBSTACLE', label: 'Structural Column', desc: 'Toggle fixed warehouse obstacle column', icon: <Layers size={16} /> },
    { mode: 'SHELF', label: 'Storage Rack Pod', desc: 'Add or remove inventory shelving rack', icon: <Layers size={16} /> },
    { mode: 'PICKUP', label: 'Inbound Bay (P)', desc: 'Designate receiving loading station', icon: <PackagePlus size={16} /> },
    { mode: 'DELIVERY', label: 'Outbound Bay (D)', desc: 'Designate dispatch packing station', icon: <PackageCheck size={16} /> },
    { mode: 'PLACE_ROBOT', label: 'Deploy AGV', desc: 'Click an open cell to commission an AGV', icon: <Truck size={16} /> },
    { mode: 'ERASE', label: 'Clear Cell', desc: 'Restore cell to open traversable floor', icon: <Eraser size={16} /> },
  ];

  return (
    <div className="panel-container">
      <div className="panel-header-row">
        <div>
          <h3 className="panel-title">Warehouse Layout & Geometry</h3>
          <p className="panel-description">Configure grid dimensions, storage racks, and operational loading bays</p>
        </div>
      </div>

      <div>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
          Interactive Placement Tools
        </span>
        <div className="tool-grid">
          {tools.map(t => {
            const isSelected = toolMode === t.mode;
            return (
              <button
                key={t.mode}
                onClick={() => onSelectTool(t.mode)}
                className={`tool-card-btn ${isSelected ? 'active' : ''}`}
              >
                <div style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                  {t.icon}
                </div>
                <div>
                  <span className="tool-title">{t.label}</span>
                  <span className="tool-sub">{t.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
            Grid Geometry
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Columns:</label>
              <select
                value={warehouse.width}
                onChange={(e) => onChangeDimensions(Number(e.target.value), warehouse.height)}
                className="industrial-select"
              >
                <option value="16">16 Columns</option>
                <option value="20">20 Columns (Standard)</option>
                <option value="24">24 Columns</option>
                <option value="28">28 Columns (Wide)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Rows:</label>
              <select
                value={warehouse.height}
                onChange={(e) => onChangeDimensions(warehouse.width, Number(e.target.value))}
                className="industrial-select"
              >
                <option value="12">12 Rows</option>
                <option value="14">14 Rows (Standard)</option>
                <option value="16">16 Rows</option>
                <option value="18">18 Rows (Deep)</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
            Environment Presets
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
            <button onClick={onResetWarehouse} className="btn-secondary-action" title="Baseline 20x14 single-aisle grid">
              <RotateCcw size={12} />
              <span>Standard (Baseline)</span>
            </button>
            <button
              onClick={() => onSelectPreset?.('IMPROVED')}
              className="btn-secondary-action"
              title="12 designated passing bays at aisle junctions"
            >
              <Layers size={12} />
              <span>Improved (Passing Bays)</span>
            </button>
            <button
              onClick={() => onSelectPreset?.('DUAL_LANE')}
              className="btn-secondary-action"
              title="2-cell-wide highway corridors and station bypasses"
            >
              <Layers size={12} />
              <span>Dual-Lane Highway</span>
            </button>
            <button onClick={onGenerateRandom} className="btn-secondary-action" title="Procedurally generate randomized shelf blocks">
              <Shuffle size={12} />
              <span>Procedural Layout</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
