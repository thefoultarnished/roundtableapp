import { useState, useEffect, useMemo } from 'react';
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

/**
 * Hook to get blob URLs for multiple users at once (optimized for chat)
 * Loads each user's profile picture only once instead of per-message
 *
 * @param {Array} users - Array of user objects with id, username, profile_picture, profile_picture_timestamp
 * @returns {Object} Map of userId -> blobUrl
 */
export function useProfilePictureMap(users) {
  const [pictureMap, setPictureMap] = useState({});
  const [loadedUserIds, setLoadedUserIds] = useState(new Set());

  // Memoize user IDs for stable dependency
  const userIdString = useMemo(() => {
    if (!users || users.length === 0) return '';
    return users
      .map(u => u.id || u.username)
      .filter(Boolean)
      .sort()
      .join(',');
  }, [users]);

  useEffect(() => {
    if (!users || users.length === 0) {
      setPictureMap({});
      setLoadedUserIds(new Set());
      return;
    }

    let isMounted = true;

    // Only load pictures for users we haven't loaded yet
    const usersToLoad = users.filter(u => !loadedUserIds.has(u.id || u.username));
    if (usersToLoad.length === 0) {
      return; // All pictures already loaded
    }

    async function loadAllPictures() {
      const map = { ...pictureMap };
      const newLoadedIds = new Set(loadedUserIds);

      for (const user of usersToLoad) {
        const userId = user.id || user.username;
        if (!userId) continue;

        try {
          // Try to get from cache first (quiet - no logging on repeat loads)
          const cachedBlobUrl = await getProfilePictureBlobUrl(userId);
          if (cachedBlobUrl) {
            map[userId] = cachedBlobUrl;
          } else if (user.profile_picture) {
            // Use fallback while caching in background
            map[userId] = user.profile_picture;

            // Cache in background
            setTimeout(() => {
              if (isMounted) {
                cacheProfilePictureBlob(userId, user.profile_picture, user.profile_picture_timestamp)
                  .then(() => {
                    // Update map with new blob URL
                    getProfilePictureBlobUrl(userId).then(url => {
                      if (url && isMounted) {
                        setPictureMap(prev => ({ ...prev, [userId]: url }));
                      }
                    });
                  });
              }
            }, 100);
          }
        } catch (error) {
          console.error(`📸 Failed to load picture for ${userId}:`, error);
          if (user.profile_picture) {
            map[userId] = user.profile_picture;
          }
        }

        newLoadedIds.add(userId);
      }

      if (isMounted) {
        setPictureMap(map);
        setLoadedUserIds(newLoadedIds);
      }
    }

    loadAllPictures();

    return () => {
      isMounted = false;
    };
  }, [userIdString, loadedUserIds, users]);

  return pictureMap;
}
