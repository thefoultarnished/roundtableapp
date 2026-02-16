import { useState, useEffect } from 'react';
import { getProfilePictureBlobUrl, cacheProfilePictureBlob } from '../utils/profilePictureBlobCache';

/**
 * Hook to get blob URL for a user's profile picture
 * Automatically loads from IndexedDB cache or fetches if needed
 *
 * @param {string} userId - User's ID
 * @param {string} fallbackUrl - MinIO URL to use as fallback
 * @param {number} timestamp - Server timestamp for version checking
 * @returns {{blobUrl: string|null, loading: boolean}}
 */
export function useProfilePictureBlobUrl(userId, fallbackUrl, timestamp = null) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetchedTimestamp, setLastFetchedTimestamp] = useState(null);

  useEffect(() => {
    if (!userId || !fallbackUrl) {
      setBlobUrl(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let timeoutId = null;

    async function loadBlobUrl() {
      try {
        setLoading(true);

        // Try to get blob URL from IndexedDB
        const cachedBlobUrl = await getProfilePictureBlobUrl(userId);

        if (cachedBlobUrl && isMounted) {
          console.log(`📸 Using cached blob for ${userId}`);
          setBlobUrl(cachedBlobUrl);
          setLoading(false);
          return;
        }

        // Cache miss - use fallback and optionally fetch in background
        if (isMounted) {
          setBlobUrl(fallbackUrl);
          setLoading(false);
        }

        // Skip background fetch if we just fetched with this timestamp
        const currentTimestamp = timestamp || Date.now();
        if (lastFetchedTimestamp === currentTimestamp) {
          return;
        }

        // Fetch and cache blob in background with debounce
        timeoutId = setTimeout(async () => {
          if (!isMounted) return;

          try {
            await cacheProfilePictureBlob(userId, fallbackUrl, currentTimestamp);
            setLastFetchedTimestamp(currentTimestamp);

            // Update to blob URL after caching
            if (isMounted) {
              const newBlobUrl = await getProfilePictureBlobUrl(userId);
              if (newBlobUrl) {
                setBlobUrl(newBlobUrl);
              }
            }
          } catch (error) {
            console.error(`📸 Background fetch failed for ${userId}:`, error);
            // Keep using fallback URL
          }
        }, 100);
      } catch (error) {
        console.error(`📸 Failed to load blob URL for ${userId}:`, error);
        if (isMounted) {
          setBlobUrl(fallbackUrl);
          setLoading(false);
        }
      }
    }

    loadBlobUrl();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [userId, fallbackUrl, timestamp, lastFetchedTimestamp]);

  return { blobUrl: blobUrl || fallbackUrl, loading };
}
