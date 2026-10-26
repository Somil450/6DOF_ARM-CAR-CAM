import React, { useState, useEffect } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Settings,
  Save,
  Server,
  Car,
  Cpu,
  Camera,
  Sliders,
  Check,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const { gatewayHost, setGatewayHost, updateSettings, telemetry, testDevice } = useRobotStore();

  const [localGatewayHost, setLocalGatewayHost] = useState(gatewayHost);
  const [carIp, setCarIp] = useState('10.172.189.44');
  const [armIp, setArmIp] = useState('10.172.189.193');
  const [cameraIp, setCameraIp] = useState('10.172.189.233');
  
  const [stopDistance, setStopDistance] = useState(25.0);
  const [reverseDistance, setReverseDistance] = useState(20.0);
  
  const [gripperOpen, setGripperOpen] = useState(170);
  const [gripperClosed, setGripperClosed] = useState(90);
  
  const [yoloConf, setYoloConf] = useState(0.12);
  const [simMode, setSimMode] = useState(false);

  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    // Fetch current settings from gateway
    fetch(`http://${gatewayHost}:8000/api/settings`)
      .then((res) => res.json())
      .then((data) => {
        if (data.car_ip) setCarIp(data.car_ip);
        if (data.arm_ip) setArmIp(data.arm_ip);
        if (data.camera_ip) setCameraIp(data.camera_ip);
        if (data.stop_distance_cm) setStopDistance(data.stop_distance_cm);
        if (data.reverse_distance_cm) setReverseDistance(data.reverse_distance_cm);
        if (data.gripper_open_angle) setGripperOpen(data.gripper_open_angle);
        if (data.gripper_closed_angle) setGripperClosed(data.gripper_closed_angle);
        if (data.yolo_confidence) setYoloConf(data.yolo_confidence);
        if (data.simulation_mode !== undefined) setSimMode(data.simulation_mode);
      })
      .catch((err) => console.log('Could not fetch settings:', err));
  }, [gatewayHost]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (localGatewayHost !== gatewayHost) {
      setGatewayHost(localGatewayHost);
    }

    const payload = {
      car_ip: carIp,
      arm_ip: armIp,
      camera_ip: cameraIp,
      stop_distance_cm: Number(stopDistance),
      reverse_distance_cm: Number(reverseDistance),
      gripper_open_angle: Number(gripperOpen),
      gripper_closed_angle: Number(gripperClosed),
      yolo_confidence: Number(yoloConf),
      simulation_mode: simMode,
    };

    const ok = await updateSettings(payload);
    if (ok) {
      setSavedMessage('Configuration updated and validated successfully.');
      setTimeout(() => setSavedMessage(null), 3000);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">SYSTEM SETTINGS & HARDWARE CALIBRATION</h1>
            <p className="text-xs text-text-muted font-mono">
              Network IP Addresses • Proximity Thresholds • Calibration Offsets • Operating Mode
            </p>
          </div>
        </div>
        <button
          type="submit"
          className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-md active:scale-95"
        >
          <Save className="w-4 h-4" />
          <span>SAVE SETTINGS</span>
        </button>
      </div>

      {savedMessage && (
        <div className="p-3.5 rounded-lg bg-accent-green/15 border border-accent-green/30 text-accent-green text-xs font-mono flex items-center space-x-2">
          <Check className="w-4 h-4" />
          <span>{savedMessage}</span>
        </div>
      )}

      {/* Simulation Mode Toggle Card */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-sm font-bold text-white flex items-center space-x-2">
            <span>OPERATING MODE: SIMULATION / MOCK HARDWARE</span>
          </div>
          <p className="text-xs text-text-secondary max-w-xl">
            When enabled, the gateway generates synthetic camera streams and simulated car/arm telemetry.
            Real hardware mode never fakes data.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={simMode}
            onChange={(e) => setSimMode(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-elevated border border-surface-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-yellow"></div>
        </label>
      </div>

      {/* Network Configuration */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-4">
        <span className="text-xs font-semibold text-text-secondary uppercase">
          EMBEDDED HARDWARE IP ADDRESSES
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              Gateway Server Host / IP
            </label>
            <input
              type="text"
              value={localGatewayHost}
              onChange={(e) => setLocalGatewayHost(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              Car ESP32 IP Address
            </label>
            <input
              type="text"
              value={carIp}
              onChange={(e) => setCarIp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              Arm ESP32 IP Address
            </label>
            <input
              type="text"
              value={armIp}
              onChange={(e) => setArmIp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              ESP32-CAM IP Address
            </label>
            <input
              type="text"
              value={cameraIp}
              onChange={(e) => setCameraIp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
          </div>
        </div>
      </div>

      {/* Proximity & Distance Calibration */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-4">
        <span className="text-xs font-semibold text-text-secondary uppercase">
          ULTRASONIC PROXIMITY THRESHOLDS
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              Stopping Distance Threshold (cm)
            </label>
            <input
              type="number"
              step="0.5"
              value={stopDistance}
              onChange={(e) => setStopDistance(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
            <span className="text-[10px] font-mono text-text-muted mt-1 block">
              Default in car_code.ino: 25.0 cm
            </span>
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              Post-Pickup Reverse Backoff (cm)
            </label>
            <input
              type="number"
              step="0.5"
              value={reverseDistance}
              onChange={(e) => setReverseDistance(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
            <span className="text-[10px] font-mono text-text-muted mt-1 block">
              Default in car_code.ino: +20.0 cm
            </span>
          </div>
        </div>
      </div>

      {/* Gripper Angle Limits Calibration */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-4">
        <span className="text-xs font-semibold text-text-secondary uppercase">
          GRIPPER CHANNEL 5 CALIBRATION LIMITS
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              Gripper OPEN Angle (degrees)
            </label>
            <input
              type="number"
              min="0"
              max="180"
              value={gripperOpen}
              onChange={(e) => setGripperOpen(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
            <span className="text-[10px] font-mono text-text-muted mt-1 block">
              Default in arm_slider_control.py: 170°
            </span>
          </div>

          <div>
            <label className="text-xs font-mono text-text-muted block mb-1">
              Gripper CLOSED Angle (degrees)
            </label>
            <input
              type="number"
              min="0"
              max="180"
              value={gripperClosed}
              onChange={(e) => setGripperClosed(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-surface-border text-xs font-mono text-white focus:border-accent-blue outline-none"
            />
            <span className="text-[10px] font-mono text-text-muted mt-1 block">
              Default in arm_slider_control.py: 90°
            </span>
          </div>
        </div>
      </div>
    </form>
  );
};
