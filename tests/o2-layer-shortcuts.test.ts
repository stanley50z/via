import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import type {VIADefinitionV3} from '@the-via/reader';
import {getByteForCode, getCustomKeycodes} from '../src/utils/key';
import {advancedStringToKeycode} from '../src/utils/advanced-keys';
import {getBasicKeyDict} from '../src/utils/key-to-byte/dictionary-store';

const o2: VIADefinitionV3 = JSON.parse(
  readFileSync('public/definitions/v3/1330839554.json', 'utf8'),
);

// Native MO/TO literals come from QMK's keycode ranges, independently of the picker.
test('O2 Custom shortcuts send the same native layer-10 codes as Any', () => {
  const keys = getCustomKeycodes(o2);
  assert.deepEqual(
    keys.slice(33).map(({name, code}) => ({name, code})),
    [
      {name: 'MO(10)', code: 'MO(10)'},
      {name: 'TO(10)', code: 'TO(10)'},
    ],
  );
  const dictionary = getBasicKeyDict(12);
  assert.equal(getByteForCode(keys[33].code, dictionary), 0x522a);
  assert.equal(getByteForCode(keys[34].code, dictionary), 0x520a);
  assert.equal(
    getByteForCode(keys[33].code, dictionary),
    advancedStringToKeycode('MO(10)', dictionary),
  );
  assert.equal(
    getByteForCode(keys[34].code, dictionary),
    advancedStringToKeycode('TO(10)', dictionary),
  );
  assert.equal(keys[0].code, 'CUSTOM(0)');
  assert.equal(keys[32].code, 'CUSTOM(32)');
  assert.equal(o2.customKeycodes?.length, 33);
});

// O2-only shortcuts must not replace another board's custom actions.
test('other keyboards keep their definition-provided custom picker unchanged', () => {
  const definition = {...o2, vendorProductId: 0x12345678};
  const keys = getCustomKeycodes(definition);
  assert.equal(keys.length, 33);
  assert.deepEqual(
    keys.map(({code}) => code),
    Array.from({length: 33}, (_, index) => `CUSTOM(${index})`),
  );
  assert.deepEqual(
    getCustomKeycodes({...definition, customKeycodes: undefined}),
    [],
  );
});
