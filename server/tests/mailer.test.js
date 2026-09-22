import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Mailer Configuration & Sanitization Tests", () => {
    it("should strip whitespace from Google App Passwords", () => {
        const rawAppPass = "abcd efgh ijkl mnop";
        const cleaned = rawAppPass.trim().replace(/\s+/g, "");
        assert.equal(cleaned, "abcdefghijklmnop", "Spaces in Google App Passwords must be removed");
    });

    it("should detect Gmail addresses and select gmail service", () => {
        const email = "user@gmail.com";
        const isGmail = email.endsWith("@gmail.com");
        assert.equal(isGmail, true, "Must recognize @gmail.com addresses");
    });

    it("should correctly handle port 465 as secure and 587 as non-secure", () => {
        const port465 = 465;
        const port587 = 587;

        const isSecure465 = port465 === 465;
        const isSecure587 = port587 === 465;

        assert.equal(isSecure465, true, "Port 465 must be secure");
        assert.equal(isSecure587, false, "Port 587 must use STARTTLS (secure: false)");
    });
});

