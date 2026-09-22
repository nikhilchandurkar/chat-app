import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Validation helper functions matching the application's rules
function validateUsername(username) {
    if (!username || typeof username !== "string") return false;
    // 3-30 chars, alphanumeric and underscore
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    return usernameRegex.test(username);
}

function validateEmail(email) {
    if (!email || typeof email !== "string") return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.toLowerCase().trim());
}

function validatePassword(password) {
    if (!password || typeof password !== "string") return false;
    return password.length >= 8;
}

describe("User Input Validation Tests", () => {
    describe("Username Validation", () => {
        it("should accept valid alphanumeric usernames between 3 and 30 characters", () => {
            assert.equal(validateUsername("janedoe"), true);
            assert.equal(validateUsername("john_doe_99"), true);
            assert.equal(validateUsername("user123"), true);
        });

        it("should reject usernames that are too short (< 3 chars)", () => {
            assert.equal(validateUsername("ab"), false);
            assert.equal(validateUsername("a"), false);
            assert.equal(validateUsername(""), false);
        });

        it("should reject usernames that are too long (> 30 chars)", () => {
            const longUsername = "a".repeat(31);
            assert.equal(validateUsername(longUsername), false);
        });

        it("should reject usernames with special characters or spaces", () => {
            assert.equal(validateUsername("jane doe"), false);
            assert.equal(validateUsername("jane@doe"), false);
            assert.equal(validateUsername("jane!"), false);
        });
    });

    describe("Email Validation", () => {
        it("should accept valid email addresses", () => {
            assert.equal(validateEmail("user@example.com"), true);
            assert.equal(validateEmail("nikhilchandurkar24@gmail.com"), true);
            assert.equal(validateEmail("test.user+tag@domain.co.uk"), true);
        });

        it("should reject invalid email formats", () => {
            assert.equal(validateEmail("invalid-email"), false);
            assert.equal(validateEmail("@domain.com"), false);
            assert.equal(validateEmail("user@.com"), false);
            assert.equal(validateEmail(""), false);
        });
    });

    describe("Password Validation", () => {
        it("should accept passwords with 8 or more characters", () => {
            assert.equal(validatePassword("Password123!"), true);
            assert.equal(validatePassword("12345678"), true);
        });

        it("should reject passwords with fewer than 8 characters", () => {
            assert.equal(validatePassword("1234567"), false);
            assert.equal(validatePassword("short"), false);
            assert.equal(validatePassword(""), false);
        });
    });
});

