import { Position } from '../types/grid';
import { TimePosition, GoalReservation } from '../types/path';
import { posKey, timePosKey, edgeKey } from '../utils/heuristics';

export class ReservationTable {
  // Vertex reservations: key "x,y@t" -> robotId
  private vertexReservations: Map<string, string> = new Map();
  
  // Edge reservations: key "x1,y1->x2,y2@t" -> robotId (where t is the start time of the move)
  private edgeReservations: Map<string, string> = new Map();

  // Goal reservations: cellKey "x,y" -> GoalReservation (occupied permanently from fromTime onwards)
  private goalReservations: Map<string, GoalReservation> = new Map();

  // Map robotId to its list of reserved keys for easy cleanup/invalidation
  private robotVertexKeys: Map<string, Set<string>> = new Map();
  private robotEdgeKeys: Map<string, Set<string>> = new Map();

  /**
   * Check if a cell is reserved at time t by any robot other than askingRobotId
   */
  isVertexReserved(x: number, y: number, t: number, askingRobotId?: string): boolean {
    const key = `${x},${y}@${t}`;
    const occupant = this.vertexReservations.get(key);
    if (occupant && occupant !== askingRobotId) {
      return true;
    }

    // Check goal reservations (cells occupied indefinitely by robots that finished)
    const cellKey = `${x},${y}`;
    const goalRes = this.goalReservations.get(cellKey);
    if (goalRes && goalRes.robotId !== askingRobotId && t >= goalRes.fromTime) {
      return true;
    }

    return false;
  }

  /**
   * Check if moving from (fromX, fromY) at t to (toX, toY) at t+1 causes an edge collision or edge swap.
   * Edge swap occurs when another robot moves from (toX, toY) at t to (fromX, fromY) at t+1.
   */
  isEdgeSwapConflict(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    t: number,
    askingRobotId?: string
  ): boolean {
    // Edge swap: opposite transition at the exact same time step
    const reverseKey = `${toX},${toY}->${fromX},${fromY}@${t}`;
    const occupant = this.edgeReservations.get(reverseKey);
    if (occupant && occupant !== askingRobotId) {
      return true;
    }
    return false;
  }

  /**
   * Comprehensive collision check for a candidate transition:
   * (fromX, fromY) at t  -->  (toX, toY) at t+1
   */
  isTransitionReserved(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    t: number,
    askingRobotId?: string
  ): boolean {
    // 1. Destination vertex at t+1 must not be reserved
    if (this.isVertexReserved(toX, toY, t + 1, askingRobotId)) {
      return true;
    }

    // 2. If it's a move (not a wait action), check for edge swap
    if (fromX !== toX || fromY !== toY) {
      if (this.isEdgeSwapConflict(fromX, fromY, toX, toY, t, askingRobotId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Reserve an entire time-indexed path for a robot
   */
  reservePath(
    robotId: string,
    path: TimePosition[],
    reserveGoalIndefinitely = true
  ): void {
    // First clear any existing reservations for this robot
    this.clearRobot(robotId);

    if (path.length === 0) return;

    const vKeys = new Set<string>();
    const eKeys = new Set<string>();

    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      const vKey = `${step.x},${step.y}@${step.t}`;
      this.vertexReservations.set(vKey, robotId);
      vKeys.add(vKey);

      if (i > 0) {
        const prev = path[i - 1];
        if (prev.x !== step.x || prev.y !== step.y) {
          const eKey = `${prev.x},${prev.y}->${step.x},${step.y}@${prev.t}`;
          this.edgeReservations.set(eKey, robotId);
          eKeys.add(eKey);
        }
      }
    }

    this.robotVertexKeys.set(robotId, vKeys);
    this.robotEdgeKeys.set(robotId, eKeys);

    // Goal reservation: the destination is occupied permanently from arrival time
    if (reserveGoalIndefinitely) {
      const lastStep = path[path.length - 1];
      const goalKey = `${lastStep.x},${lastStep.y}`;
      this.goalReservations.set(goalKey, {
        robotId,
        position: { x: lastStep.x, y: lastStep.y },
        fromTime: lastStep.t,
      });
    }
  }

  /**
   * Remove all reservations held by a specific robot (e.g. for replanning or removal)
   */
  clearRobot(robotId: string): void {
    const vKeys = this.robotVertexKeys.get(robotId);
    if (vKeys) {
      for (const k of vKeys) {
        this.vertexReservations.delete(k);
      }
      this.robotVertexKeys.delete(robotId);
    }

    const eKeys = this.robotEdgeKeys.get(robotId);
    if (eKeys) {
      for (const k of eKeys) {
        this.edgeReservations.delete(k);
      }
      this.robotEdgeKeys.delete(robotId);
    }

    // Clear goal reservation if held by this robot
    for (const [key, goalRes] of this.goalReservations.entries()) {
      if (goalRes.robotId === robotId) {
        this.goalReservations.delete(key);
      }
    }
  }

  /**
   * Clear all reservations
   */
  clear(): void {
    this.vertexReservations.clear();
    this.edgeReservations.clear();
    this.goalReservations.clear();
    this.robotVertexKeys.clear();
    this.robotEdgeKeys.clear();
  }

  getActiveReservationsCount(): number {
    return this.vertexReservations.size + this.edgeReservations.size + this.goalReservations.size;
  }

  getRobotAtVertex(x: number, y: number, t: number): string | undefined {
    const key = `${x},${y}@${t}`;
    const robot = this.vertexReservations.get(key);
    if (robot) return robot;

    const goal = this.goalReservations.get(`${x},${y}`);
    if (goal && t >= goal.fromTime) {
      return goal.robotId;
    }
    return undefined;
  }

  getAllVertexReservations(): Array<{ robotId: string; x: number; y: number; t: number }> {
    const list: Array<{ robotId: string; x: number; y: number; t: number }> = [];
    for (const [key, robotId] of this.vertexReservations.entries()) {
      const [posPart, tPart] = key.split('@');
      const [x, y] = posPart.split(',').map(Number);
      list.push({ robotId, x, y, t: Number(tPart) });
    }
    return list;
  }

  getGoalReservations(): GoalReservation[] {
    return Array.from(this.goalReservations.values());
  }
}
