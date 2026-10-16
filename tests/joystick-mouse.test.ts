import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMouseResponse} from '../src/utils/joystick-mouse';
import firmware from './fixtures/joystick-mouse.json';

const linear = [0, 36, 73, 109, 146, 182, 219, 255];
const linearCurve = [...linear, ...linear];

for (const fixture of firmware.cases) {
  test(`match firmware reports: ${fixture.name}, sensitivity ${fixture.sensitivity}`, () => {
    const response = createMouseResponse(fixture.curve, fixture.sensitivity);
    assert.deepEqual(
      Array.from({length: 201}, (_, i) => response.axisOutput(i - 100)),
      fixture.reports,
    );
    const shadedSamples = fixture.reports.map((_, i) => {
      const percent = i - 100;
      const sample = Math.max(
        -100,
        Math.min(100, percent + Math.sign(percent) * 0.5),
      );
      return response.noMovementRanges.some(
        ({min, max}) => sample >= min && sample <= max,
      );
    });
    assert.deepEqual(
      shadedSamples,
      fixture.reports.map((report) => report === 0),
    );
  });
}

// These boundary values were measured using adc_to_mouse_report in firmware.
test('shade the 19% input that produces no movement at sensitivity 67', () => {
  const response = createMouseResponse(linearCurve, 67);
  assert.equal(response.axisOutput(19), 0);
  assert.equal(response.axisOutput(20), 1);
  assert.equal(response.axisOutput(-19), 0);
  assert.equal(response.axisOutput(-20), -1);
  assert.deepEqual(response.noMovementRanges, [{min: -20, max: 20}]);
});

test('apply the 10% axis cutoff independently, including sensitivity 255', () => {
  for (const [sensitivity, firstOutput] of [
    [128, 1],
    [255, 2],
  ]) {
    const response = createMouseResponse(linearCurve, sensitivity);
    assert.equal(response.axisOutput(9), 0);
    assert.equal(response.axisOutput(10), firstOutput);
    assert.deepEqual(response.noMovementRanges, [{min: -10, max: 10}]);
  }
});

test('retain separate no-movement bands in a nonmonotone custom curve', () => {
  const response = createMouseResponse(
    [...linear, 0, 255, 255, 0, 0, 255, 255, 0],
    128,
  );
  assert.ok(response.noMovementRanges.length > 1);
  assert.equal(response.axisOutput(50), 0);
  assert.ok(response.axisOutput(25) > 0);
});

test('show no shaded region when a raised origin produces pointer drift', () => {
  const response = createMouseResponse(
    [...linear, ...linear.map(() => 255)],
    128,
  );
  assert.equal(response.axisOutput(0), 10);
  assert.equal(response.axisOutput(-9), 10);
  assert.deepEqual(response.noMovementRanges, []);
});

test('zero sensitivity shades the full input square', () => {
  assert.deepEqual(createMouseResponse(linearCurve, 0).noMovementRanges, [
    {min: -100, max: 100},
  ]);
});

test('reject unreadable curve data instead of displaying a guessed dead zone', () => {
  assert.throws(() => createMouseResponse([], 128), /16.*bytes/);
  assert.throws(
    () => createMouseResponse([...linear, ...linear.slice(0, 7), 256], 128),
    /bytes/,
  );
  assert.throws(
    () => createMouseResponse([36, 0, ...linear.slice(2), ...linear], 128),
    /ordered/,
  );
  assert.throws(() => createMouseResponse(linearCurve, NaN), /sensitivity/i);
});
