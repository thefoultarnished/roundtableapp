// src/crypto.js

// We use ECDH (Elliptic Curve Diffie-Hellman) with P-256 curve for key exchange.
// We use AES-GCM for symmetric encryption of messages.

const ALGORITHM_NAME = 'ECDH';
const NAMED_CURVE = 'P-256';

/**
 * Generates a new ECDH key pair for the user.
 * Ideally, this should be done once and stored in IndexedDB or localStorage (if secure enough),
 * but for now we'll generate on session start.
 */
export async function generateKeyPair() {
    return window.crypto.subtle.generateKey(
        {
            name: ALGORITHM_NAME,
            namedCurve: NAMED_CURVE,
        },
        true, // extracted
        ['deriveKey', 'deriveBits']
    );
}

/**
 * Exports the public key to a format suitable for transmission (JWK).
 */
export async function exportPublicKey(key) {
    if (!key) return null;
    return window.crypto.subtle.exportKey('jwk', key);
}

/**
 * Imports a public key from a JWK object received from another user.
 */
export async function importPublicKey(jwk) {
    if (!jwk) return null;
    return window.crypto.subtle.importKey(
        'jwk',
        jwk,
        {
            name: ALGORITHM_NAME,
            namedCurve: NAMED_CURVE,
        },
        true,
        []
    );
}

/**
 * Derives a shared AES-GCM key from our private key and the other user's public key.
 */
export async function deriveSharedKey(privateKey, publicKey) {
    if (!privateKey || !publicKey) return null;

    return window.crypto.subtle.deriveKey(
        {
            name: ALGORITHM_NAME,
            public: publicKey,
        },
        privateKey,
        {
            name: 'AES-GCM',
            length: 256,
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a text message using the shared AES-GCM key.
 * Returns an object containing the ciphertext (as base64) and the IV (initialization vector).
 */
export async function encryptMessage(text, sharedKey) {
    if (!text || !sharedKey) return null;

    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // IV must be unique for every encryption operation
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        sharedKey,
        data
    );

    return {
        ciphertext: arrayBufferToBase64(encryptedContent),
        iv: arrayBufferToBase64(iv),
    };
}

/**
 * Decrypts an encrypted message using the shared AES-GCM key.
 */
export async function decryptMessage(encryptedData, sharedKey) {
    if (!encryptedData || !sharedKey) return null;

    const { ciphertext, iv } = encryptedData;
    
    try {
        const decryptedContent = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: base64ToArrayBuffer(iv),
            },
            sharedKey,
            base64ToArrayBuffer(ciphertext)
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedContent);
    } catch (e) {
        console.error("Decryption failed:", e);
        return null; // Or return a "Message could not be decrypted" string
    }
}


/* --- Helpers --- */

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
