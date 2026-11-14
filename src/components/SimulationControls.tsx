import React from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  RotateCcw, 
  Clock, 
  Eye, 
  Zap, 
  GitCommit 
} from 'lucide-react';

interface SimulationControlsProps {
  isRunning: boolean;
  currentStep: number;
  intervalMs: number;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSetSpeed: (intervalMs: number) => void;
  showPaths: boolean;
  onTogglePaths: () => void;
  showReservations: boolean;
  onToggleReservations: () => void;
  showExploredNodes: boolean;
  onToggleExplored: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isRunning,
  currentStep,
  intervalMs,
  onStart,
  onPause,
  onStep,
  onReset,
  onSetSpeed,
  showPaths,
  onTogglePaths,
  showReservations,
  onToggleReservations,
  showExploredNodes,
  onToggleExplored,
}) => {
  const speeds = [
    { label: '0.5x', ms: 800 },
    { label: '1.0x', ms: 400 },
    { label: '2.0x', ms: 200 },
    { label: '4.0x', ms: 100 },
  ];

  return (
    <div className="simulation-controls-bar">
      {/* Clock display */}
      <div className="clock-display-group">
        <Clock size={15} className="text-slate-500" />
        <span className="clock-label">Sim Clock:</span>
        <span className="clock-value">t={currentStep}</span>
      </div>

      {/* Main Playback Actions */}
      <div className="playback-buttons-group">
        {isRunning ? (
          <button onClick={onPause} className="ctrl-btn pause" title="Pause simulation">
            <Pause size={14} />
            <span>Pause</span>
          </button>
        ) : (
          <button onClick={onStart} className="ctrl-btn play" title="Run simulation">
            <Play size={14} />
            <span>Run</span>
          </button>
        )}

        <button
          onClick={onStep}
          disabled={isRunning}
          className="ctrl-btn"
          title="Single discrete step"
        >
          <SkipForward size={14} />
          <span>Step</span>
        </button>

        <button onClick={onReset} className="ctrl-btn" title="Reset simulation clock and fleet">
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      {/* Speed Controls */}
      <div className="speed-selector-group">
        <span className="speed-label">Speed:</span>
        <div className="speed-pills">
          {speeds.map((s) => (
            <button
              key={s.label}
              onClick={() => onSetSpeed(s.ms)}
              className={`speed-pill ${intervalMs === s.ms ? 'active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visualization Layer Toggles */}
      <div className="visual-toggles-group">
        <button
          onClick={onTogglePaths}
          className={`layer-toggle-btn ${showPaths ? 'active' : ''}`}
          title="Toggle trajectory paths"
        >
          <Eye size={13} />
          <span>Paths</span>
        </button>
        <button
          onClick={onToggleReservations}
          className={`layer-toggle-btn ${showReservations ? 'active' : ''}`}
          title="Toggle time-step reservations"
        >
          <Zap size={13} />
          <span>Reservations</span>
        </button>
        <button
          onClick={onToggleExplored}
          className={`layer-toggle-btn ${showExploredNodes ? 'active' : ''}`}
          title="Toggle explored nodes search tree"
        >
          <GitCommit size={13} />
          <span>Explored</span>
        </button>
      </div>
    </div>
  );
};
