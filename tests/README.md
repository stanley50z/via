# Joystick Mouse Mode tests

## Hardware safety

Never change a physically connected keyboard's settings for testing. This includes
mode switches, sensitivity or curve writes, saves, resets, and restore commands.
Use offline firmware fixtures or explicitly simulated HID devices only. Browser
checks must run in an isolated context with real WebHID access blocked before
application code loads; do not test through the user's live VIA session.

Run `bun run test` from the VIA checkout. No keyboard or C compiler is needed for
these tests.

`fixtures/joystick-mouse.json` contains 7,035 reports captured by compiling the
current O2 firmware's `speed_curve_compute_tangents`, `speed_curve_lookup`, and
`adc_to_mouse_report` functions with a host C compiler. It records a SHA-256 of
those functions. It covers signed percentages -100 through 100, seven curves,
and sensitivities 0, 20, 67, 128, and 255. The response model deliberately retains
the firmware's fixed-point rounding and tangent scaling; the editor's smooth
floating-point preview is not the source of truth for the shaded region.

To recapture after an intentional firmware change:

```bash
python tests/capture-firmware-mouse.py ../qmk_firmware --cc gcc
bun run test
```

Pass the absolute path to a host GCC with `--cc` if it is not on PATH. The capture
script requires the O2 12-bit axis configuration (maximum 2047). Review changed
reference data against the firmware change before accepting it.

The tests also cover the 19%/sensitivity-67 regression, independent axis cutoffs,
non-monotone curves with disjoint no-movement bands, raised origins that cause
drift, and invalid firmware settings. The indicator describes each joystick's
contribution; opposing reports from both joysticks can still cancel each other.
