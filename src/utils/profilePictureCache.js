/**
 * Profile Picture Cache Utilities
 * Manages localStorage caching with timestamps for profile pictures
 */

const CACHE_PREFIX = 'profilePic_';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached profile picture URL for a user
 * @param {string} username - The username to look up
 * @returns {{url: string, timestamp: number} | null} - Cached data or null
 */
export function getCachedProfilePic(username) {
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + username);
    if (!cached) return null;

    const data = JSON.parse(cached);
    return data;
  } catch (e) {
    console.error('Failed to read profile pic cache:', e);
    return null;
  }
}

/**
 * Set cached profile picture URL for a user
 * @param {string} username - The username
 * @param {string} url - The MinIO URL
 * @param {number} timestamp - The timestamp when this pic was uploaded
 */
export function setCachedProfilePic(username, url, timestamp = Date.now()) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + username,
      JSON.stringify({ url, timestamp })
    );
  } catch (e) {
    console.error('Failed to cache profile pic:', e);
  }
}

/**
 * Check if cached data is stale
 * @param {number} timestamp - The cached timestamp
 * @param {number} maxAge - Maximum age in milliseconds (default: 24h)
 * @returns {boolean} - True if stale
 */
export function isCacheStale(timestamp, maxAge = CACHE_EXPIRY_MS) {
  if (!timestamp) return true;
  return Date.now() - timestamp > maxAge;
}

/**
 * Clear profile picture cache for a specific user
 * @param {string} username - The username
 */
export function clearProfilePicCache(username) {
  try {
    localStorage.removeItem(CACHE_PREFIX + username);
  } catch (e) {
    console.error('Failed to clear profile pic cache:', e);
  }
}

/**
 * Clear all profile picture caches (for cleanup/logout)
 */
export function clearAllProfilePicCaches() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) {
    console.error('Failed to clear all profile pic caches:', e);
  }
}
