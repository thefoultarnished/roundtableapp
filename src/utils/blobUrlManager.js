/**
 * Blob URL Manager
 * Prevents memory leaks by tracking and revoking blob URLs
 */

class BlobUrlManager {
  constructor() {
    this.urlMap = new Map(); // userId -> blobUrl
  }

  /**
   * Get or create a blob URL for a user
   * @param {string} userId - User's ID
   * @param {Blob} blob - Image blob
   * @returns {string} - Blob URL
   */
  getOrCreate(userId, blob) {
    // Check if we already have a URL for this user
    const existing = this.urlMap.get(userId);
    if (existing) {
      return existing;
    }

    // Create new blob URL
    const blobUrl = URL.createObjectURL(blob);
    this.urlMap.set(userId, blobUrl);

    console.log(`📸 Created blob URL for ${userId}`);
    return blobUrl;
  }

  /**
   * Revoke blob URL for a specific user
   * @param {string} userId - User's ID
   */
  revoke(userId) {
    const blobUrl = this.urlMap.get(userId);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.urlMap.delete(userId);
      console.log(`📸 Revoked blob URL for ${userId}`);
    }
  }

  /**
   * Revoke all blob URLs (call on logout)
   */
  revokeAll() {
    console.log(`📸 Revoking all blob URLs (${this.urlMap.size} total)`);

    for (const [userId, blobUrl] of this.urlMap.entries()) {
      URL.revokeObjectURL(blobUrl);
    }

    this.urlMap.clear();
  }

  /**
   * Get the current number of blob URLs being managed
   * @returns {number}
   */
  size() {
    return this.urlMap.size;
  }
}

// Export singleton instance
export const blobUrlManager = new BlobUrlManager();
