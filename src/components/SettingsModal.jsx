import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useNetwork } from '../hooks/useNetwork';

export default function SettingsModal() {
  const { state, dispatch } = useAppContext();
  const { announcePresence } = useNetwork();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [autoDownload, setAutoDownload] = useState(false);
  const [appFont, setAppFont] = useState("'Inter', sans-serif");
  const [chatFont, setChatFont] = useState("'Inter', sans-serif");
  const [fontScale, setFontScale] = useState(100);
  const [saveStatus, setSaveStatus] = useState('');
  const [profilePicture, setProfilePicture] = useState('');

  useEffect(() => {
    if (state.settingsOpen) {
      setDisplayName(localStorage.getItem('displayName') || 'Your Name');
      setUsername(localStorage.getItem('username') || 'RoundtableUser');
      setAutoDownload(localStorage.getItem('autoDownloadFiles') === 'true');
      setAppFont(localStorage.getItem('appFont') || "'Inter', sans-serif");
      setChatFont(localStorage.getItem('chatFont') || "'Inter', sans-serif");
      setFontScale(parseInt(localStorage.getItem('fontSizeScale') || '100'));
      setProfilePicture(localStorage.getItem('profilePicture') || '');
    }
  }, [state.settingsOpen]);

  if (!state.settingsOpen) return null;

  const handleSave = () => {
    const oldDisplayName = localStorage.getItem('displayName') || 'Roundtable User';
    const oldUsername = localStorage.getItem('username') || 'Anonymous';

    localStorage.setItem('username', username);
    localStorage.setItem('displayName', displayName);
    localStorage.setItem('fontSizeScale', fontScale);
    localStorage.setItem('autoDownloadFiles', autoDownload);
    localStorage.setItem('appFont', appFont);
    localStorage.setItem('chatFont', chatFont);

    document.documentElement.style.setProperty('--app-font', appFont);
    document.documentElement.style.setProperty('--chat-font', chatFont);
    document.documentElement.style.setProperty('--font-size-scale', fontScale / 100);

    const nameChanged = displayName !== oldDisplayName;
    const usernameChanged = username !== oldUsername;

    if (nameChanged || usernameChanged) {
      announcePresence();
      setTimeout(() => announcePresence(), 1000);
      setSaveStatus('Name Updated! ✓');
    } else {
      setSaveStatus('Saved! ✓');
    }

    setTimeout(() => {
      setSaveStatus('');
      dispatch({ type: 'SET_SETTINGS_OPEN', payload: false });
    }, 1500);
  };

  const handlePfpChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 96, 96);
        const resized = canvas.toDataURL('image/png');
        setProfilePicture(resized);
        localStorage.setItem('profilePicture', resized);
        announcePresence();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const close = () => dispatch({ type: 'SET_SETTINGS_OPEN', payload: false });

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="bg-white/80 dark:bg-slate-800/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col glassmorphism transform transition-all duration-300 border border-white/20">
        {/* Header */}
        <div className="p-6 border-b border-slate-200/50 dark:border-slate-700/50 flex-shrink-0 flex justify-between items-center bg-white/50 dark:bg-slate-800/50 rounded-t-3xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <span>Settings</span>
          </h2>
          <button onClick={close} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all duration-300 hover:rotate-90">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-hidden grid grid-cols-1 md:grid-cols-3 gap-6 text-slate-600 dark:text-slate-300">
          {/* Column 1: Profile */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest border-b border-teal-500/20 pb-1.5">Profile</h3>
            <div className="flex flex-col items-center p-3 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
              <div className="relative group">
                <img
                  src={profilePicture || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }
                  className="h-16 w-16 rounded-full bg-slate-200 dark:bg-slate-700 object-cover border-2 border-white dark:border-gray-800 shadow shadow-teal-500/10 transition-transform duration-300 group-hover:scale-105"
                  alt="Profile"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('pfp-file-input')?.click()}
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-teal-500 text-white shadow-lg border-2 border-white dark:border-slate-800 hover:bg-teal-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <input type="file" id="pfp-file-input" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handlePfpChange} />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-teal-500 transition-all"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Username (@)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-teal-500 transition-all"
                  placeholder="Unique ID"
                />
              </div>
            </div>
          </div>

          {/* Column 2: Appearance */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest border-b border-purple-500/20 pb-1.5">Appearance</h3>
            <div className="space-y-2.5 p-3 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">App Font</label>
                <select value={appFont} onChange={(e) => setAppFont(e.target.value)} className="w-full p-2 text-[11px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 outline-none text-slate-800 dark:text-slate-200 cursor-pointer shadow-sm">
                  <option value="'Inter', sans-serif">Inter (Clean)</option>
                  <option value="'Roboto', sans-serif">Roboto</option>
                  <option value="'Montserrat', sans-serif">Montserrat</option>
                  <option value="'Space Grotesk', sans-serif">Space Tech</option>
                  <option value="'Comic Sans MS', cursive">Comic Sans</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Chat Font</label>
                <select value={chatFont} onChange={(e) => setChatFont(e.target.value)} className="w-full p-2 text-[11px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 outline-none text-slate-800 dark:text-slate-200 cursor-pointer shadow-sm">
                  <option value="'Inter', sans-serif">Inter (Clean)</option>
                  <option value="'Roboto Mono', monospace">Roboto Mono</option>
                  <option value="'Fira Code', monospace">Fira Code</option>
                  <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                  <option value="'Space Grotesk', sans-serif">Space Tech</option>
                </select>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1 px-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scale</label>
                <span className="text-[10px] font-bold font-mono text-purple-600 bg-purple-100 dark:bg-purple-900/40 px-1.5 rounded">{fontScale}%</span>
              </div>
              <input type="range" min="50" max="200" step="10" value={fontScale} onChange={(e) => setFontScale(e.target.value)} className="w-full h-1.5 rounded-lg appearance-none bg-slate-200 dark:bg-slate-700 accent-purple-500 cursor-pointer" />
            </div>
          </div>

          {/* Column 3: Network */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest border-b border-blue-500/20 pb-1.5">Network</h3>
            <div className="bg-slate-50/50 dark:bg-slate-900/30 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Connection Mode</label>
              <ConnectionModeToggle />
            </div>
            <div className="p-3 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Auto-Download</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={autoDownload} onChange={(e) => setAutoDownload(e.target.checked)} className="sr-only peer" />
                  <div className="w-8 h-4 bg-slate-300 dark:bg-slate-600 rounded-full peer peer-checked:bg-teal-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 shadow-inner" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-shrink-0 justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-b-3xl">
          <button onClick={close} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">Cancel</button>
          <button
            onClick={handleSave}
            className="px-8 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 shadow-md hover:shadow-teal-500/20 transform hover:-translate-y-0.5 active:translate-y-0 transition-all"
          >
            {saveStatus || 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectionModeToggle() {
  const [mode, setMode] = useState(localStorage.getItem('connectionMode') || 'lan');

  const handleSwitch = (newMode) => {
    setMode(newMode);
    localStorage.setItem('connectionMode', newMode);
  };

  return (
    <>
      <div className="relative bg-white dark:bg-slate-800 p-0.5 rounded-lg flex border border-slate-200 dark:border-slate-700/50 h-8">
        <div
          className="absolute top-0.5 left-0.5 bottom-0.5 w-[calc(50%-2px)] bg-slate-100 dark:bg-slate-700 rounded-md shadow transition-all duration-300 z-0"
          style={{ left: mode === 'online' ? 'calc(50%)' : '4px' }}
        />
        <button
          type="button"
          onClick={() => handleSwitch('lan')}
          className={`flex-1 text-[10px] font-bold z-10 transition-colors outline-none ${mode === 'lan' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}
        >
          LAN
        </button>
        <button
          type="button"
          onClick={() => handleSwitch('online')}
          className={`flex-1 text-[10px] font-bold z-10 transition-colors outline-none ${mode === 'online' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'}`}
        >
          ONLINE
        </button>
      </div>
      <p className="mt-2 text-[8.5px] text-center text-slate-400 uppercase tracking-tight opacity-70">
        {mode === 'online' ? 'Internet-wide connection via Relay' : 'Fast local discovery via network broadcast'}
      </p>
    </>
  );
}
