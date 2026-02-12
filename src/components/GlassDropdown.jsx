import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function GlassDropdown({ value, options, onChange, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: -9999, left: -9999, width: 0 });
  const ref = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target) && 
          dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useLayoutEffect(() => {
    const updatePosition = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width
        });
      }
    };

    if (isOpen) {
      updatePosition();
      
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.pageYOffset + 4,
        left: rect.left + window.pageXOffset,
        width: rect.width
      });
    }
    setIsOpen(!isOpen);
  };

  const selectedOption = options.find(o => o.value === value);
  const selectedLabel = selectedOption?.label || value;

  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full px-3 py-2 text-[11px] rounded-app bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 text-slate-800 dark:text-slate-200 cursor-pointer backdrop-blur-sm transition-all duration-300 hover:bg-white/40 dark:hover:bg-white/10 hover:border-white/30 dark:hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/40 flex items-center justify-between"
        style={value.includes("'") ? { fontFamily: value } : {}}
      >
        <span>{selectedLabel}</span>
        <svg 
          className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu - Rendered via Portal */}
      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            visibility: position.top === -9999 ? 'hidden' : 'visible'
          }}
          className="z-[99999] rounded-app backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="bg-white/70 dark:bg-slate-800/70">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-left text-[11px] transition-all duration-200 ${
                  value === option.value
                    ? 'bg-teal-500/20 text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-white/30 dark:hover:bg-white/10'
                }`}
                style={option.value.includes("'") ? { fontFamily: option.value } : {}}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
