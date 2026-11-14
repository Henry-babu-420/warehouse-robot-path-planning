import React, { useState } from 'react';
import { Robot } from '../types/robot';
import { Station, Position } from '../types/grid';
import { Send, ArrowRight, CheckCircle2, Clock } from 'lucide-react';

interface TaskManagerProps {
  robots: Robot[];
  stations: Station[];
  onAssignTask: (robotId: string, pickup: Position, delivery: Position) => void;
}

export const TaskManager: React.FC<TaskManagerProps> = ({
  robots,
  stations,
  onAssignTask,
}) => {
  const pickupStations = stations.filter(s => s.type === 'PICKUP');
  const deliveryStations = stations.filter(s => s.type === 'DELIVERY');

  const [selectedRobotId, setSelectedRobotId] = useState<string>(robots[0]?.id || '');
  const [selectedPickupId, setSelectedPickupId] = useState<string>(pickupStations[0]?.id || '');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>(deliveryStations[0]?.id || '');

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    const robot = robots.find(r => r.id === selectedRobotId);
    const pStation = pickupStations.find(s => s.id === selectedPickupId);
    const dStation = deliveryStations.find(s => s.id === selectedDeliveryId);

    if (robot && pStation && dStation) {
      onAssignTask(robot.id, pStation.position, dStation.position);
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header-row">
        <div>
          <h3 className="panel-title">Mission & Task Dispatcher</h3>
          <p className="panel-description">Create and dispatch automated inventory transport missions to the fleet</p>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'block' }}>
          Dispatch New Transport Order
        </span>
        <form onSubmit={handleDispatch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>
                Select Vehicle:
              </label>
              <select
                value={selectedRobotId}
                onChange={(e) => setSelectedRobotId(e.target.value)}
                className="industrial-select"
              >
                {robots.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.id}) — Priority {r.priority}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>
                Inbound Pickup Bay:
              </label>
              <select
                value={selectedPickupId}
                onChange={(e) => setSelectedPickupId(e.target.value)}
                className="industrial-select"
              >
                {pickupStations.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.position.x}, {p.position.y})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>
                Outbound Delivery Bay:
              </label>
              <select
                value={selectedDeliveryId}
                onChange={(e) => setSelectedDeliveryId(e.target.value)}
                className="industrial-select"
              >
                {deliveryStations.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.position.x}, {d.position.y})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="btn-primary-action" style={{ width: '100%', padding: '9px 16px' }}>
            <Send size={14} />
            <span>Dispatch Transport Order to Fleet</span>
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Active Fleet Assignments
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {robots.map(robot => (
            <div
              key={robot.id}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>{robot.name}</span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: robot.hasPayload ? '#FEF3C7' : '#F1F5F9',
                    color: robot.hasPayload ? '#B45309' : '#64748B',
                    border: robot.hasPayload ? '1px solid #FDE68A' : '1px solid #E2E8F0',
                  }}
                >
                  {robot.hasPayload ? 'Freight Loaded' : 'Empty Chassis'}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                }}
              >
                <div>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>Pickup</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {robot.assignedPickup ? `(${robot.assignedPickup.x}, ${robot.assignedPickup.y})` : 'None'}
                  </span>
                </div>
                <ArrowRight size={14} color="#8E9BAE" />
                <div>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>Delivery</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {robot.assignedDelivery ? `(${robot.assignedDelivery.x}, ${robot.assignedDelivery.y})` : 'None'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
                  <span>Trajectory: {robot.pathIndex} / {robot.plannedPath.length}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={12} color="#2E7D32" />
                  <span>Delivered: {robot.tasksCompleted}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
