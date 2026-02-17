import React from 'react';
import appIcon from '../../src-tauri/icons/icon.png';

export default function SplashScreen({ isVisible }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 9999,
        backgroundColor: 'transparent',
        pointerEvents: isVisible ? 'auto' : 'none',
        opacity: isVisible ? 1 : 0,
        visibility: isVisible ? 'visible' : 'hidden',
        transition: 'opacity 0.6s ease, visibility 0.6s ease',
      }}
    >
      {/* Aurora gradient background */}
      <div className="aurora-bg absolute inset-0">
        <div className="aurora-orb-1" />
        <div className="aurora-orb-2" />
        <div className="aurora-orb-3" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-4">
        {/* App Icon */}
        <img
          src={appIcon}
          alt="Roundtable App Icon"
          className="w-24 h-24 drop-shadow-lg"
        />

        {/* Title */}
        <h1 className="text-4xl font-bold text-white drop-shadow-lg">
          Roundtable
        </h1>

        {/* Tagline */}
        <p className="text-lg text-white/80 drop-shadow-md">
          Starting up...
        </p>

        {/* Loading Spinner */}
        <div className="mt-6">
          <div
            className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full drop-shadow-lg"
            style={{
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      </div>

      {/* Spinner animation CSS */}
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
