import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt } from "../utils/encryption.js";

describe("Message Encryption & Decryption Tests", () => {
    it("should correctly encrypt and decrypt a plain text message", () => {
        const secretMessage = "Hello, this is a highly confidential message!";
        const encrypted = encrypt(secretMessage);

        assert.ok(encrypted.startsWith("ENC:"), "Encrypted text must have 'ENC:' prefix");
        assert.notEqual(encrypted, secretMessage, "Encrypted text must not match plaintext");

        const decrypted = decrypt(encrypted);
        assert.equal(decrypted, secretMessage, "Decrypted text must match original message");
    });

    it("should handle empty strings or null gracefully", () => {
        assert.equal(encrypt(""), "");
        assert.equal(encrypt(null), null);
        assert.equal(decrypt(""), "");
        assert.equal(decrypt(null), null);
    });

    it("should not double-encrypt if string already starts with ENC:", () => {
        const original = "ENC:1234:5678";
        const reEncrypted = encrypt(original);
        assert.equal(reEncrypted, original, "Must not double encrypt");
    });

    it("should return fallback string when decrypting corrupted ciphertext", () => {
        const corrupted = "ENC:invalid_iv:invalid_ciphertext";
        const result = decrypt(corrupted);
        assert.equal(result, "[Encrypted Message - Unable to Decrypt]");
    });

    it("should return original string if decrypt is called on unencrypted text", () => {
        const plain = "Just an unencrypted string";
        assert.equal(decrypt(plain), plain);
    });
});
