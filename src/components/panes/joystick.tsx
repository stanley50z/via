import React, {FC, useEffect, useRef, useState, useCallback} from 'react';
import styled from 'styled-components';
import {Pane} from './pane';
import {useAppSelector} from 'src/store/hooks';
import {getSelectedKeyboardAPI} from 'src/store/devicesSlice';
import {SpeedCurveEditor} from './speed-curve-editor';

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

const CIRCLE_RADIUS = 120;
const DOT_RADIUS = 10;

const JoystickCircle: FC<{
  position: JoystickPosition;
  label: string;
}> = ({position, label}) => {
  const size = CIRCLE_RADIUS * 2 + 40;
  const center = size / 2;

  // Map -1..1 to pixel coordinates within the circle
  const dotX = center + position.x * CIRCLE_RADIUS;
  const dotY = center + position.y * CIRCLE_RADIUS;

  return (
    <JoystickWrapper>
      <JoystickLabel>{label}</JoystickLabel>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
        {/* Inner dead zone circle */}
        <circle
          cx={center}
          cy={center}
          r={CIRCLE_RADIUS * 0.15}
          fill="none"
          stroke="var(--color_accent)"
          strokeWidth={1}
          opacity={0.15}
          strokeDasharray="4 4"
        />
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
        X: {Math.round(position.x * 100)}% &nbsp; Y: {Math.round(position.y * 100)}%
      </CoordLabel>
    </JoystickWrapper>
  );
};

export const Joystick: FC = () => {
  const api = useAppSelector(getSelectedKeyboardAPI);

  const [leftPos, setLeftPos] = useState<JoystickPosition>({x: 0, y: 0});
  const [rightPos, setRightPos] = useState<JoystickPosition>({x: 0, y: 0});
  const [connected, setConnected] = useState(false);
  const [modeStatus, setModeStatus] = useState<string>('');
  const [leftSens, setLeftSens] = useState(128);
  const [rightSens, setRightSens] = useState(128);

  const prevLeftModeRef = useRef<number | null>(null);
  const prevRightModeRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
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

        setModeStatus(
          `Previous modes — Left: ${getModeName(leftMode)}, Right: ${getModeName(rightMode)}. Switching to Mouse mode...`,
        );

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

        if (!cancelledRef.current) {
          setLeftSens(lSensRes[1]);
          setRightSens(rSensRes[1]);
          setConnected(true);
          setModeStatus(
            `Both joysticks set to Mouse mode. Previous — Left: ${getModeName(leftMode)}, Right: ${getModeName(rightMode)}`,
          );
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

  // Poll raw joystick axes via HID custom command
  useEffect(() => {
    if (!api || !connected) return;

    pollingRef.current = true;

    const poll = async () => {
      while (pollingRef.current) {
        try {
          const res = await api.getCustomMenuValue([
            JOYSTICK_CHANNEL,
            RAW_AXES_ID,
          ]);
          // res[0] = echoed value_id, res[1..4] = signed percentages (-100..100) as int8
          const toSigned = (v: number) => (v > 127 ? v - 256 : v);
          const lx = toSigned(res[1]);
          const ly = toSigned(res[2]);
          const rx = toSigned(res[3]);
          const ry = toSigned(res[4]);

          setLeftPos({x: lx / 100, y: ly / 100});
          setRightPos({x: rx / 100, y: ry / 100});
        } catch {
          // Device may have disconnected
        }
        // ~30fps polling rate
        await new Promise((r) => setTimeout(r, 33));
      }
    };

    poll();

    return () => {
      pollingRef.current = false;
    };
  }, [api, connected]);

  const handleSensChange = useCallback(
    async (side: 'left' | 'right', value: number) => {
      if (side === 'left') setLeftSens(value);
      else setRightSens(value);

      if (!api) return;
      try {
        const id = side === 'left' ? LEFT_SENS_ID : RIGHT_SENS_ID;
        await api.setCustomMenuValue(JOYSTICK_CHANNEL, id, value);
      } catch {
        // ignore
      }
    },
    [api],
  );

  return (
    <JoystickPane>
      <Title>Mouse Sensitivity</Title>
      <StatusBar>
        <span>
          <StatusDot $connected={connected} />
          {connected
            ? 'Connected — joysticks in Mouse mode'
            : 'Connecting...'}
        </span>
      </StatusBar>
      {modeStatus && (
        <StatusBar style={{fontSize: 12, opacity: 0.6}}>
          {modeStatus}
        </StatusBar>
      )}
      <JoystickContainer>
        <JoystickCircle position={leftPos} label="Left Joystick" />
        <JoystickCircle position={rightPos} label="Right Joystick" />
      </JoystickContainer>
      <SensContainer>
        <SensGroup>
          <SensLabel>Left Sensitivity</SensLabel>
          <SensSlider
            type="range"
            min={20}
            max={249}
            value={leftSens}
            onChange={(e) => handleSensChange('left', Number(e.target.value))}
          />
          <SensValue>{leftSens}</SensValue>
        </SensGroup>
        <SensGroup>
          <SensLabel>Right Sensitivity</SensLabel>
          <SensSlider
            type="range"
            min={20}
            max={249}
            value={rightSens}
            onChange={(e) => handleSensChange('right', Number(e.target.value))}
          />
          <SensValue>{rightSens}</SensValue>
        </SensGroup>
      </SensContainer>
      <Divider />
      <SpeedCurveEditor api={api} />
    </JoystickPane>
  );
};

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
      return `Unknown (${mode})`;
  }
}
