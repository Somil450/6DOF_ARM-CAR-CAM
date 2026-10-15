import { create } from 'zustand';

export type ScreenId =
  | 'overview'
  | 'camera'
  | 'car'
  | 'arm'
  | 'detection'
  | 'mission'
  | 'logs'
  | 'health'
  | 'settings';

export interface DeviceStatus {
  online: boolean;
  status_text: string;
  latency_ms: number | null;
  ip: string;
  port: number;
  last_seen: number | null;
  last_error: string | null;
}

export interface TelemetryData {
  timestamp: number;
  iso_time: string;
  system_mode: string;
  simulation_mode: boolean;
  emergency_stop: boolean;
  devices: {
    gateway: DeviceStatus;
    car: DeviceStatus;
    arm: DeviceStatus;
    camera: DeviceStatus;
    vision: DeviceStatus;
  };
  car: {
    online: boolean;
    state: string;
    state_fresh: boolean;
    distance_cm: number | null;
    distance_fresh: boolean;
    last_command: string | null;
    stop_threshold_cm: number;
    reverse_target_cm: number;
  };
  arm: {
    online: boolean;
    commanded_angles: number[];
    measured_angles: number[] | null;
    homing_active: boolean;
    gripper_channel: number;
    gripper_state: string;
    gripper_angle: number;
    gripper_open_angle: number;
    gripper_closed_angle: number;
    presets: string[];
    joint_names: string[];
  };
  camera: {
    online: boolean;
    fps: number;
    frame_fresh: boolean;
    frame_id: number;
    stream_url: string;
    resolution: string;
  };
  detection: {
    running: boolean;
    model_loaded: boolean;
    model_path: string;
    selected_target: string;
    target_supported: boolean;
    supported_classes: string[];
    unsupported_classes: string[];
    fps: number;
    target_visible: boolean;
    detection: {
      class_id: number;
      class_name: string;
      confidence: number;
      box: [number, number, number, number];
      center: [number, number];
      area: number;
    } | null;
    all_detections: any[];
    detection_hits: number;
    confidence_threshold: number;
  };
  mission: {
    state: string;
    current_step: string;
    active_target: string;
    emergency_stop: boolean;
    last_transition_time: number;
    timeline: Array<{
      timestamp: number;
      time_str: string;
      event: string;
      description: string;
    }>;
  };
}

export interface LogEntry {
  id: string;
  timestamp: number;
  iso_time: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';
  subsystem: 'SYSTEM' | 'GATEWAY' | 'CAR' | 'ARM' | 'CAMERA' | 'VISION' | 'MISSION';
  event_type: string;
  message: string;
  details?: Record<string, any>;
}

interface RobotState {
  activeScreen: ScreenId;
  setActiveScreen: (screen: ScreenId) => void;
  gatewayHost: string;
  setGatewayHost: (host: string) => void;
  isConnected: boolean;
  telemetry: TelemetryData | null;
  logs: LogEntry[];
  lastError: string | null;

  // Actions
  initWebSocket: () => void;
  sendCarCommand: (command: string, force?: boolean) => Promise<boolean>;
  setArmAngles: (angles: number[]) => Promise<boolean>;
  sendArmCommand: (command: string) => Promise<boolean>;
  controlGripper: (action: string, angle?: number) => Promise<boolean>;
  applyArmPreset: (preset: string) => Promise<boolean>;
  setTarget: (targetClass: string) => Promise<boolean>;
  startMission: (targetClass: string) => Promise<boolean>;
  stopMission: () => Promise<boolean>;
  triggerPickup: () => Promise<boolean>;
  triggerEmergencyStop: () => Promise<boolean>;
  clearEmergencyStop: () => Promise<boolean>;
  fetchLogs: (filters?: { severity?: string; subsystem?: string; search?: string }) => Promise<void>;
  clearLogs: () => Promise<boolean>;
  updateSettings: (settings: Record<string, any>) => Promise<boolean>;
  testDevice: (device: string) => Promise<any>;
}

const getInitialGatewayHost = () => {
  if (typeof window !== 'undefined') {
    return window.location.hostname || 'localhost';
  }
  return 'localhost';
};

export const useRobotStore = create<RobotState>((set, get) => {
  let ws: WebSocket | null = null;
  let reconnectTimer: any = null;

  const getBaseUrl = () => {
    const host = get().gatewayHost;
    const port = '8000';
    return `http://${host}:${port}`;
  };

  const getWsUrl = () => {
    const host = get().gatewayHost;
    const port = '8000';
    return `ws://${host}:${port}/ws/telemetry`;
  };

  return {
    activeScreen: 'overview',
    setActiveScreen: (screen) => set({ activeScreen: screen }),
    gatewayHost: getInitialGatewayHost(),
    setGatewayHost: (host) => {
      set({ gatewayHost: host });
      get().initWebSocket();
    },
    isConnected: false,
    telemetry: null,
    logs: [],
    lastError: null,

    initWebSocket: () => {
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          // ignore
        }
      }
      clearTimeout(reconnectTimer);

      const url = getWsUrl();
      console.log('[WS] Connecting to:', url);

      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('[WS] Connected to WAREBOT Gateway');
          set({ isConnected: true, lastError: null });
        };

        ws.onmessage = (event) => {
          try {
            const data: TelemetryData = JSON.parse(event.data);
            set({ telemetry: data });
          } catch (err) {
            console.error('[WS Parse Error]', err);
          }
        };

        ws.onclose = () => {
          set({ isConnected: false });
          reconnectTimer = setTimeout(() => {
            get().initWebSocket();
          }, 2000);
        };

        ws.onerror = (err) => {
          console.warn('[WS Warning]', err);
          set({ isConnected: false });
        };
      } catch (e) {
        set({ isConnected: false });
        reconnectTimer = setTimeout(() => {
          get().initWebSocket();
        }, 3000);
      }
    },

    sendCarCommand: async (command, force = false) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/car/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, force }),
        });
        const data = await res.json();
        if (!res.ok) {
          set({ lastError: data.detail || data.error || 'Car command failed' });
          return false;
        }
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    setArmAngles: async (angles) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/arm/angles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ angles }),
        });
        const data = await res.json();
        if (!res.ok) {
          set({ lastError: data.detail || data.error });
          return false;
        }
        return true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    sendArmCommand: async (command) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/arm/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });
        const data = await res.json();
        if (!res.ok) {
          set({ lastError: data.detail || data.error });
          return false;
        }
        return true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    controlGripper: async (action, angle) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/arm/gripper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, angle }),
        });
        const data = await res.json();
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    applyArmPreset: async (preset) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/arm/preset?preset=${encodeURIComponent(preset)}`, {
          method: 'POST',
        });
        const data = await res.json();
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    setTarget: async (targetClass) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/vision/target`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_class: targetClass }),
        });
        const data = await res.json();
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    startMission: async (targetClass) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/mission/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_class: targetClass }),
        });
        const data = await res.json();
        if (!res.ok) {
          set({ lastError: data.detail || 'Could not start mission' });
          return false;
        }
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    stopMission: async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/mission/stop`, {
          method: 'POST',
        });
        const data = await res.json();
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    triggerPickup: async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/mission/pickup`, {
          method: 'POST',
        });
        const data = await res.json();
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    triggerEmergencyStop: async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/emergency_stop`, {
          method: 'POST',
        });
        const data = await res.json();
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    clearEmergencyStop: async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/emergency_reset`, {
          method: 'POST',
        });
        const data = await res.json();
        return data.success === true;
      } catch (err: any) {
        set({ lastError: err.message });
        return false;
      }
    },

    fetchLogs: async (filters) => {
      try {
        const params = new URLSearchParams();
        if (filters?.severity) params.set('severity', filters.severity);
        if (filters?.subsystem) params.set('subsystem', filters.subsystem);
        if (filters?.search) params.set('search', filters.search);
        params.set('limit', '100');

        const res = await fetch(`${getBaseUrl()}/api/logs?${params.toString()}`);
        if (res.ok) {
          const logsData: LogEntry[] = await res.json();
          set({ logs: logsData });
        }
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    },

    clearLogs: async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/logs/clear`, {
          method: 'POST',
        });
        if (res.ok) {
          set({ logs: [] });
          return true;
        }
        return false;
      } catch (err) {
        return false;
      }
    },

    updateSettings: async (settings) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
        return res.ok;
      } catch (err) {
        return false;
      }
    },

    testDevice: async (device) => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/settings/test?device=${encodeURIComponent(device)}`, {
          method: 'POST',
        });
        return await res.json();
      } catch (err: any) {
        return { online: false, error: err.message };
      }
    },
  };
});
