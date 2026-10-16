export type JoystickSide = 'left' | 'right';

// Mirrors O2's fixed-point speed_curve_compute_tangents and speed_curve_lookup.
// Keep integer truncation and the firmware's tangent scaling: the editor's
// floating-point spline is not an exact prediction of pointer movement.
function curveOutputs(curve: readonly number[]) {
  const xs = curve.slice(0, 8);
  const ys = curve.slice(8);
  const delta = new Int16Array(7);
  const tangents = new Int16Array(8);

  for (let i = 0; i < 7; i++) {
    const dx = xs[i + 1] - xs[i];
    delta[i] = dx === 0 ? 0 : Math.trunc(((ys[i + 1] - ys[i]) * 256) / dx);
  }
  tangents[0] = delta[0];
  for (let i = 1; i < 7; i++) {
    tangents[i] = Math.trunc((delta[i - 1] + delta[i]) / 2);
  }
  tangents[7] = delta[6];

  for (let i = 0; i < 7; i++) {
    if (delta[i] === 0) {
      tangents[i] = tangents[i + 1] = 0;
    } else {
      const a = Math.trunc((tangents[i] * 256) / delta[i]);
      const b = Math.trunc((tangents[i + 1] * 256) / delta[i]);
      const r2 = (Math.imul(a, a) + Math.imul(b, b)) | 0;
      if (r2 > 9 * 256 * 256) {
        const raw = Math.max(1, Math.trunc(r2 / (256 * 256)));
        let estimate = raw;
        for (let j = 0; j < 6; j++) {
          estimate = Math.trunc(
            (estimate + Math.trunc((raw * 256) / estimate)) / 2,
          );
        }
        const tau = Math.trunc((3 * 256 * 256) / (estimate || 1));
        tangents[i] = Math.trunc(
          (Math.trunc(Math.imul(a, tau) / 256) * delta[i]) / 256,
        );
        tangents[i + 1] = Math.trunc(
          (Math.trunc(Math.imul(b, tau) / 256) * delta[i]) / 256,
        );
      }
    }
  }

  return Array.from({length: 101}, (_, percent) => {
    const x = Math.trunc((percent * 255) / 100);
    if (x <= xs[0]) return ys[0];
    if (x >= xs[7]) return ys[7];
    let i = 0;
    while (i < 6 && xs[i + 1] <= x) i++;
    const h = xs[i + 1] - xs[i];
    if (h === 0) return ys[i];
    const t = Math.trunc(((x - xs[i]) * 256) / h);
    const t2 = Math.trunc((t * t) / 256);
    const t3 = Math.trunc((t2 * t) / 256);
    const result =
      (2 * t3 - 3 * t2 + 256) * ys[i] +
      Math.trunc(((t3 - 2 * t2 + t) * h * tangents[i]) / (256 * 256)) +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      Math.trunc(((t3 - t2) * h * tangents[i + 1]) / (256 * 256));
    return Math.max(0, Math.min(255, Math.trunc(result / 256)));
  });
}

// Validates firmware curve reads before using them for the movement indicator.
export function validateSpeedCurve(curve: readonly number[]) {
  if (
    curve.length !== 16 ||
    curve.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    throw new Error('Speed curve must contain 16 unsigned bytes');
  }
  if (curve.slice(0, 7).some((x, i) => x > curve[i + 1])) {
    throw new Error('Speed curve X values must be ordered');
  }
}

// Predicts one joystick's per-axis reports and all no-movement bands from the
// 16 saved curve bytes and sensitivity. Percentages match raw-axes command 32.
export function createMouseResponse(
  curve: readonly number[],
  sensitivity: number,
) {
  validateSpeedCurve(curve);
  if (!Number.isInteger(sensitivity) || sensitivity < 0 || sensitivity > 255) {
    throw new Error('Mouse sensitivity must be an unsigned byte');
  }
  const outputs = curveOutputs(curve);
  const axisOutput = (percent: number) => {
    const axis = Math.abs(percent) < 10 ? 0 : Math.trunc(percent);
    const output = Math.trunc(
      (outputs[Math.abs(axis)] * (axis < 0 ? -1 : 1) * sensitivity) / 3264,
    );
    return output === 0 ? 0 : output;
  };
  const noMovementRanges: {min: number; max: number}[] = [];
  let start: number | null = null;
  for (let percent = -100; percent <= 101; percent++) {
    if (percent <= 100 && axisOutput(percent) === 0) {
      if (start === null) start = percent;
    } else if (start !== null) {
      const end = percent - 1;
      // HID percentages truncate toward zero. E.g. -19..19 covers the
      // physical interval (-20,20), not a radius-19 circle.
      noMovementRanges.push({
        min: Math.max(-100, start <= 0 ? start - 1 : start),
        max: Math.min(100, end >= 0 ? end + 1 : end),
      });
      start = null;
    }
  }
  return {axisOutput, noMovementRanges};
}
