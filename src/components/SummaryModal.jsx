import React from 'react';
import { useAppContext } from '../context/AppContext';

export default function SummaryModal() {
  const { state, dispatch } = useAppContext();

  if (!state.summaryOpen) return null;

  const close = () => dispatch({ type: 'SET_SUMMARY_OPEN', payload: false });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col glassmorphism transform transition-all duration-300">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white p-6 border-b border-slate-200/20 dark:border-slate-700/30 flex-shrink-0 flex items-center gap-2">
          <span className="text-2xl">✨</span> Conversation Summary
        </h2>
        <div id="summary-content" className="p-6 overflow-y-auto text-slate-700 dark:text-slate-300 space-y-4">
          <p className="text-slate-500">No summary available yet.</p>
        </div>
        <div className="p-4 border-t border-slate-200/20 dark:border-slate-700/30 flex-shrink-0 flex justify-end">
          <button
            onClick={close}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
