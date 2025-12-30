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

// Decrypt DB JSON string → return plaintext
function decryptMessage(storedBody, key) {
    try {
        const { iv, ciphertext } = JSON.parse(storedBody);

        const bytes = CryptoJS.AES.decrypt(
            ciphertext,
            key,
            { iv: CryptoJS.enc.Hex.parse(iv) }
        );

        return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
        return "[Decrypt Error]";
    }
}

module.exports = { encryptMessage, decryptMessage };
