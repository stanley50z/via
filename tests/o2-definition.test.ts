import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {
  isVIADefinitionV3,
  keyboardDefinitionV3ToVIADefinitionV3,
} from '@the-via/reader';
import {LOCAL_KEYBOARD_DEFINITIONS} from '../src/utils/local-definitions';

// Check the bundled source and the public URL consumed by automatic loading.
test('O2 bundles the revised firmware definition without Git ignoring it', () => {
  const sourcePath = 'definitions/o2/via.json';
  const publicPath = 'public/definitions/v3/1330839554.json';
  const ignored = spawnSync(
    'git',
    ['check-ignore', '--no-index', sourcePath, publicPath],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(ignored.status, 1, ignored.stdout || ignored.stderr);

  const source = readFileSync(sourcePath);
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    '901c617f19bff6aefbd752a4d56d4bf1e9adf794be4dc3d4a4ee43323003809b',
  );
  const {customKeycodes, ...unchangedData} = JSON.parse(
    source.toString('utf8'),
  );
  // Captured from the v2.2.0 source before the custom-key revision.
  assert.equal(
    createHash('sha256').update(JSON.stringify(unchangedData)).digest('hex'),
    '7c460f11b3e66c471bed91243fa0558ff00ccf0fb0ae2f0a4c9bf7305e763161',
  );
  assert.equal(customKeycodes[0].name, 'Switch Mode');
  const definition = JSON.parse(readFileSync(publicPath, 'utf8'));
  assert.ok(isVIADefinitionV3(definition));
  assert.equal(definition.vendorProductId, 1330839554);
  assert.equal(definition.firmwareVersion, 1);
  assert.equal(LOCAL_KEYBOARD_DEFINITIONS[1330839554].v3, true);
  assert.equal(
    JSON.stringify(definition),
    JSON.stringify(
      keyboardDefinitionV3ToVIADefinitionV3(
        JSON.parse(source.toString('utf8')),
      ),
    ),
  );
});
