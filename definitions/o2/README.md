# O2 VIA definition

`via.json` is the unchanged asset from the QMK firmware
[v2.2.0 release](https://github.com/stanley50z/qmk_firmware/releases/tag/v2.2.0).
Its SHA-256 is `12adeb98fdfbe51d9240c79a7b9a892816c9425e61370caae33230b1cf7b78c4`.

The source and its converted autoload asset,
`public/definitions/v3/1330839554.json`, are both kept in Git. Other generated
keyboard definitions stay ignored. Dev and production builds generate the
upstream definitions alongside the bundled O2 asset; no release download is
needed during builds.

To update, download `via.json` from a specific firmware release into this
directory, then run from the VIA repository root:

```bash
node -e 'const fs=require("fs"); const {keyboardDefinitionV3ToVIADefinitionV3}=require("@the-via/reader"); const source=JSON.parse(fs.readFileSync("definitions/o2/via.json","utf8")); fs.writeFileSync("public/definitions/v3/1330839554.json",JSON.stringify(keyboardDefinitionV3ToVIADefinitionV3(source),null,2)+"\n");'
bun run test
bun run build
```

Update the release and checksum recorded here and in `tests/o2-definition.test.ts`
when intentionally upgrading. Review changes to menus, custom keycodes, and
layout before accepting them. This asset is a V3 definition; legacy V2 definition
handling is unchanged. Hardware compatibility has not been retested as part of
bundling it.

Verification logs and failure stack traces are persisted in
`.codex-logs/o2-definition/` (`tests.log`, `build.log`, and focused test logs).
