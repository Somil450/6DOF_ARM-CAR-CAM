import React, { useEffect, useState } from 'react';
import { useRobotStore } from './store/useRobotStore';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { OfflineBanner } from './components/OfflineBanner';
import { DashboardScreen } from './screens/DashboardScreen';
import { CameraScreen } from './screens/CameraScreen';
import { CarControlScreen } from './screens/CarControlScreen';
import { ArmControlScreen } from './screens/ArmControlScreen';
import { DetectionScreen } from './screens/DetectionScreen';
import { MissionScreen } from './screens/MissionScreen';
import { LogsScreen } from './screens/LogsScreen';
import { HealthScreen } from './screens/HealthScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export const App: React.FC = () => {
  const { activeScreen, initWebSocket, lastError } = useRobotStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    initWebSocket();
  }, [initWebSocket]);

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 'overview':
        return <DashboardScreen />;
      case 'camera':
        return <CameraScreen />;
      case 'car':
        return <CarControlScreen />;
      case 'arm':
        return <ArmControlScreen />;
      case 'detection':
        return <DetectionScreen />;
      case 'mission':
        return <MissionScreen />;
      case 'logs':
        return <LogsScreen />;
      case 'health':
        return <HealthScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-accent-blue selection:text-white">
      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <OfflineBanner />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-black">
          {lastError && (
            <div className="mb-4 p-3 rounded-xl bg-accent-red/15 border border-accent-red/30 text-accent-red text-xs font-mono flex items-center justify-between animate-fade-in">
              <span>{lastError}</span>
            </div>
          )}
          {renderActiveScreen()}
        </main>
      </div>
    </div>
  );
};

export default App;
