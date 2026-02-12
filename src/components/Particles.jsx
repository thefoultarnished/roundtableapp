import React, { useEffect } from 'react';

export default function Particles() {
  useEffect(() => {
    const container = document.getElementById('particles-container');
    if (!container || container.children.length > 0) return;

    for (let i = 0; i < 50; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 20 + 's';
      particle.style.animationDuration = (15 + Math.random() * 10) + 's';
      container.appendChild(particle);
    }
  }, []);

  return <div className="particles" id="particles-container" />;
}
