import React, { useEffect } from 'react';
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

function AppContent() {
  const { state } = useAppContext();
  useTauriIntegration();
  useTheme();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Particles />
      <Titlebar />
      <div className="flex flex-1 pt-8 overflow-hidden">
        <Sidebar />
        <div 
          id="resize-handle" 
          className="w-2 cursor-col-resize bg-transparent flex items-center justify-center group relative resize-handle"
          title="Drag to resize sidebar"
        />
        <ChatArea />
      </div>
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
