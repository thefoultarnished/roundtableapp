/**
 * Simple test function to verify setOverlayIcon works at all
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { Image } from '@tauri-apps/api/image';

/**
 * Test function - call this from the browser console to test the API
 */
export async function testOverlayIcon() {
  console.log('=== Testing Overlay Icon API ===');

  try {
    const window = getCurrentWindow();
    console.log('✓ Got window');

    // Create a simple test icon
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');

    // Red circle
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(8, 8, 8, 0, Math.PI * 2);
    ctx.fill();

    const dataUrl = canvas.toDataURL('image/png');
    console.log('✓ Created test icon');

    // Convert to bytes
    const base64Data = dataUrl.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log('✓ Converted to bytes:', bytes.length);

    // Create Image
    const image = await Image.fromBytes(bytes);
    console.log('✓ Created Image object');

    // Try setOverlayIcon
    console.log('Attempting setOverlayIcon...');
    await window.setOverlayIcon(image);
    console.log('✓ setOverlayIcon succeeded!');

    // Try clearing it after 3 seconds
    setTimeout(async () => {
      console.log('Clearing overlay icon...');
      await window.setOverlayIcon(null);
      console.log('✓ Overlay cleared');
    }, 3000);

    return 'Test completed - check your taskbar!';
  } catch (error) {
    console.error('✗ Test failed:', error);
    return `Test failed: ${error.message}`;
  }
}

// Make it globally available for console testing
window.__testOverlayIcon = testOverlayIcon;
console.log('Test function loaded. Run: window.__testOverlayIcon()');
