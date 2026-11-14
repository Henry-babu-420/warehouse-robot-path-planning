import React, { useState } from 'react';
import { SimulationMetrics, BenchmarkDataPoint } from '../types/simulation';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { RefreshCw, Activity, BarChart3, ShieldAlert, Cpu } from 'lucide-react';

interface AnalyticsDashboardProps {
  metrics: SimulationMetrics;
  benchmarkData: BenchmarkDataPoint[];
  onRunBenchmark: () => void;
  isRunningBenchmark: boolean;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  metrics,
  benchmarkData,
  onRunBenchmark,
  isRunningBenchmark,
}) => {
  const [activeView, setActiveView] = useState<'ALL' | 'LIVE' | 'BENCHMARK'>('ALL');

  return (
    <div className="panel-container">
      {/* Panel Header */}
      <div className="panel-header-row">
        <div>
          <h3 className="panel-title">Fleet Telemetry & Scalability Benchmarks</h3>
          <p className="panel-description">
            Real-time multi-agent execution telemetry and offline empirical benchmark results (1..10 AGVs)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-subtle)', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveView('ALL')}
              className={`toolbar-btn ${activeView === 'ALL' ? 'active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              Unified View
            </button>
            <button
              onClick={() => setActiveView('LIVE')}
              className={`toolbar-btn ${activeView === 'LIVE' ? 'active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              Live Telemetry
            </button>
            <button
              onClick={() => setActiveView('BENCHMARK')}
              className={`toolbar-btn ${activeView === 'BENCHMARK' ? 'active' : ''}`}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              Benchmark Suite
            </button>
          </div>

          <button
            onClick={onRunBenchmark}
            disabled={isRunningBenchmark}
            className="btn-primary-action"
          >
            <RefreshCw size={13} className={isRunningBenchmark ? 'animate-spin' : ''} />
            <span>{isRunningBenchmark ? 'Running Suite...' : 'Run Benchmark (1..10 AGVs)'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: LIVE RUNTIME SIMULATION TELEMETRY */}
      {(activeView === 'ALL' || activeView === 'LIVE') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={14} color="#426B8A" />
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Live Runtime Simulation Telemetry
              </span>
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', backgroundColor: '#EFF4F8', color: '#426B8A', fontWeight: 500 }}>
                Source: Live Engine | Scope: Active Session
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Operational Fleet: {metrics.activeRobots} AGVs Active
            </span>
          </div>

          {/* Standardized KPI Cards Grid */}
          <div className="kpi-cards-grid">
            {/* Card 1: Active Fleet */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Active AGVs</span>
              <span className="kpi-summary-val">{metrics.activeRobots}/{metrics.totalRobots}</span>
              <span className="kpi-summary-sub">
                {metrics.totalRobots <= 5 
                  ? `${metrics.totalRobots} initial fleet AGVs` 
                  : `5 initial + ${metrics.totalRobots - 5} commissioned AGVs`}
              </span>
            </div>

            {/* Card 2: Completed Deliveries */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Completed Deliveries</span>
              <span className="kpi-summary-val" style={{ color: '#2E7D32' }}>{metrics.completedTasks}</span>
              <span className="kpi-summary-sub">{metrics.pendingTasks} missions in progress</span>
            </div>

            {/* Card 3: Collision Conflicts Prevented */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Collision Conflicts Prevented</span>
              <span className="kpi-summary-val" style={{ color: '#2E7D32' }}>{metrics.collisionAttemptsPrevented}</span>
              <span className="kpi-summary-sub">Vertex and edge-swap conflicts rejected by checks</span>
            </div>

            {/* Card 4: Deadlock Cycles Detected */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Deadlock Cycles Detected</span>
              <span className="kpi-summary-val" style={{ color: metrics.deadlockCyclesDetected > 0 ? '#B45309' : '#697586' }}>
                {metrics.deadlockCyclesDetected}
              </span>
              <span className="kpi-summary-sub">
                {metrics.unresolvedDeadlockCycles ?? 0} unresolved cycles ({metrics.deadlockEvents} stall checks)
              </span>
            </div>

            {/* Card 5: Automated Recovery Actions */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">AGV Replanning Actions</span>
              <span className="kpi-summary-val" style={{ color: '#426B8A' }}>
                {metrics.replanningCount}
              </span>
              <span className="kpi-summary-sub">
                Across {metrics.deadlockRecoveryAttempts} recovery invocations
              </span>
            </div>

            {/* Card 6: Deferred Stall Recoveries */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Deferred Stall Recoveries</span>
              <span className="kpi-summary-val" style={{ color: metrics.unresolvedDeadlocks > 0 ? '#B45309' : '#2E7D32' }}>
                {metrics.unresolvedDeadlocks}
              </span>
              <span className="kpi-summary-sub">
                Holding safe positions for clearance (0 deadlock cycles)
              </span>
            </div>

            {/* Card 7: Total Path Planning Time */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Total Path Planning Time</span>
              <span className="kpi-summary-val">{metrics.totalPlanningTimeMs} ms</span>
              <span className="kpi-summary-sub">{metrics.avgPlanningTimePerRobotMs} ms / vehicle</span>
            </div>

            {/* Card 8: Expanded Space-Time States */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Expanded Space-Time States</span>
              <span className="kpi-summary-val">{metrics.totalExpandedNodes}</span>
              <span className="kpi-summary-sub">Space-time graph states</span>
            </div>

            {/* Card 9: Average Path Length */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Average Path Length</span>
              <span className="kpi-summary-val" style={{ color: '#426B8A' }}>{metrics.averagePathLength}</span>
              <span className="kpi-summary-sub">Grid steps per trajectory</span>
            </div>

            {/* Card 10: Fleet Cumulative Wait Ticks */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Fleet Cumulative Wait Ticks</span>
              <span className="kpi-summary-val">{metrics.totalWaitingTime} ticks</span>
              <span className="kpi-summary-sub">Sum across all {metrics.totalRobots} AGVs</span>
            </div>

            {/* Card 11: Average Wait Ticks per AGV */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Average Wait Ticks per AGV</span>
              <span className="kpi-summary-val">{metrics.avgWaitingTimePerRobot} ticks</span>
              <span className="kpi-summary-sub">Mean delay per vehicle</span>
            </div>

            {/* Card 12: Snapshot Makespan */}
            <div className="kpi-summary-card">
              <span className="kpi-summary-label">Snapshot Makespan</span>
              <span className="kpi-summary-val">{metrics.makespan} steps</span>
              <span className="kpi-summary-sub">Max remaining active route length</span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: EMPIRICAL BENCHMARK SUITE */}
      {(activeView === 'ALL' || activeView === 'BENCHMARK') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: activeView === 'ALL' ? '12px' : '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={14} color="#2E7D32" />
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Empirical Scalability Benchmarks (Offline Suite)
              </span>
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', backgroundColor: '#E8F5E9', color: '#2E7D32', fontWeight: 500 }}>
                Source: Controlled Benchmark | Scope: 1..10 AGVs | Horizon: 30 Ticks
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              10 independent runs per configuration on 20×14 grid
            </span>
          </div>

          {/* Benchmark Charts (2x2 Grid) */}
          <div className="charts-grid-2x2">
            {/* Chart 1 */}
            <div className="chart-card-industrial">
              <span className="chart-title-industrial">
                Figure 1: Vehicle Count vs Total Planning Time (ms)
              </span>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={benchmarkData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" />
                    <XAxis dataKey="robotCount" stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <YAxis stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '4px', fontSize: '11px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#697586' }} />
                    <Line type="monotone" dataKey="planningTimeMs" name="Planning Time (ms)" stroke="#426B8A" strokeWidth={2} dot={{ r: 3, fill: '#426B8A' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2 */}
            <div className="chart-card-industrial">
              <span className="chart-title-industrial">
                Figure 2: Vehicle Count vs Expanded Space-Time States
              </span>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={benchmarkData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" />
                    <XAxis dataKey="robotCount" stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <YAxis stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '4px', fontSize: '11px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#697586' }} />
                    <Bar dataKey="expandedNodes" name="Expanded States" fill="#7895A8" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3 */}
            <div className="chart-card-industrial">
              <span className="chart-title-industrial">
                Figure 3: Vehicle Count vs Average Trajectory Length
              </span>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={benchmarkData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" />
                    <XAxis dataKey="robotCount" stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <YAxis stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '4px', fontSize: '11px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#697586' }} />
                    <Line type="monotone" dataKey="averagePathLength" name="Avg Path (Steps)" stroke="#2E7D32" strokeWidth={2} dot={{ r: 3, fill: '#2E7D32' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4 */}
            <div className="chart-card-industrial">
              <span className="chart-title-industrial">
                Figure 4: Vehicle Count vs Batch Completion Steps (Snapshot Makespan)
              </span>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={benchmarkData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" />
                    <XAxis dataKey="robotCount" stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <YAxis stroke="#8E9BAE" tick={{ fill: '#697586', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '4px', fontSize: '11px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#697586' }} />
                    <Bar dataKey="taskCompletionSteps" name="Makespan (Steps)" fill="#426B8A" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
