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
const HID_JOYSTICK_MODE = 0; // Mode 0 = HID Joystick

type JoystickPosition = {x: number; y: number};

const JoystickPane = styled(Pane)`
  display: flex;
  height: 100%;
  max-width: 100vw;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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
        X: {position.x.toFixed(3)} &nbsp; Y: {position.y.toFixed(3)}
      </CoordLabel>
    </JoystickWrapper>
  );
};

export const Joystick: FC = () => {
  const api = useAppSelector(getSelectedKeyboardAPI);

  const [leftPos, setLeftPos] = useState<JoystickPosition>({x: 0, y: 0});
  const [rightPos, setRightPos] = useState<JoystickPosition>({x: 0, y: 0});
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState<string>('');
  const [modeStatus, setModeStatus] = useState<string>('');

  const prevLeftModeRef = useRef<number | null>(null);
  const prevRightModeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number>(0);
  const isActiveRef = useRef(true);

  // Set joystick modes to HID Joystick on mount, restore on unmount
  useEffect(() => {
    if (!api) return;

    let cancelled = false;

    const activateRawMode = async () => {
      try {
        setModeStatus('Reading current joystick modes...');

        // Read current modes
        const leftModeRes = await api.getCustomMenuValue([
          JOYSTICK_CHANNEL,
          LEFT_MODE_ID,
        ]);
        const rightModeRes = await api.getCustomMenuValue([
          JOYSTICK_CHANNEL,
          RIGHT_MODE_ID,
        ]);

        // getCustomMenuValue returns res.slice(commandBytes.length)
        // For commandBytes [0, 1], response is [command, channel, id, value, ...]
        // After slicing by commandBytes.length (2), we get [id, value, ...]
        // So the actual value is at index 1 (index 0 is the echoed id)
        const leftMode = leftModeRes[1];
        const rightMode = rightModeRes[1];

        if (cancelled) return;

        prevLeftModeRef.current = leftMode;
        prevRightModeRef.current = rightMode;

        setModeStatus(
          `Previous modes — Left: ${getModeName(leftMode)}, Right: ${getModeName(rightMode)}. Switching to HID Joystick...`,
        );

        // Set both to HID Joystick mode (mode 0)
        if (leftMode !== HID_JOYSTICK_MODE) {
          await api.setCustomMenuValue(
            JOYSTICK_CHANNEL,
            LEFT_MODE_ID,
            HID_JOYSTICK_MODE,
          );
        }
        if (rightMode !== HID_JOYSTICK_MODE) {
          await api.setCustomMenuValue(
            JOYSTICK_CHANNEL,
            RIGHT_MODE_ID,
            HID_JOYSTICK_MODE,
          );
        }

        if (!cancelled) {
          setModeStatus(
            `Both joysticks set to HID Joystick mode. Previous — Left: ${getModeName(leftMode)}, Right: ${getModeName(rightMode)}`,
          );
        }
      } catch (e) {
        console.error('Failed to set joystick modes:', e);
        if (!cancelled) {
          setModeStatus('Failed to set joystick modes. Is a device connected?');
        }
      }
    };

    activateRawMode();

    return () => {
      cancelled = true;
      // Restore previous modes on unmount
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

  // Poll Gamepad API for joystick data
  const pollGamepad = useCallback(() => {
    if (!isActiveRef.current) return;

    const gamepads = navigator.getGamepads();
    let found = false;

    for (const gp of gamepads) {
      if (gp && gp.axes.length >= 2) {
        found = true;
        setGamepadConnected(true);
        setGamepadName(gp.id);

        // Standard mapping: axes[0]=LX, axes[1]=LY, axes[2]=RX, axes[3]=RY
        const lx = gp.axes[0] ?? 0;
        const ly = gp.axes[1] ?? 0;
        const rx = gp.axes.length >= 4 ? (gp.axes[2] ?? 0) : 0;
        const ry = gp.axes.length >= 4 ? (gp.axes[3] ?? 0) : 0;

        // Clamp to unit circle
        const clamp = (x: number, y: number): JoystickPosition => {
          const mag = Math.sqrt(x * x + y * y);
          if (mag > 1) {
            return {x: x / mag, y: y / mag};
          }
          return {x, y};
        };

        setLeftPos(clamp(lx, ly));
        setRightPos(clamp(rx, ry));
        break; // Use first gamepad found
      }
    }

    if (!found) {
      setGamepadConnected(false);
      setGamepadName('');
    }

    animFrameRef.current = requestAnimationFrame(pollGamepad);
  }, []);

  useEffect(() => {
    isActiveRef.current = true;
    animFrameRef.current = requestAnimationFrame(pollGamepad);

    const handleConnect = () => {
      // Gamepad connected event - polling will pick it up
    };
    const handleDisconnect = () => {
      setGamepadConnected(false);
      setGamepadName('');
    };

    window.addEventListener('gamepadconnected', handleConnect);
    window.addEventListener('gamepaddisconnected', handleDisconnect);

    return () => {
      isActiveRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('gamepadconnected', handleConnect);
      window.removeEventListener('gamepaddisconnected', handleDisconnect);
    };
  }, [pollGamepad]);

  return (
    <JoystickPane>
      <Title>Joystick Monitor</Title>
      <StatusBar>
        <span>
          <StatusDot $connected={gamepadConnected} />
          {gamepadConnected
            ? `Gamepad: ${gamepadName}`
            : 'No gamepad detected — move a joystick to connect'}
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
