import { Robot } from '../types/robot';
import { Position } from '../types/grid';
import { posEquals, posKey } from '../utils/heuristics';
import { ReservationTable } from '../algorithms/reservationTable';

export interface CollisionWarning {
  id: string;
  timeStep: number;
  type: 'VERTEX_CONFLICT' | 'EDGE_SWAP' | 'OBSTACLE_COLLISION' | 'GOAL_OCCUPIED';
  robot1Id: string;
  robot2Id?: string;
  position: Position;
  message: string;
}

export class CollisionManager {
  private preventedCollisionsCount: number = 0;
  private recentWarnings: CollisionWarning[] = [];
  private maxWarningsHistory = 50;

  getPreventedCount(): number {
    return this.preventedCollisionsCount;
  }

  getRecentWarnings(): CollisionWarning[] {
    return [...this.recentWarnings];
  }

  reset() {
    this.preventedCollisionsCount = 0;
    this.recentWarnings = [];
  }

  /**
   * Validates planned moves for all robots before applying them at time step t.
   * If a conflict is detected between two robots or an obstacle, the conflicting move
   * is REJECTED and prevented, forcing the affected robot to wait at its current cell.
   *
   * Handles:
   * 1. Physical obstacles
   * 2. Head-on edge swaps
   * 3. Vertex collisions & stationary occupant protection
   * 4. Cascading chain reactions (trailing robots yielding behind waiting robots)
   */
  validateAndFilterMoves(
    robots: Robot[],
    isCellTraversable: (pos: Position) => boolean,
    currentStep: number,
    reservationTable: ReservationTable
  ): {
    filteredRobots: Robot[];
    preventedCollisionsThisStep: CollisionWarning[];
  } {
    const warnings: CollisionWarning[] = [];
    const updatedRobots = robots.map(r => ({ ...r }));

    // Proposed target position for each robot for the next step
    const proposedMoves: Map<string, { from: Position; to: Position; robotIdx: number }> = new Map();

    for (let i = 0; i < updatedRobots.length; i++) {
      const robot = updatedRobots[i];
      if (!robot.isActive || robot.plannedPath.length === 0) {
        proposedMoves.set(robot.id, { from: robot.position, to: robot.position, robotIdx: i });
        continue;
      }

      const nextPlannedIndex = robot.pathIndex + 1;
      if (nextPlannedIndex < robot.plannedPath.length) {
        const nextStep = robot.plannedPath[nextPlannedIndex];
        proposedMoves.set(robot.id, {
          from: robot.position,
          to: { x: nextStep.x, y: nextStep.y },
          robotIdx: i,
        });
      } else {
        // Already at end of path (holding position)
        proposedMoves.set(robot.id, { from: robot.position, to: robot.position, robotIdx: i });
      }
    }

    // Iterative resolution loop to handle cascading yields and stationary occupancy
    let changed = true;
    let iteration = 0;
    const maxIterations = Math.max(10, robots.length * 2);

    while (changed && iteration < maxIterations) {
      changed = false;
      iteration++;

      // 1. Check for movements into untraversable cells (e.g. newly placed dynamic obstacle)
      for (const [rId, move] of proposedMoves.entries()) {
        if (!posEquals(move.from, move.to) && !isCellTraversable(move.to)) {
          this.preventedCollisionsCount++;
          warnings.push({
            id: `warn-obs-${rId}-${currentStep}-${iteration}`,
            timeStep: currentStep,
            type: 'OBSTACLE_COLLISION',
            robot1Id: rId,
            position: move.to,
            message: `Movement prevented: ${rId} attempted move into blocked cell (${move.to.x}, ${move.to.y})`,
          });
          move.to = move.from;
          changed = true;
        }
      }

      // 2. Check for Head-on Edge Swaps: Robot A moving u->v while Robot B moves v->u
      const robotIds = Array.from(proposedMoves.keys());
      for (let i = 0; i < robotIds.length; i++) {
        for (let j = i + 1; j < robotIds.length; j++) {
          const r1Id = robotIds[i];
          const r2Id = robotIds[j];
          const move1 = proposedMoves.get(r1Id)!;
          const move2 = proposedMoves.get(r2Id)!;

          // Is it an edge swap?
          if (
            !posEquals(move1.from, move1.to) &&
            !posEquals(move2.from, move2.to) &&
            posEquals(move1.from, move2.to) &&
            posEquals(move1.to, move2.from)
          ) {
            this.preventedCollisionsCount++;
            warnings.push({
              id: `warn-swap-${r1Id}-${r2Id}-${currentStep}-${iteration}`,
              timeStep: currentStep,
              type: 'EDGE_SWAP',
              robot1Id: r1Id,
              robot2Id: r2Id,
              position: move1.from,
              message: `Head-on edge swap collision PREVENTED between ${r1Id} and ${r2Id}. Holding positions.`,
            });
            move1.to = move1.from;
            move2.to = move2.from;
            changed = true;
          }
        }
      }

      // 3. Check for Vertex Collisions & Stationary Occupant protection
      const destinationMap = new Map<string, string[]>();
      for (const [rId, move] of proposedMoves.entries()) {
        const key = posKey(move.to);
        if (!destinationMap.has(key)) {
          destinationMap.set(key, []);
        }
        destinationMap.get(key)!.push(rId);
      }

      for (const [cellKey, occupants] of destinationMap.entries()) {
        if (occupants.length > 1) {
          // If any occupant is stationary (already physically at this cell: from === to),
          // the stationary occupant CANNOT be displaced! All moving robots must yield!
          const stationaryOccupants = occupants.filter(id => {
            const m = proposedMoves.get(id)!;
            return posEquals(m.from, m.to);
          });

          let winner: string;
          let losers: string[];

          if (stationaryOccupants.length > 0) {
            // Stationary robot wins occupancy
            winner = stationaryOccupants[0];
            losers = occupants.filter(id => id !== winner);
          } else {
            // All are moving in: highest effective priority wins
            occupants.sort((a, b) => {
              const robA = updatedRobots.find(r => r.id === a)!;
              const robB = updatedRobots.find(r => r.id === b)!;
              return (robB.priority + robB.priorityAge) - (robA.priority + robA.priorityAge);
            });
            winner = occupants[0];
            losers = occupants.slice(1);
          }

          for (const loserId of losers) {
            const loserMove = proposedMoves.get(loserId)!;
            // Only if loser is actually attempting to move into this cell from outside
            if (!posEquals(loserMove.from, loserMove.to)) {
              this.preventedCollisionsCount++;
              warnings.push({
                id: `warn-vertex-${winner}-${loserId}-${currentStep}-${iteration}`,
                timeStep: currentStep,
                type: 'VERTEX_CONFLICT',
                robot1Id: winner,
                robot2Id: loserId,
                position: loserMove.to,
                message: `Same-cell collision PREVENTED at (${loserMove.to.x}, ${loserMove.to.y}): ${loserId} yielded to ${winner}.`,
              });
              loserMove.to = loserMove.from;
              changed = true; // Trigger next iteration to cascade to any trailing robots!
            }
          }
        }
      }
    }

    // Apply validated moves to updated robots
    for (const [rId, move] of proposedMoves.entries()) {
      const robot = updatedRobots[move.robotIdx];
      if (!posEquals(move.from, move.to)) {
        // Valid forward move executed!
        robot.position = move.to;
        robot.pathIndex = robot.pathIndex + 1;
        robot.totalStepsMoved++;
        // Resume active transit status upon forward movement
        robot.status = robot.hasPayload ? 'MOVING_TO_DELIVERY' : 'MOVING_TO_PICKUP';
      } else {
        // Robot stayed in place (waited or yielded)
        if (robot.plannedPath.length > 0 && robot.pathIndex < robot.plannedPath.length - 1) {
          robot.totalWaitSteps++;
          robot.status = 'WAITING';
        }
      }
    }

    // Save recent warnings
    if (warnings.length > 0) {
      this.recentWarnings.unshift(...warnings);
      if (this.recentWarnings.length > this.maxWarningsHistory) {
        this.recentWarnings = this.recentWarnings.slice(0, this.maxWarningsHistory);
      }
    }

    return {
      filteredRobots: updatedRobots,
      preventedCollisionsThisStep: warnings,
    };
  }
}
