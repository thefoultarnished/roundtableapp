// --- Crypto Utilities for E2EE ---
const ALGO_KEY = { name: "ECDH", namedCurve: "P-256" };
const ALGO_ENC = { name: "AES-GCM", length: 256 };

/**
 * Generate a new ECDH key pair for the user.
 * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
 */
export async function generateKeyPair() {
    return await window.crypto.subtle.generateKey(
        ALGO_KEY,
        true, // extractable
        ["deriveKey", "deriveBits"]
    );
}

/**
 * Export a key to a format suitable for transmission (JWK).
 * @param {CryptoKey} key - The key to export.
 * @returns {Promise<JsonWebKey>}
 */
export async function exportKey(key) {
    return await window.crypto.subtle.exportKey("jwk", key);
}

/**
 * Import a public key received from another user.
 * @param {JsonWebKey} jwk - The JWK object.
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKey(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        ALGO_KEY,
        true,
        []
    );
}

/**
 * Restore a stored key pair from IndexedDB or localStorage (if stored as JWK).
 * helper to re-import private key.
 */
export async function importPrivateKey(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        ALGO_KEY,
        true,
        ["deriveKey", "deriveBits"]
    );
}

/**
 * Derive a shared AES-GCM key from your private key and another user's public key.
 * @param {CryptoKey} privateKey - Your private key.
 * @param {CryptoKey} publicKey - The other user's public key.
 * @returns {Promise<CryptoKey>} - The shared AES-GCM key.
 */
export async function deriveSharedKey(privateKey, publicKey) {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: publicKey },
        privateKey,
        ALGO_ENC,
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypt a message using a shared key.
 * @param {string} text - The plaintext message.
 * @param {CryptoKey} key - The shared AES-GCM key.
 * @returns {Promise<{iv: Array<number>, cipher: Array<number>}>}
 */
export async function encryptMessage(text, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
    );

    return {
        iv: Array.from(iv),
        cipher: Array.from(new Uint8Array(encrypted))
    };
}

/**
 * Decrypt a message using a shared key.
 * @param {Array<number>} iv - The initialization vector.
 * @param {Array<number>} cipher - The ciphertext.
 * @param {CryptoKey} key - The shared AES-GCM key.
 * @returns {Promise<string>} - The decrypted plaintext.
 */
export async function decryptMessage(iv, cipher, key) {
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        new Uint8Array(cipher)
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}
