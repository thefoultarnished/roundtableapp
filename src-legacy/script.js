import { state } from './state.js';
import * as utils from './utils.js';
import * as ui from './ui.js';
import * as network from './network.js';

console.log(`Using message port: ${state.MSG_PORT}`);

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded');

    ui.initializeModernToggle();
    localStorage.setItem('port', state.MSG_PORT);
    network.loadUserList();

    const searchContainer = document.getElementById('titlebar-search-container');
    if (searchContainer) {
        if (window.innerWidth < 900) {
            searchContainer.style.display = 'none';
        } else {
            searchContainer.style.display = 'block';
        }
    }

    network.logSessionStart();
    const savedFontSizeInit = localStorage.getItem('fontSizeScale') || 100;
    document.documentElement.style.setProperty('--font-size-scale', savedFontSizeInit / 100);

    // Initial User ID Check
    if (!localStorage.getItem('userId') || isNaN(parseInt(localStorage.getItem('userId'), 10))) {
        const newId = Math.floor(Math.random() * 100000000);
        localStorage.setItem('userId', newId);
        localStorage.setItem('username', 'RoundtableUser');
        localStorage.setItem('displayName', 'New User');
        console.log('Generated new user ID:', newId);
    }

    ui.createParticles();
    ui.initializeUI();
    ui.renderMyUserProfileFooter();

    if (window.__TAURI__) {
        console.log('Tauri detected, setting up integration');
        network.setupTauriIntegration();
    } else {
        console.warn('Tauri not detected - running in browser mode');
    }
    
    // Debug helpers
    window.__TAURI_DEBUG__ = {
        checkState: () => {
            console.log('Current users:', state.allUsers);
            console.log('Discovered users:', state.discoveredUsers);
            console.log('Active chat user ID:', state.activeChatUserId);
            console.log('Messages:', state.messages);
        }
    };
    
    // Window resize handling
    window.addEventListener('resize', () => {
        const searchContainer = document.getElementById('titlebar-search-container');
        if (searchContainer) {
            if (window.innerWidth < 900) {
                searchContainer.style.display = 'none';
            } else {
                searchContainer.style.display = 'block';
            }
        }

        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            const messageBubbles = document.querySelectorAll('.message-bubble > div:not(.w-12)');
            messageBubbles.forEach(bubble => {
                const maxWidth = `min(28rem, calc(100vw - 8rem))`;
                bubble.style.maxWidth = maxWidth;
            });

            const messageImages = document.querySelectorAll('.message-bubble img');
            messageImages.forEach(img => {
                img.style.maxWidth = `min(20rem, calc(100vw - 12rem))`;
            });
        }, 100);
    });

    // PFP Select Logic
    const pfpSelectBtn = document.getElementById('pfp-select-btn');
    const pfpFileInput = document.getElementById('pfp-file-input');
    const pfpPreview = document.getElementById('settings-pfp-preview');

    if (pfpSelectBtn && pfpFileInput && pfpPreview) {
        pfpSelectBtn.addEventListener('click', () => pfpFileInput.click());
        pfpPreview.addEventListener('click', () => pfpFileInput.click());

        if (localStorage.getItem('profilePicture')) {
            pfpPreview.src = localStorage.getItem('profilePicture');
        }

        pfpFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                utils.resizeImage(event.target.result, 96, 96, (resizedBase64) => {
                    pfpPreview.src = resizedBase64;
                    localStorage.setItem('profilePicture', resizedBase64);
                    ui.renderMyUserProfileFooter();
                    network.announcePresence();
                });
            };
            reader.readAsDataURL(file);
        });
    }

    network.setupUserStatusMonitor();

    setTimeout(() => {
        ui.renderUserList();
        ui.renderChatWindow();
        ui.initializeResizer();
    }, 100);
    
    // Font Size Slider Logic (from original script.js lines 273-295)
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValue = document.getElementById('font-size-value');

    if (fontSizeSlider && fontSizeValue) {
        const savedFontSize = localStorage.getItem('fontSizeScale') || 100;
        fontSizeSlider.value = savedFontSize;
        fontSizeValue.textContent = `${savedFontSize}%`;

        fontSizeSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            fontSizeValue.textContent = `${value}%`;

            const previewTexts = document.querySelectorAll('.font-size-preview');
            previewTexts.forEach(el => {
                const baseSize = el.classList.contains('preview-text-sm') ? 0.875 : 1;
                el.style.fontSize = `${baseSize * (value / 100)}rem`;
            });

            fontSizeValue.classList.add('text-purple-500', 'font-bold');
            setTimeout(() => {
                fontSizeValue.classList.remove('text-purple-500', 'font-bold');
            }, 500);
        });
    }
});

// Attach checkUserIds to window for debug calls
window.checkUserIds = utils.checkUserIds;