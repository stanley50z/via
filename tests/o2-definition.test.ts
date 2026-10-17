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

// Check the release asset and the public URL consumed by automatic loading.
test('O2 bundles the v2.2.0 release definition without Git ignoring it', () => {
  const sourcePath = 'definitions/o2/via.json';
  const publicPath = 'public/definitions/v3/1330839554.json';
  const ignored = spawnSync('git', ['check-ignore', '--no-index', sourcePath, publicPath], {
    encoding: 'utf8',
  });
  assert.equal(ignored.status, 1, ignored.stdout || ignored.stderr);

  const source = readFileSync(sourcePath);
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    '12adeb98fdfbe51d9240c79a7b9a892816c9425e61370caae33230b1cf7b78c4',
  );
  const definition = JSON.parse(readFileSync(publicPath, 'utf8'));
  assert.ok(isVIADefinitionV3(definition));
  assert.equal(definition.vendorProductId, 1330839554);
  assert.equal(definition.firmwareVersion, 1);
  assert.equal(LOCAL_KEYBOARD_DEFINITIONS[1330839554].v3, true);
  assert.equal(
    JSON.stringify(definition),
    JSON.stringify(
      keyboardDefinitionV3ToVIADefinitionV3(JSON.parse(source.toString('utf8'))),
    ),
  );
});
