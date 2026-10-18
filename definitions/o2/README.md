# O2 VIA definition

`via.json` is derived from the QMK firmware
[v2.2.0 release](https://github.com/stanley50z/qmk_firmware/releases/tag/v2.2.0),
with the controller-label changes tracked in
[VIA issue #5](https://github.com/stanley50z/via/issues/5). It is synchronized with
`keyboards/os_keyboard_beta/via.json` in the firmware repository, not the
unchanged release asset.

Its SHA-256 is `901c617f19bff6aefbd752a4d56d4bf1e9adf794be4dc3d4a4ee43323003809b`
(UTF-8, LF line endings).

## Custom keys

Controller buttons retain their existing positions, but display the Xbox input
names: A/B/X/Y, LB/RB, LT/RT, Back/Start, L3/R3 (stick presses), D-pad directions,
and Guide. Slots 17–31 say **No input** because they have no Xbox equivalent.
These keys remain in **Custom**, not Special.

The OS Keyboard VIA app adds MO(10) and TO(10) shortcuts at the end of O2's
Custom picker. These send the existing native QMK keycodes, exactly like entering
MO(10) or TO(10) through Any. They are not new custom-keycode indices and require
no firmware update. The source definition keeps all 33 existing custom entries;
stock VIA can still assign these layer actions through Any. Existing keycodes,
layout, and menus are unchanged.

If a manually imported definition overrides autoloading, import the revised
`via.json` to see the new controller labels. The shortcuts are app-side and do
not depend on replacing that definition.

## Updating the bundle

The source and its converted autoload asset,
`public/definitions/v3/1330839554.json`, are both kept in Git. Other generated
keyboard definitions stay ignored. Dev and production builds generate the
upstream definitions alongside the bundled O2 asset; no release download is
needed during builds. The application's definition-cache hash includes the
bundled O2 asset as well as the upstream hash, so label changes reach existing
users on reload without clearing their manually imported overrides.

Copy the firmware's source definition here, preserving UTF-8/LF, then run from
the VIA repository root:

```bash
node -e 'const fs=require("fs"); const {keyboardDefinitionV3ToVIADefinitionV3}=require("@the-via/reader"); const source=JSON.parse(fs.readFileSync("definitions/o2/via.json","utf8")); fs.writeFileSync("public/definitions/v3/1330839554.json",JSON.stringify(keyboardDefinitionV3ToVIADefinitionV3(source),null,2)+"\n");'
bun run test
bun run build
```

Update provenance and the checksum here and in `tests/o2-definition.test.ts`
when intentionally upgrading. Review menus, custom-keycode order, and layout
before accepting changes. This asset is a V3 definition; legacy V2 definition
handling is unchanged.

Validation logs, failure stack traces, and browser evidence for issue #5 are
persisted in `.codex-logs/issue-5/` (`tests.log`, `typecheck.log`, `build.log`,
and `browser.log`). Earlier bundling logs remain in `.codex-logs/o2-definition/`.
