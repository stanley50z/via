import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

// Check the definition data used by the real picker, without coupling to its DOM.
for (const path of [
  'definitions/o2/via.json',
  'public/definitions/v3/1330839554.json',
]) {
  test(`${path} names controller inputs without changing custom-keycode positions`, () => {
    const {customKeycodes: keys} = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(keys.length, 33);
    assert.equal(keys[0].shortName, 'SWM');
    const names = [
      'A',
      'B',
      'X',
      'Y',
      'LB',
      'RB',
      'LT',
      'RT',
      'Back',
      'Start',
      'L3',
      'R3',
      'D-pad Up',
      'D-pad Down',
      'D-pad Left',
      'D-pad Right',
      'Guide',
    ];
    assert.deepEqual(
      keys.slice(1, 18).map((key: {name: string}) => key.name),
      names,
    );
    assert.deepEqual(
      keys.slice(1, 18).map((key: {shortName: string}) => key.shortName),
      names,
    );
    for (const key of keys.slice(18, 33)) {
      assert.equal(key.name, 'No input');
      assert.equal(key.shortName, 'No input');
      assert.equal(key.title, 'No Xbox equivalent; sends no controller input');
    }
  });
}
