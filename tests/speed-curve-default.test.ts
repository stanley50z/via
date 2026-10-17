import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PRESETS} from '../src/components/panes/speed-curve-editor';
import {createMouseResponse} from '../src/utils/joystick-mouse';
import firmware from './fixtures/speed-curve-default.json';

const originalDefault = [
  0, 38, 67, 162, 207, 224, 239, 255, 0, 46, 57, 69, 120, 160, 200, 255,
];

test('QMK Default sends the baseline-derived O2 firmware curve bytes', () => {
  const preset = PRESETS.find(({name}) => name === 'QMK Default')!;
  assert.deepEqual(
    [
      ...preset.points.map(({x}) => Math.round(x * 255)),
      ...preset.points.map(({y}) => Math.round(y * 255)),
    ],
    originalDefault,
  );
});

for (const fixture of firmware.cases) {
  test(`default preview matches C-measured reports at sensitivity ${fixture.sensitivity}`, () => {
    const response = createMouseResponse(originalDefault, fixture.sensitivity);
    assert.deepEqual(
      Array.from({length: 201}, (_, i) => response.axisOutput(i - 100)),
      fixture.reports,
    );
  });
}
