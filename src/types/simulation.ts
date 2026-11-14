export type SimulationStatus = 'STOPPED' | 'RUNNING' | 'PAUSED';

export type EventType = 
  | 'INFO'
  | 'TASK_ASSIGNED'
  | 'TASK_PICKUP'
  | 'TASK_COMPLETE'
  | 'PATH_PLANNED'
  | 'COLLISION_PREVENTED'
  | 'DYNAMIC_OBSTACLE'
  | 'REPLAN'
  | 'DEADLOCK_DETECTED'
  | 'DEADLOCK_RECOVERED'
  | 'WARNING'
  | 'ERROR';

export interface EventLogItem {
  id: string;
  timeStep: number;
  realTimestamp: number;
  type: EventType;
  message: string;
  robotId?: string;
  details?: Record<string, any>;
}

export interface SimulationMetrics {
  totalRobots: number;
  activeRobots: number;
  completedTasks: number;
  pendingTasks: number;
  averagePathLength: number;
  snapshotRemainingPathLength?: number;
  totalPlanningTimeMs: number;
  avgPlanningTimePerRobotMs: number;
  totalExpandedNodes: number;
  replanningCount: number;
  totalWaitingTime: number;
  avgWaitingTimePerRobot: number;
  makespan: number;
  collisionAttemptsPrevented: number;
  deadlockEvents: number; // Stalls / cycle detection checks triggered
  deadlockCyclesDetected: number; // Unique circular wait-for cycles
  unresolvedDeadlockCycles?: number; // Unresolved circular deadlock cycles (0 when cycles resolved)
  deadlockRecoveryAttempts: number; // Automated recovery protocol invocations
  unresolvedDeadlocks: number; // Total deferred stall recoveries (preserved for backward compatibility)
  deferredStallRecoveries?: number; // Stalls deferred for choke clearance
}

export interface BenchmarkDataPoint {
  robotCount: number;
  planningTimeMs: number;
  expandedNodes: number;
  averagePathLength: number;
  taskCompletionSteps: number;
  collisionsPrevented: number;
  successRate: number;
}
