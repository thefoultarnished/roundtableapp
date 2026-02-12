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
  
  React.useEffect(() => {
    const isTransparent = localStorage.getItem('windowTransparency') !== 'false';
    if (isTransparent) {
       // Semi-transparent base
       const level = parseFloat(localStorage.getItem('transparencyLevel') || '0.75');
       const winOpacity = parseFloat(localStorage.getItem('windowOpacity') || '0.70');
       
       document.documentElement.style.setProperty('--glass-opacity', level); 
       
       const savedTheme = localStorage.getItem('theme') || 'light';
       document.documentElement.classList.remove('dark', 'aurora');
       if (savedTheme === 'dark') document.documentElement.classList.add('dark');
       if (savedTheme === 'aurora') document.documentElement.classList.add('aurora');

       const isDark = savedTheme === 'dark' || savedTheme === 'aurora';
       document.getElementById('root').style.background = isDark 
          ? `rgba(2, 6, 23, ${winOpacity})` 
          : `rgba(235, 238, 244, ${winOpacity})`;
    } else {
       const isDark = document.documentElement.classList.contains('dark');
       document.getElementById('root').style.background = isDark ? '#020617' : '#e2e8f0';
    }
  }, []);

  return (
    <div className="h-screen flex flex-row overflow-hidden relative">
      {/* Animated background layers */}
      <AuroraBackground />
      <Particles />

      {/* Left Sidebar - Full Height */}
      <Sidebar />

      {/* Right Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden relative z-10 ml-2 mr-2 my-2" style={{ height: 'calc(100vh - 16px)' }}>
        <div className="flex-1 overflow-hidden relative w-full h-full">
          <ChatArea />
        </div>
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
