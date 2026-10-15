import React from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Car,
  Cpu,
  Camera,
  Eye,
  Server,
  Compass,
  Home,
  Unlock,
  Lock,
  Play,
  Square,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Navigation
} from 'lucide-react';

export const DashboardScreen: React.FC = () => {
  const {
    telemetry,
    setActiveScreen,
    sendArmCommand,
    controlGripper,
    startMission,
    stopMission,
    triggerEmergencyStop,
    initWebSocket
  } = useRobotStore();

  const devices = telemetry?.devices;
  const car = telemetry?.car;
  const arm = telemetry?.arm;
  const cam = telemetry?.camera;
  const det = telemetry?.detection;
  const mission = telemetry?.mission;

  const deviceList = [
    { key: 'car', name: 'Car ESP32', icon: Car, info: devices?.car },
    { key: 'arm', name: 'Arm ESP32', icon: Cpu, info: devices?.arm },
    { key: 'camera', name: 'ESP32-CAM', icon: Camera, info: devices?.camera },
    { key: 'vision', name: 'Vision Engine', icon: Eye, info: devices?.vision },
    { key: 'gateway', name: 'Robotics Gateway', icon: Server, info: devices?.gateway },
  ];

  const getStatusBadge = (info?: { online: boolean; status_text: string }) => {
    if (!info) return <span className="text-text-muted">N/A</span>;
    if (info.status_text === 'SIMULATION') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40">
          SIMULATION
        </span>
      );
    }
    if (info.online) {
      return (
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-accent-green/20 text-accent-green border border-accent-green/40">
          <CheckCircle2 className="w-3 h-3" />
          <span>ONLINE</span>
        </span>
      );
    }
    return (
      <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-accent-red/20 text-accent-red border border-accent-red/40">
        <XCircle className="w-3 h-3" />
        <span>OFFLINE</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface-primary border border-surface-border">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>WAREBOT OPERATIONAL SUMMARY</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Real-time telemetry and unified actuator control platform
          </p>
        </div>
        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1 text-text-muted">
            <Clock className="w-3.5 h-3.5" />
            <span>LAST SYNC: {telemetry ? telemetry.iso_time.split(' ')[1] : 'OFFLINE'}</span>
          </div>
          <button
            onClick={() => initWebSocket()}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-surface-secondary hover:bg-surface-elevated text-text-secondary hover:text-white border border-surface-border transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>RECONNECT</span>
          </button>
        </div>
      </div>

      {/* Device Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {deviceList.map((dev) => {
          const Icon = dev.icon;
          return (
            <div
              key={dev.key}
              className="p-3.5 rounded-xl bg-surface-primary border border-surface-border flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded bg-surface-secondary text-text-secondary">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">{dev.name}</span>
                </div>
                {getStatusBadge(dev.info)}
              </div>
              <div className="mt-3 pt-2 border-t border-surface-border text-[11px] font-mono text-text-muted space-y-0.5">
                <div className="flex justify-between">
                  <span>IP:</span>
                  <span className="text-text-secondary truncate max-w-[110px]">
                    {dev.info?.ip || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <span className="text-text-secondary">
                    {dev.info?.latency_ms !== null && dev.info?.latency_ms !== undefined
                      ? `${dev.info.latency_ms} ms`
                      : 'N/A'}
                  </span>
                </div>
                {dev.info?.last_error && (
                  <div className="text-accent-red text-[10px] truncate" title={dev.info.last_error}>
                    Err: {dev.info.last_error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Primary Telemetry Readouts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Ultrasonic Distance Gauge */}
        <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">ULTRASONIC PROXIMITY</span>
            <Compass className="w-4 h-4 text-text-muted" />
          </div>
          <div className="my-3 text-center">
            {car?.distance_cm !== null && car?.distance_cm !== undefined && car?.distance_fresh ? (
              <div className="space-y-1">
                <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                  {car.distance_cm.toFixed(1)}
                </span>
                <span className="text-xs text-text-muted ml-1">cm</span>
                <div className="text-[11px] font-mono">
                  {car.distance_cm <= 25.0 ? (
                    <span className="text-accent-red font-semibold">STOP THRESHOLD REACHED</span>
                  ) : car.distance_cm <= 35.0 ? (
                    <span className="text-accent-yellow">APPROACHING THRESHOLD</span>
                  ) : (
                    <span className="text-accent-green">PATH CLEAR</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-lg font-mono text-text-muted py-2">
                {car?.online ? 'STALE / NO ECHO' : 'OFFLINE'}
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-surface-border text-[11px] font-mono text-text-muted flex justify-between">
            <span>Stop Cutoff: 25.0 cm</span>
            <span>Reverse: +20.0 cm</span>
          </div>
        </div>

        {/* Vision & Target */}
        <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">OBJECT DETECTION</span>
            <Eye className="w-4 h-4 text-text-muted" />
          </div>
          <div className="my-3 text-center">
            {det?.target_visible && det.detection ? (
              <div className="space-y-1">
                <div className="text-lg font-bold text-accent-green uppercase font-mono tracking-wider">
                  {det.detection.class_name}
                </div>
                <div className="text-xs text-text-muted font-mono">
                  Confidence: {(det.detection.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-[11px] text-text-secondary font-mono">
                  BBox: [{det.detection.box.join(', ')}]
                </div>
              </div>
            ) : (
              <div className="py-2">
                <div className="text-sm font-semibold text-text-muted font-mono">NO TARGET IN VIEW</div>
                <div className="text-[11px] text-text-muted mt-1">
                  Filtering for: <span className="text-white uppercase font-mono">{det?.selected_target || 'BOTTLE'}</span>
                </div>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-surface-border text-[11px] font-mono text-text-muted flex justify-between">
            <span>Vision FPS: {det?.fps || 0}</span>
            <span>Cam Fresh: {cam?.frame_fresh ? 'YES' : 'NO'}</span>
          </div>
        </div>

        {/* Mission & Car State */}
        <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">ACTIVE MISSION & STATE</span>
            <Navigation className="w-4 h-4 text-text-muted" />
          </div>
          <div className="my-3 text-center space-y-1">
            <div className="text-2xl font-bold font-mono text-accent-blue tracking-wider">
              {mission?.state || 'IDLE'}
            </div>
            <div className="text-xs text-text-secondary truncate px-2" title={mission?.current_step}>
              {mission?.current_step || 'Awaiting operator input'}
            </div>
          </div>
          <div className="pt-2 border-t border-surface-border text-[11px] font-mono text-text-muted flex justify-between">
            <span>Car Firmware: {car?.state || 'UNKNOWN'}</span>
            <span>Gripper: {arm?.gripper_state || 'UNKNOWN'}</span>
          </div>
        </div>
      </div>

      {/* Robotic Arm Joint Readout Overview */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-secondary">ROBOTIC ARM 6-DOF COMMANDED POSITIONS</span>
          <span className="text-[11px] font-mono text-text-muted">PCA9685 SERVO PWM (0° - 180°)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {(arm?.commanded_angles || [146, 180, 46, 124, 119, 157]).map((angle, idx) => {
            const jointName = arm?.joint_names?.[idx] || `Servo ${idx}`;
            return (
              <div key={idx} className="p-2.5 rounded-lg bg-surface-secondary border border-surface-border text-center">
                <div className="text-[10px] text-text-muted font-mono truncate">{jointName}</div>
                <div className="text-lg font-bold font-mono text-white mt-1">{angle}°</div>
                <div className="w-full bg-surface-elevated h-1 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-accent-blue h-full rounded-full transition-all duration-150"
                    style={{ width: `${(angle / 180) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Action Station */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border">
        <h2 className="text-xs font-semibold text-text-secondary uppercase mb-3">
          QUICK ACTIONS & MANUAL OVERRIDES
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveScreen('car')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Car className="w-4 h-4 text-accent-blue" />
            <span>CAR CONTROLS</span>
          </button>

          <button
            onClick={() => setActiveScreen('arm')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Cpu className="w-4 h-4 text-accent-blue" />
            <span>ARM CONTROLS</span>
          </button>

          <button
            onClick={() => setActiveScreen('camera')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Camera className="w-4 h-4 text-accent-blue" />
            <span>LIVE CAMERA</span>
          </button>

          <button
            onClick={() => sendArmCommand('HOME')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Home className="w-4 h-4 text-accent-yellow" />
            <span>ARM TO HOME</span>
          </button>

          <button
            onClick={() => controlGripper('OPEN')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Unlock className="w-4 h-4 text-accent-green" />
            <span>OPEN GRIPPER</span>
          </button>

          <button
            onClick={() => controlGripper('CLOSE')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Lock className="w-4 h-4 text-accent-red" />
            <span>CLOSE GRIPPER</span>
          </button>

          <button
            onClick={() => startMission('bottle')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Play className="w-4 h-4 text-accent-green" />
            <span>START FOLLOW</span>
          </button>

          <button
            onClick={() => stopMission()}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Square className="w-4 h-4 text-text-muted" />
            <span>STOP FOLLOW</span>
          </button>

          <button
            onClick={() => setActiveScreen('detection')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Compass className="w-4 h-4 text-accent-blue" />
            <span>SELECT TARGET</span>
          </button>

          <button
            onClick={() => setActiveScreen('health')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <AlertCircle className="w-4 h-4 text-text-secondary" />
            <span>DEVICE HEALTH</span>
          </button>

          <button
            onClick={() => setActiveScreen('logs')}
            className="p-2.5 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-white flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <Clock className="w-4 h-4 text-text-secondary" />
            <span>VIEW EVENT LOGS</span>
          </button>

          <button
            onClick={() => triggerEmergencyStop()}
            className="p-2.5 rounded-lg bg-accent-red/20 hover:bg-accent-red/30 border border-accent-red/50 text-accent-red flex items-center justify-center space-x-2 transition-colors active:scale-95"
          >
            <AlertTriangle className="w-4 h-4 text-accent-red" />
            <span className="font-bold">E-STOP</span>
          </button>
        </div>
      </div>
    </div>
  );
};
