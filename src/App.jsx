import React from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Particles from './components/Particles';
import SettingsModal from './components/SettingsModal';
import SummaryModal from './components/SummaryModal';
import NotificationContainer from './components/NotificationContainer';
import { useTauriIntegration } from './hooks/useTauriIntegration';
import { useTheme } from './hooks/useTheme';

function AuroraBackground() {
  return (
    <div className="aurora-bg">
      <div className="aurora-orb-1" />
      <div className="aurora-orb-2" />
      <div className="aurora-orb-3" />
    </div>
  );
}

function AppContent() {
  const { state } = useAppContext();
  useTauriIntegration();
  useTheme();

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* Animated background layers */}
      <AuroraBackground />
      <Particles />

      {/* Glass titlebar */}
      <Titlebar />

      {/* Main layout */}
      <div className="flex flex-1 pt-9 overflow-hidden relative z-10">
        <Sidebar />
        <div
          id="resize-handle"
          className="resize-handle"
          title="Drag to resize sidebar"
        />
        <ChatArea />
      </div>

      {/* Modals & Notifications */}
      <SettingsModal />
      <SummaryModal />
      <NotificationContainer />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
