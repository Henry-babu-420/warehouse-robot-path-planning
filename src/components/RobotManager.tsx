import React from 'react';
import { Robot } from '../types/robot';
import { Plus, Trash2, Power, RotateCcw, Eye } from 'lucide-react';

interface RobotManagerProps {
  robots: Robot[];
  selectedRobotId: string | null;
  onSelectRobot: (robotId: string) => void;
  onAddRobot: () => void;
  onRemoveRobot: (robotId: string) => void;
  onToggleActive: (robotId: string) => void;
  onResetPositions: () => void;
  onPlanAll: () => void;
}

export const RobotManager: React.FC<RobotManagerProps> = ({
  robots,
  selectedRobotId,
  onSelectRobot,
  onAddRobot,
  onRemoveRobot,
  onToggleActive,
  onResetPositions,
  onPlanAll,
}) => {
  const formatStatus = (status: string) => {
    switch (status) {
      case 'MOVING_TO_PICKUP': return 'In transit (Pickup)';
      case 'MOVING_TO_DELIVERY': return 'In transit (Delivery)';
      case 'AT_PICKUP': return 'Loading at Pickup';
      case 'WAITING': return 'Yielding / Holding';
      case 'BLOCKED': return 'Blocked by Obstacle';
      case 'DEADLOCKED': return 'Resolving Cycle';
      case 'COMPLETED': return 'Completed';
      case 'IDLE': return 'Standby';
      default: return status;
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header-row">
        <div>
          <h3 className="panel-title">Robot Fleet Roster</h3>
          <p className="panel-description">
            Active fleet: {robots.length} AGVs ({Math.min(robots.length, 5)} initial baseline{robots.length > 5 ? ` + ${robots.length - 5} commissioned` : ''}) • Maximum capacity: 10 AGVs
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onAddRobot}
            className="btn-primary-action"
            disabled={robots.length >= 10}
          >
            <Plus size={14} />
            <span>Commission AGV ({robots.length}/10)</span>
          </button>
          <button onClick={onResetPositions} className="btn-secondary-action">
            <RotateCcw size={14} />
            <span>Reset Fleet Positions</span>
          </button>
        </div>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Vehicle ID</th>
              <th>Designation</th>
              <th>Position</th>
              <th>Destination</th>
              <th>Status</th>
              <th>Effective Priority</th>
              <th>Robot Wait Ticks</th>
              <th>Completed</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            {robots.map((robot) => {
              const isSelected = robot.id === selectedRobotId;

              return (
                <tr
                  key={robot.id}
                  className={isSelected ? 'selected' : ''}
                  onClick={() => onSelectRobot(robot.id)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '2px',
                          backgroundColor: robot.color,
                          display: 'inline-block',
                        }}
                      ></span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{robot.id}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 500 }}>{robot.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {parseInt(robot.id.replace(/\D/g, ''), 10) <= 5 ? 'Initial Fleet' : 'Commissioned'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      ({robot.position.x}, {robot.position.y})
                    </span>
                  </td>
                  <td>
                    {robot.targetPosition ? (
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        ({robot.targetPosition.x}, {robot.targetPosition.y})
                      </span>
                    ) : (
                      <span style={{ color: '#8E9BAE', fontSize: '11px' }}>None</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-pill ${robot.status.toLowerCase()}`}>
                      {formatStatus(robot.status)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {robot.priority}
                      {robot.priorityAge > 0 && (
                        <span style={{ color: '#B45309', fontSize: '11px' }}> (+{robot.priorityAge})</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#697586' }}>
                      {robot.totalWaitSteps}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2E7D32' }}>
                      {robot.tasksCompleted}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        title={robot.isActive ? 'Halt AGV' : 'Resume AGV'}
                        onClick={() => onToggleActive(robot.id)}
                        className="btn-secondary-action"
                        style={{ padding: '3px 8px' }}
                      >
                        <Power size={12} color={robot.isActive ? '#2E7D32' : '#8E9BAE'} />
                      </button>
                      <button
                        title="Inspect AGV"
                        onClick={() => onSelectRobot(robot.id)}
                        className="btn-secondary-action"
                        style={{ padding: '3px 8px' }}
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        title="Decommission AGV"
                        onClick={() => onRemoveRobot(robot.id)}
                        className="btn-secondary-action"
                        style={{ padding: '3px 8px', color: '#C62828' }}
                        disabled={robots.length <= 1}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
