import React from 'react';
import { ReservationTable } from '../algorithms/reservationTable';
import { Robot } from '../types/robot';
import { Route, ShieldCheck, Clock, Eye, Info } from 'lucide-react';

interface AlgorithmInspectorProps {
  reservationTable: ReservationTable;
  robots: Robot[];
  currentStep: number;
  showExploredNodes: boolean;
  onToggleExplored: () => void;
  showReservations: boolean;
  onToggleReservations: () => void;
  showPaths: boolean;
  onTogglePaths: () => void;
}

export const AlgorithmInspector: React.FC<AlgorithmInspectorProps> = ({
  reservationTable,
  robots,
  currentStep,
  showExploredNodes,
  onToggleExplored,
  showReservations,
  onToggleReservations,
  showPaths,
  onTogglePaths,
}) => {
  const allVertexRes = reservationTable.getAllVertexReservations();
  const goalRes = reservationTable.getGoalReservations();
  const futureVertexRes = allVertexRes.filter(r => r.t >= currentStep);

  return (
    <div className="panel-container">
      <div className="panel-header-row">
        <div>
          <h3 className="panel-title">Path Planning & Space-Time Reservations</h3>
          <p className="panel-description">Cooperative A* search states, time-expanded reservation matrix, and collision avoidance</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Route size={15} color="#426B8A" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Cooperative A* Formulation</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', backgroundColor: 'var(--bg-surface)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', color: '#426B8A', marginBottom: '8px' }}>
            State: (x, y, t) &nbsp;|&nbsp; f(n) = g(n) + h(n) &nbsp;|&nbsp; Planning Horizon: 150 Steps
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '6px' }}>
            State space is expanded along discrete time ticks <code>t</code> up to a 150-step search horizon. Actions include 4-directional moves plus in-place wait actions <code>(x, y, t+1)</code> to allow higher-priority traffic to clear choke points.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#426B8A' }}>
            <Info size={12} />
            <span>Note: 150-step planning horizon is distinct from the 30-tick empirical benchmark window.</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <ShieldCheck size={15} color="#2E7D32" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Space-Time Reservation Matrix</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '6px' }}>
            Enforces collision prevention through three discrete reservation and movement validation checks:
          </p>
          <ul style={{ paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li><strong>Vertex (Fleet-Wide):</strong> Locks cell <code>(x, y)</code> at step <code>t</code> across all active AGVs.</li>
            <li><strong>Edge-Swap:</strong> Prevents opposite transitions <code>u &harr; v</code> at time <code>t</code>.</li>
            <li><strong>Goal Dwell & Lock:</strong> 3-tick verified arrival dwell for cargo transfer; permanent goal reservation holds destination indefinitely for parked/idle AGVs.</li>
          </ul>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Scheduled Reservations (Fleet-Wide Total)
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
              (All active AGVs combined)
            </span>
          </div>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {allVertexRes.length} Fleet Vertices Total &nbsp;|&nbsp; {futureVertexRes.length} Future Active
          </span>
        </div>
        <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Coordinates</th>
                <th>Time Step</th>
                <th>Relative Schedule</th>
                <th>Reservation Class</th>
              </tr>
            </thead>
            <tbody>
              {futureVertexRes
                .filter(r => r.t <= currentStep + 15)
                .sort((a, b) => a.t - b.t)
                .slice(0, 30)
                .map((res, i) => {
                  const robot = robots.find(r => r.id === res.robotId);
                  return (
                    <tr key={`${res.robotId}-${res.x}-${res.y}-${res.t}-${i}`}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: robot?.color || '#8E9BAE' }}></span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{res.robotId}</span>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>({res.x}, {res.y})</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>t={res.t}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>+{res.t - currentStep} ticks</td>
                      <td>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', backgroundColor: '#EFF4F8', color: '#426B8A', fontWeight: 500 }}>
                          Vertex (Fleet)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              {goalRes.map((gr, idx) => (
                <tr key={`goal-${gr.robotId}-${idx}`}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{gr.robotId}</span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>({gr.position.x}, {gr.position.y})</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#2E7D32' }}>&ge; {gr.fromTime}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#2E7D32' }}>Permanent</td>
                  <td>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', backgroundColor: '#E8F5E9', color: '#2E7D32', fontWeight: 500 }}>
                      Goal Lock (Parked)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
