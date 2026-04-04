const { encryptMessage, decryptMessage } = require('../../src/utils/encryption');

describe('Encryption Utility', () => {
  const key = 'unit-test-secret';

  it('encrypts and decrypts a message payload', () => {
    const encrypted = encryptMessage('hello world', key);

    const parsed = JSON.parse(encrypted);
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ciphertext).toBe('string');

    const decrypted = decryptMessage(encrypted, key);
    expect(decrypted).toBe('hello world');
  });

  it('returns legacy plaintext without attempting JSON decryption', () => {
    const plaintext = 'Absolutely yes, this is legacy plaintext';

    const decrypted = decryptMessage(plaintext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('returns empty string for empty values', () => {
    expect(decryptMessage('', key)).toBe('');
    expect(decryptMessage('   ', key)).toBe('');
  });

  it('throws for encrypted payload that cannot be decrypted with given key', () => {
    const encryptedWithDifferentKey = encryptMessage('secret body', 'different-key');

    expect(() => decryptMessage(encryptedWithDifferentKey, key)).toThrow(
      /DECRYPT_MESSAGE_FAILED/
    );
  });
});
