import { Robot } from '../types/robot';

export type StarvationClass =
  | 'PROGRESSING'
  | 'TEMPORARY_CONGESTION'
  | 'PROLONGED_WAITING'
  | 'CONFIRMED_STARVATION'
  | 'UNRESOLVED_DEADLOCK_CYCLE';

export interface StarvationConfig {
  temporaryCongestionMaxTicks: number; // e.g., 15 ticks
  prolongedWaitingMaxTicks: number;    // e.g., 30 ticks
  starvationThresholdTicks: number;    // e.g., 60 ticks
}

export const DEFAULT_STARVATION_CONFIG: StarvationConfig = {
  temporaryCongestionMaxTicks: 15,
  prolongedWaitingMaxTicks: 30,
  starvationThresholdTicks: 60,
};

export interface AGVTelemetryReport {
  id: string;
  name: string;
  totalMovements: number;
  completedDeliveries: number;
  totalWaitingTicks: number;
  maxConsecutiveWaitTicks: number;
  longestDurationWithoutMovement: number;
  longestMotionlessWhileActive?: number;
  idleAwaitingTaskTicks?: number;
  stationDwellTicks?: number;
  activeWaitingTicks?: number;
  successfulReplans: number;
  failedReplans: number;
  stallAlertCount: number;
  currentStatus: string;
  isWaitingAtTermination: boolean;
  starvationClassification: StarvationClass;
  involvesUnresolvedCycle: boolean;
}

export interface WaitingDistribution {
  min: number;
  max: number;
  median: number;
  mean: number;
  stdDev: number;
}

export interface FleetFairnessAnalysis {
  simulationTicks: number;
  totalRobots: number;
  totalDeliveries: number;
  fleetThroughputDeliveriesPerTick: number;
  totalReplans: number;
  replansPerTick: number;
  totalStallAlerts: number;
  totalCycleEpisodes: number;
  unresolvedDeadlocks: number;
  jainIndexDeliveries: number;
  jainIndexMovements: number;
  jainIndexWaiting: number;
  waitingDistribution: WaitingDistribution;
  classificationCounts: {
    progressing: number;
    temporaryCongestion: number;
    prolongedWaiting: number;
    confirmedStarvation: number;
    unresolvedCycle: number;
  };
}

/**
 * Classifies an AGV's starvation state based on its longest physical motionless duration
 * and whether it is caught in an unresolvable graph cycle.
 */
export function classifyAGVStarvation(
  robot: Robot,
  config: StarvationConfig = DEFAULT_STARVATION_CONFIG,
  involvesUnresolvedCycle: boolean = false
): StarvationClass {
  if (involvesUnresolvedCycle) {
    return 'UNRESOLVED_DEADLOCK_CYCLE';
  }

  // If robot has no target or has completed, it is not considered starved
  if (!robot.targetPosition && (robot.status === 'COMPLETED' || robot.status === 'IDLE')) {
    return 'PROGRESSING';
  }

  // Intentional station dwell (loading/unloading) is not starvation
  if (robot.status === 'AT_PICKUP') {
    return 'PROGRESSING';
  }

  // Use active motionless duration if tracked; otherwise fallback
  const motionless = robot.longestMotionlessWhileActive !== undefined
    ? robot.longestMotionlessWhileActive
    : (robot.longestDurationWithoutMovement ?? robot.consecutiveStepsWithoutMovement ?? 0);

  if (motionless >= config.starvationThresholdTicks) {
    return 'CONFIRMED_STARVATION';
  }
  if (motionless >= config.prolongedWaitingMaxTicks) {
    return 'PROLONGED_WAITING';
  }
  if (motionless >= config.temporaryCongestionMaxTicks) {
    return 'TEMPORARY_CONGESTION';
  }
  return 'PROGRESSING';
}

/**
 * Generates per-AGV detailed telemetry records.
 */
export function generatePerAGVTelemetry(
  robots: Robot[],
  config: StarvationConfig = DEFAULT_STARVATION_CONFIG,
  cycleInvolvedIds: string[] = []
): AGVTelemetryReport[] {
  return robots.map(robot => {
    const isCycleInvolved = cycleInvolvedIds.includes(robot.id);
    const classification = classifyAGVStarvation(robot, config, isCycleInvolved);

    return {
      id: robot.id,
      name: robot.name,
      totalMovements: robot.totalStepsMoved,
      completedDeliveries: robot.tasksCompleted,
      totalWaitingTicks: robot.totalWaitSteps,
      maxConsecutiveWaitTicks: robot.maxConsecutiveWaitSteps ?? 0,
      longestDurationWithoutMovement: robot.longestDurationWithoutMovement ?? 0,
      longestMotionlessWhileActive: robot.longestMotionlessWhileActive ?? 0,
      idleAwaitingTaskTicks: robot.idleAwaitingTaskTicks ?? 0,
      stationDwellTicks: robot.stationDwellTicks ?? 0,
      activeWaitingTicks: robot.activeWaitingTicks ?? 0,
      successfulReplans: robot.successfulReplans ?? 0,
      failedReplans: robot.failedReplans ?? 0,
      stallAlertCount: robot.stallAlertCount ?? 0,
      currentStatus: robot.status,
      isWaitingAtTermination: robot.status === 'WAITING',
      starvationClassification: classification,
      involvesUnresolvedCycle: isCycleInvolved,
    };
  });
}

/**
 * Computes Jain's Fairness Index:
 * J(x) = (sum(x_i))^2 / (n * sum(x_i^2))
 * Bound: [1/n, 1.0]. A value of 1.0 indicates absolute equality.
 */
export function calculateJainsFairnessIndex(values: number[]): number {
  if (values.length === 0) return 1.0;
  const n = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  if (sum === 0) {
    // If all values are 0, fairness is technically equal across all agents
    return 1.0;
  }
  const sumSq = values.reduce((acc, v) => acc + v * v, 0);
  if (sumSq === 0) return 1.0;
  return parseFloat(((sum * sum) / (n * sumSq)).toFixed(4));
}

/**
 * Computes waiting time distribution parameters (min, max, median, mean, stdDev).
 */
export function calculateWaitingDistribution(waitTimes: number[]): WaitingDistribution {
  if (waitTimes.length === 0) {
    return { min: 0, max: 0, median: 0, mean: 0, stdDev: 0 };
  }
  const sorted = [...waitTimes].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = parseFloat((sum / sorted.length).toFixed(2));
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sorted.length;
  const stdDev = parseFloat(Math.sqrt(variance).toFixed(2));

  return { min, max, median, mean, stdDev };
}

/**
 * Computes complete fleet-level fairness and traffic efficiency metrics.
 */
export function calculateFleetFairnessAnalysis(
  robots: Robot[],
  reports: AGVTelemetryReport[],
  simulationTicks: number,
  deadlockCount: number,
  cycleEpisodes: number,
  replanCount: number,
  unresolvedDeadlocks: number
): FleetFairnessAnalysis {
  const deliveries = reports.map(r => r.completedDeliveries);
  const movements = reports.map(r => r.totalMovements);
  const waiting = reports.map(r => r.totalWaitingTicks);

  const totalDeliveries = deliveries.reduce((a, b) => a + b, 0);
  const fleetThroughput = simulationTicks > 0 ? parseFloat((totalDeliveries / simulationTicks).toFixed(4)) : 0;
  const replansPerTick = simulationTicks > 0 ? parseFloat((replanCount / simulationTicks).toFixed(2)) : 0;

  const classificationCounts = {
    progressing: reports.filter(r => r.starvationClassification === 'PROGRESSING').length,
    temporaryCongestion: reports.filter(r => r.starvationClassification === 'TEMPORARY_CONGESTION').length,
    prolongedWaiting: reports.filter(r => r.starvationClassification === 'PROLONGED_WAITING').length,
    confirmedStarvation: reports.filter(r => r.starvationClassification === 'CONFIRMED_STARVATION').length,
    unresolvedCycle: reports.filter(r => r.starvationClassification === 'UNRESOLVED_DEADLOCK_CYCLE').length,
  };

  return {
    simulationTicks,
    totalRobots: robots.length,
    totalDeliveries,
    fleetThroughputDeliveriesPerTick: fleetThroughput,
    totalReplans: replanCount,
    replansPerTick,
    totalStallAlerts: deadlockCount,
    totalCycleEpisodes: cycleEpisodes,
    unresolvedDeadlocks,
    jainIndexDeliveries: calculateJainsFairnessIndex(deliveries),
    jainIndexMovements: calculateJainsFairnessIndex(movements),
    jainIndexWaiting: calculateJainsFairnessIndex(waiting),
    waitingDistribution: calculateWaitingDistribution(waiting),
    classificationCounts,
  };
}

/**
 * Exports AGV telemetry records to CSV format.
 */
export function formatTelemetryCSV(reports: AGVTelemetryReport[]): string {
  const headers = [
    'AGV_ID',
    'Call_Sign',
    'Total_Movements',
    'Completed_Deliveries',
    'Total_Wait_Ticks',
    'Max_Consecutive_Wait_Ticks',
    'Longest_Motionless_Duration',
    'Successful_Replans',
    'Failed_Replans',
    'Stall_Alert_Count',
    'Current_Status',
    'Waiting_At_Termination',
    'Starvation_Classification',
    'Involves_Unresolved_Cycle',
  ];

  const rows = reports.map(r => [
    r.id,
    r.name,
    r.totalMovements,
    r.completedDeliveries,
    r.totalWaitingTicks,
    r.maxConsecutiveWaitTicks,
    r.longestDurationWithoutMovement,
    r.successfulReplans,
    r.failedReplans,
    r.stallAlertCount,
    r.currentStatus,
    r.isWaitingAtTermination ? 'TRUE' : 'FALSE',
    r.starvationClassification,
    r.involvesUnresolvedCycle ? 'TRUE' : 'FALSE',
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

/**
 * Formats detailed audited starvation and traffic breakdown for PER_AGV_STARVATION_AUDIT.csv
 */
export function formatAuditedStarvationCSV(reports: AGVTelemetryReport[]): string {
  const headers = [
    'AGV_ID',
    'Call_Sign',
    'Total_Movements',
    'Completed_Deliveries',
    'Fleet_Wait_Ticks',
    'Active_Mission_Wait_Ticks',
    'Idle_Awaiting_Task_Ticks',
    'Station_Dwell_Ticks',
    'Max_Consecutive_Wait_Ticks',
    'Longest_Motionless_Overall',
    'Longest_Motionless_Active_Mission',
    'Successful_Replans',
    'Failed_Replans',
    'Stall_Alert_Count',
    'Current_Status',
    'Waiting_At_Termination',
    'Starvation_Classification',
    'Involves_Unresolved_Cycle',
  ];

  const rows = reports.map(r => [
    r.id,
    r.name,
    r.totalMovements,
    r.completedDeliveries,
    r.totalWaitingTicks,
    r.activeWaitingTicks ?? 0,
    r.idleAwaitingTaskTicks ?? 0,
    r.stationDwellTicks ?? 0,
    r.maxConsecutiveWaitTicks,
    r.longestDurationWithoutMovement,
    r.longestMotionlessWhileActive ?? 0,
    r.successfulReplans,
    r.failedReplans,
    r.stallAlertCount,
    r.currentStatus,
    r.isWaitingAtTermination ? 'TRUE' : 'FALSE',
    r.starvationClassification,
    r.involvesUnresolvedCycle ? 'TRUE' : 'FALSE',
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}
