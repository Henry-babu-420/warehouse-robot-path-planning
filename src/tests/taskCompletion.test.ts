import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/simulationEngine';
import { posEquals } from '../utils/heuristics';

describe('Robot Task Completion & Mission Lifecycle', () => {
  it('navigates robot from start to pickup to delivery and increments completed tasks', () => {
    const engine = new SimulationEngine();

    // Configure a single robot with a direct short path
    const pPos = { x: 1, y: 3 };
    const dPos = { x: 3, y: 3 };
    
    // Clear other cells around to make sure path is straight
    engine.warehouse.cells[3][1] = 'PICKUP';
    engine.warehouse.cells[3][2] = 'EMPTY';
    engine.warehouse.cells[3][3] = 'DELIVERY';

    const r = engine.robots[0];
    r.position = { x: 1, y: 1 };
    r.startPosition = { x: 1, y: 1 };
    r.assignedPickup = pPos;
    r.assignedDelivery = dPos;
    r.targetPosition = pPos;
    r.hasPayload = false;
    r.tasksCompleted = 0;

    // Deactivate other robots for isolated test
    for (let i = 1; i < engine.robots.length; i++) {
      engine.robots[i].isActive = false;
    }

    engine.planFleetPaths();

    expect(r.plannedPath.length).toBeGreaterThan(0);
    const initialTasksCompleted = r.tasksCompleted;

    // Step the simulation until it reaches pickup, loads payload, then reaches delivery
    let maxSteps = 40;
    while (maxSteps > 0 && engine.robots[0].tasksCompleted === initialTasksCompleted) {
      engine.step();
      maxSteps--;
    }

    // Robot should have completed its task!
    expect(engine.robots[0].tasksCompleted).toBeGreaterThan(0);
  });
});
