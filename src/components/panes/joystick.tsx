import React, {
  FC,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import styled from 'styled-components';
import {useTranslation} from 'react-i18next';
import {Pane} from './pane';
import {useAppSelector} from 'src/store/hooks';
import {getSelectedKeyboardAPI} from 'src/store/devicesSlice';
import {SpeedCurveEditor} from './speed-curve-editor';
import type {KeyboardAPI} from 'src/utils/keyboard-api';
import {createMouseResponse} from 'src/utils/joystick-mouse';
import type {JoystickSide} from 'src/utils/joystick-mouse';

// Custom menu channel and IDs for joystick modes (from keyboard definition)
const JOYSTICK_CHANNEL = 0;
const LEFT_MODE_ID = 1;
const RIGHT_MODE_ID = 2;
const MOUSE_MODE = 2; // Mode 2 = Pointing Device (mouse)
const RAW_AXES_ID = 32; // 4 bytes: signed percentages [Lx, Ly, Rx, Ry]
const LEFT_SENS_ID = 17;
const RIGHT_SENS_ID = 18;

type JoystickPosition = {x: number; y: number};

const JoystickPane = styled(Pane)`
  display: flex;
  height: 100%;
  max-width: 100vw;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  padding-bottom: 40px;
`;

const JoystickContainer = styled.div`
  display: flex;
  gap: 80px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  padding: 40px;
`;

const JoystickWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`;

const JoystickLabel = styled.div`
  color: var(--color_label);
  font-size: 18px;
  font-weight: 500;
`;

const CoordLabel = styled.div`
  color: var(--color_label);
  font-size: 13px;
  font-family: monospace;
  opacity: 0.7;
`;

const StatusBar = styled.div`
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: var(--color_label);
  font-size: 14px;
`;

const StatusDot = styled.span<{$connected: boolean}>`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => (p.$connected ? '#4caf50' : '#f44336')};
  margin-right: 6px;
`;

const Title = styled.h2`
  color: var(--color_label);
  font-size: 24px;
  font-weight: 400;
  margin: 0 0 8px 0;
`;

const Divider = styled.hr`
  width: 80%;
  max-width: 600px;
  border: none;
  border-top: 1px solid var(--color_accent);
  opacity: 0.2;
  margin: 16px 0;
`;

const SensContainer = styled.div`
  display: flex;
  gap: 40px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  padding: 0 40px;
`;

const SensGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 200px;
`;

const SensLabel = styled.div`
  color: var(--color_label);
  font-size: 14px;
  font-weight: 500;
`;

const SensValue = styled.div`
  color: var(--color_label);
  font-size: 13px;
  font-family: monospace;
  opacity: 0.7;
`;

const SensSlider = styled.input`
  width: 200px;
  accent-color: var(--color_accent);
`;

const IndicatorNote = styled.div`
  color: var(--color_label);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  max-width: 280px;
`;

const CIRCLE_RADIUS = 120;
const DOT_RADIUS = 10;

// Shades the Cartesian product of the axes' no-movement bands, not a radial dead zone.
const JoystickCircle: FC<{
  position: JoystickPosition;
  label: string;
  curve: number[] | null;
  sensitivity: number;
}> = ({position, label, curve, sensitivity}) => {
  const {t} = useTranslation();
  const response = useMemo(
    () => curve && createMouseResponse(curve, sensitivity),
    [curve, sensitivity],
  );
  const moving =
    response &&
    (response.axisOutput(Math.round(position.x * 100)) !== 0 ||
      response.axisOutput(Math.round(position.y * 100)) !== 0);
  const size = CIRCLE_RADIUS * 2 + 40;
  const center = size / 2;

  // Map -1..1 to pixel coordinates within the circle
  const dotX = center + position.x * CIRCLE_RADIUS;
  const dotY = center + position.y * CIRCLE_RADIUS;

  return (
    <JoystickWrapper>
      <JoystickLabel>{label}</JoystickLabel>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={t('{{label}} input and no-movement region', {label})}
      >
        {/* Outer circle */}
        <circle
          cx={center}
          cy={center}
          r={CIRCLE_RADIUS}
          fill="none"
          stroke="var(--color_accent)"
          strokeWidth={2}
          opacity={0.5}
        />
        {/* Cross hairs */}
        <line
          x1={center - CIRCLE_RADIUS}
          y1={center}
          x2={center + CIRCLE_RADIUS}
          y2={center}
          stroke="var(--color_accent)"
          strokeWidth={1}
          opacity={0.2}
        />
        <line
          x1={center}
          y1={center - CIRCLE_RADIUS}
          x2={center}
          y2={center + CIRCLE_RADIUS}
          stroke="var(--color_accent)"
          strokeWidth={1}
          opacity={0.2}
        />
        <g aria-label={t('No-movement region')}>
          {response?.noMovementRanges.flatMap((x) =>
            response.noMovementRanges.map((y) => (
              <rect
                key={`${x.min},${y.min}`}
                x={center + (x.min * CIRCLE_RADIUS) / 100}
                y={center + (y.min * CIRCLE_RADIUS) / 100}
                width={((x.max - x.min) * CIRCLE_RADIUS) / 100}
                height={((y.max - y.min) * CIRCLE_RADIUS) / 100}
                fill="var(--color_accent)"
                fillOpacity={0.14}
                stroke="var(--color_accent)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            )),
          )}
        </g>
        {/* Position trail (faint) */}
        <line
          x1={center}
          y1={center}
          x2={dotX}
          y2={dotY}
          stroke="var(--color_accent)"
          strokeWidth={1}
          opacity={0.3}
        />
        {/* Joystick position dot */}
        <circle
          cx={dotX}
          cy={dotY}
          r={DOT_RADIUS}
          fill="var(--color_accent)"
          opacity={0.9}
        />
        {/* Center dot */}
        <circle
          cx={center}
          cy={center}
          r={3}
          fill="var(--color_accent)"
          opacity={0.4}
        />
      </svg>
      <CoordLabel>
        X: {Math.round(position.x * 100)}% &nbsp; Y:{' '}
        {Math.round(position.y * 100)}%
      </CoordLabel>
      <IndicatorNote>
        {response ? (
          <>
            <div>{t(moving ? 'Pointer movement' : 'No pointer movement')}</div>
            <div>
              {t('Shaded area: no pointer movement with saved settings.')}
            </div>
          </>
        ) : (
          t(
            'Movement indicator unavailable. Check the connection and read or save settings again.',
          )
        )}
      </IndicatorNote>
    </JoystickWrapper>
  );
};

// Reset the monitor and its saved settings whenever the selected device changes.
export const Joystick: FC = () => {
  const api = useAppSelector(getSelectedKeyboardAPI);
  return (
    <JoystickControls
      key={api ? api.kbAddr : 'disconnected'}
      api={api || null}
    />
  );
};

const JoystickControls: FC<{api: KeyboardAPI | null}> = ({api}) => {
  const {t} = useTranslation();
  const [leftPos, setLeftPos] = useState<JoystickPosition>({x: 0, y: 0});
  const [rightPos, setRightPos] = useState<JoystickPosition>({x: 0, y: 0});
  const [connected, setConnected] = useState(false);
  const [modeStatus, setModeStatus] = useState<
    string | {key: string; left: number; right: number}
  >('');
  const [leftSens, setLeftSens] = useState(128);
  const [rightSens, setRightSens] = useState(128);
  const [curves, setCurves] = useState<Record<JoystickSide, number[] | null>>({
    left: null,
    right: null,
  });
  const [sensKnown, setSensKnown] = useState({left: false, right: false});
  const [settingsError, setSettingsError] = useState('');
  const [axesAvailable, setAxesAvailable] = useState(false);
  const [axesError, setAxesError] = useState('');
  const onCurveApplied = useCallback(
    (side: JoystickSide, bytes: number[] | null) => {
      setCurves((previous) => ({...previous, [side]: bytes}));
    },
    [],
  );

  const prevLeftModeRef = useRef<number | null>(null);
  const prevRightModeRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // Set joystick modes to Mouse on mount, restore on unmount
  useEffect(() => {
    if (!api) return;

    cancelledRef.current = false;

    const activateMouseMode = async () => {
      try {
        setModeStatus('Reading current joystick modes...');

        const leftModeRes = await api.getCustomMenuValue([
          JOYSTICK_CHANNEL,
          LEFT_MODE_ID,
        ]);
        const rightModeRes = await api.getCustomMenuValue([
          JOYSTICK_CHANNEL,
          RIGHT_MODE_ID,
        ]);

        const leftMode = leftModeRes[1];
        const rightMode = rightModeRes[1];

        if (cancelledRef.current) return;

        prevLeftModeRef.current = leftMode;
        prevRightModeRef.current = rightMode;

        setModeStatus({
          key: 'Previous modes — Left: {{left}}, Right: {{right}}. Switching to Mouse mode...',
          left: leftMode,
          right: rightMode,
        });

        if (leftMode !== MOUSE_MODE) {
          await api.setCustomMenuValue(
            JOYSTICK_CHANNEL,
            LEFT_MODE_ID,
            MOUSE_MODE,
          );
        }
        if (rightMode !== MOUSE_MODE) {
          await api.setCustomMenuValue(
            JOYSTICK_CHANNEL,
            RIGHT_MODE_ID,
            MOUSE_MODE,
          );
        }

        // Load current sensitivity values
        const lSensRes = await api.getCustomMenuValue([
          JOYSTICK_CHANNEL,
          LEFT_SENS_ID,
        ]);
        const rSensRes = await api.getCustomMenuValue([
          JOYSTICK_CHANNEL,
          RIGHT_SENS_ID,
        ]);

        if (
          [lSensRes, rSensRes].some(
            (res) => !Number.isInteger(res[1]) || res[1] < 0 || res[1] > 255,
          )
        ) {
          throw new Error('Invalid mouse sensitivity response');
        }
        if (!cancelledRef.current) {
          setLeftSens(lSensRes[1]);
          setRightSens(rSensRes[1]);
          setSensKnown({left: true, right: true});
          setConnected(true);
          setModeStatus({
            key: 'Both joysticks set to Mouse mode. Previous — Left: {{left}}, Right: {{right}}',
            left: leftMode,
            right: rightMode,
          });
        }
      } catch (e) {
        console.error('Failed to set joystick modes:', e);
        if (!cancelledRef.current) {
          setModeStatus('Failed to set joystick modes. Is a device connected?');
        }
      }
    };

    activateMouseMode();

    return () => {
      cancelledRef.current = true;
      const restoreModes = async () => {
        try {
          if (prevLeftModeRef.current !== null) {
            await api.setCustomMenuValue(
              JOYSTICK_CHANNEL,
              LEFT_MODE_ID,
              prevLeftModeRef.current,
            );
          }
          if (prevRightModeRef.current !== null) {
            await api.setCustomMenuValue(
              JOYSTICK_CHANNEL,
              RIGHT_MODE_ID,
              prevRightModeRef.current,
            );
          }
        } catch (e) {
          console.error('Failed to restore joystick modes:', e);
        }
      };
      restoreModes();
    };
  }, [api]);

  // A lost or malformed raw-axes report invalidates live movement claims.
  useEffect(() => {
    if (!api || !connected) return;
    let active = true;
    const poll = async () => {
      while (active) {
        try {
          const res = await api.getCustomMenuValue([
            JOYSTICK_CHANNEL,
            RAW_AXES_ID,
          ]);
          const axes = res
            .slice(1, 5)
            .map((value) => (value > 127 ? value - 256 : value));
          if (
            res[0] !== RAW_AXES_ID ||
            axes.length !== 4 ||
            axes.some(
              (value) => !Number.isInteger(value) || Math.abs(value) > 100,
            )
          ) {
            throw new Error('Invalid joystick input response');
          }
          if (!active) return;
          setLeftPos({x: axes[0] / 100, y: axes[1] / 100});
          setRightPos({x: axes[2] / 100, y: axes[3] / 100});
          setAxesAvailable(true);
          setAxesError('');
        } catch {
          if (!active) return;
          setAxesAvailable(false);
          setAxesError(
            'Joystick input unavailable. Check the keyboard connection.',
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 33));
      }
    };
    void poll();
    return () => {
      active = false;
    };
  }, [api, connected]);

  const handleSensChange = useCallback(
    async (side: JoystickSide, value: number) => {
      if (!api) return;
      setSensKnown((previous) => ({...previous, [side]: false}));
      try {
        const id = side === 'left' ? LEFT_SENS_ID : RIGHT_SENS_ID;
        await api.setCustomMenuValue(JOYSTICK_CHANNEL, id, value);
        if (cancelledRef.current) return;
        if (side === 'left') setLeftSens(value);
        else setRightSens(value);
        setSensKnown((previous) => ({...previous, [side]: true}));
        setSettingsError('');
      } catch (error) {
        console.error(`Failed to set ${side} mouse sensitivity:`, error);
        if (cancelledRef.current) return;
        setSensKnown((previous) => ({...previous, [side]: false}));
        setSettingsError(
          'Sensitivity update failed. Reconnect or retry the slider to restore the movement indicator.',
        );
      }
    },
    [api],
  );

  return (
    <JoystickPane>
      <Title>{t('Mouse Sensitivity')}</Title>
      <StatusBar>
        <span>
          <StatusDot $connected={connected} />
          {t(
            connected ? 'Connected — joysticks in Mouse mode' : 'Connecting...',
          )}
        </span>
      </StatusBar>
      {modeStatus && (
        <StatusBar style={{fontSize: 12, opacity: 0.6}}>
          {typeof modeStatus === 'string'
            ? t(modeStatus)
            : t(modeStatus.key, {
                left: t(getModeName(modeStatus.left), {mode: modeStatus.left}),
                right: t(getModeName(modeStatus.right), {
                  mode: modeStatus.right,
                }),
              })}
        </StatusBar>
      )}
      {settingsError && <StatusBar role="alert">{t(settingsError)}</StatusBar>}
      {axesError && <StatusBar role="alert">{t(axesError)}</StatusBar>}
      <JoystickContainer>
        <JoystickCircle
          position={leftPos}
          label={t('Left Joystick')}
          curve={sensKnown.left && axesAvailable ? curves.left : null}
          sensitivity={leftSens}
        />
        <JoystickCircle
          position={rightPos}
          label={t('Right Joystick')}
          curve={sensKnown.right && axesAvailable ? curves.right : null}
          sensitivity={rightSens}
        />
      </JoystickContainer>
      <SensContainer>
        <SensGroup>
          <SensLabel>{t('Left Sensitivity')}</SensLabel>
          <SensSlider
            type="range"
            min={20}
            max={255}
            aria-label={t('Left mouse sensitivity')}
            disabled={!connected}
            value={leftSens}
            onChange={(e) => handleSensChange('left', Number(e.target.value))}
          />
          <SensValue>{leftSens}</SensValue>
        </SensGroup>
        <SensGroup>
          <SensLabel>{t('Right Sensitivity')}</SensLabel>
          <SensSlider
            type="range"
            min={20}
            max={255}
            aria-label={t('Right mouse sensitivity')}
            disabled={!connected}
            value={rightSens}
            onChange={(e) => handleSensChange('right', Number(e.target.value))}
          />
          <SensValue>{rightSens}</SensValue>
        </SensGroup>
      </SensContainer>
      <Divider />
      <SpeedCurveEditor api={api} onCurveApplied={onCurveApplied} />
    </JoystickPane>
  );
};

// Returns translation keys so language changes do not restart HID effects.
function getModeName(mode: number): string {
  switch (mode) {
    case 0:
      return 'HID Joystick';
    case 1:
      return 'Keypad';
    case 2:
      return 'Pointing Device';
    case 3:
      return 'Gaming';
    default:
      return 'Unknown ({{mode}})';
  }
}
