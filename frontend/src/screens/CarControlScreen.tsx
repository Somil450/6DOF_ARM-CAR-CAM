import React, { useState, useEffect, useRef } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Car,
  ArrowUp,
  ArrowDown,
  Square,
  RotateCcw,
  Compass,
  AlertTriangle,
  Info,
  Shield,
  Activity
} from 'lucide-react';

export const CarControlScreen: React.FC = () => {
  const { telemetry, sendCarCommand } = useRobotStore();
  const [activeDrivingCmd, setActiveDrivingCmd] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  
  const activeDrivingRef = useRef<string | null>(null);
  activeDrivingRef.current = activeDrivingCmd;

  const car = telemetry?.car;
  const devCar = telemetry?.devices.car;
  const isEmergencyStop = telemetry?.emergency_stop;
  const isLockedOut = car?.state === 'PICKUP_STARTED' || car?.state === 'REVERSE_20_ACTIVE';

  // Safety release on window blur or pointer cancel
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (activeDrivingRef.current) {
        setActiveDrivingCmd(null);
        sendCarCommand('STOP');
      }
    };
    window.addEventListener('blur', handleGlobalRelease);
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('touchcancel', handleGlobalRelease);
    return () => {
      window.removeEventListener('blur', handleGlobalRelease);
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('touchcancel', handleGlobalRelease);
    };
  }, [sendCarCommand]);

  const handlePointerDown = async (cmd: 'FORWARD' | 'BACKWARD') => {
    if (isEmergencyStop || isLockedOut) return;
    setActiveDrivingCmd(cmd);
    const success = await sendCarCommand(cmd);
    if (!success) {
      setActiveDrivingCmd(null);
    }
  };

  const handlePointerUp = async () => {
    if (activeDrivingCmd) {
      setActiveDrivingCmd(null);
      await sendCarCommand('STOP');
    }
  };

  const handleDiscreteClick = async (cmd: string) => {
    const success = await sendCarCommand(cmd);
    setFeedbackMsg(success ? `Sent ${cmd}` : `Failed ${cmd}`);
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

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
              car?.state === 'MOVING_ALLOWED'
                ? 'text-accent-green'
                : car?.state === 'PICKUP_STARTED' || car?.state === 'REVERSE_20_ACTIVE'
                ? 'text-accent-yellow'
                : 'text-text-primary'
            }`}
          >
            {car?.state || 'UNKNOWN'}
          </div>
        </div>
      </div>

      {/* Lockout Warning during pickup / reverse */}
      {isLockedOut && (
        <div className="p-3.5 rounded-xl bg-accent-yellow/15 border border-accent-yellow/30 text-accent-yellow flex items-center space-x-3 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-bold">FIRMWARE SEQUENCE ACTIVE: {car?.state}</span>
            <div className="text-[11px] text-accent-yellow/80 mt-0.5">
              The ESP32 is currently executing an autonomous pickup or 20cm reverse sequence. Manual drive commands are rejected by firmware until the cycle completes.
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
                {car?.online ? 'NO ECHO' : 'OFFLINE'}
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
              <span className="text-accent-red font-semibold">DISCONNECTED</span>
            )}
          </div>
          <div className="text-[11px] font-mono text-text-muted truncate">
            IP: {devCar?.ip || 'N/A'}:80
          </div>
        </div>
      </div>

      {/* Directional Drive Control Pad */}
      <div className="p-6 rounded-xl bg-surface-primary border border-surface-border flex flex-col items-center justify-center">
        <div className="text-xs font-semibold text-text-secondary font-mono mb-4 text-center">
          HOLD TO DRIVE (RELEASING STOPS MOVEMENT)
        </div>

        {/* Directional Buttons Container */}
        <div className="flex flex-col items-center space-y-4">
          {/* FORWARD (Press & Hold) */}
          <button
            onPointerDown={() => handlePointerDown('FORWARD')}
            onPointerUp={handlePointerUp}
            disabled={isEmergencyStop || isLockedOut || !devCar?.online}
            className={`w-32 h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-sm border transition-all active:scale-95 touch-none select-none ${
              activeDrivingCmd === 'FORWARD'
                ? 'bg-accent-blue text-white border-blue-400 shadow-lg shadow-blue-900/50 scale-105'
                : 'bg-surface-secondary hover:bg-surface-elevated text-white border-surface-border disabled:opacity-30 disabled:pointer-events-none'
            }`}
          >
            <ArrowUp className="w-6 h-6 mb-1" />
            <span>FORWARD</span>
          </button>

          {/* Center Emergency & Stop Controls */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => handleDiscreteClick('STOP')}
              disabled={!devCar?.online}
              className="w-24 h-16 rounded-xl bg-surface-elevated hover:bg-surface-border text-text-primary border border-surface-border flex flex-col items-center justify-center text-xs font-bold transition-all active:scale-95 disabled:opacity-30"
            >
              <Square className="w-5 h-5 text-accent-red mb-1" />
              <span>STOP</span>
            </button>

            <button
              onClick={() => handleDiscreteClick('RESET')}
              disabled={!devCar?.online}
              className="w-24 h-16 rounded-xl bg-surface-secondary hover:bg-surface-elevated text-text-primary border border-surface-border flex flex-col items-center justify-center text-xs font-bold transition-all active:scale-95 disabled:opacity-30"
              title="Resets car cycle and informs Arm via UDP"
            >
              <RotateCcw className="w-5 h-5 text-accent-yellow mb-1" />
              <span>RESET</span>
            </button>
          </div>

          {/* BACKWARD (Press & Hold) */}
          <button
            onPointerDown={() => handlePointerDown('BACKWARD')}
            onPointerUp={handlePointerUp}
            disabled={isEmergencyStop || isLockedOut || !devCar?.online}
            className={`w-32 h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-sm border transition-all active:scale-95 touch-none select-none ${
              activeDrivingCmd === 'BACKWARD'
                ? 'bg-accent-blue text-white border-blue-400 shadow-lg shadow-blue-900/50 scale-105'
                : 'bg-surface-secondary hover:bg-surface-elevated text-white border-surface-border disabled:opacity-30 disabled:pointer-events-none'
            }`}
          >
            <ArrowDown className="w-6 h-6 mb-1" />
            <span>BACKWARD</span>
          </button>
        </div>

        {feedbackMsg && (
          <div className="mt-4 text-xs font-mono text-accent-blue animate-fade-in">
            {feedbackMsg}
          </div>
        )}
      </div>

      {/* Firmware Specification & Steering Notice Card */}
      <div className="p-4 rounded-xl bg-surface-secondary border border-surface-border text-xs text-text-secondary space-y-2">
        <div className="flex items-center space-x-2 text-white font-semibold">
          <Info className="w-4 h-4 text-accent-blue" />
          <span>FIRMWARE COMPLIANCE & DIRECTIONAL CAPABILITIES</span>
        </div>
        <p className="font-mono text-[11px] leading-relaxed">
          The inspected <code className="text-white">car_code.ino</code> firmware implements exclusively{' '}
          <code className="text-accent-blue">FORWARD</code> and <code className="text-accent-blue">BACKWARD</code>{' '}
          linear trajectories. No differential steering or left/right servo commands exist in the current microcontroller code.
          In accordance with safety requirements, unsupported steering actions are intentionally excluded to prevent command corruption.
        </p>
      </div>
    </div>
  );
};
