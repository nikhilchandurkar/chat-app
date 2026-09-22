import crypto from "crypto";

const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY || "12345678901234567890123456789012";
const IV_LENGTH = 16;

export function encrypt(text) {
    if (!text) return text;
    if (text.startsWith("ENC:")) return text;
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return "ENC:" + iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text) {
    if (!text || !text.startsWith("ENC:")) return text;
    try {
        let textParts = text.substring(4).split(":");
        let iv = Buffer.from(textParts.shift(), "hex");
        let encryptedText = Buffer.from(textParts.join(":"), "hex");
        let decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return "[Encrypted Message - Unable to Decrypt]";
    }
}

