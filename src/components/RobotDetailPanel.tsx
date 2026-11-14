import React from 'react';
import { Robot } from '../types/robot';
import { ReservationTable } from '../algorithms/reservationTable';
import { 
  Truck, 
  MapPin, 
  Navigation, 
  Clock, 
  Package, 
  RotateCw, 
  Power, 
  ArrowRight
} from 'lucide-react';

interface RobotDetailPanelProps {
  robot: Robot | null;
  reservationTable: ReservationTable;
  currentStep: number;
  onToggleActive: (robotId: string) => void;
  onReplan: (robotId: string) => void;
}

export const RobotDetailPanel: React.FC<RobotDetailPanelProps> = ({
  robot,
  reservationTable,
  currentStep,
  onToggleActive,
  onReplan,
}) => {
  if (!robot) {
    return (
      <div className="robot-detail-panel empty">
        <Truck size={32} className="text-slate-400 mb-2" />
        <span className="text-slate-600 font-medium text-sm">No AGV Selected</span>
        <span className="text-slate-400 text-xs mt-1 text-center">
          Select any vehicle on the warehouse grid or fleet roster to view telemetry.
        </span>
      </div>
    );
  }

  // Get reservations held by this robot
  const robotRes = reservationTable
    .getAllVertexReservations()
    .filter(r => r.robotId === robot.id && r.t >= currentStep)
    .sort((a, b) => a.t - b.t);

  const pathLen = robot.plannedPath.length;
  const progressPct = pathLen > 0 ? Math.min(100, Math.round((robot.pathIndex / pathLen) * 100)) : 0;

  const formatStatus = (status: string) => {
    switch (status) {
      case 'MOVING_TO_PICKUP': return 'In transit to pickup';
      case 'MOVING_TO_DELIVERY': return 'In transit to delivery';
      case 'AT_PICKUP': return 'Loading at pickup';
      case 'WAITING': return 'Yielding / Holding for clearance';
      case 'BLOCKED': return 'Blocked by obstacle';
      case 'DEADLOCKED': return 'Resolving deadlock cycle';
      case 'COMPLETED': return 'Completed';
      case 'IDLE': return 'Standby / Idle';
      default: return status;
    }
  };

  return (
    <div className="robot-detail-panel">
      {/* Unit Header */}
      <div className="detail-header">
        <div className="robot-title-row">
          <div className="robot-color-indicator" style={{ backgroundColor: robot.color }}></div>
          <div>
            <h3 className="robot-heading">{robot.name}</h3>
            <span className="robot-sub-id">
              ID: {robot.id} • {parseInt(robot.id.replace(/\D/g, ''), 10) <= 5 ? 'Initial Fleet' : 'Commissioned'}
            </span>
          </div>
        </div>
        <span className={`status-pill ${robot.status.toLowerCase()}`}>
          {formatStatus(robot.status)}
        </span>
      </div>

      {/* Spatial Telemetry */}
      <div className="detail-section">
        <span className="section-label">Navigation Status</span>
        <div className="data-row">
          <span className="data-label">Mission Feasibility</span>
          <span className="data-value" style={{ color: robot.targetPosition ? '#2E7D32' : '#697586' }}>
            {robot.targetPosition ? (robot.status === 'WAITING' ? 'Feasible (Holding for clearance)' : 'Active & Feasible') : 'Standby / Unassigned'}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">Current Position</span>
          <span className="data-value mono">({robot.position.x}, {robot.position.y})</span>
        </div>
        <div className="data-row">
          <span className="data-label">Target Destination</span>
          <span className="data-value mono">
            {robot.targetPosition ? `(${robot.targetPosition.x}, ${robot.targetPosition.y})` : 'None'}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">Assigned Pickup</span>
          <span className="data-value mono">
            {robot.assignedPickup ? `(${robot.assignedPickup.x}, ${robot.assignedPickup.y})` : 'Unassigned'}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">Assigned Delivery</span>
          <span className="data-value mono">
            {robot.assignedDelivery ? `(${robot.assignedDelivery.x}, ${robot.assignedDelivery.y})` : 'Unassigned'}
          </span>
        </div>
      </div>

      {/* Freight & Payload */}
      <div className="detail-section">
        <span className="section-label">Freight Payload</span>
        <div className="data-row">
          <span className="data-label">Payload State</span>
          <span className="data-value" style={{ color: robot.hasPayload ? '#B45309' : '#697586' }}>
            {robot.hasPayload ? 'Freight Loaded (Pallet)' : 'Chassis Empty'}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">Missions Completed</span>
          <span className="data-value mono">{robot.tasksCompleted}</span>
        </div>
      </div>

      {/* Trajectory Progress */}
      <div className="detail-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="section-label">Trajectory Progress</span>
          <span className="data-value mono" style={{ fontSize: '11px', color: '#697586' }}>
            Step {robot.pathIndex} / {pathLen} ({progressPct}%)
          </span>
        </div>
        <div className="progress-bar-container">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressPct}%`, backgroundColor: robot.color }}
            ></div>
          </div>
        </div>
      </div>

      {/* Metrics & Operational Data */}
      <div className="detail-section">
        <span className="section-label">Operational Metrics</span>
        <div className="data-row">
          <span className="data-label">Base Priority</span>
          <span className="data-value mono">
            {robot.priority}
            {robot.priorityAge > 0 && (
              <span style={{ color: '#B45309', fontSize: '11px' }}> (+{robot.priorityAge} age)</span>
            )}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">Individual Wait Ticks</span>
          <span className="data-value mono">{robot.totalWaitSteps} ticks</span>
        </div>
        <div className="data-row">
          <span className="data-label">Steps Moved</span>
          <span className="data-value mono">{robot.totalStepsMoved} steps</span>
        </div>
        <div className="data-row">
          <span className="data-label">Replanning Events</span>
          <span className="data-value mono">{robot.replanCount}</span>
        </div>
      </div>

      {/* Scheduled Future Reservations */}
      <div className="detail-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="section-label">Upcoming Reservations (Selected AGV)</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#697586' }}>
            {robotRes.length} Vertices Reserved
          </span>
        </div>
        <div className="res-chip-list">
          {robotRes.slice(0, 8).map((res, idx) => (
            <span key={idx} className="res-chip">
              t={res.t}: ({res.x},{res.y})
            </span>
          ))}
          {robotRes.length === 0 && (
            <span style={{ color: '#8E9BAE', fontSize: '11px' }}>
              No active upcoming reservations (AGV holding / standby)
            </span>
          )}
        </div>
      </div>

      {/* Action Controls */}
      <div className="detail-actions">
        <button
          onClick={() => onToggleActive(robot.id)}
          className="btn-secondary-action"
        >
          <Power size={13} />
          <span>{robot.isActive ? 'Halt AGV' : 'Resume AGV'}</span>
        </button>
        <button onClick={() => onReplan(robot.id)} className="btn-secondary-action">
          <RotateCw size={13} />
          <span>Recalculate Route</span>
        </button>
      </div>
    </div>
  );
};
