# Original O2 speed-curve default

[VIA issue #2](https://github.com/stanley50z/via/issues/2) now uses an eight-point approximation of the actual pre-custom-curve O2 response, replacing the unverified `x^1.6` preset. Hardware feel verification is still pending.

The baseline is firmware revision `6ee11479ceb67cd071f6b93989c852f0db0d4c3b`. Its `os_joystick.h` contains the 101-entry `ANALOG_JOYSTICK_WEIGHTS` table. Its per-axis report is `trunc(weight * sign * sensitivity / 1280)`, after truncating deflection to integer percentages and applying the 10% per-axis cutoff. Default sensitivity was 128 on both sides, with a 5 ms pointing-device throttle.

VIA's existing **QMK Default** button now packs these exact bytes, matching the companion firmware's startup and EEPROM defaults:

```text
X: 0, 38, 67, 162, 207, 224, 239, 255
Y: 0, 46, 57,  69, 120, 160, 200, 255
```

The name is retained for continuity; the tooltip identifies it as an O2 approximation, not a universal QMK profile. No layout or styling changes were made.

## Behavior

- Loading the editor reads both firmware curves. Valid saved linear/custom curves remain unchanged; there is no migration or firmware EEPROM version bump.
- Side changes update the highlighted preset to match that side's curve.
- Selecting a preset edits a draft only. Save Left/Right Curve writes that side; Save Both writes both current drafts. Select QMK Default separately on each side before Save Both if both should change.
- Firmware **Restore Defaults** uses the new curve for both sides and also resets the other settings. It restores sensitivity to 128/128 for the `via` keymap or 67/255 for `stanley50z`.
- The editor's floating-point spline is a visual aid, not an exact pointer-report model. The movement predictor uses the actual fixed-point rules. The fit deliberately preserves those existing rules so saved custom curves keep their behavior.

## Validation

The source, fit method, tolerance rationale, migration policy, numerical table, and hardware checklist are recorded in the companion checkout at `../qmk_firmware/keyboards/os_keyboard_beta/docs/mouse-default-response.md`.

The fit stays within **one report count per axis** of the baseline for every integer deflection and sensitivity 0–255 on both sides. At sensitivity 128, 96/101 nonnegative input percentages match exactly; at 255, 88/101 match. Repeated one-count errors can affect feel, so this is not a claim of hardware equivalence.

`tests/fixtures/speed-curve-default.json` captures the real compiled C reports, baseline weights, source hash, and metrics. Regenerate it from the QMK root with:

```text
python keyboards/os_keyboard_beta/tests/compare_speed_curve_default.py
```

Review numerical changes before replacing that fixture. `tests/speed-curve-default.test.ts` checks preset packing and the movement predictor against the captured signed reports at sensitivities 32, 67, 128, 192, and 255.

Software checks on 2026-10-17:

- 59 VIA tests and the production build passed.
- 91 firmware tests passed, including fresh/reset EEPROM defaults and preservation of saved linear curves.
- Both `os_keyboard_beta/o2` keymaps (`via`, `stanley50z`) compiled.
- Desktop browser walkthrough passed for loading different saved curves, matching each side's preset label, draft-only preset selection, Save Right Curve, Save Both, and reload without writes. This used the real editor with a simulated HID boundary and C-measured curve bytes, not attached hardware. Screenshots are `red.png` and `green.png` in the log directory. Background-tab CSS transitions stalled in Chrome; disabling transitions in the throwaway test page resolved misleading color checks. No product animation/style change was needed.

### Review

**Standards:** No documented-standard violations. Review caught a possible asynchronous preset-label race; the final implementation derives the label directly from the visible points instead of storing a second copy of that state. Repeated firmware default literals remain guarded by startup/reset byte tests.

**Spec:** No software defects or scope creep found. An independent reviewer verified baseline provenance, regenerated the numerical fixture, and reran the exhaustive response tests. Hardware acceptance remains incomplete.

Persistent logs and browser evidence are in `C:/OS Keyboard/code/via/.codex-logs/issue-2/`. Test/build logs retain errors and stack traces; the host harness does not generate native crash dumps. Hardware flash/reset, pointer feel, USB persistence, and split synchronization still require the checklist above. Hardware validation remains tracked separately in issue #3; closing issue #2 does not certify hardware results.
