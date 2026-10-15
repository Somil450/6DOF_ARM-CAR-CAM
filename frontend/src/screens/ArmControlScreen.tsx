import React, { useState, useEffect, useRef } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Cpu,
  Home,
  Square,
  RotateCcw,
  Unlock,
  Lock,
  BookmarkCheck,
  Send,
  AlertCircle,
  Sliders,
  Check
} from 'lucide-react';

const HOME_ANGLES = [146, 180, 46, 124, 119, 157];
const JOINT_NAMES = [
  'Base Joint',
  'Shoulder Joint',
  'Elbow Joint',
  'Wrist Pitch',
  'Wrist Roll',
  'End Gripper'
];

export const ArmControlScreen: React.FC = () => {
  const {
    telemetry,
    setArmAngles,
    sendArmCommand,
    controlGripper,
    applyArmPreset,
    updateSettings
  } = useRobotStore();

  const arm = telemetry?.arm;
  const devArm = telemetry?.devices.arm;
  const isEmergencyStop = telemetry?.emergency_stop;

  // Local state for interactive sliders (synced initially with commanded angles)
  const [sliderAngles, setSliderAngles] = useState<number[]>(
    arm?.commanded_angles || HOME_ANGLES
  );
  const [hasUnsentChanges, setHasUnsentChanges] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Debounce timer for slider transmission
  const debounceRef = useRef<any>(null);

  // Sync if external telemetry arrives and user is not actively editing
  useEffect(() => {
    if (arm?.commanded_angles && !hasUnsentChanges) {
      setSliderAngles(arm.commanded_angles);
    }
  }, [arm?.commanded_angles, hasUnsentChanges]);

  const handleSliderChange = (index: number, newAngle: number) => {
    const clamped = Math.max(0, Math.min(180, Math.round(newAngle)));
    const updated = [...sliderAngles];
    updated[index] = clamped;
    setSliderAngles(updated);
    setHasUnsentChanges(true);

    // Debounced automatic transmission (matches arm_slider_control.py behavior)
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (devArm?.online) {
        await setArmAngles(updated);
        setHasUnsentChanges(false);
        setStatusMessage(`Sent 6 angles to UDP :4242`);
        setTimeout(() => setStatusMessage(null), 2000);
      }
    }, 150);
  };

  const handleStepChange = (index: number, delta: number) => {
    handleSliderChange(index, sliderAngles[index] + delta);
  };

  const handleSendAll = async () => {
    const success = await setArmAngles(sliderAngles);
    if (success) {
      setHasUnsentChanges(false);
      setStatusMessage('All 6 servo angles transmitted via UDP :4242');
      setTimeout(() => setStatusMessage(null), 2500);
    }
  };

  const handleResetSliders = () => {
    setSliderAngles(HOME_ANGLES);
    setHasUnsentChanges(true);
    handleSliderChange(0, HOME_ANGLES[0]);
  };

  const handleSaveAsOpen = async () => {
    const angle = sliderAngles[5];
    await updateSettings({ gripper_open_angle: angle });
    setStatusMessage(`Saved ${angle}° as Gripper OPEN angle`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSaveAsClosed = async () => {
    const angle = sliderAngles[5];
    await updateSettings({ gripper_closed_angle: angle });
    setStatusMessage(`Saved ${angle}° as Gripper CLOSED angle`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">6-DOF ROBOTIC ARM CONTROL</h1>
            <p className="text-xs text-text-muted font-mono">
              Driver: PCA9685 I2C (0x40) • UDP Slider :4242 (6 bytes) • UDP Cmd :5005
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {hasUnsentChanges && (
            <button
              onClick={handleSendAll}
              disabled={isEmergencyStop}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-bold transition-all shadow active:scale-95 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>SEND ANGLES</span>
            </button>
          )}
          <button
            onClick={() => sendArmCommand('HOME')}
            disabled={isEmergencyStop}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated text-accent-yellow border border-surface-border text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
          >
            <Home className="w-3.5 h-3.5" />
            <span>HOME</span>
          </button>
          <button
            onClick={() => sendArmCommand('STOP')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated text-accent-red border border-surface-border text-xs font-semibold transition-all active:scale-95"
          >
            <Square className="w-3.5 h-3.5" />
            <span>STOP HOMING</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="px-4 py-2 rounded-lg bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-xs font-mono flex items-center space-x-2">
          <Check className="w-4 h-4" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Six Servo Joints Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sliderAngles.map((angle, index) => {
          const isGripper = index === 5;
          const homeVal = HOME_ANGLES[index];
          return (
            <div
              key={index}
              className={`p-4 rounded-xl border transition-all ${
                isGripper
                  ? 'bg-surface-primary border-accent-blue/40 shadow-sm'
                  : 'bg-surface-primary border-surface-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-white">
                    CH{index} — {JOINT_NAMES[index]}
                  </span>
                  {isGripper && (
                    <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent-blue/20 text-accent-blue uppercase font-semibold">
                      GRIPPER
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-text-muted font-mono">Home: {homeVal}°</span>
                  <span className="text-base font-bold font-mono text-accent-blue min-w-[42px] text-right">
                    {angle}°
                  </span>
                </div>
              </div>

              {/* Slider Control */}
              <div className="py-2">
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={angle}
                  disabled={isEmergencyStop}
                  onChange={(e) => handleSliderChange(index, Number(e.target.value))}
                  className="w-full accent-accent-blue cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Step Adjustment Buttons & Direct Input */}
              <div className="flex items-center justify-between pt-2 border-t border-surface-border/60 text-xs font-mono">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleStepChange(index, -5)}
                    disabled={isEmergencyStop}
                    className="px-2 py-1 rounded bg-surface-secondary hover:bg-surface-elevated text-text-secondary hover:text-white border border-surface-border disabled:opacity-40"
                  >
                    -5°
                  </button>
                  <button
                    onClick={() => handleStepChange(index, -1)}
                    disabled={isEmergencyStop}
                    className="px-2 py-1 rounded bg-surface-secondary hover:bg-surface-elevated text-text-secondary hover:text-white border border-surface-border disabled:opacity-40"
                  >
                    -1°
                  </button>
                </div>

                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={angle}
                    disabled={isEmergencyStop}
                    onChange={(e) => handleSliderChange(index, Number(e.target.value))}
                    className="w-14 px-2 py-1 rounded bg-surface-secondary border border-surface-border text-center text-white text-xs font-mono focus:border-accent-blue outline-none disabled:opacity-40"
                  />
                  <span className="text-text-muted">deg</span>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleStepChange(index, 1)}
                    disabled={isEmergencyStop}
                    className="px-2 py-1 rounded bg-surface-secondary hover:bg-surface-elevated text-text-secondary hover:text-white border border-surface-border disabled:opacity-40"
                  >
                    +1°
                  </button>
                  <button
                    onClick={() => handleStepChange(index, 5)}
                    disabled={isEmergencyStop}
                    className="px-2 py-1 rounded bg-surface-secondary hover:bg-surface-elevated text-text-secondary hover:text-white border border-surface-border disabled:opacity-40"
                  >
                    +5°
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Verified Arm Presets Panel */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-secondary uppercase">
            VERIFIED ARM POSE PRESETS
          </span>
          <span className="text-[11px] font-mono text-text-muted">Calculated safe coordinates</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => applyArmPreset('HOME')}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 disabled:opacity-40"
          >
            <Home className="w-5 h-5 text-accent-yellow" />
            <span className="text-xs font-bold text-white">HOME POSE</span>
            <span className="text-[10px] font-mono text-text-muted">[146, 180, 46, 124, 119, 157]</span>
          </button>

          <button
            onClick={() => applyArmPreset('READY')}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 disabled:opacity-40"
          >
            <BookmarkCheck className="w-5 h-5 text-accent-blue" />
            <span className="text-xs font-bold text-white">READY POSE</span>
            <span className="text-[10px] font-mono text-text-muted">Raised arm, gripper open</span>
          </button>

          <button
            onClick={() => applyArmPreset('PICKUP')}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 disabled:opacity-40"
          >
            <Sliders className="w-5 h-5 text-accent-green" />
            <span className="text-xs font-bold text-white">PICKUP POSE</span>
            <span className="text-[10px] font-mono text-text-muted">Ground reach forward</span>
          </button>

          <button
            onClick={() => applyArmPreset('DROP_OFF')}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="w-5 h-5 text-accent-yellow" />
            <span className="text-xs font-bold text-white">DROP-OFF POSE</span>
            <span className="text-[10px] font-mono text-text-muted">Rotated base drop</span>
          </button>
        </div>
      </div>

      {/* Dedicated Gripper Controls & Calibration */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary uppercase">
            GRIPPER CALIBRATION & WORKBENCH — CH5
          </span>
          <span className="text-xs font-mono text-white">
            State: <span className="text-accent-blue font-bold">{arm?.gripper_state || 'UNKNOWN'}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => controlGripper('OPEN')}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border flex items-center justify-center space-x-2 text-xs font-bold text-accent-green transition-all active:scale-95 disabled:opacity-40"
          >
            <Unlock className="w-4 h-4" />
            <span>GRIPPER OPEN ({arm?.gripper_open_angle || 170}°)</span>
          </button>

          <button
            onClick={() => controlGripper('CLOSE')}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border flex items-center justify-center space-x-2 text-xs font-bold text-accent-red transition-all active:scale-95 disabled:opacity-40"
          >
            <Lock className="w-4 h-4" />
            <span>GRIPPER CLOSE ({arm?.gripper_closed_angle || 90}°)</span>
          </button>

          <button
            onClick={handleSaveAsOpen}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs font-mono text-text-secondary hover:text-white transition-all active:scale-95 disabled:opacity-40"
          >
            SAVE AS OPEN ({sliderAngles[5]}°)
          </button>

          <button
            onClick={handleSaveAsClosed}
            disabled={isEmergencyStop}
            className="p-3 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs font-mono text-text-secondary hover:text-white transition-all active:scale-95 disabled:opacity-40"
          >
            SAVE AS CLOSED ({sliderAngles[5]}°)
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-surface-border text-xs font-mono text-text-muted">
          <button
            onClick={handleResetSliders}
            className="hover:text-white transition-colors flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET SLIDERS TO HOME</span>
          </button>
          <button
            onClick={() => sendArmCommand('PICKUP_COMPLETE')}
            className="text-accent-yellow hover:text-yellow-400 font-semibold transition-colors"
          >
            TRIGGER PICKUP COMPLETE ROUTINE
          </button>
        </div>
      </div>

      {/* Safety & Angle Notice */}
      <div className="p-4 rounded-xl bg-surface-secondary border border-surface-border text-xs text-text-secondary flex items-start space-x-3">
        <AlertCircle className="w-4 h-4 text-accent-blue flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-[11px] font-mono leading-relaxed">
          <div className="text-white font-semibold">FEEDBACK LIMITATION NOTICE</div>
          <p>
            Standard PCA9685 PWM servos do not provide physical angle telemetry. The values shown above are{' '}
            <strong className="text-white">commanded angles</strong> transmitted by the controller. Never assume the arm
            physically moved if power to the servo driver is disconnected or mechanical binding occurs.
          </p>
        </div>
      </div>
    </div>
  );
};
