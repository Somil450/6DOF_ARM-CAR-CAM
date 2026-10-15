import React from 'react';
import { useRobotStore } from '../store/useRobotStore';
import { WifiOff, AlertTriangle } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { isConnected, telemetry } = useRobotStore();
  const emergencyStop = telemetry?.emergency_stop;

  if (emergencyStop) {
    return (
      <div className="bg-accent-red/20 border-b border-accent-red/50 text-accent-red px-4 py-2 flex items-center justify-between text-xs font-mono animate-pulse">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-bold">
            EMERGENCY STOP ACTIVATED — All motion routines halted. Reset latch in header to resume.
          </span>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="bg-accent-yellow/15 border-b border-accent-yellow/30 text-accent-yellow px-4 py-2 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center space-x-2">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>
            DISCONNECTED FROM ROBOTICS GATEWAY — Direct hardware commands disabled. Reconnecting automatically...
          </span>
        </div>
      </div>
    );
  }

  return null;
};
