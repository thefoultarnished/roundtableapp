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

    if (displayName !== oldDisplayName || username !== oldUsername) {
      announcePresence();
      setTimeout(() => announcePresence(), 1000);
      setSaveStatus('Updated! ✓');
    } else {
      setSaveStatus('Saved! ✓');
    }

    setTimeout(() => {
      setSaveStatus('');
      dispatch({ type: 'SET_SETTINGS_OPEN', payload: false });
    }, 1500);
  };

  const handlePfpChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96; canvas.height = 96;
        canvas.getContext('2d').drawImage(img, 0, 0, 96, 96);
        const resized = canvas.toDataURL('image/png');
        setProfilePicture(resized);
        localStorage.setItem('profilePicture', resized);
        announcePresence();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  };

  const close = () => dispatch({ type: 'SET_SETTINGS_OPEN', payload: false });

  const inputClass = "w-full px-3 py-2 text-xs rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/40 transition-all duration-300 text-slate-800 dark:text-slate-200 placeholder:text-slate-400/60 backdrop-blur-sm";
  const selectClass = "w-full p-2 text-[11px] rounded-xl bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 outline-none text-slate-800 dark:text-slate-200 cursor-pointer backdrop-blur-sm focus:ring-2 focus:ring-teal-500/30";
  const labelClass = "block text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-1.5 ml-0.5";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="glass-panel-heavy rounded-3xl w-full max-w-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/10 dark:border-white/5 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm shadow-lg shadow-teal-500/20">⚙</span>
            <span>Settings</span>
          </h2>
          <button onClick={close} className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 hover:rotate-90">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Column 1: Profile */}
          <div className="space-y-4">
            <SectionHeader color="teal" label="Profile" />
            <div className="flex flex-col items-center p-4 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div className="relative group mb-3">
                <div className="w-20 h-20 rounded-full overflow-hidden ring-3 ring-white/20 group-hover:ring-teal-400/40 transition-all duration-400 shadow-lg">
                  <img
                    src={profilePicture || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}
                    className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 object-cover"
                    alt="Profile"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => document.getElementById('pfp-file-input')?.click()}
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-white shadow-lg shadow-teal-500/30 border-2 border-white dark:border-slate-900 hover:scale-110 transition-transform duration-300"
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
                <label className={labelClass}>Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="Name" />
              </div>
              <div>
                <label className={labelClass}>Username (@)</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} placeholder="Unique ID" />
              </div>
            </div>
          </div>

          {/* Column 2: Appearance */}
          <div className="space-y-4">
            <SectionHeader color="purple" label="Appearance" />
            <div className="space-y-3 p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div>
                <label className={labelClass}>App Font</label>
                <select value={appFont} onChange={(e) => setAppFont(e.target.value)} className={selectClass}>
                  <option value="'Inter', sans-serif">Inter (Clean)</option>
                  <option value="'Roboto', sans-serif">Roboto</option>
                  <option value="'Montserrat', sans-serif">Montserrat</option>
                  <option value="'Space Grotesk', sans-serif">Space Tech</option>
                  <option value="'Comic Sans MS', cursive">Comic Sans</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Chat Font</label>
                <select value={chatFont} onChange={(e) => setChatFont(e.target.value)} className={selectClass}>
                  <option value="'Inter', sans-serif">Inter (Clean)</option>
                  <option value="'Roboto Mono', monospace">Roboto Mono</option>
                  <option value="'Fira Code', monospace">Fira Code</option>
                  <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                  <option value="'Space Grotesk', sans-serif">Space Tech</option>
                </select>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-2">
                <label className={labelClass + ' mb-0'}>Scale</label>
                <span className="text-[10px] font-bold font-mono text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-lg">{fontScale}%</span>
              </div>
              <input type="range" min="50" max="200" step="10" value={fontScale} onChange={(e) => setFontScale(e.target.value)}
                className="w-full h-1.5 rounded-lg appearance-none bg-white/20 dark:bg-white/10 accent-purple-500 cursor-pointer" />
            </div>
          </div>

          {/* Column 3: Network */}
          <div className="space-y-4">
            <SectionHeader color="blue" label="Network" />
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <label className={labelClass}>Connection Mode</label>
              <ConnectionModeToggle />
            </div>
            <div className="p-3 rounded-2xl bg-white/15 dark:bg-white/5 border border-white/15 dark:border-white/5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className={labelClass + ' mb-0'}>Auto-Download</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={autoDownload} onChange={(e) => setAutoDownload(e.target.checked)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-white/20 dark:bg-white/10 rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-teal-400 peer-checked:to-cyan-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 after:shadow-lg" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 dark:border-white/5 flex justify-end gap-3">
          <button onClick={close} className="px-5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-white/10 transition-all duration-300">Cancel</button>
          <button
            onClick={handleSave}
            className="px-8 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
          >
            {saveStatus || 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ color, label }) {
  const colorMap = {
    teal: 'text-teal-500 border-teal-500/20',
    purple: 'text-purple-500 border-purple-500/20',
    blue: 'text-blue-500 border-blue-500/20',
  };

  return (
    <h3 className={`text-[10px] font-bold uppercase tracking-[0.2em] border-b pb-2 ${colorMap[color] || colorMap.teal}`}>
      {label}
    </h3>
  );
}

function ConnectionModeToggle() {
  const [mode, setMode] = useState(localStorage.getItem('connectionMode') || 'lan');

  return (
    <>
      <div className="relative bg-white/10 dark:bg-white/5 p-0.5 rounded-xl flex border border-white/15 dark:border-white/5 h-9 overflow-hidden">
        <div
          className="absolute top-0.5 bottom-0.5 w-[calc(50%-4px)] bg-gradient-to-r from-teal-500/20 to-cyan-500/20 dark:from-teal-500/15 dark:to-cyan-500/15 rounded-lg shadow-sm transition-all duration-400 z-0 backdrop-blur-sm border border-white/10"
          style={{ left: mode === 'online' ? 'calc(50%)' : '4px' }}
        />
        <button type="button" onClick={() => { setMode('lan'); localStorage.setItem('connectionMode', 'lan'); }}
          className={`flex-1 text-[10px] font-bold z-10 transition-colors outline-none rounded-lg ${mode === 'lan' ? 'text-teal-500' : 'text-slate-400'}`}>
          LAN
        </button>
        <button type="button" onClick={() => { setMode('online'); localStorage.setItem('connectionMode', 'online'); }}
          className={`flex-1 text-[10px] font-bold z-10 transition-colors outline-none rounded-lg ${mode === 'online' ? 'text-purple-500' : 'text-slate-400'}`}>
          ONLINE
        </button>
      </div>
      <p className="mt-2 text-[8px] text-center text-slate-400/60 uppercase tracking-wider">
        {mode === 'online' ? 'Internet-wide via Relay' : 'Local network broadcast'}
      </p>
    </>
  );
}
