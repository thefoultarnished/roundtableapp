/**
 * Profile Picture Blob Cache
 * Manages IndexedDB blob storage for profile pictures with version-based invalidation
 */

import {
  getProfilePictureBlob,
  saveProfilePictureBlob,
  deleteProfilePictureBlob,
  getAllProfilePictureBlobs,
  clearAllProfilePictureBlobs,
  forceUpgradeDatabase
} from './indexedDB';
import { getCachedProfilePic } from './profilePictureCache';
import { blobUrlManager } from './blobUrlManager';

// Configuration constants
const CONFIG = {
  MAX_AGE_DAYS: 30,              // Auto-cleanup after 30 days
  MAX_CACHED_USERS: 100,         // LRU eviction threshold
  FETCH_TIMEOUT_MS: 10000,       // MinIO fetch timeout
  RETRY_DELAY_MS: 5000,          // Retry failed fetch delay
  ENABLE_FALLBACK: true,         // localStorage fallback during migration
};

/**
 * Fetch from MinIO and store blob in IndexedDB
 * @param {string} userId - User's ID
 * @param {string} minioUrl - MinIO URL
 * @param {number} serverTimestamp - Server version timestamp
 * @param {Blob} optionalBlob - Optional blob if already fetched
 * @returns {Promise<void>}
 */
export async function cacheProfilePictureBlob(userId, minioUrl, serverTimestamp, optionalBlob = null) {
  try {
    let blob = optionalBlob;

    // Fetch blob if not provided
    if (!blob) {
      console.log(`📸 Fetching profile picture for ${userId} from MinIO...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(minioUrl, {
          mode: 'cors',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        blob = await response.blob();
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    }

    // Validate blob type (allow image/* and binary/octet-stream from MinIO)
    if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'binary/octet-stream' && blob.type !== 'application/octet-stream') {
      console.warn(`⚠️ Unexpected blob type for ${userId}: ${blob.type}, proceeding anyway`);
    }

    // Ensure blob has content (size check)
    if (blob.size === 0) {
      console.warn(`⚠️ Empty blob for ${userId}`);
      return;
    }

    // Store in IndexedDB
    const record = {
      userId,
      blob,
      timestamp: serverTimestamp || Date.now(),
      url: minioUrl,
      cachedAt: Date.now(),
      size: blob.size
    };

    await saveProfilePictureBlob(record);
    console.log(`📸 Cached blob for ${userId} (${(blob.size / 1024).toFixed(1)} KB)`);

    // Trigger cleanup if needed
    await cleanupIfNeeded();
  } catch (error) {
    console.error(`📸 Failed to cache blob for ${userId}:`, error);
    throw error;
  }
}

/**
 * Retrieve cached blob
 * @param {string} userId - User's ID
 * @returns {Promise<Object|null>} - Profile picture record or null
 */
export async function getCachedProfilePictureBlob(userId) {
  try {
    const record = await getProfilePictureBlob(userId);
    if (record) {
      console.log(`📸 Retrieved cached blob for ${userId}`);
    }
    return record;
  } catch (error) {
    console.error(`📸 Failed to get cached blob for ${userId}:`, error);
    return null;
  }
}

/**
 * Get metadata only (for version checking)
 * @param {string} userId - User's ID
 * @returns {Promise<{timestamp: number, url: string, cachedAt: number, size: number}|null>}
 */
export async function getProfilePictureMeta(userId) {
  try {
    const record = await getProfilePictureBlob(userId);
    if (!record) return null;

    return {
      timestamp: record.timestamp,
      url: record.url,
      cachedAt: record.cachedAt,
      size: record.size
    };
  } catch (error) {
    console.error(`📸 Failed to get metadata for ${userId}:`, error);
    return null;
  }
}

/**
 * Check if cached version is current
 * @param {string} userId - User's ID
 * @param {number} serverTimestamp - Server version timestamp
 * @returns {Promise<boolean>} - True if cache is valid
 */
export async function isCacheValid(userId, serverTimestamp) {
  try {
    const meta = await getProfilePictureMeta(userId);
    if (!meta) return false;

    // Check if cached timestamp >= server timestamp
    const isValid = meta.timestamp >= serverTimestamp;

    if (isValid) {
      console.log(`📸 Cache valid for ${userId} (cached: ${meta.timestamp}, server: ${serverTimestamp})`);
    } else {
      console.log(`📸 Cache stale for ${userId} (cached: ${meta.timestamp}, server: ${serverTimestamp})`);
    }

    return isValid;
  } catch (error) {
    console.error(`📸 Failed to check cache validity for ${userId}:`, error);
    return false;
  }
}

/**
 * Create blob URL from cached blob
 * @param {string} userId - User's ID
 * @returns {Promise<string|null>} - Blob URL or null
 */
export async function getProfilePictureBlobUrl(userId) {
  try {
    const record = await getCachedProfilePictureBlob(userId);
    if (!record || !record.blob) return null;

    // Use blob URL manager to create/reuse URL
    const blobUrl = blobUrlManager.getOrCreate(userId, record.blob);
    return blobUrl;
  } catch (error) {
    console.error(`📸 Failed to get blob URL for ${userId}:`, error);
    return null;
  }
}

/**
 * Cleanup old entries (>30 days or >100 users)
 * @returns {Promise<void>}
 */
export async function cleanupOldProfilePictures() {
  try {
    const allRecords = await getAllProfilePictureBlobs();
    if (allRecords.length === 0) return;

    console.log(`📸 Starting cleanup (${allRecords.length} cached profile pictures)`);

    const now = Date.now();
    const maxAge = CONFIG.MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    // Find records to delete
    const toDelete = [];

    // Delete records older than MAX_AGE_DAYS
    for (const record of allRecords) {
      if (now - record.cachedAt > maxAge) {
        toDelete.push(record.userId);
      }
    }

    // LRU eviction if over MAX_CACHED_USERS
    if (allRecords.length > CONFIG.MAX_CACHED_USERS) {
      // Sort by cachedAt (oldest first)
      const sortedRecords = [...allRecords].sort((a, b) => a.cachedAt - b.cachedAt);
      const excessCount = allRecords.length - CONFIG.MAX_CACHED_USERS;

      for (let i = 0; i < excessCount; i++) {
        if (!toDelete.includes(sortedRecords[i].userId)) {
          toDelete.push(sortedRecords[i].userId);
        }
      }
    }

    // Delete records
    for (const userId of toDelete) {
      await deleteProfilePictureBlob(userId);
      blobUrlManager.revoke(userId);
    }

    if (toDelete.length > 0) {
      console.log(`📸 Cleaned up ${toDelete.length} profile pictures`);
    } else {
      console.log(`📸 No cleanup needed`);
    }
  } catch (error) {
    console.error('📸 Failed to cleanup profile pictures:', error);
  }
}

/**
 * Cleanup if needed (called after each cache operation)
 * @returns {Promise<void>}
 */
async function cleanupIfNeeded() {
  try {
    const allRecords = await getAllProfilePictureBlobs();

    // Only cleanup if we're over the threshold
    if (allRecords.length > CONFIG.MAX_CACHED_USERS * 1.1) {
      await cleanupOldProfilePictures();
    }
  } catch (error) {
    console.error('📸 Failed to check cleanup:', error);
  }
}

/**
 * Clear specific user's blob
 * @param {string} userId - User's ID
 * @returns {Promise<void>}
 */
export async function clearProfilePictureBlob(userId) {
  try {
    await deleteProfilePictureBlob(userId);
    blobUrlManager.revoke(userId);
    console.log(`📸 Cleared blob for ${userId}`);
  } catch (error) {
    console.error(`📸 Failed to clear blob for ${userId}:`, error);
  }
}

/**
 * Clear all blobs
 * @returns {Promise<void>}
 */
export async function clearAllProfilePictureBlobsWithRevoke() {
  try {
    await clearAllProfilePictureBlobs();
    blobUrlManager.revokeAll();
    console.log('📸 Cleared all profile picture blobs');
  } catch (error) {
    console.error('📸 Failed to clear all blobs:', error);
  }
}

/**
 * Migrate localStorage → IndexedDB
 * @returns {Promise<void>}
 */
export async function migrateFromLocalStorage() {
  try {
    const keys = Object.keys(localStorage);
    const profilePicKeys = keys.filter(key => key.startsWith('profilePic_'));

    if (profilePicKeys.length === 0) {
      console.log('📸 No localStorage entries to migrate');
      return;
    }

    // Check if database needs upgrade
    const db = await import('./indexedDB').then(m => m.initDB());
    if (!db.objectStoreNames.contains('profilePictures')) {
      console.warn('⚠️ Database schema needs upgrade. Forcing upgrade...');
      await forceUpgradeDatabase();
      return; // Will retry migration on next app load
    }

    let migratedCount = 0;
    let failedCount = 0;

    for (const key of profilePicKeys) {
      const userId = key.replace('profilePic_', '');

      try {
        // Check if already in IndexedDB
        const existing = await getCachedProfilePictureBlob(userId);
        if (existing) {
          console.log(`📸 Skipping ${userId} (already in IndexedDB)`);
          continue;
        }

        // Get from localStorage
        const cached = getCachedProfilePic(userId);
        if (!cached || !cached.url) {
          console.warn(`📸 Invalid localStorage entry for ${userId}`);
          continue;
        }

        // Fetch and cache blob
        await cacheProfilePictureBlob(userId, cached.url, cached.timestamp);
        migratedCount++;
      } catch (error) {
        console.error(`📸 Failed to migrate ${userId}:`, error);
        failedCount++;
      }
    }

    console.log(`📸 Migration complete: ${migratedCount} migrated, ${failedCount} failed`);
  } catch (error) {
    console.error('📸 Migration failed:', error);
  }
}
