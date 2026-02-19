import React from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Particles from './components/Particles';
import SettingsModal from './components/SettingsModal';
import SummaryModal from './components/SummaryModal';
import NotificationContainer from './components/NotificationContainer';
import SplashScreen from './components/SplashScreen';
import { useTauriIntegration } from './hooks/useTauriIntegration';
import { useTheme } from './hooks/useTheme';
import { useTaskbarBadge } from './hooks/useTaskbarBadge';

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
  const [saveStatus, setSaveStatus] = React.useState('');
  useTauriIntegration();
  useTheme();
  useTaskbarBadge(state.unreadCounts); // Update Windows taskbar badge

  // Splash screen visibility based on app ready state
  const splashVisible = !state.isAppReady;
  
  const updateBackground = () => {
    const savedTheme = localStorage.getItem('theme') || 'aurora';
    const isTransparent = localStorage.getItem('windowTransparency') !== 'false';
    const winOpacity = parseFloat(localStorage.getItem('windowOpacity') || '0.70');
    const isAcrylic = localStorage.getItem('acrylicEffect') === 'true';

    // 1. Sync Theme Classes
    document.documentElement.classList.remove('dark', 'aurora');
    if (savedTheme === 'dark') document.documentElement.classList.add('dark');
    if (savedTheme === 'aurora') document.documentElement.classList.add('aurora');

    // 2. Set Root Background
    const root = document.getElementById('root');
    if (!root) return;

    if (savedTheme === 'aurora' || isAcrylic) {
      // Aurora and acrylic MUST be fully transparent so the OS effect shows through
      root.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
    } else if (isTransparent) {
      const isDark = savedTheme === 'dark';
      root.style.background = isDark
        ? `rgba(2, 6, 23, ${winOpacity})`
        : `rgba(235, 238, 244, ${winOpacity})`;
    } else {
      const isDark = savedTheme === 'dark';
      root.style.background = isDark ? '#020617' : '#e2e8f0';
    }
  };

  React.useEffect(() => {
    // Show the window now that React has rendered (avoids transparent rectangle flash)
    if (window.__TAURI__?.window) {
      window.__TAURI__.window.getCurrentWindow().show();
    }
    updateBackground();
    // Listen for storage changes (settings updates)
    window.addEventListener('storage', updateBackground);
    return () => window.removeEventListener('storage', updateBackground);
  }, []);

  // Update when settings modal closes or theme state changes
  React.useEffect(() => {
    updateBackground();
  }, [state.settingsOpen]);

  return (
    <div className="h-screen flex flex-row overflow-hidden relative" style={{ gap: 'var(--layout-spacing)' }}>
      {/* Splash Screen Overlay */}
      <SplashScreen isVisible={splashVisible} />

      {/* Animated background layers */}
      <AuroraBackground />
      <Particles />

      {/* Left Sidebar - Full Height */}
      <Sidebar />

      {/* Right Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden relative z-10" style={{ height: 'calc(100vh - calc(var(--layout-spacing) * 2))', marginRight: 'var(--layout-spacing)', marginTop: 'var(--layout-spacing)', marginBottom: 'var(--layout-spacing)' }}>
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
