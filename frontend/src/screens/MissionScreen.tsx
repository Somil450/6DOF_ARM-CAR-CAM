import React from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Navigation,
  Play,
  Square,
  PackageCheck,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  Camera,
  Cpu,
  Car
} from 'lucide-react';

const STATE_STEPS = [
  { id: 'IDLE', label: 'Idle' },
  { id: 'TARGET_SELECTED', label: 'Target Selected' },
  { id: 'FOLLOWING', label: 'Following Target' },
  { id: 'STOPPED_AT_TARGET', label: 'Proximity Stop (25cm)' },
  { id: 'PICKUP', label: 'Arm Pickup Sequence' },
  { id: 'COMPLETE', label: 'Mission Complete' },
];

export const MissionScreen: React.FC = () => {
  const {
    telemetry,
    startMission,
    stopMission,
    triggerPickup,
    sendCarCommand,
    clearEmergencyStop
  } = useRobotStore();

  const mission = telemetry?.mission;
  const car = telemetry?.car;
  const arm = telemetry?.arm;
  const cam = telemetry?.camera;
  const det = telemetry?.detection;
  const isEmergencyStop = telemetry?.emergency_stop;

  const currentState = mission?.state || 'IDLE';
  const targetClass = det?.selected_target || 'bottle';
  const isTargetSupported = det?.target_supported ?? true;

  const getStepIndex = (state: string) => {
    switch (state) {
      case 'IDLE':
        return 0;
      case 'READY':
      case 'TARGET_SELECTED':
        return 1;
      case 'FOLLOWING':
        return 2;
      case 'STOPPED_AT_TARGET':
        return 3;
      case 'PICKUP':
        return 4;
      case 'COMPLETE':
        return 5;
      default:
        return 0;
    }
  };

  const currentIdx = getStepIndex(currentState);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">AUTONOMOUS MISSION CONTROL</h1>
            <p className="text-xs text-text-muted font-mono">
              Deterministic State Machine • Ultrasonic Safety Gating • Vision Closed-Loop
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {currentState === 'FOLLOWING' ? (
            <button
              onClick={() => stopMission()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-border border border-surface-border text-xs font-bold text-white transition-all active:scale-95"
            >
              <Square className="w-4 h-4 text-text-muted" />
              <span>STOP FOLLOWING</span>
            </button>
          ) : (
            <button
              onClick={() => startMission(targetClass)}
              disabled={isEmergencyStop || !isTargetSupported}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-accent-green hover:bg-green-600 text-black text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-40"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>START FOLLOWING ({targetClass.toUpperCase()})</span>
            </button>
          )}

          <button
            onClick={() => triggerPickup()}
            disabled={isEmergencyStop}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs font-semibold text-accent-yellow transition-all active:scale-95 disabled:opacity-40"
          >
            <PackageCheck className="w-4 h-4" />
            <span>PICK UP TARGET</span>
          </button>

          <button
            onClick={() => sendCarCommand('RESET')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs font-semibold text-text-secondary hover:text-white transition-all active:scale-95"
            title="Reset mission cycle and car state"
          >
            <RotateCcw className="w-4 h-4" />
            <span>RESET</span>
          </button>
        </div>
      </div>

      {/* Target Warning if Unsupported */}
      {!isTargetSupported && (
        <div className="p-3.5 rounded-xl bg-accent-red/15 border border-accent-red/30 text-accent-red flex items-center space-x-3 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-bold">UNSUPPORTED MISSION TARGET: {targetClass.toUpperCase()}</span>
            <div className="text-[11px] text-accent-red/80 mt-0.5">
              The currently selected object is not in the COCO-80 model. Autonomous following and pickup are safely locked out. Select Bottle from the Object Detection tab to enable autonomous operations.
            </div>
          </div>
        </div>
      )}

      {/* State Machine Step Pipeline */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-3">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="font-semibold text-text-secondary uppercase">MISSION STATE MACHINE</span>
          <span className="text-accent-blue font-bold tracking-wider">{currentState}</span>
        </div>

        {/* Pipeline Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {STATE_STEPS.map((step, idx) => {
            const isPassed = currentIdx > idx;
            const isCurrent = currentIdx === idx && currentState !== 'IDLE';
            return (
              <div
                key={step.id}
                className={`p-3 rounded-lg border flex flex-col justify-between text-center transition-all ${
                  isCurrent
                    ? 'bg-accent-blue/15 border-accent-blue shadow-md'
                    : isPassed
                    ? 'bg-surface-secondary border-accent-green/40 text-text-secondary'
                    : 'bg-surface-secondary/40 border-surface-border text-text-muted'
                }`}
              >
                <div className="text-[10px] font-mono text-text-muted">STEP 0{idx + 1}</div>
                <div
                  className={`text-xs font-bold font-mono mt-1 ${
                    isCurrent ? 'text-accent-blue' : isPassed ? 'text-accent-green' : 'text-text-muted'
                  }`}
                >
                  {step.label}
                </div>
                <div className="mt-2 flex justify-center">
                  {isPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-accent-green" />
                  ) : isCurrent ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-accent-blue animate-ping" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-surface-border" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Current Step Description */}
        <div className="p-3 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2 text-text-secondary">
            <span className="text-text-muted">Current Directive:</span>
            <span className="text-white font-semibold">{mission?.current_step || 'Awaiting start'}</span>
          </div>
          <div className="text-text-muted text-[11px]">
            Target: <strong className="text-white uppercase">{targetClass}</strong>
          </div>
        </div>
      </div>

      {/* Safety & Prerequisite Check Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        {/* Camera Freshness */}
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border space-y-1">
          <div className="text-text-muted flex items-center justify-between">
            <span>CAMERA STREAM</span>
            <Camera className="w-3.5 h-3.5" />
          </div>
          <div className="text-white font-semibold">
            {cam?.frame_fresh ? (
              <span className="text-accent-green">FRESH ({cam.fps} FPS)</span>
            ) : (
              <span className="text-accent-red">STALE / NO FEED</span>
            )}
          </div>
        </div>

        {/* Distance Status */}
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border space-y-1">
          <div className="text-text-muted flex items-center justify-between">
            <span>PROXIMITY (HC-SR04)</span>
            <Compass className="w-3.5 h-3.5" />
          </div>
          <div className="text-white font-semibold">
            {car?.distance_cm !== null && car?.distance_cm !== undefined ? (
              car.distance_cm <= 25.0 ? (
                <span className="text-accent-red font-bold">{car.distance_cm.toFixed(1)} cm (STOP)</span>
              ) : (
                <span className="text-accent-green">{car.distance_cm.toFixed(1)} cm (SAFE)</span>
              )
            ) : (
              <span className="text-text-muted">INVALID DISTANCE</span>
            )}
          </div>
        </div>

        {/* Vision Detection */}
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border space-y-1">
          <div className="text-text-muted flex items-center justify-between">
            <span>TARGET VISIBILITY</span>
            <Eye className="w-3.5 h-3.5" />
          </div>
          <div className="text-white font-semibold">
            {det?.target_visible && det.detection ? (
              <span className="text-accent-green font-bold">
                FOUND ({(det.detection.confidence * 100).toFixed(0)}%)
              </span>
            ) : (
              <span className="text-text-muted">SEARCHING...</span>
            )}
          </div>
        </div>

        {/* Car State */}
        <div className="p-3 rounded-lg bg-surface-primary border border-surface-border space-y-1">
          <div className="text-text-muted flex items-center justify-between">
            <span>CAR STATE</span>
            <Car className="w-3.5 h-3.5" />
          </div>
          <div className="text-white font-semibold">
            <span
              className={
                car?.state === 'MOVING_ALLOWED'
                  ? 'text-accent-green'
                  : car?.state === 'PICKUP_STARTED'
                  ? 'text-accent-yellow'
                  : 'text-text-primary'
              }
            >
              {car?.state || 'UNKNOWN'}
            </span>
          </div>
        </div>
      </div>

      {/* Mission Event Timeline */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary uppercase">
            MISSION EVENT TIMELINE
          </span>
          <span className="text-xs font-mono text-text-muted flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Chronological State Log</span>
          </span>
        </div>

        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {mission?.timeline && mission.timeline.length > 0 ? (
            mission.timeline.slice().reverse().map((item, idx) => (
              <div
                key={idx}
                className="px-3 py-2 rounded bg-surface-secondary border border-surface-border/50 flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-text-muted">{item.time_str}</span>
                  <span className="text-accent-blue font-semibold">{item.event}</span>
                  <span className="text-text-secondary">{item.description}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-xs font-mono text-text-muted">
              No mission events recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
