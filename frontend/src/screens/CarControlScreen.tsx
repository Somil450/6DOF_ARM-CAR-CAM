import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Car,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  RotateCcw,
  Compass,
  AlertTriangle,
  Info,
  Shield,
  Activity,
  Keyboard,
  ShieldAlert
} from 'lucide-react';

type DriveDirection = 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT';

export const CarControlScreen: React.FC = () => {
  const { telemetry, sendCarCommand, clearEmergencyStop } = useRobotStore();
  const [activeDrivingCmd, setActiveDrivingCmd] = useState<DriveDirection | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  
  const activeDrivingRef = useRef<DriveDirection | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const car = telemetry?.car;
  const devCar = telemetry?.devices?.car;
  const isEmergencyStop = telemetry?.emergency_stop;
  const isArmActive = car?.state === 'PICKUP_STARTED' || car?.state === 'REVERSE_20_ACTIVE';

  // Continuous hold-to-drive loop (100ms keepalive stream)
  const startContinuousDriving = useCallback((dir: DriveDirection) => {
    // Auto-clear emergency stop if operator drives
    if (isEmergencyStop) {
      clearEmergencyStop();
    }

    if (activeDrivingRef.current === dir) return;

    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }

    activeDrivingRef.current = dir;
    setActiveDrivingCmd(dir);

    // Initial instant dispatch with force=true for immediate response
    inFlightRef.current = true;
    sendCarCommand(dir, true).finally(() => {
      inFlightRef.current = false;
    });

    // 100ms stream keepalive so car drives continuously without stutter
    keepAliveIntervalRef.current = setInterval(() => {
      if (activeDrivingRef.current === dir && !inFlightRef.current) {
        inFlightRef.current = true;
        sendCarCommand(dir, true).finally(() => {
          inFlightRef.current = false;
        });
      }
    }, 100);
  }, [isEmergencyStop, clearEmergencyStop, sendCarCommand]);

  // Clean stop on release
  const stopContinuousDriving = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    const hadActive = activeDrivingRef.current !== null;
    activeDrivingRef.current = null;
    setActiveDrivingCmd(null);
    inFlightRef.current = false;

    if (hadActive) {
      sendCarCommand('STOP', true);
    }
  }, [sendCarCommand]);

  // Discrete action clicks (STOP, RESET)
  const handleDiscreteClick = async (cmd: string) => {
    stopContinuousDriving();
    if (cmd === 'RESET' && isEmergencyStop) {
      await clearEmergencyStop();
    }
    const success = await sendCarCommand(cmd, true);
    setFeedbackMsg(success ? `Sent ${cmd}` : `Failed ${cmd}`);
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  // Safety release on window blur or global pointer up
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (activeDrivingRef.current) {
        stopContinuousDriving();
      }
    };
    window.addEventListener('blur', handleGlobalRelease);
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('touchcancel', handleGlobalRelease);
    return () => {
      window.removeEventListener('blur', handleGlobalRelease);
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('touchcancel', handleGlobalRelease);
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
    };
  }, [stopContinuousDriving]);

  // Keyboard navigation listeners (W/A/S/D and Arrow Keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.repeat) return;

      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') {
        e.preventDefault();
        startContinuousDriving('FORWARD');
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        e.preventDefault();
        startContinuousDriving('BACKWARD');
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        e.preventDefault();
        startContinuousDriving('LEFT');
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        e.preventDefault();
        startContinuousDriving('RIGHT');
      } else if (code === 'Space' || code === 'KeyX') {
        e.preventDefault();
        stopContinuousDriving();
        sendCarCommand('STOP', true);
      } else if (code === 'KeyR') {
        e.preventDefault();
        stopContinuousDriving();
        handleDiscreteClick('RESET');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const code = e.code;
      const current = activeDrivingRef.current;
      if (
        (current === 'FORWARD' && (code === 'KeyW' || code === 'ArrowUp')) ||
        (current === 'BACKWARD' && (code === 'KeyS' || code === 'ArrowDown')) ||
        (current === 'LEFT' && (code === 'KeyA' || code === 'ArrowLeft')) ||
        (current === 'RIGHT' && (code === 'KeyD' || code === 'ArrowRight'))
      ) {
        e.preventDefault();
        stopContinuousDriving();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startContinuousDriving, stopContinuousDriving, sendCarCommand]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">CHASSIS & MOTOR CONTROLS</h1>
            <p className="text-xs text-text-muted font-mono">
              Driver: L298N Dual H-Bridge • Pins: IN1(25), IN2(26), IN3(27), IN4(14)
            </p>
          </div>
        </div>
        <div className="text-right font-mono text-xs">
          <div className="text-text-muted">STATE:</div>
          <div
            className={`font-bold ${
              car?.state === 'MOVING_ALLOWED' || car?.state === 'MOVING_FORWARD' || car?.state === 'MOVING_BACKWARD' || car?.state === 'TURNING_LEFT' || car?.state === 'TURNING_RIGHT'
                ? 'text-accent-green'
                : car?.state === 'PICKUP_STARTED' || car?.state === 'REVERSE_20_ACTIVE'
                ? 'text-accent-blue'
                : 'text-text-primary'
            }`}
          >
            {car?.state || 'READY'}
          </div>
        </div>
      </div>

      {/* Emergency Stop Banner & Quick Reset */}
      {isEmergencyStop && (
        <div className="p-3.5 rounded-xl bg-accent-red/20 border border-accent-red/40 text-accent-red flex items-center justify-between text-xs font-mono animate-fade-in shadow-lg">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 animate-pulse" />
            <div>
              <span className="font-bold">EMERGENCY STOP ENGAGED</span>
              <div className="text-[11px] text-accent-red/80 mt-0.5">
                Motion safety latch is active. Tap Reset to resume full control.
              </div>
            </div>
          </div>
          <button
            onClick={() => clearEmergencyStop()}
            className="px-3 py-1.5 bg-accent-yellow hover:bg-yellow-400 text-black font-bold text-xs rounded transition-all active:scale-95 shadow"
          >
            RESET E-STOP
          </button>
        </div>
      )}

      {/* Informative notice when arm is moving (Dual control active) */}
      {isArmActive && (
        <div className="p-3.5 rounded-xl bg-accent-blue/15 border border-accent-blue/30 text-accent-blue flex items-center space-x-3 text-xs font-mono">
          <Activity className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-bold">ARM SEQUENCE RUNNING ({car?.state}) • DUAL CONTROL ACTIVE</span>
            <div className="text-[11px] text-accent-blue/80 mt-0.5">
              Simultaneous control active: You can drive the chassis freely while the arm is operating.
            </div>
          </div>
        </div>
      )}

      {/* Distance & Telemetry Display */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Distance Card */}
        <div className="p-4 rounded-xl bg-surface-primary border border-surface-border text-center">
          <div className="text-xs font-semibold text-text-secondary flex items-center justify-center space-x-1.5">
            <Compass className="w-3.5 h-3.5 text-text-muted" />
            <span>ULTRASONIC PROXIMITY</span>
          </div>
          <div className="my-2">
            {car?.distance_cm !== null && car?.distance_cm !== undefined && car?.distance_fresh ? (
              <span className="text-3xl font-extrabold font-mono text-white">
                {car.distance_cm.toFixed(1)} <span className="text-sm text-text-muted">cm</span>
              </span>
            ) : (
              <span className="text-lg font-mono text-text-muted">
                {car?.online ? 'CLEAR (>40cm)' : 'STANDBY'}
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-text-muted">
            Safety Cutoff: 25.0 cm
          </div>
        </div>

        {/* Current Motor State Card */}
        <div className="p-4 rounded-xl bg-surface-primary border border-surface-border text-center">
          <div className="text-xs font-semibold text-text-secondary flex items-center justify-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-text-muted" />
            <span>MOTOR STATUS</span>
          </div>
          <div className="my-2">
            <span
              className={`text-xl font-bold font-mono ${
                activeDrivingCmd
                  ? 'text-accent-green'
                  : 'text-text-secondary'
              }`}
            >
              {activeDrivingCmd ? `MOVING ${activeDrivingCmd}` : 'MOTORS STOPPED'}
            </span>
          </div>
          <div className="text-[11px] font-mono text-text-muted">
            Last Command: {car?.last_command || 'NONE'}
          </div>
        </div>

        {/* Device Network Card */}
        <div className="p-4 rounded-xl bg-surface-primary border border-surface-border text-center">
          <div className="text-xs font-semibold text-text-secondary flex items-center justify-center space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-text-muted" />
            <span>COMMUNICATION</span>
          </div>
          <div className="my-2 text-sm font-mono text-white">
            {devCar?.online ? (
              <span className="text-accent-green font-semibold">ONLINE ({devCar.latency_ms || 0} ms)</span>
            ) : (
              <span className="text-accent-green font-semibold">CONNECTED (READY)</span>
            )}
          </div>
          <div className="text-[11px] font-mono text-text-muted truncate">
            IP: {devCar?.ip || '10.228.168.44'}:80
          </div>
        </div>
      </div>

      {/* Directional Drive Control D-Pad */}
      <div className="p-6 rounded-xl bg-surface-primary border border-surface-border flex flex-col items-center justify-center">
        <div className="text-xs font-semibold text-text-secondary font-mono mb-2 text-center">
          HOLD TO DRIVE • CONTINUOUS MOTION (RELEASING STOPS)
        </div>
        <div className="flex items-center space-x-2 text-[11px] text-text-muted font-mono mb-6">
          <Keyboard className="w-3.5 h-3.5 text-accent-blue" />
          <span>Keyboard enabled: W/A/S/D or Arrow keys • Space to stop • R to reset</span>
        </div>

        {/* 3x3 D-Pad Matrix */}
        <div className="grid grid-cols-3 gap-3 w-72 sm:w-84 max-w-full">
          {/* Row 1: Empty, FORWARD, Empty */}
          <div />
          <button
            onPointerDown={(e) => { e.preventDefault(); startContinuousDriving('FORWARD'); }}
            onPointerUp={(e) => { e.preventDefault(); stopContinuousDriving(); }}
            onPointerLeave={() => stopContinuousDriving()}
            onPointerCancel={() => stopContinuousDriving()}
            className={`h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm border transition-all active:scale-95 touch-none select-none cursor-pointer ${
              activeDrivingCmd === 'FORWARD'
                ? 'bg-accent-blue text-white border-blue-400 shadow-lg shadow-blue-900/60 scale-105'
                : 'bg-surface-secondary hover:bg-surface-elevated text-white border-surface-border'
            }`}
          >
            <ArrowUp className="w-6 h-6 mb-1" />
            <span>FORWARD</span>
            <span className="text-[10px] text-text-muted font-mono font-normal">W / ↑</span>
          </button>
          <div />

          {/* Row 2: LEFT, STOP, RIGHT */}
          <button
            onPointerDown={(e) => { e.preventDefault(); startContinuousDriving('LEFT'); }}
            onPointerUp={(e) => { e.preventDefault(); stopContinuousDriving(); }}
            onPointerLeave={() => stopContinuousDriving()}
            onPointerCancel={() => stopContinuousDriving()}
            className={`h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm border transition-all active:scale-95 touch-none select-none cursor-pointer ${
              activeDrivingCmd === 'LEFT'
                ? 'bg-accent-blue text-white border-blue-400 shadow-lg shadow-blue-900/60 scale-105'
                : 'bg-surface-secondary hover:bg-surface-elevated text-white border-surface-border'
            }`}
          >
            <ArrowLeft className="w-6 h-6 mb-1" />
            <span>LEFT</span>
            <span className="text-[10px] text-text-muted font-mono font-normal">A / ←</span>
          </button>

          <button
            onClick={() => { stopContinuousDriving(); handleDiscreteClick('STOP'); }}
            className="h-20 rounded-2xl bg-surface-elevated hover:bg-surface-border text-white border border-surface-border flex flex-col items-center justify-center text-xs sm:text-sm font-bold transition-all active:scale-95 cursor-pointer"
          >
            <Square className="w-5 h-5 text-accent-red mb-1 fill-accent-red/20" />
            <span>STOP</span>
            <span className="text-[10px] text-text-muted font-mono font-normal">SPACE</span>
          </button>

          <button
            onPointerDown={(e) => { e.preventDefault(); startContinuousDriving('RIGHT'); }}
            onPointerUp={(e) => { e.preventDefault(); stopContinuousDriving(); }}
            onPointerLeave={() => stopContinuousDriving()}
            onPointerCancel={() => stopContinuousDriving()}
            className={`h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm border transition-all active:scale-95 touch-none select-none cursor-pointer ${
              activeDrivingCmd === 'RIGHT'
                ? 'bg-accent-blue text-white border-blue-400 shadow-lg shadow-blue-900/60 scale-105'
                : 'bg-surface-secondary hover:bg-surface-elevated text-white border-surface-border'
            }`}
          >
            <ArrowRight className="w-6 h-6 mb-1" />
            <span>RIGHT</span>
            <span className="text-[10px] text-text-muted font-mono font-normal">D / →</span>
          </button>

          {/* Row 3: RESET, BACKWARD, Empty */}
          <button
            onClick={() => { stopContinuousDriving(); handleDiscreteClick('RESET'); }}
            className="h-20 rounded-2xl bg-surface-secondary hover:bg-surface-elevated text-text-primary border border-surface-border flex flex-col items-center justify-center text-xs font-bold transition-all active:scale-95 cursor-pointer"
            title="Resets car cycle and informs Arm via UDP"
          >
            <RotateCcw className="w-5 h-5 text-accent-yellow mb-1" />
            <span>RESET</span>
            <span className="text-[10px] text-text-muted font-mono font-normal">R</span>
          </button>

          <button
            onPointerDown={(e) => { e.preventDefault(); startContinuousDriving('BACKWARD'); }}
            onPointerUp={(e) => { e.preventDefault(); stopContinuousDriving(); }}
            onPointerLeave={() => stopContinuousDriving()}
            onPointerCancel={() => stopContinuousDriving()}
            className={`h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm border transition-all active:scale-95 touch-none select-none cursor-pointer ${
              activeDrivingCmd === 'BACKWARD'
                ? 'bg-accent-blue text-white border-blue-400 shadow-lg shadow-blue-900/60 scale-105'
                : 'bg-surface-secondary hover:bg-surface-elevated text-white border-surface-border'
            }`}
          >
            <ArrowDown className="w-6 h-6 mb-1" />
            <span>BACKWARD</span>
            <span className="text-[10px] text-text-muted font-mono font-normal">S / ↓</span>
          </button>

          <div />
        </div>

        {feedbackMsg && (
          <div className="mt-4 text-xs font-mono text-accent-blue animate-fade-in">
            {feedbackMsg}
          </div>
        )}
      </div>

      {/* Hardware & Safety Notice Card */}
      <div className="p-4 rounded-xl bg-surface-secondary border border-surface-border text-xs text-text-secondary space-y-2">
        <div className="flex items-center space-x-2 text-white font-semibold">
          <Info className="w-4 h-4 text-accent-blue" />
          <span>DUAL ARM & CHASSIS CONTROL WITH ACTIVE PROXIMITY CUTOFF</span>
        </div>
        <p className="font-mono text-[11px] leading-relaxed">
          The chassis uses an L298N dual H-bridge motor driver with pivot steering: Left command drives left motors while stopping both right motors; Right command drives right motors while stopping both left motors.
          Holding down any direction continuously streams keep-alive packets at 100ms intervals.
          Manual driving commands are always accessible regardless of arm activity, allowing seamless simultaneous operation of both the arm and car.
          Ultrasonic collision prevention remains active with a 25.0 cm safety threshold.
        </p>
      </div>
    </div>
  );
};
