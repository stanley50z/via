# Todo

Reviewed against VIA `20d5fd4` and local firmware `ec1364e0e5`. None of these items is fully verified as complete.

- [ ] [#1: Auto-load the beta O2 VIA definition from a clean build](https://github.com/stanley50z/via/issues/1)
  - Registration exists and local definition URLs work, but the definition files are untracked. Verify reproducible packaging and automatic loading on beta hardware without a manual `via.json` import.
- [ ] [#3: Verify joystick fine-tuning end to end on O2 hardware](https://github.com/stanley50z/via/issues/3)
  - UI and firmware paths exist. Automated contract tests and real-device validation are still needed; a successful build does not prove pointer behavior or persistence.
- [ ] [#2: Match the original joystick mouse response in default speed curves](https://github.com/stanley50z/via/issues/2)
  - Firmware defaults remain linear. The UI's QMK Default preset is a heuristic, not a measured match to the original implementation.
