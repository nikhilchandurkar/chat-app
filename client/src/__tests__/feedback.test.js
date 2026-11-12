import { describe, it, expect } from "vitest";
import {
  extractBurstEmoji,
  getChatFontSize,
  isEnterToSendEnabled,
  isPrivacyBlurEnabled,
  isScreenshotBlockEnabled,
} from "../utils/feedback";

describe("Chat UX feedback helpers", () => {
  it("extracts celebration emojis from short festive messages only", () => {
    expect(extractBurstEmoji("🎉")).toBe("🎉");
    expect(extractBurstEmoji("Happy birthday 🥳")).toBe("🥳");
    expect(extractBurstEmoji("Hello world")).toBeNull();
    expect(extractBurstEmoji("This is a much longer message containing ❤️ that should not burst")).toBeNull();
  });

  it("provides sensible defaults in non-browser environment", () => {
    expect(getChatFontSize()).toBe(14.5);
    expect(isEnterToSendEnabled()).toBe(true);
    expect(isScreenshotBlockEnabled()).toBe(true);
    expect(isPrivacyBlurEnabled()).toBe(true);
  });
});

