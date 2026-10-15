import React, { useState } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Car,
  Cpu,
  Camera,
  Eye,
  ShieldCheck,
  Clock,
  Wifi
} from 'lucide-react';

export const HealthScreen: React.FC = () => {
  const { telemetry, testDevice } = useRobotStore();
  const [testingDevice, setTestingDevice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const devices = telemetry?.devices;
  const car = telemetry?.car;
  const arm = telemetry?.arm;
  const cam = telemetry?.camera;
  const det = telemetry?.detection;

  const handleTest = async (devKey: string) => {
    setTestingDevice(devKey);
    setTestResult(null);
    const result = await testDevice(devKey);
    setTestResult({ device: devKey, ...result });
    setTestingDevice(null);
  };

  const deviceHealth = [
    {
      key: 'gateway',
      name: 'Central Robotics Gateway',
      icon: Server,
      subsystem: 'GATEWAY',
      info: devices?.gateway,
      description: 'FastAPI async mediator, safety interlocks, WebSocket broadcaster, and MJPEG proxy.',
    },
    {
      key: 'car',
      name: 'Car ESP32 Controller',
      icon: Car,
      subsystem: 'CAR',
      info: devices?.car,
      description: 'L298N motor driver, HC-SR04 ultrasonic rangefinder, and reverse backoff state machine.',
    },
    {
      key: 'arm',
      name: 'Robotic Arm ESP32',
      icon: Cpu,
      subsystem: 'ARM',
      info: devices?.arm,
      description: 'PCA9685 I2C driver, 6-DOF servo PWM channels, UDP binary/ASCII listener, non-blocking homing.',
    },
    {
      key: 'camera',
      name: 'ESP32-CAM AI Thinker',
      icon: Camera,
      subsystem: 'CAMERA',
      info: devices?.camera,
      description: 'OV2640 sensor, QQVGA 160x120 continuous MJPEG stream generator with CORS support.',
    },
    {
      key: 'vision',
      name: 'YOLOv8 Vision Service',
      icon: Eye,
      subsystem: 'VISION',
      info: devices?.vision,
      description: 'Ultralytics neural worker processing freshest camera frames for object tracking.',
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-4 rounded-xl bg-surface-primary border border-surface-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-surface-secondary text-accent-blue border border-surface-border">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">HARDWARE HEALTH & NETWORK DIAGNOSTICS</h1>
            <p className="text-xs text-text-muted font-mono">
              Live Heartbeat Probes • Round-Trip Latency Verification • Error Logs
            </p>
          </div>
        </div>
        <div className="text-xs font-mono text-text-muted flex items-center space-x-2">
          <span>SIMULATION MODE:</span>
          <span
            className={`font-bold ${
              telemetry?.simulation_mode ? 'text-accent-yellow' : 'text-accent-blue'
            }`}
          >
            {telemetry?.simulation_mode ? 'ENABLED' : 'PHYSICAL HARDWARE'}
          </span>
        </div>
      </div>

      {testResult && (
        <div className="p-3.5 rounded-xl bg-surface-elevated border border-accent-blue text-xs font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-accent-green" />
            <span>
              DIAGNOSTIC TEST COMPLETED FOR <strong className="text-white uppercase">{testResult.device}</strong>:
              {' '}{testResult.online ? 'DEVICE RESPONDED' : 'NO RESPONSE'}
              {testResult.latency_ms !== null && ` (${testResult.latency_ms} ms)`}
              {testResult.error && ` • Error: ${testResult.error}`}
            </span>
          </div>
        </div>
      )}

      {/* Deep-Dive Subsystem Cards */}
      <div className="space-y-3">
        {deviceHealth.map((item) => {
          const Icon = item.icon;
          const isOnline = item.info?.online;
          return (
            <div
              key={item.key}
              className="p-4 rounded-xl bg-surface-primary border border-surface-border space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-surface-secondary text-text-secondary border border-surface-border">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>{item.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-secondary text-text-muted">
                        {item.subsystem}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5">{item.description}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 self-end sm:self-center">
                  {item.info?.status_text === 'SIMULATION' ? (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40">
                      SIMULATION
                    </span>
                  ) : isOnline ? (
                    <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-accent-green/20 text-accent-green border border-accent-green/40">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ONLINE</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold bg-accent-red/20 text-accent-red border border-accent-red/40">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>OFFLINE</span>
                    </span>
                  )}

                  {item.key !== 'gateway' && item.key !== 'vision' && (
                    <button
                      onClick={() => handleTest(item.key)}
                      disabled={testingDevice === item.key}
                      className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-surface-secondary hover:bg-surface-elevated border border-surface-border text-xs text-text-secondary hover:text-white transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingDevice === item.key ? 'animate-spin' : ''}`} />
                      <span>TEST</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Status Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-surface-border/60 text-xs font-mono text-text-muted">
                <div>
                  <span className="text-[10px] text-text-muted block">NETWORK ADDRESS</span>
                  <span className="text-text-secondary truncate block">{item.info?.ip || 'N/A'}:{item.info?.port || 80}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">MEASURED LATENCY</span>
                  <span className="text-text-secondary block">
                    {item.info?.latency_ms !== null && item.info?.latency_ms !== undefined ? `${item.info.latency_ms} ms` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">LAST CONTACT</span>
                  <span className="text-text-secondary block">
                    {item.info?.last_seen ? new Date(item.info.last_seen * 1000).toLocaleTimeString() : 'NEVER'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">LAST ERROR</span>
                  <span className="text-accent-red truncate block" title={item.info?.last_error || 'None'}>
                    {item.info?.last_error || 'NONE'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Freshness & Quality Assurance */}
      <div className="p-4 rounded-xl bg-surface-secondary border border-surface-border space-y-2 text-xs font-mono text-text-secondary">
        <div className="flex items-center space-x-2 text-white font-semibold">
          <ShieldCheck className="w-4 h-4 text-accent-green" />
          <span>SAFETY ASSURANCE: REAL HEALTH CHECKS</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Online status is determined by real asynchronous network probes (HTTP status codes and socket reachability),
          not stored booleans. A device that was online earlier will automatically transition to OFFLINE if network
          packets fail to arrive within configured timeout windows.
        </p>
      </div>
    </div>
  );
};
