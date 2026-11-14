import React, { useState, useRef, useEffect } from 'react';
import { EventLogItem, EventType } from '../types/simulation';

interface EventLogProps {
  events: EventLogItem[];
  onClearLogs?: () => void;
}

export const EventLog: React.FC<EventLogProps> = ({ events, onClearLogs }) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredEvents = events.filter((ev) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'COLLISIONS') return ev.type === 'COLLISION_PREVENTED';
    if (filterType === 'REPLAN') return ev.type === 'REPLAN' || ev.type === 'DYNAMIC_OBSTACLE';
    if (filterType === 'DEADLOCK') return ev.type === 'DEADLOCK_DETECTED' || ev.type === 'DEADLOCK_RECOVERED';
    if (filterType === 'TASKS') return ev.type === 'TASK_COMPLETE' || ev.type === 'TASK_PICKUP' || ev.type === 'TASK_ASSIGNED';
    return true;
  });

  // Auto-scroll to bottom as new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const getBadgeStyle = (type: EventType) => {
    switch (type) {
      case 'COLLISION_PREVENTED':
        return 'badge-collision';
      case 'DEADLOCK_DETECTED':
      case 'WARNING':
        return 'badge-warning';
      case 'DEADLOCK_RECOVERED':
      case 'TASK_COMPLETE':
        return 'badge-success';
      case 'DYNAMIC_OBSTACLE':
      case 'REPLAN':
        return 'badge-replan';
      case 'PATH_PLANNED':
      case 'TASK_PICKUP':
      case 'INFO':
      default:
        return 'badge-info';
    }
  };

  const formatEventType = (type: EventType) => {
    switch (type) {
      case 'COLLISION_PREVENTED': return 'Collision Avoided';
      case 'DEADLOCK_DETECTED': return 'Deadlock Cycle';
      case 'DEADLOCK_RECOVERED': return 'Deadlock Cleared';
      case 'DYNAMIC_OBSTACLE': return 'Hazard Detected';
      case 'REPLAN': return 'Route Recomputed';
      case 'TASK_COMPLETE': return 'Delivery Done';
      case 'TASK_PICKUP': return 'Freight Loaded';
      case 'TASK_ASSIGNED': return 'Task Dispatched';
      case 'PATH_PLANNED': return 'Route Scheduled';
      case 'WARNING': return 'Warning';
      case 'INFO': return 'Info';
      default: return type;
    }
  };

  const formatTime = (ts: number, step: number) => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `[${hh}:${mm}:${ss} · t=${step}]`;
  };

  return (
    <div className="event-log-component">
      <div className="event-log-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="log-title">Diagnostic Console</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            ({filteredEvents.length} events)
          </span>
        </div>

        {/* Filter Pills */}
        <div className="filter-chips">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'COLLISIONS', label: 'Collisions' },
            { id: 'REPLAN', label: 'Replanning' },
            { id: 'DEADLOCK', label: 'Deadlocks' },
            { id: 'TASKS', label: 'Missions' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`filter-chip ${filterType === f.id ? 'active' : ''}`}
            >
              {f.label}
            </button>
          ))}
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="filter-chip"
              style={{ color: 'var(--text-muted)' }}
              title="Clear event history"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="log-stream-container">
        {filteredEvents.length === 0 ? (
          <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '11px' }}>
            No telemetry records for selected filter.
          </div>
        ) : (
          filteredEvents.map((item) => (
            <div key={item.id} className="log-row">
              <span className="log-clock">{formatTime(item.realTimestamp, item.timeStep)}</span>
              <span className={`log-badge ${getBadgeStyle(item.type)}`}>
                {formatEventType(item.type)}
              </span>
              {item.robotId && (
                <span className="log-robot-chip">{item.robotId}</span>
              )}
              <span className="log-message">{item.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
