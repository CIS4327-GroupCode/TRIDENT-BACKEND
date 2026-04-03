const CryptoJS = require("crypto-js");

// Encrypt plaintext → return JSON string for DB
function encryptMessage(plaintext, key) {
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(plaintext, key, { iv });

    return JSON.stringify({
        iv: iv.toString(),
        ciphertext: encrypted.toString()
    });
}

function parseEncryptedPayload(storedBody) {
    if (typeof storedBody !== "string") {
        return { type: "empty" };
    }

    const trimmed = storedBody.trim();

    if (!trimmed) {
        return { type: "empty" };
    }

    // Legacy rows may be stored as plaintext; only parse JSON-like values.
    if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        return { type: "plaintext", value: storedBody };
    }

    let parsed;

    try {
        parsed = JSON.parse(trimmed);
    } catch (_error) {
        return { type: "plaintext", value: storedBody };
    }

    if (
        parsed &&
        typeof parsed.iv === "string" &&
        parsed.iv &&
        typeof parsed.ciphertext === "string" &&
        parsed.ciphertext
    ) {
        return {
            type: "encrypted",
            iv: parsed.iv,
            ciphertext: parsed.ciphertext,
        };
    }

    return { type: "plaintext", value: storedBody };
}

// Decrypt DB JSON string → return plaintext
function decryptMessage(storedBody, key) {
    const payload = parseEncryptedPayload(storedBody);

    if (payload.type === "empty") {
        return "";
    }

    if (payload.type === "plaintext") {
        return payload.value;
    }

    try {
        const bytes = CryptoJS.AES.decrypt(
            payload.ciphertext,
            key,
            { iv: CryptoJS.enc.Hex.parse(payload.iv) }
        );

        const decrypted = bytes.toString(CryptoJS.enc.Utf8);

        if (!decrypted) {
            throw new Error("MESSAGE_DECRYPTION_FAILED");
        }

        return decrypted;
    } catch (error) {
        throw new Error(`DECRYPT_MESSAGE_FAILED: ${error.message}`);
    }
}

module.exports = { encryptMessage, decryptMessage };
