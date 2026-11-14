import React from 'react';
import { Sliders, ShieldCheck, RotateCcw, Compass } from 'lucide-react';
import { TrafficDirectionMode } from '../utils/trafficRules';

interface SettingsPanelProps {
  onResetAll: () => void;
  trafficMode?: TrafficDirectionMode;
  backoffEnabled?: boolean;
  onUpdateTrafficConfig?: (config: { trafficMode?: TrafficDirectionMode; backoffEnabled?: boolean }) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onResetAll,
  trafficMode = 'BIDIRECTIONAL',
  backoffEnabled = false,
  onUpdateTrafficConfig,
}) => {
  return (
    <div className="panel-container settings-panel">
      <div className="panel-header-row">
        <div>
          <h3 className="panel-title">Simulation engine configuration</h3>
          <p className="panel-description">Fine-tune space-time planning heuristics, horizon parameters, and safety policies</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-header">
            <Sliders size={15} style={{ color: 'var(--accent-primary)' }} />
            <span>Cooperative A* search parameters</span>
          </div>
          <div className="card-content">
            <div className="setting-item">
              <label>Space-time planning horizon</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>150 steps</span>
            </div>
            <div className="setting-item">
              <label>Goal dwell hold steps</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>3 ticks</span>
            </div>
            <div className="setting-item">
              <label>Priority aging step rate (&Delta;age / fail)</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--status-warning)' }}>+5 units</span>
            </div>
            <div className="setting-item">
              <label>Maximum node expansion limit</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>8,000 nodes</span>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="card-header">
            <ShieldCheck size={15} style={{ color: 'var(--status-success)' }} />
            <span>Safety and collision policies</span>
          </div>
          <div className="card-content">
            <div className="setting-item">
              <label>Vertex collision avoidance</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--status-success)' }}>Active (Strict)</span>
            </div>
            <div className="setting-item">
              <label>Head-on edge swap prevention</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--status-success)' }}>Active (Strict)</span>
            </div>
            <div className="setting-item">
              <label>Goal permanent reservation</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--status-success)' }}>Active</span>
            </div>
            <div className="setting-item">
              <label>Automated deadlock recovery</label>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-primary)' }}>Cycle DFS & Reprioritize</span>
            </div>
          </div>
        </div>

        <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <Compass size={15} style={{ color: 'var(--accent-primary)' }} />
            <span>Traffic flow policies & replanning backoff</span>
          </div>
          <div className="card-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div className="setting-item" style={{ borderBottom: 'none' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>Aisle Traffic Flow Mode</label>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Configure bidirectional lanes or alternating one-way corridors</span>
              </div>
              <select
                value={trafficMode}
                onChange={(e) => onUpdateTrafficConfig?.({ trafficMode: e.target.value as TrafficDirectionMode })}
                className="industrial-select"
                style={{ width: 'auto', minWidth: '180px', padding: '5px 8px', fontSize: '11px' }}
              >
                <option value="BIDIRECTIONAL">Bidirectional Flow (Standard)</option>
                <option value="ONE_WAY_AISLES">One-Way Alternating Aisles</option>
                <option value="DUAL_LANE_DIRECTIONS">Dual-Lane Directional Flow</option>
              </select>
            </div>
            <div className="setting-item" style={{ borderBottom: 'none' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '2px' }}>Replanning Backoff</label>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Exponential backoff with neighbor-movement reset to avoid thrashing</span>
              </div>
              <select
                value={backoffEnabled ? 'ENABLED' : 'DISABLED'}
                onChange={(e) => onUpdateTrafficConfig?.({ backoffEnabled: e.target.value === 'ENABLED' })}
                className="industrial-select"
                style={{ width: 'auto', minWidth: '180px', padding: '5px 8px', fontSize: '11px' }}
              >
                <option value="DISABLED">Disabled (Continuous Retry)</option>
                <option value="ENABLED">Enabled (Exponential Backoff)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="danger-zone-section">
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--status-danger)', marginBottom: '4px' }}>
          System reset and maintenance
        </h4>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Resets all simulation timers, clears the 3D space-time reservation table, and restores default AGV fleet positions and missions.
        </p>
        <button onClick={onResetAll} className="btn-danger">
          <RotateCcw size={14} />
          <span>Factory reset simulator</span>
        </button>
      </div>
    </div>
  );
};
