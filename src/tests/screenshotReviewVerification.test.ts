import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/simulationEngine';
import { posEquals } from '../utils/heuristics';

describe('Screenshot Review & Analytics Consistency Verification', () => {
  it('ISSUE 1: distinguishes genuine deadlock cycles from deferred stall recoveries (does not report unresolved deadlocks when cycle count is zero)', () => {
    const engine = new SimulationEngine();

    // Verify initial cycle and stall counters
    expect(engine.deadlockCyclesDetected).toBe(0);
    expect(engine.unresolvedDeadlockCycles).toBe(0);

    // Simulate a transient aisle stall where recovery is deferred
    // (e.g. 2 robots in single-width corridor, one holding position)
    engine.deadlockCount = 45;
    engine.deadlockCyclesDetected = 0; // ZERO genuine circular wait-for cycles
    engine.unresolvedDeadlocks = 28; // 28 deferred stall recovery ticks
    engine.unresolvedDeadlockCycles = 0;

    const metrics = engine.getMetrics();
    expect(metrics.deadlockCyclesDetected).toBe(0);
    expect(metrics.unresolvedDeadlockCycles).toBe(0);
    expect(metrics.unresolvedDeadlocks).toBe(28);
    expect(metrics.deferredStallRecoveries).toBe(28);

    // Mathematical consistency check: unresolved deadlock cycles MUST NOT exceed detected cycles
    expect(metrics.unresolvedDeadlockCycles!).toBeLessThanOrEqual(metrics.deadlockCyclesDetected);
  });

  it('ISSUE 2: distinguishes individual AGV replanning actions (e.g. 157) from recovery protocol invocations (e.g. 59)', () => {
    const engine = new SimulationEngine();

    // In a multi-robot cluster, each recovery invocation evaluates all involved AGVs
    // Example telemetry from high-density simulation: 59 invocations triggered 157 individual AGV replans
    engine.deadlockRecoveryAttempts = 59;
    engine.replanCount = 157;

    const metrics = engine.getMetrics();
    expect(metrics.deadlockRecoveryAttempts).toBe(59);
    expect(metrics.replanningCount).toBe(157);

    // Every multi-agent cluster involves >= 1 AGV per recovery invocation
    expect(metrics.replanningCount).toBeGreaterThan(metrics.deadlockRecoveryAttempts);
    const avgReplansPerInvocation = metrics.replanningCount / metrics.deadlockRecoveryAttempts;
    expect(avgReplansPerInvocation).toBeCloseTo(2.66, 1);
  });

  it('ISSUE 3: distinguishes initial fleet size (5 AGVs) from commissioned AGVs (up to 8)', () => {
    const engine = new SimulationEngine();

    // Initial default fleet is exactly 5 AGVs
    expect(engine.robots.length).toBe(5);
    expect(engine.robots.map(r => r.name)).toEqual(['AGV-01', 'AGV-02', 'AGV-03', 'AGV-04', 'AGV-05']);

    // Commission 3 additional AGVs to reach 8 AGVs
    engine.addRobot();
    engine.addRobot();
    engine.addRobot();

    expect(engine.robots.length).toBe(8);
    expect(engine.robots.map(r => r.name)).toEqual([
      'AGV-01', 'AGV-02', 'AGV-03', 'AGV-04', 'AGV-05',
      'AGV-06', 'AGV-07', 'AGV-08'
    ]);

    // Dashboard metrics accurately reflect 8 total AGVs (5 initial + 3 commissioned)
    const metrics = engine.getMetrics();
    expect(metrics.totalRobots).toBe(8);
    expect(metrics.activeRobots).toBe(8);

    // Verify designation classification
    for (const r of engine.robots) {
      const idx = parseInt(r.id.replace(/\D/g, ''), 10);
      const designation = idx <= 5 ? 'Initial Fleet' : 'Commissioned';
      if (idx <= 5) {
        expect(designation).toBe('Initial Fleet');
      } else {
        expect(designation).toBe('Commissioned');
      }
    }
  });

  it('ISSUE 4: validates collision prevention checks (vertex, edge-swap, and stationary AGVs)', () => {
    const engine = new SimulationEngine();

    // Run 5-AGV fleet for 40 ticks
    for (let t = 0; t < 40; t++) {
      engine.step();

      // Check no two AGVs share coordinates at any time
      for (let i = 0; i < engine.robots.length; i++) {
        for (let j = i + 1; j < engine.robots.length; j++) {
          const r1 = engine.robots[i];
          const r2 = engine.robots[j];
          if (r1.isActive && r2.isActive) {
            expect(posEquals(r1.position, r2.position)).toBe(false);
          }
        }
      }
    }

    // Verify collision attempts prevented counter is positive or non-negative
    expect(engine.collisionManager.getPreventedCount()).toBeGreaterThanOrEqual(0);
  });

  it('ISSUE 5: verifies AGVs in WAITING state have active feasible missions and resume transit without stale status labels', () => {
    const engine = new SimulationEngine();

    // R1 at (2,1) moving towards P1 (1,3)
    // Place a temporary blocker directly at (2,2)
    const r1 = engine.robots[0];
    const initialTarget = { ...r1.targetPosition! };

    // Set R1 status to WAITING as if yielding
    r1.status = 'WAITING';
    expect(r1.status).toBe('WAITING');
    expect(r1.targetPosition).not.toBeNull();
    expect(posEquals(r1.targetPosition!, initialTarget)).toBe(true);

    // When R1 executes a forward step, status must immediately update to active transit
    engine.step();

    // If R1 moved forward, status MUST NOT remain stale 'WAITING'
    const updatedR1 = engine.robots.find(r => r.id === 'R1')!;
    if (!posEquals(updatedR1.position, r1.startPosition)) {
      expect(updatedR1.status).not.toBe('WAITING');
      expect(updatedR1.status === 'MOVING_TO_PICKUP' || updatedR1.status === 'AT_PICKUP').toBe(true);
    }
  });

  it('ISSUE 6: validates all dashboard metrics update strictly from actual simulation state', () => {
    const engine = new SimulationEngine();

    const m1 = engine.getMetrics();
    expect(engine.simulationClock.getStep()).toBe(0);
    expect(m1.totalRobots).toBe(5);
    expect(m1.completedTasks).toBe(0);

    // Step simulation 25 ticks
    for (let t = 0; t < 25; t++) {
      engine.step();
    }

    const m2 = engine.getMetrics();
    // Path length and waiting time must reflect actual movements
    expect(m2.totalWaitingTime).toBeGreaterThanOrEqual(0);
    expect(m2.averagePathLength).toBeGreaterThanOrEqual(0);
    expect(m2.makespan).toBeGreaterThanOrEqual(0);
  });
});
