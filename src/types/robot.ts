import { Position } from './grid';
import { TimePosition } from './path';

export type RobotStatus = 
  | 'IDLE'
  | 'PLANNING'
  | 'MOVING_TO_PICKUP'
  | 'AT_PICKUP'
  | 'MOVING_TO_DELIVERY'
  | 'WAITING'
  | 'BLOCKED'
  | 'DEADLOCKED'
  | 'COMPLETED';

export interface RobotTask {
  id: string;
  pickup: Position;
  delivery: Position;
  pickupStationId?: string;
  deliveryStationId?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assignedRobotId?: string;
}

export interface Robot {
  id: string;
  name: string;
  color: string;
  position: Position;
  startPosition: Position;
  targetPosition: Position | null;
  assignedPickup: Position | null;
  assignedDelivery: Position | null;
  status: RobotStatus;
  plannedPath: TimePosition[];
  pathIndex: number;
  priority: number;
  priorityAge: number; // For anti-starvation priority aging
  speed: number;
  isActive: boolean;
  hasPayload: boolean;
  totalWaitSteps: number;
  totalStepsMoved: number;
  tasksCompleted: number;
  replanCount: number;
  lastDeadlockTime?: number;
  consecutiveWaitSteps?: number;
  maxConsecutiveWaitSteps?: number;
  consecutiveStepsWithoutMovement?: number;
  longestDurationWithoutMovement?: number;
  successfulReplans?: number;
  failedReplans?: number;
  stallAlertCount?: number;
  replanBackoffInterval?: number;
  nextAllowedReplanTick?: number;
  lastReplanOutcome?: 'SUCCESS' | 'FAILED';
  consecutiveMotionlessWhileActive?: number;
  longestMotionlessWhileActive?: number;
  idleAwaitingTaskTicks?: number;
  stationDwellTicks?: number;
  activeWaitingTicks?: number;
}
