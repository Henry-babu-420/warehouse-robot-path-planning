import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WarehouseLayout, Position, ToolMode } from '../types/grid';
import { Robot } from '../types/robot';
import { ReservationTable } from '../algorithms/reservationTable';

interface WarehouseGridProps {
  warehouse: WarehouseLayout;
  robots: Robot[];
  selectedRobotId: string | null;
  onSelectRobot: (robotId: string) => void;
  toolMode: ToolMode;
  onCellClick: (x: number, y: number) => void;
  reservationTable: ReservationTable;
  showPaths: boolean;
  showReservations: boolean;
  showExploredNodes: boolean;
  exploredNodes: Position[];
  currentStep: number;
}

export const WarehouseGrid: React.FC<WarehouseGridProps> = ({
  warehouse,
  robots,
  selectedRobotId,
  onSelectRobot,
  toolMode,
  onCellClick,
  reservationTable,
  showPaths,
  showReservations,
  showExploredNodes,
  exploredNodes,
  currentStep,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<Position | null>(null);

  const rulerOffset = 26; // px for coordinate rulers
  const { width: gridW, height: gridH, cells, stations } = warehouse;

  // Convert mouse coordinate to grid cell with centered square cell geometry
  const getCellFromMouse = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const activeW = rect.width - rulerOffset;
    const activeH = rect.height - rulerOffset;
    if (activeW <= 0 || activeH <= 0) return null;

    const cellSize = Math.floor(Math.min(activeW / gridW, activeH / gridH));
    if (cellSize <= 0) return null;

    const offsetX = rulerOffset + Math.floor((activeW - gridW * cellSize) / 2);
    const offsetY = rulerOffset + Math.floor((activeH - gridH * cellSize) / 2);

    if (clientX < offsetX || clientY < offsetY) return null;

    const gx = Math.floor((clientX - offsetX) / cellSize);
    const gy = Math.floor((clientY - offsetY) / cellSize);

    if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
      return { x: gx, y: gy };
    }
    return null;
  }, [gridW, gridH, rulerOffset]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = getCellFromMouse(e);
    setHoveredCell(cell);
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = getCellFromMouse(e);
    if (cell) {
      if (toolMode === 'SELECT') {
        const clickedRobot = robots.find(r => r.position.x === cell.x && r.position.y === cell.y);
        if (clickedRobot) {
          onSelectRobot(clickedRobot.id);
          return;
        }
      }
      onCellClick(cell.x, cell.y);
    }
  };

  // High-DPI Canvas Rendering Loop (Precision Industrial Engineering)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const activeW = rect.width - rulerOffset;
    const activeH = rect.height - rulerOffset;
    
    // Maintain uniform square cell geometry centered in the viewport
    const cellSize = Math.max(16, Math.floor(Math.min(activeW / gridW, activeH / gridH)));
    const cellW = cellSize;
    const cellH = cellSize;
    const offsetX = rulerOffset + Math.floor((activeW - gridW * cellSize) / 2);
    const offsetY = rulerOffset + Math.floor((activeH - gridH * cellSize) / 2);

    // Industrial floor base
    ctx.fillStyle = '#F4F6F8';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Coordinate Rulers Background Bar
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rulerOffset);
    ctx.fillRect(0, 0, rulerOffset, rect.height);
    
    ctx.strokeStyle = '#E2E6EA';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerOffset);
    ctx.lineTo(rect.width, rulerOffset);
    ctx.moveTo(rulerOffset, 0);
    ctx.lineTo(rulerOffset, rect.height);
    ctx.stroke();

    // Coordinate text formatting
    ctx.fillStyle = '#697586';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top X-axis ruler
    for (let x = 0; x < gridW; x++) {
      const cx = offsetX + x * cellW + cellW / 2;
      ctx.fillText(x.toString(), cx, rulerOffset / 2);
    }

    // Left Y-axis ruler
    for (let y = 0; y < gridH; y++) {
      const cy = offsetY + y * cellH + cellH / 2;
      ctx.fillText(y.toString(), rulerOffset / 2, cy);
    }

    // Grid cells background and boundaries
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const px = offsetX + x * cellW;
        const py = offsetY + y * cellH;
        const type = cells[y]?.[x] || 'EMPTY';

        // Clean white floor tile
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(px, py, cellW, cellH);

        // Subtle thin grid separator
        ctx.strokeStyle = 'rgba(226, 230, 234, 0.75)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(px, py, cellW, cellH);

        if (type === 'WALL') {
          // Perimeter Structural Wall
          ctx.fillStyle = '#334155';
          ctx.fillRect(px + 1, py + 1, cellW - 2, cellH - 2);
          ctx.strokeStyle = '#1E293B';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1, py + 1, cellW - 2, cellH - 2);
        } else if (type === 'SHELF') {
          // Industrial Storage Rack Block
          ctx.fillStyle = '#F1F5F9';
          ctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);
          
          // Outer steel frame
          ctx.strokeStyle = '#64748B';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(px + 2, py + 2, cellW - 4, cellH - 4);

          // 4 Corner support footings
          const legSize = Math.max(2, Math.floor(cellW * 0.12));
          ctx.fillStyle = '#475569';
          ctx.fillRect(px + 2, py + 2, legSize, legSize);
          ctx.fillRect(px + cellW - 2 - legSize, py + 2, legSize, legSize);
          ctx.fillRect(px + 2, py + cellH - 2 - legSize, legSize, legSize);
          ctx.fillRect(px + cellW - 2 - legSize, py + cellH - 2 - legSize, legSize, legSize);

          // Rack horizontal divider beams
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + cellH * 0.35);
          ctx.lineTo(px + cellW - 4, py + cellH * 0.35);
          ctx.moveTo(px + 4, py + cellH * 0.68);
          ctx.lineTo(px + cellW - 4, py + cellH * 0.68);
          ctx.stroke();

          // Understated bay designation
          ctx.fillStyle = '#64748B';
          ctx.font = '700 8px "Inter", sans-serif';
          ctx.fillText('RACK', px + cellW / 2, py + cellH / 2);
        } else if (type === 'STATIC_OBSTACLE') {
          // Structural concrete column with muted hazard hatch
          ctx.fillStyle = '#E5E7EB';
          ctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);
          ctx.strokeStyle = '#9CA3AF';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 2, py + 2, cellW - 4, cellH - 4);

          ctx.save();
          ctx.beginPath();
          ctx.rect(px + 2, py + 2, cellW - 4, cellH - 4);
          ctx.clip();
          ctx.strokeStyle = 'rgba(180, 83, 9, 0.45)';
          ctx.lineWidth = 2;
          for (let offset = -cellW; offset < cellW * 2; offset += 6) {
            ctx.beginPath();
            ctx.moveTo(px + offset, py);
            ctx.lineTo(px + offset + cellH, py + cellH);
            ctx.stroke();
          }
          ctx.restore();
        } else if (type === 'DYNAMIC_OBSTACLE') {
          // Dynamic Obstacle (Restrained Warning State)
          ctx.fillStyle = '#FEF3C7';
          ctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);
          ctx.strokeStyle = '#D97706';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(px + 2, py + 2, cellW - 4, cellH - 4);

          ctx.fillStyle = '#B45309';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('!', px + cellW / 2, py + cellH / 2);
        } else if (type === 'PICKUP') {
          // Inbound Receiving Bay (Muted Green)
          ctx.fillStyle = '#E8F5E9';
          ctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);
          ctx.strokeStyle = '#2E7D32';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(px + 2, py + 2, cellW - 4, cellH - 4);

          const st = stations.find(s => s.position.x === x && s.position.y === y);
          ctx.fillStyle = '#2E7D32';
          ctx.font = '600 9px "Inter", sans-serif';
          ctx.fillText(st?.id || 'IN', px + cellW / 2, py + cellH / 2);
        } else if (type === 'DELIVERY') {
          // Outbound Packing Bay (Muted Steel Blue)
          ctx.fillStyle = '#EFF4F8';
          ctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);
          ctx.strokeStyle = '#426B8A';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(px + 2, py + 2, cellW - 4, cellH - 4);

          const st = stations.find(s => s.position.x === x && s.position.y === y);
          ctx.fillStyle = '#426B8A';
          ctx.font = '600 9px "Inter", sans-serif';
          ctx.fillText(st?.id || 'OUT', px + cellW / 2, py + cellH / 2);
        } else if (type === 'PASSING_BAY') {
          // Designated Passing Bay / Siding (Muted Industrial Cyan)
          ctx.fillStyle = '#EBF4F6';
          ctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);
          ctx.strokeStyle = '#4A8296';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(px + 2, py + 2, cellW - 4, cellH - 4);
          ctx.setLineDash([]);

          ctx.fillStyle = '#2C6475';
          ctx.font = '600 8px "Inter", sans-serif';
          ctx.fillText('BAY', px + cellW / 2, py + cellH / 2);
        }
      }
    }

    // Explored Nodes (Subtle Search Expansion Overlay)
    if (showExploredNodes && exploredNodes.length > 0) {
      ctx.fillStyle = 'rgba(66, 107, 138, 0.06)';
      for (const en of exploredNodes) {
        const px = offsetX + en.x * cellW;
        const py = offsetY + en.y * cellH;
        ctx.fillRect(px + 1, py + 1, cellW - 2, cellH - 2);

        ctx.fillStyle = '#7895A8';
        ctx.beginPath();
        ctx.arc(px + cellW / 2, py + cellH / 2, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(66, 107, 138, 0.06)';
      }
    }

    // Space-Time Reservations Overlay (Clean & Uncrowded: next 4 time steps only)
    if (showReservations) {
      const allRes = reservationTable.getAllVertexReservations();
      for (const res of allRes) {
        // Limit to immediate horizon [currentStep + 1 .. currentStep + 4] to prevent visual clutter
        if (res.t > currentStep && res.t <= currentStep + 4) {
          const px = offsetX + res.x * cellW;
          const py = offsetY + res.y * cellH;
          const robot = robots.find(r => r.id === res.robotId);
          const color = robot ? robot.color : '#697586';

          // Soft translucent reservation footprint
          ctx.fillStyle = 'rgba(100, 116, 139, 0.08)';
          ctx.fillRect(px + 3, py + 3, cellW - 6, cellH - 6);

          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(px + 3, py + 3, cellW - 6, cellH - 6);
          ctx.setLineDash([]);

          // Compact corner micro-pill
          ctx.fillStyle = color;
          ctx.font = '700 7px "JetBrains Mono", monospace';
          ctx.fillText(`+${res.t - currentStep}`, px + cellW / 2, py + cellH / 2);
        }
      }
    }

    // Planned Path Trajectories
    if (showPaths) {
      for (const robot of robots) {
        if (!robot.isActive || robot.plannedPath.length < 2) continue;

        const isSelected = robot.id === selectedRobotId;
        const path = robot.plannedPath;

        ctx.strokeStyle = robot.color;
        ctx.lineWidth = isSelected ? 2.2 : 1.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalAlpha = isSelected ? 0.95 : 0.55;

        if (!isSelected) {
          ctx.setLineDash([3, 2]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        for (let i = robot.pathIndex; i < path.length; i++) {
          const pt = path[i];
          const px = offsetX + pt.x * cellW + cellW / 2;
          const py = offsetY + pt.y * cellH + cellH / 2;

          if (i === robot.pathIndex) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Waypoint dots
        for (let i = robot.pathIndex + 1; i < path.length; i++) {
          const pt = path[i];
          const px = offsetX + pt.x * cellW + cellW / 2;
          const py = offsetY + pt.y * cellH + cellH / 2;

          ctx.fillStyle = robot.color;
          ctx.beginPath();
          ctx.arc(px, py, isSelected ? 2.2 : 1.4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = 1.0;
      }
    }

    // Render AGV Units (Authentic Industrial Vehicle Representation)
    for (const robot of robots) {
      if (!robot.isActive) continue;

      const px = offsetX + robot.position.x * cellW + cellW / 2;
      const py = offsetY + robot.position.y * cellH + cellH / 2;
      const size = Math.min(cellW, cellH) * 0.74;
      const half = size / 2;
      const isSelected = robot.id === selectedRobotId;

      // Selection indicator bracket
      if (isSelected) {
        ctx.strokeStyle = '#426B8A';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px - half - 3, py - half - 3, size + 6, size + 6);
      }

      // Waiting / Yielding status indicator
      if (robot.status === 'WAITING' || robot.status === 'BLOCKED') {
        ctx.strokeStyle = '#B45309';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(px - half - 2, py - half - 2, size + 4, size + 4);
        ctx.setLineDash([]);
      }

      // AGV Chassis (Rounded Rectangular Industrial Chassis)
      ctx.fillStyle = robot.color;
      ctx.beginPath();
      ctx.roundRect(px - half, py - half, size, size, 4);
      ctx.fill();

      // Protective Dark Bumper Edge
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Heading Vector Calculation
      let headingAngle = 0;
      if (robot.plannedPath.length > robot.pathIndex + 1) {
        const next = robot.plannedPath[robot.pathIndex + 1];
        headingAngle = Math.atan2(next.y - robot.position.y, next.x - robot.position.x);
      }

      // Front LIDAR / Optical Sensor Indicator
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(headingAngle);
      
      // Directional Arrow Pod
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(half * 0.65, 0);
      ctx.lineTo(half * 0.15, -half * 0.35);
      ctx.lineTo(half * 0.15, half * 0.35);
      ctx.closePath();
      ctx.fill();

      // Lateral Drive Wheels (Subtle side notches)
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-half * 0.25, -half - 1, half * 0.5, 2);
      ctx.fillRect(-half * 0.25, half - 1, half * 0.5, 2);

      ctx.restore();

      // Cargo Container / Pallet on top deck when carrying payload
      if (robot.hasPayload) {
        const cargoW = size * 0.52;
        const cargoH = size * 0.52;
        ctx.fillStyle = '#C25E40';
        ctx.fillRect(px - cargoW / 2, py - cargoH / 2, cargoW, cargoH);
        ctx.strokeStyle = '#78350F';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - cargoW / 2, py - cargoH / 2, cargoW, cargoH);

        // Strapping cross
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(px - cargoW / 2, py);
        ctx.lineTo(px + cargoW / 2, py);
        ctx.stroke();
      }

      // Robot ID label
      ctx.fillStyle = '#202A35';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(robot.id, px, py - half - 4);
    }

    // Subtle Hover Highlighting
    if (hoveredCell) {
      const hx = offsetX + hoveredCell.x * cellW;
      const hy = offsetY + hoveredCell.y * cellH;

      ctx.fillStyle = 'rgba(66, 107, 138, 0.08)';
      ctx.fillRect(hx, hy, cellW, cellH);

      ctx.strokeStyle = '#426B8A';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(hx + 0.5, hy + 0.5, cellW - 1, cellH - 1);

      // Tooltip clamped safely inside the canvas viewport
      const tipW = 42;
      const tipH = 16;
      let tipX = hx + cellW + 4;
      let tipY = hy;
      if (tipX + tipW > rect.width - 4) {
        tipX = hx - tipW - 4;
      }
      if (tipY + tipH > rect.height - 4) {
        tipY = rect.height - tipH - 4;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(tipX, tipY, tipW, tipH);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(tipX, tipY, tipW, tipH);

      ctx.fillStyle = '#426B8A';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${hoveredCell.x},${hoveredCell.y}`, tipX + tipW / 2, tipY + tipH / 2);
    }

    ctx.restore();
  }, [
    warehouse,
    robots,
    selectedRobotId,
    toolMode,
    hoveredCell,
    reservationTable,
    showPaths,
    showReservations,
    showExploredNodes,
    exploredNodes,
    currentStep,
    gridW,
    gridH,
    cells,
    stations,
  ]);

  return (
    <div ref={containerRef} className="warehouse-canvas-container">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ display: 'block', cursor: toolMode === 'SELECT' ? 'default' : 'crosshair' }}
      />
    </div>
  );
};
