import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import type {KeyboardAPI} from 'src/utils/keyboard-api';
import {validateSpeedCurve} from 'src/utils/joystick-mouse';
import type {JoystickSide} from 'src/utils/joystick-mouse';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A point on the speed curve: x = joystick distance % [0,1], y = mouse speed % [0,1] */
export type CurvePoint = {x: number; y: number};

/** A named preset profile */
export type CurvePreset = {
  name: string;
  description: string;
  points: CurvePoint[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const GRAPH_W = 340;
const GRAPH_H = 280;
const PAD = {top: 20, right: 20, bottom: 40, left: 50};
const PLOT_W = GRAPH_W - PAD.left - PAD.right;
const PLOT_H = GRAPH_H - PAD.top - PAD.bottom;
const POINT_RADIUS = 7;
const POINT_HIT_RADIUS = 14;

/** Number of curve points transmitted to firmware (including 0 and 1 endpoints) */
const CURVE_POINT_COUNT = 8;

// ─── Preset Profiles ────────────────────────────────────────────────────────

const linearPoints = (): CurvePoint[] =>
  Array.from({length: CURVE_POINT_COUNT}, (_, i) => {
    const t = i / (CURVE_POINT_COUNT - 1);
    return {x: t, y: t};
  });

const qmkDefaultPoints = (): CurvePoint[] => {
  // QMK's default mouse driver uses a stepped acceleration:
  // slow ramp at beginning, then faster acceleration at higher deflections
  const xs = Array.from(
    {length: CURVE_POINT_COUNT},
    (_, i) => i / (CURVE_POINT_COUNT - 1),
  );
  return xs.map((x) => ({x, y: Math.pow(x, 1.6)}));
};

const exponentialPoints = (): CurvePoint[] => {
  const xs = Array.from(
    {length: CURVE_POINT_COUNT},
    (_, i) => i / (CURVE_POINT_COUNT - 1),
  );
  return xs.map((x) => ({x, y: Math.pow(x, 2.5)}));
};

const precisionPoints = (): CurvePoint[] => {
  // Logarithmic feel — fine control at low deflection, fast at high
  const xs = Array.from(
    {length: CURVE_POINT_COUNT},
    (_, i) => i / (CURVE_POINT_COUNT - 1),
  );
  return xs.map((x) => ({x, y: x === 0 ? 0 : Math.pow(x, 0.5)}));
};

const sCurvePoints = (): CurvePoint[] => {
  const xs = Array.from(
    {length: CURVE_POINT_COUNT},
    (_, i) => i / (CURVE_POINT_COUNT - 1),
  );
  // Smooth S-curve using a sigmoid-like function
  return xs.map((x) => {
    if (x === 0) return {x, y: 0};
    if (x === 1) return {x, y: 1};
    const s = 1 / (1 + Math.exp(-10 * (x - 0.5)));
    return {x, y: s};
  });
};

const flatTopPoints = (): CurvePoint[] => {
  // Quick ramp up then flat — good for consistent speed once past dead zone
  const xs = Array.from(
    {length: CURVE_POINT_COUNT},
    (_, i) => i / (CURVE_POINT_COUNT - 1),
  );
  return xs.map((x) => ({x, y: Math.min(1, x * 2.5)}));
};

export const PRESETS: CurvePreset[] = [
  {name: 'Linear', description: 'Constant 1:1 mapping', points: linearPoints()},
  {
    name: 'QMK Default',
    description: 'Moderate acceleration curve',
    points: qmkDefaultPoints(),
  },
  {
    name: 'Exponential',
    description: 'Slow start, fast finish',
    points: exponentialPoints(),
  },
  {
    name: 'Precision',
    description: 'Fine control at low deflection',
    points: precisionPoints(),
  },
  {
    name: 'S-Curve',
    description: 'Smooth slow–fast–slow transition',
    points: sCurvePoints(),
  },
  {
    name: 'Fast Ramp',
    description: 'Quick ramp then plateau',
    points: flatTopPoints(),
  },
];

// ─── Interpolation helpers ──────────────────────────────────────────────────

/**
 * Monotone cubic Hermite spline interpolation (Fritsch–Carlson).
 * Given sorted control points, returns a function mapping x ∈ [0,1] → y ∈ [0,1].
 */
function monotoneCubicInterpolation(pts: CurvePoint[]): (x: number) => number {
  const n = pts.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => pts[0].y;

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  // Compute secants
  const deltas: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    deltas.push(dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx);
  }

  // Initial tangents
  ms.push(deltas[0]);
  for (let i = 1; i < n - 1; i++) {
    ms.push((deltas[i - 1] + deltas[i]) / 2);
  }
  ms.push(deltas[n - 2]);

  // Fritsch–Carlson monotonicity fix
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(deltas[i]) < 1e-12) {
      ms[i] = 0;
      ms[i + 1] = 0;
    } else {
      const alpha = ms[i] / deltas[i];
      const beta = ms[i + 1] / deltas[i];
      const r = alpha * alpha + beta * beta;
      if (r > 9) {
        const tau = 3 / Math.sqrt(r);
        ms[i] = tau * alpha * deltas[i];
        ms[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  return (x: number) => {
    // Clamp
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];

    // Binary search for interval
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }

    const h = xs[hi] - xs[lo];
    if (h === 0) return ys[lo];

    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return h00 * ys[lo] + h10 * h * ms[lo] + h01 * ys[hi] + h11 * h * ms[hi];
  };
}

/** Generate SVG path from interpolation function */
function curveToPath(
  interp: (x: number) => number,
  samples: number = 80,
): string {
  const parts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const y = Math.max(0, Math.min(1, interp(x)));
    const px = PAD.left + x * PLOT_W;
    const py = PAD.top + (1 - y) * PLOT_H;
    parts.push(i === 0 ? `M${px},${py}` : `L${px},${py}`);
  }
  return parts.join(' ');
}

// ─── Styled Components ──────────────────────────────────────────────────────

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
`;

const SectionTitle = styled.div`
  color: var(--color_label);
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 4px;
`;

const SideSelector = styled.div`
  display: flex;
  gap: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--color_accent);
`;

const SideButton = styled.button<{$active: boolean}>`
  background: ${(p) => (p.$active ? 'var(--color_accent)' : 'transparent')};
  color: ${(p) => (p.$active ? '#000' : 'var(--color_label)')};
  border: none;
  padding: 6px 18px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    background: ${(p) =>
      p.$active
        ? 'var(--color_accent)'
        : 'rgba(var(--color_accent-rgb), 0.15)'};
  }
`;

const PresetBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  max-width: ${GRAPH_W + 40}px;
`;

const PresetButton = styled.button<{$active: boolean}>`
  background: ${(p) =>
    p.$active ? 'var(--color_accent)' : 'rgba(var(--color_accent-rgb), 0.1)'};
  color: ${(p) => (p.$active ? '#000' : 'var(--color_label)')};
  border: 1px solid
    ${(p) => (p.$active ? 'var(--color_accent)' : 'rgba(var(--color_accent-rgb), 0.25)')};
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    border-color: var(--color_accent);
  }
`;

const GraphSVG = styled.svg`
  cursor: default;
  user-select: none;
  touch-action: none;
`;

const SaveRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  max-width: ${GRAPH_W + 40}px;
  gap: 10px;
  align-items: center;
`;

const ActionButton = styled.button`
  background: var(--color_accent);
  color: #000;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const StatusText = styled.span`
  color: var(--color_label);
  font-size: 12px;
  opacity: 0.7;
`;

const TooltipText = styled.div`
  color: var(--color_label);
  font-size: 11px;
  opacity: 0.5;
  text-align: center;
  max-width: ${GRAPH_W}px;
`;

// ─── Custom Menu IDs for Speed Curve Points ─────────────────────────────────
// Each ID transmits 16 bytes: [x0..x7, y0..y7] (all 0-255)
// Left curve  : channel 0, ID 30
// Right curve : channel 0, ID 31

const SPEED_CURVE_CHANNEL = 0;
const LEFT_CURVE_ID = 30;
const RIGHT_CURVE_ID = 31;

// ─── Component ──────────────────────────────────────────────────────────────

interface SpeedCurveEditorProps {
  api: KeyboardAPI | null;
  onCurveApplied: (side: JoystickSide, bytes: number[] | null) => void;
}

// Reports only firmware-loaded or successfully saved bytes to the movement indicator.
export const SpeedCurveEditor: FC<SpeedCurveEditorProps> = ({
  api,
  onCurveApplied,
}) => {
  const [side, setSide] = useState<JoystickSide>('left');
  const [leftPoints, setLeftPoints] = useState<CurvePoint[]>(PRESETS[0].points);
  const [rightPoints, setRightPoints] = useState<CurvePoint[]>(
    PRESETS[0].points,
  );
  const [activePreset, setActivePreset] = useState<string>('Linear');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [hoverInfo, setHoverInfo] = useState<{x: number; y: number} | null>(
    null,
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const activeApiRef = useRef(api);
  activeApiRef.current = api;

  const points = side === 'left' ? leftPoints : rightPoints;
  const setPoints = side === 'left' ? setLeftPoints : setRightPoints;

  // Interpolation function for the current curve
  const interp = useMemo(() => monotoneCubicInterpolation(points), [points]);
  const curvePath = useMemo(() => curveToPath(interp), [interp]);

  // Never use draft/localStorage curves to predict what the firmware will do.
  useEffect(() => {
    let cancelled = false;
    onCurveApplied('left', null);
    onCurveApplied('right', null);
    if (!api) return;

    const loadCurve = async (side: JoystickSide, curveId: number) => {
      try {
        const res = await api.getCustomMenuValue([
          SPEED_CURVE_CHANNEL,
          curveId,
        ]);
        if (res[0] !== curveId) throw new Error('Unexpected curve response');
        const bytes = res.slice(1, 17);
        validateSpeedCurve(bytes);
        const points = Array.from({length: CURVE_POINT_COUNT}, (_, i) => ({
          x: bytes[i] / 255,
          y: bytes[i + CURVE_POINT_COUNT] / 255,
        }));
        if (cancelled) return;
        if (side === 'left') {
          setLeftPoints(points);
          matchPreset(points);
        } else {
          setRightPoints(points);
        }
        onCurveApplied(side, bytes);
      } catch (error) {
        console.error(`Failed to read ${side} speed curve:`, error);
        if (!cancelled)
          setSaveStatus(
            'Could not read speed curves. Reconnect the keyboard to retry.',
          );
      }
    };
    void Promise.all([
      loadCurve('left', LEFT_CURVE_ID),
      loadCurve('right', RIGHT_CURVE_ID),
    ]);
    return () => {
      cancelled = true;
    };
  }, [api, onCurveApplied]);

  // Match current points to a preset name
  const matchPreset = useCallback((pts: CurvePoint[]) => {
    for (const preset of PRESETS) {
      const match = preset.points.every(
        (p, i) =>
          pts[i] &&
          Math.abs(p.x - pts[i].x) < 0.01 &&
          Math.abs(p.y - pts[i].y) < 0.02,
      );
      if (match) {
        setActivePreset(preset.name);
        return;
      }
    }
    setActivePreset('Custom');
  }, []);

  // Apply a preset
  const applyPreset = useCallback(
    (preset: CurvePreset) => {
      const newPts = preset.points.map((p) => ({...p}));
      setPoints(newPts);
      setActivePreset(preset.name);
    },
    [setPoints],
  );

  // ─── Dragging logic ─────────────────────────────────────────────────────

  const svgToData = useCallback(
    (clientX: number, clientY: number): {x: number; y: number} => {
      const svg = svgRef.current;
      if (!svg) return {x: 0, y: 0};
      const rect = svg.getBoundingClientRect();
      const svgX = clientX - rect.left;
      const svgY = clientY - rect.top;
      const x = Math.max(0, Math.min(1, (svgX - PAD.left) / PLOT_W));
      const y = Math.max(0, Math.min(1, 1 - (svgY - PAD.top) / PLOT_H));
      return {x, y};
    },
    [],
  );

  const handlePointerDown = useCallback(
    (idx: number) => (e: React.PointerEvent) => {
      // Don't allow dragging the first (0%) or last (100%) point's X,
      // but do allow changing their Y
      e.preventDefault();
      e.stopPropagation();
      setDraggingIdx(idx);
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const {x, y} = svgToData(e.clientX, e.clientY);

      // Always update hover info
      setHoverInfo({x, y: Math.max(0, Math.min(1, interp(x)))});

      if (draggingIdx === null) return;

      setPoints((prev) => {
        const newPts = [...prev];
        const pt = {...newPts[draggingIdx]};

        // First and last points: X is locked
        if (draggingIdx === 0) {
          pt.x = 0;
        } else if (draggingIdx === CURVE_POINT_COUNT - 1) {
          pt.x = 1;
        } else {
          // Constrain X between neighbors
          const minX = newPts[draggingIdx - 1].x + 0.01;
          const maxX = newPts[draggingIdx + 1].x - 0.01;
          pt.x = Math.max(minX, Math.min(maxX, x));
        }
        pt.y = Math.max(0, Math.min(1, y));

        newPts[draggingIdx] = pt;
        return newPts;
      });
    },
    [draggingIdx, svgToData, setPoints, interp],
  );

  const handlePointerUp = useCallback(() => {
    if (draggingIdx !== null) {
      setDraggingIdx(null);
      setActivePreset('Custom');
      // Re-check if it matches a preset
      matchPreset(points);
    }
  }, [draggingIdx, points, matchPreset]);

  const handlePointerLeave = useCallback(() => {
    setHoverInfo(null);
    if (draggingIdx !== null) {
      setDraggingIdx(null);
    }
  }, [draggingIdx]);

  // ─── Save to firmware ───────────────────────────────────────────────────
  // Channel 0, IDs 30/31 each transmit all 16 curve bytes in one message.

  const packCurve = useCallback((pts: CurvePoint[]): number[] => {
    // Pack 8 X-values then 8 Y-values, each 0-255
    const bytes: number[] = [];
    for (let i = 0; i < CURVE_POINT_COUNT; i++) {
      bytes.push(Math.round(pts[i].x * 255));
    }
    for (let i = 0; i < CURVE_POINT_COUNT; i++) {
      bytes.push(Math.round(pts[i].y * 255));
    }
    return bytes;
  }, []);

  // Serialize whole transactions: the HID queue alone permits overlapping
  // multi-command saves to interleave and publish stale indicator settings.
  const saveCurves = useCallback(
    async (sides: JoystickSide[]) => {
      if (savingRef.current) return;
      if (!api) {
        setSaveStatus('No device connected');
        return;
      }
      savingRef.current = true;
      setSaving(true);
      const updates = sides.map((side) => ({
        side,
        id: side === 'left' ? LEFT_CURVE_ID : RIGHT_CURVE_ID,
        bytes: packCurve(side === 'left' ? leftPoints : rightPoints),
      }));
      // Firmware applies SET immediately, before the SAVE acknowledgement.
      sides.forEach((side) => onCurveApplied(side, null));
      try {
        setSaveStatus('Saving...');
        for (const update of updates) {
          await api.setCustomMenuValue(
            SPEED_CURVE_CHANNEL,
            update.id,
            ...update.bytes,
          );
        }
        await api.commitCustomMenu(SPEED_CURVE_CHANNEL);
        if (activeApiRef.current !== api) return;
        updates.forEach(({side, bytes}) => onCurveApplied(side, bytes));
        setSaveStatus('Saved!');
      } catch (error) {
        console.error('Failed to save speed curves:', error);
        if (activeApiRef.current !== api) return;
        setSaveStatus(
          'Save failed. Reconnect or save again to restore the movement indicator.',
        );
      } finally {
        savingRef.current = false;
        if (activeApiRef.current === api) setSaving(false);
      }
    },
    [api, leftPoints, rightPoints, packCurve, onCurveApplied],
  );

  // ─── Axis labels ────────────────────────────────────────────────────────

  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <Container>
      <SectionTitle>Mouse Speed Curve</SectionTitle>

      {/* Left / Right selector */}
      <SideSelector>
        <SideButton $active={side === 'left'} onClick={() => setSide('left')}>
          Left Joystick
        </SideButton>
        <SideButton $active={side === 'right'} onClick={() => setSide('right')}>
          Right Joystick
        </SideButton>
      </SideSelector>

      {/* Preset bar */}
      <PresetBar>
        {PRESETS.map((preset) => (
          <PresetButton
            key={preset.name}
            $active={activePreset === preset.name}
            onClick={() => applyPreset(preset)}
            title={preset.description}
          >
            {preset.name}
          </PresetButton>
        ))}
        {activePreset === 'Custom' && (
          <PresetButton $active={true} onClick={() => {}}>
            Custom
          </PresetButton>
        )}
      </PresetBar>

      {/* Graph */}
      <GraphSVG
        ref={svgRef}
        width={GRAPH_W}
        height={GRAPH_H}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Background */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="rgba(0,0,0,0.15)"
          rx={4}
        />

        {/* Grid lines */}
        {xTicks.map((t) => {
          const px = PAD.left + t * PLOT_W;
          return (
            <line
              key={`xg-${t}`}
              x1={px}
              y1={PAD.top}
              x2={px}
              y2={PAD.top + PLOT_H}
              stroke="var(--color_accent)"
              strokeWidth={0.5}
              opacity={0.12}
            />
          );
        })}
        {yTicks.map((t) => {
          const py = PAD.top + (1 - t) * PLOT_H;
          return (
            <line
              key={`yg-${t}`}
              x1={PAD.left}
              y1={py}
              x2={PAD.left + PLOT_W}
              y2={py}
              stroke="var(--color_accent)"
              strokeWidth={0.5}
              opacity={0.12}
            />
          );
        })}

        {/* Diagonal reference (linear) */}
        <line
          x1={PAD.left}
          y1={PAD.top + PLOT_H}
          x2={PAD.left + PLOT_W}
          y2={PAD.top}
          stroke="var(--color_accent)"
          strokeWidth={1}
          opacity={0.1}
          strokeDasharray="4 4"
        />

        {/* Interpolated curve */}
        <path
          d={curvePath}
          fill="none"
          stroke="var(--color_accent)"
          strokeWidth={2.5}
          opacity={0.85}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Filled area under curve */}
        <path
          d={`${curvePath} L${PAD.left + PLOT_W},${PAD.top + PLOT_H} L${PAD.left},${PAD.top + PLOT_H} Z`}
          fill="var(--color_accent)"
          opacity={0.06}
        />

        {/* Hover crosshair */}
        {hoverInfo && draggingIdx === null && (
          <>
            <line
              x1={PAD.left + hoverInfo.x * PLOT_W}
              y1={PAD.top}
              x2={PAD.left + hoverInfo.x * PLOT_W}
              y2={PAD.top + PLOT_H}
              stroke="var(--color_accent)"
              strokeWidth={0.5}
              opacity={0.3}
              strokeDasharray="3 3"
            />
            <circle
              cx={PAD.left + hoverInfo.x * PLOT_W}
              cy={PAD.top + (1 - hoverInfo.y) * PLOT_H}
              r={3}
              fill="var(--color_accent)"
              opacity={0.5}
            />
            <text
              x={PAD.left + hoverInfo.x * PLOT_W + 8}
              y={PAD.top + (1 - hoverInfo.y) * PLOT_H - 8}
              fill="var(--color_label)"
              fontSize={10}
              opacity={0.6}
            >
              {`${Math.round(hoverInfo.x * 100)}% → ${Math.round(hoverInfo.y * 100)}%`}
            </text>
          </>
        )}

        {/* Draggable control points */}
        {points.map((pt, i) => {
          const cx = PAD.left + pt.x * PLOT_W;
          const cy = PAD.top + (1 - pt.y) * PLOT_H;
          const isEndpoint = i === 0 || i === CURVE_POINT_COUNT - 1;
          const isDragging = draggingIdx === i;

          return (
            <g key={i}>
              {/* Invisible hit area */}
              <circle
                cx={cx}
                cy={cy}
                r={POINT_HIT_RADIUS}
                fill="transparent"
                cursor="grab"
                onPointerDown={handlePointerDown(i)}
              />
              {/* Visible point */}
              <circle
                cx={cx}
                cy={cy}
                r={isDragging ? POINT_RADIUS + 2 : POINT_RADIUS}
                fill={
                  isDragging
                    ? 'var(--color_accent)'
                    : isEndpoint
                      ? 'var(--color_accent)'
                      : '#fff'
                }
                stroke="var(--color_accent)"
                strokeWidth={isEndpoint ? 2 : 1.5}
                opacity={isDragging ? 1 : 0.9}
                style={{transition: isDragging ? 'none' : 'r 0.1s'}}
                pointerEvents="none"
              />
              {/* Point label when dragging */}
              {isDragging && (
                <text
                  x={cx + 12}
                  y={cy - 12}
                  fill="var(--color_label)"
                  fontSize={11}
                  fontWeight={500}
                >
                  {`${Math.round(pt.x * 100)}% → ${Math.round(pt.y * 100)}%`}
                </text>
              )}
            </g>
          );
        })}

        {/* X-axis labels */}
        {xTicks.map((t) => (
          <text
            key={`xl-${t}`}
            x={PAD.left + t * PLOT_W}
            y={GRAPH_H - 8}
            textAnchor="middle"
            fill="var(--color_label)"
            fontSize={10}
            opacity={0.5}
          >
            {`${Math.round(t * 100)}%`}
          </text>
        ))}
        {/* X-axis title */}
        <text
          x={PAD.left + PLOT_W / 2}
          y={GRAPH_H}
          textAnchor="middle"
          fill="var(--color_label)"
          fontSize={11}
          opacity={0.6}
        >
          Joystick Distance
        </text>

        {/* Y-axis labels */}
        {yTicks.map((t) => (
          <text
            key={`yl-${t}`}
            x={PAD.left - 8}
            y={PAD.top + (1 - t) * PLOT_H + 4}
            textAnchor="end"
            fill="var(--color_label)"
            fontSize={10}
            opacity={0.5}
          >
            {`${Math.round(t * 100)}%`}
          </text>
        ))}
        {/* Y-axis title */}
        <text
          x={12}
          y={PAD.top + PLOT_H / 2}
          textAnchor="middle"
          fill="var(--color_label)"
          fontSize={11}
          opacity={0.6}
          transform={`rotate(-90, 12, ${PAD.top + PLOT_H / 2})`}
        >
          Mouse Speed
        </text>
      </GraphSVG>

      <TooltipText>
        Drag the control points to shape the speed response curve.
        <br />
        The dashed diagonal line represents a linear (1:1) mapping.
      </TooltipText>

      {/* Save actions */}
      <SaveRow>
        <ActionButton
          onClick={() => saveCurves([side])}
          disabled={!api || saving}
        >
          Save {side === 'left' ? 'Left' : 'Right'} Curve
        </ActionButton>
        <ActionButton
          onClick={() => saveCurves(['left', 'right'])}
          disabled={!api || saving}
        >
          Save Both
        </ActionButton>
        {saveStatus && <StatusText role="status">{saveStatus}</StatusText>}
      </SaveRow>
    </Container>
  );
};
