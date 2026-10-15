import React from 'react';
import { useRobotStore } from '../store/useRobotStore';
import { AlertTriangle, Wifi, WifiOff, Menu, ShieldAlert, Cpu } from 'lucide-react';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { isConnected, telemetry, triggerEmergencyStop, clearEmergencyStop } = useRobotStore();
  const emergencyStop = telemetry?.emergency_stop || false;
  const simulationMode = telemetry?.simulation_mode || false;
  const systemMode = telemetry?.system_mode || 'MANUAL';

  return (
    <header className="h-16 border-b border-surface-border bg-surface-primary px-4 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded border border-surface-border bg-surface-secondary text-text-secondary hover:text-white hover:bg-surface-elevated"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded bg-surface-elevated border border-surface-border flex items-center justify-center text-accent-blue font-bold">
            <Cpu className="w-5 h-5 text-accent-blue" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-wider text-base text-white">WAREBOT</span>
              {simulationMode && (
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40 font-semibold">
                  SIMULATION
                </span>
              )}
            </div>
            <div className="text-[10px] text-text-muted font-mono tracking-tight hidden sm:block">
              ROBOTICS CONTROL PLATFORM
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Connection status badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded border border-surface-border bg-surface-secondary text-xs">
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              <Wifi className="w-3.5 h-3.5 text-accent-green" />
              <span className="text-text-primary hidden sm:inline">ONLINE</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-accent-red" />
              <WifiOff className="w-3.5 h-3.5 text-accent-red" />
              <span className="text-accent-red font-semibold">OFFLINE</span>
            </>
          )}
        </div>

        {/* System operating mode */}
        <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded border border-surface-border bg-surface-secondary text-xs font-mono">
          <span className="text-text-muted">MODE:</span>
          <span
            className={
              emergencyStop
                ? 'text-accent-red font-bold'
                : systemMode === 'AUTONOMOUS'
                ? 'text-accent-blue font-semibold'
                : 'text-text-primary'
            }
          >
            {systemMode}
          </span>
        </div>

        {/* Emergency Stop Button */}
        {emergencyStop ? (
          <button
            onClick={() => clearEmergencyStop()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-accent-yellow hover:bg-yellow-500 text-black font-bold text-xs rounded transition-all shadow-md active:scale-95"
            title="Reset emergency stop latch"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>RESET E-STOP</span>
          </button>
        ) : (
          <button
            onClick={() => triggerEmergencyStop()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-accent-red hover:bg-red-600 text-white font-bold text-xs rounded border border-red-500 transition-all shadow-lg shadow-red-950/40 active:scale-95"
            title="Immediately halt all motors and mission loops"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>EMERGENCY STOP</span>
          </button>
        )}
      </div>
    </header>
  );
};
