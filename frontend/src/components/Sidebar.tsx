import React from 'react';
import { useRobotStore, ScreenId } from '../store/useRobotStore';
import {
  LayoutDashboard,
  Camera,
  Car,
  Cpu,
  Crosshair,
  Navigation,
  ListCollapse,
  Activity,
  Settings,
  X
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { activeScreen, setActiveScreen, telemetry } = useRobotStore();

  const navItems: Array<{ id: ScreenId; label: string; icon: React.ElementType; badge?: string | number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'camera', label: 'Live Camera', icon: Camera, badge: telemetry?.camera.fps ? `${telemetry.camera.fps.toFixed(0)} FPS` : undefined },
    { id: 'car', label: 'Car Control', icon: Car, badge: telemetry?.car.state !== 'UNKNOWN' ? telemetry?.car.state : undefined },
    { id: 'arm', label: 'Robotic Arm', icon: Cpu },
    { id: 'detection', label: 'Object Detection', icon: Crosshair, badge: telemetry?.detection.selected_target },
    { id: 'mission', label: 'Autonomous Mission', icon: Navigation, badge: telemetry?.mission.state !== 'IDLE' ? telemetry?.mission.state : undefined },
    { id: 'logs', label: 'Logs & Events', icon: ListCollapse },
    { id: 'health', label: 'Device Health', icon: Activity },
    { id: 'settings', label: 'Settings & Calibration', icon: Settings },
  ];

  const handleSelect = (id: ScreenId) => {
    setActiveScreen(id);
    onClose();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 w-64 bg-surface-primary border-r border-surface-border flex flex-col z-50 transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Mobile Header */}
        <div className="h-16 border-b border-surface-border flex items-center justify-between px-4 lg:hidden">
          <span className="font-bold tracking-wider text-sm text-white">WAREBOT NAVIGATION</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-secondary hover:text-white hover:bg-surface-elevated"
            aria-label="Close Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/40 shadow-sm'
                    : 'text-text-secondary hover:text-white hover:bg-surface-secondary border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-accent-blue' : 'text-text-muted'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface-elevated border border-surface-border text-text-muted">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick System Status Footer */}
        <div className="p-3 border-t border-surface-border bg-surface-secondary/50 text-[11px] text-text-muted font-mono space-y-1">
          <div className="flex justify-between">
            <span>Car ESP32:</span>
            <span className={telemetry?.devices.car.online ? 'text-accent-green' : 'text-accent-red'}>
              {telemetry?.devices.car.online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Arm ESP32:</span>
            <span className={telemetry?.devices.arm.online ? 'text-accent-green' : 'text-accent-red'}>
              {telemetry?.devices.arm.online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>ESP32-CAM:</span>
            <span className={telemetry?.devices.camera.online ? 'text-accent-green' : 'text-accent-red'}>
              {telemetry?.devices.camera.online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
