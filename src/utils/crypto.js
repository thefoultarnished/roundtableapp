// --- Crypto Utilities for E2EE ---
import { p256 } from '@noble/curves/nist.js';

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

/**
 * Helper function to convert ArrayBuffer to base64url.
 * Used for converting binary key material to JWK format.
 * @param {ArrayBuffer|Uint8Array} buffer - The buffer to convert.
 * @returns {string} - The base64url-encoded string.
 */
function arrayBufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Derive a deterministic P-256 ECDH key pair from username and password.
 * Same username + password = same keys = consistent message decryption across devices.
 *
 * Uses PBKDF2 + SHA-256 to derive a deterministic private key, then @noble/curves to compute the public key.
 *
 * @param {string} username - The username (used as salt for determinism)
 * @param {string} password - The password (key material)
 * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>} - Deterministic ECDH key pair
 * @throws {Error} - If key derivation fails
 */
export async function deriveKeyPairFromPassword(username, password) {
    const encoder = new TextEncoder();

    try {
        // Use username as salt (deterministic, unique per user)
        const salt = encoder.encode(username.toLowerCase());

        // Import password as base key for PBKDF2
        const baseKey = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        // Derive 256 bits (32 bytes) for private key seed using PBKDF2
        const derivedBits = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,  // High iteration count for security
                hash: 'SHA-256'
            },
            baseKey,
            256  // 256 bits
        );

        // Convert to Uint8Array
        const privateKeyBytes = new Uint8Array(derivedBits);

        // Use @noble/curves to compute the P-256 public key from the private key
        const publicKeyUncompressed = p256.getPublicKey(privateKeyBytes, false); // uncompressed: 0x04 + X + Y

        // Extract X and Y coordinates (each 32 bytes, starting after 0x04 prefix)
        const xCoord = publicKeyUncompressed.slice(1, 33);
        const yCoord = publicKeyUncompressed.slice(33, 65);

        // Import private key as P-256 JWK with computed public key coordinates
        const privateKey = await window.crypto.subtle.importKey(
            'jwk',
            {
                kty: 'EC',
                crv: 'P-256',
                d: arrayBufferToBase64Url(privateKeyBytes),
                x: arrayBufferToBase64Url(xCoord),
                y: arrayBufferToBase64Url(yCoord),
                ext: true
            },
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey', 'deriveBits']
        );

        // Import public key separately
        const publicKey = await window.crypto.subtle.importKey(
            'jwk',
            {
                kty: 'EC',
                crv: 'P-256',
                x: arrayBufferToBase64Url(xCoord),
                y: arrayBufferToBase64Url(yCoord),
                ext: true
            },
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            []
        );

        return { privateKey, publicKey };
    } catch (e) {
        throw new Error(`Failed to derive key pair from password: ${e.message}`);
    }
}
