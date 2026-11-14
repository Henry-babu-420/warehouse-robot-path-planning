import React, { useRef, useState, useEffect, useReducer } from 'react';
import { SimulationEngine } from './simulation/simulationEngine';
import { SidebarNav, NavTab } from './components/SidebarNav';
import { WarehouseGrid } from './components/WarehouseGrid';
import { WarehouseEditor } from './components/WarehouseEditor';
import { RobotManager } from './components/RobotManager';
import { TaskManager } from './components/TaskManager';
import { AlgorithmInspector } from './components/AlgorithmInspector';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { SettingsPanel } from './components/SettingsPanel';
import { RobotDetailPanel } from './components/RobotDetailPanel';
import { SimulationControls } from './components/SimulationControls';
import { EventLog } from './components/EventLog';
import { BenchmarkDataPoint } from './types/simulation';
import { 
  Layers, 
  Grid
} from 'lucide-react';
import './style.css';

export const App: React.FC = () => {
  // Single Simulation Engine instance
  const engineRef = useRef<SimulationEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new SimulationEngine();
  }
  const engine = engineRef.current;

  // Re-render trigger
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    engine.subscribe(() => {
      forceUpdate();
    });
  }, [engine]);

  // UI Navigation & View State
  const [currentTab, setCurrentTab] = useState<NavTab>('DASHBOARD');
  const [activeCenterView, setActiveCenterView] = useState<'GRID' | 'TAB'>('GRID');

  // Visualization toggles
  const [showPaths, setShowPaths] = useState(true);
  const [showReservations, setShowReservations] = useState(true);
  const [showExploredNodes, setShowExploredNodes] = useState(false);

  // Benchmarking State
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkDataPoint[]>([]);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);

  // Run initial benchmark once on mount so charts are immediately populated with real measured data
  useEffect(() => {
    const results = engine.runBenchmarkExperiment();
    setBenchmarkData(results);
  }, [engine]);

  const handleRunBenchmark = () => {
    setIsRunningBenchmark(true);
    setTimeout(() => {
      const results = engine.runBenchmarkExperiment();
      setBenchmarkData(results);
      setIsRunningBenchmark(false);
      engine.logEvent('INFO', 'Benchmark experiment completed for 1, 2, 4, 6, 8, and 10 AGVs');
    }, 100);
  };

  const selectedRobot = engine.robots.find(r => r.id === engine.selectedRobotId) || null;
  const metrics = engine.getMetrics();
  const currentStep = engine.simulationClock.getStep();
  const isRunning = engine.simulationClock.getIsRunning();

  // Combine explored nodes for visualization
  const allExploredNodes = engine.recentPlanningResults.flatMap(r => r.exploredNodes);

  const handleTabChange = (tab: NavTab) => {
    setCurrentTab(tab);
    if (tab === 'DASHBOARD' || tab === 'WAREHOUSE') {
      setActiveCenterView('GRID');
    } else {
      setActiveCenterView('TAB');
    }
  };

  const handleSelectPreset = (preset: 'STANDARD' | 'IMPROVED' | 'DUAL_LANE') => {
    if (preset === 'STANDARD') {
      engine.setTrafficManagementConfig({ useImprovedLayout: false, useDualLaneLayout: false });
      engine.resetWarehouse();
    } else if (preset === 'IMPROVED') {
      engine.setTrafficManagementConfig({ useImprovedLayout: true });
    } else if (preset === 'DUAL_LANE') {
      engine.setTrafficManagementConfig({ useDualLaneLayout: true });
    }
    forceUpdate();
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-header">
        <div className="header-left">
          <div className="warehouse-mark" title="Warehouse Control System"></div>
          <div>
            <h1 className="system-title">Warehouse Control System</h1>
          </div>
        </div>

        <div className="header-center">
          <div className="header-mode-badge">
            <span className={`mode-status-dot ${isRunning ? '' : 'paused'}`}></span>
            <span>{isRunning ? 'Operational — Automated Dispatch Active' : 'Simulation Paused — Standing By'}</span>
          </div>
        </div>

        <div className="header-right">
          <div className="header-kpi-item">
            <span>Fleet:</span>
            <strong className="kpi-mono">{metrics.activeRobots}/{metrics.totalRobots} AGVs</strong>
          </div>
          <div className="header-kpi-item">
            <span>Missions:</span>
            <strong className="kpi-mono success">{metrics.completedTasks} Done</strong>
          </div>
          <div className="header-kpi-item">
            <span>Safety:</span>
            <strong className="kpi-mono success">{metrics.collisionAttemptsPrevented} Prevented</strong>
          </div>
          <div className="header-kpi-item">
            <span>Clock:</span>
            <strong className="kpi-mono">t={currentStep}</strong>
          </div>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="main-layout">
        {/* Left Sidebar */}
        <SidebarNav
          currentTab={currentTab}
          onSelectTab={handleTabChange}
          robotCount={engine.robots.length}
          preventedCollisions={metrics.collisionAttemptsPrevented}
          activeDeadlocks={metrics.deadlockEvents}
        />

        {/* Center Viewport */}
        <main className="center-viewport">
          <div className="viewport-toolbar">
            <div className="toolbar-title-group">
              <Grid size={15} style={{ color: 'var(--text-secondary)' }} />
              <span>
                {activeCenterView === 'GRID' 
                  ? `Warehouse floor layout (${engine.warehouse.width} × ${engine.warehouse.height}) — ${engine.toolMode === 'SELECT' ? 'Inspect mode' : `Tool: ${engine.toolMode}`}`
                  : `${currentTab === 'DASHBOARD' ? 'Overview' : currentTab.charAt(0) + currentTab.slice(1).toLowerCase()} panel`}
              </span>
            </div>

            <div className="toolbar-actions">
              <button
                onClick={() => setActiveCenterView('GRID')}
                className={`toolbar-btn ${activeCenterView === 'GRID' ? 'active' : ''}`}
                title="View warehouse floor grid"
              >
                <Grid size={13} />
                <span>Warehouse floor</span>
              </button>
              {currentTab !== 'DASHBOARD' && (
                <button
                  onClick={() => setActiveCenterView('TAB')}
                  className={`toolbar-btn ${activeCenterView === 'TAB' ? 'active' : ''}`}
                  title={`View ${currentTab} configuration panel`}
                >
                  <Layers size={13} />
                  <span>Config view</span>
                </button>
              )}
            </div>
          </div>

          <div className="viewport-main-content">
            {activeCenterView === 'GRID' ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
                {currentTab === 'WAREHOUSE' && (
                  <WarehouseEditor
                    toolMode={engine.toolMode}
                    onSelectTool={(tool) => {
                      engine.toolMode = tool;
                      forceUpdate();
                    }}
                    warehouse={engine.warehouse}
                    onChangeDimensions={(w, h) => engine.changeDimensions(w, h)}
                    onGenerateRandom={() => engine.generateRandomLayout()}
                    onResetWarehouse={() => engine.resetWarehouse()}
                    onSelectPreset={handleSelectPreset}
                  />
                )}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <WarehouseGrid
                    warehouse={engine.warehouse}
                    robots={engine.robots}
                    selectedRobotId={engine.selectedRobotId}
                    onSelectRobot={(id) => {
                      engine.selectedRobotId = id;
                      forceUpdate();
                    }}
                    toolMode={engine.toolMode}
                    onCellClick={(x, y) => engine.handleCellClick(x, y)}
                    reservationTable={engine.reservationTable}
                    showPaths={showPaths}
                    showReservations={showReservations}
                    showExploredNodes={showExploredNodes}
                    exploredNodes={allExploredNodes}
                    currentStep={currentStep}
                  />
                </div>
              </div>
            ) : (
              <>
                {currentTab === 'WAREHOUSE' && (
                  <WarehouseEditor
                    toolMode={engine.toolMode}
                    onSelectTool={(tool) => {
                      engine.toolMode = tool;
                      forceUpdate();
                    }}
                    warehouse={engine.warehouse}
                    onChangeDimensions={(w, h) => engine.changeDimensions(w, h)}
                    onGenerateRandom={() => engine.generateRandomLayout()}
                    onResetWarehouse={() => engine.resetWarehouse()}
                    onSelectPreset={handleSelectPreset}
                  />
                )}
                {currentTab === 'FLEET' && (
                  <RobotManager
                    robots={engine.robots}
                    selectedRobotId={engine.selectedRobotId}
                    onSelectRobot={(id) => {
                      engine.selectedRobotId = id;
                      forceUpdate();
                    }}
                    onAddRobot={() => engine.addRobot()}
                    onRemoveRobot={(id) => engine.removeRobot(id)}
                    onToggleActive={(id) => engine.toggleRobotActive(id)}
                    onResetPositions={() => engine.resetRobotPositions()}
                    onPlanAll={() => engine.planFleetPaths()}
                  />
                )}
                {currentTab === 'TASKS' && (
                  <TaskManager
                    robots={engine.robots}
                    stations={engine.warehouse.stations}
                    onAssignTask={(rId, p, d) => engine.assignTask(rId, p, d)}
                  />
                )}
                {currentTab === 'ALGORITHMS' && (
                  <AlgorithmInspector
                    reservationTable={engine.reservationTable}
                    robots={engine.robots}
                    currentStep={currentStep}
                    showExploredNodes={showExploredNodes}
                    onToggleExplored={() => setShowExploredNodes(!showExploredNodes)}
                    showReservations={showReservations}
                    onToggleReservations={() => setShowReservations(!showReservations)}
                    showPaths={showPaths}
                    onTogglePaths={() => setShowPaths(!showPaths)}
                  />
                )}
                {currentTab === 'ANALYTICS' && (
                  <AnalyticsDashboard
                    metrics={metrics}
                    benchmarkData={benchmarkData}
                    onRunBenchmark={handleRunBenchmark}
                    isRunningBenchmark={isRunningBenchmark}
                  />
                )}
                {currentTab === 'SETTINGS' && (
                  <SettingsPanel
                    onResetAll={() => {
                      engine.resetWarehouse();
                      engine.initDefaultFleet();
                    }}
                    trafficMode={engine.trafficMode}
                    backoffEnabled={engine.backoffEnabled}
                    onUpdateTrafficConfig={(cfg) => {
                      engine.setTrafficManagementConfig(cfg);
                      forceUpdate();
                    }}
                  />
                )}
              </>
            )}
          </div>
        </main>

        {/* Right Sidebar: Selected Robot Telemetry */}
        <aside className="right-sidebar">
          <RobotDetailPanel
            robot={selectedRobot}
            reservationTable={engine.reservationTable}
            currentStep={currentStep}
            onToggleActive={(id) => engine.toggleRobotActive(id)}
            onReplan={(id) => {
              const r = engine.robots.find(rob => rob.id === id);
              if (r) {
                engine.planFleetPaths();
              }
            }}
          />
        </aside>
      </div>

      {/* Bottom Panel: Playback Controls & Event Log Stream */}
      <footer className="bottom-dock">
        <SimulationControls
          isRunning={isRunning}
          currentStep={currentStep}
          intervalMs={engine.simulationClock.getIntervalMs()}
          onStart={() => {
            engine.simulationClock.start();
            forceUpdate();
          }}
          onPause={() => {
            engine.simulationClock.pause();
            forceUpdate();
          }}
          onStep={() => {
            engine.simulationClock.stepOnce();
            forceUpdate();
          }}
          onReset={() => {
            engine.resetRobotPositions();
            forceUpdate();
          }}
          onSetSpeed={(speed) => {
            engine.simulationClock.setSpeed(speed);
            forceUpdate();
          }}
          showPaths={showPaths}
          onTogglePaths={() => setShowPaths(!showPaths)}
          showReservations={showReservations}
          onToggleReservations={() => setShowReservations(!showReservations)}
          showExploredNodes={showExploredNodes}
          onToggleExplored={() => setShowExploredNodes(!showExploredNodes)}
        />
        <EventLog
          events={engine.eventLogs}
          onClearLogs={() => {
            engine.eventLogs = [];
            forceUpdate();
          }}
        />
      </footer>
    </div>
  );
};

export default App;
