# Todo

Original review: VIA `20d5fd4` and firmware `ec1364e0e5`. Software completion and outstanding hardware validation are noted separately below.

- [ ] [#1: Auto-load the beta O2 VIA definition from a clean build](https://github.com/stanley50z/via/issues/1)
  - Registration exists and local definition URLs work, but the definition files are untracked. Verify reproducible packaging and automatic loading on beta hardware without a manual `via.json` import.
- [ ] [#3: Verify joystick fine-tuning end to end on O2 hardware](https://github.com/stanley50z/via/issues/3)
  - UI and firmware paths exist. Automated contract tests and real-device validation are still needed; a successful build does not prove pointer behavior or persistence.
- [x] [#2: Match the original joystick mouse response in default speed curves](https://github.com/stanley50z/via/issues/2)
  - Closed at maintainer request after software implementation and automated validation on 2026-10-17; hardware feel and on-device persistence/reset checks remain pending under #3. The fitted preset/defaults stay within one report count of the original at every integer deflection and sensitivity. See `docs/joystick-default-response.md`.
