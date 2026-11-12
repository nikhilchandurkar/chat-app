import { describe, expect, it, beforeEach } from "vitest";
import { encodeFramesToGifBlob } from "../utils/gifEncoder";
import { parseMessageSegments } from "../utils/markdown.jsx";
import {
  decryptE2eeMessage,
  encryptE2eeMessage,
  generateIdentityKeyPair,
  isE2eePayload,
} from "../utils/e2ee";
import { hashPin } from "../utils/appLock";
import { transformImage } from "../lib/feature";
import { extractCelebrationTrigger } from "../utils/feedback";
import { extractYouTubeId, parseRemindCommand } from "../utils/interactive";
import { buildUnreadRecap, getSmartReplySuggestions } from "../utils/chatEnhancements";

describe("rich composer & security utilities", () => {
  it("encodes RGBA frames into a valid looping GIF89a blob", async () => {
    const w = 16;
    const h = 16;
    const frame1 = new Uint8ClampedArray(w * h * 4).fill(255);
    const frame2 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      frame2[i * 4] = 35;
      frame2[i * 4 + 1] = 107;
      frame2[i * 4 + 2] = 74;
      frame2[i * 4 + 3] = 255;
    }

    const blob = encodeFramesToGifBlob([frame1, frame2], { width: w, height: h, delayCs: 10 });
    expect(blob.type).toBe("image/gif");
    const buf = new Uint8Array(await blob.arrayBuffer());
    const header = String.fromCharCode(...buf.slice(0, 6));
    expect(header).toBe("GIF89a");
    expect(buf[buf.length - 1]).toBe(0x3b);
  });

  it("parses fenced code blocks alongside formatted text segments", () => {
    const segs = parseMessageSegments("Hi **team**\n```js\nconst x = 1;\n```\nDone");
    expect(segs).toEqual([
      { type: "text", content: "Hi **team**\n" },
      { type: "code", lang: "js", content: "const x = 1;" },
      { type: "text", content: "\nDone" },
    ]);
  });

  it("performs real ECDH P-256 + AES-GCM client-side encryption & decryption", async () => {
    const alice = await generateIdentityKeyPair();
    const bob = await generateIdentityKeyPair();
    const mallory = await generateIdentityKeyPair();

    const cipher = await encryptE2eeMessage("Secret lunch spot at 1pm", alice, bob.publicJwk);
    expect(isE2eePayload(cipher)).toBe(true);

    const bobDecrypted = await decryptE2eeMessage(cipher, bob, false);
    expect(bobDecrypted.failed).toBe(false);
    expect(bobDecrypted.text).toBe("Secret lunch spot at 1pm");

    const aliceSelf = await decryptE2eeMessage(cipher, alice, true);
    expect(aliceSelf.failed).toBe(false);
    expect(aliceSelf.text).toBe("Secret lunch spot at 1pm");

    const malloryAttempt = await decryptE2eeMessage(cipher, mallory, false);
    expect(malloryAttempt.failed).toBe(true);
  });

  it("hashes 4-6 digit PINs consistently", async () => {
    const h1 = await hashPin("123456");
    const h2 = await hashPin("123456");
    const h3 = await hashPin("654321");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1.length).toBeGreaterThan(8);
  });

  it("rewrites only genuine cloudinary host URLs and never arbitrary query substrings", () => {
    expect(transformImage("https://res.cloudinary.com/demo/image/upload/sample.jpg", 300)).toContain(
      "/upload/dpr_auto,w_300/"
    );
    expect(transformImage("https://evil.example.com/upload/?ref=cloudinary.com", 300)).toBe(
      "https://evil.example.com/upload/?ref=cloudinary.com"
    );
  });

  it("extracts celebration triggers, YouTube IDs, and /remind commands cleanly", () => {
    expect(extractCelebrationTrigger("/confetti Happy Birthday!")?.mode).toBe("confetti");
    expect(extractCelebrationTrigger("/fireworks")?.mode).toBe("fireworks");
    expect(extractCelebrationTrigger("/hearts")?.mode).toBe("hearts");

    expect(extractYouTubeId("https://youtu.be/jfKfPfyJRdk")).toBe("jfKfPfyJRdk");
    expect(extractYouTubeId("https://www.youtube.com/watch?v=4xDzrJKXOOY&t=12")).toBe("4xDzrJKXOOY");

    const rem = parseRemindCommand("/remind me in 15m check builds");
    expect(rem?.content).toBe("⏰ Reminder: check builds");
    expect(rem?.scheduledFor instanceof Date).toBe(true);
  });

  it("builds local Catch Me Up unread recap & contextual smart reply chips", () => {
    const replies = getSmartReplySuggestions(
      { _id: "m1", sender: { _id: "u2", name: "Bob" }, content: "Where are you right now?" },
      "u1"
    );
    expect(replies).toContain("On my way!");

    const emptyForSelf = getSmartReplySuggestions(
      { _id: "m2", sender: { _id: "u1", name: "Me" }, content: "Hello?" },
      "u1"
    );
    expect(emptyForSelf).toEqual([]);

    const recap = buildUnreadRecap(
      [
        { _id: "1", sender: { _id: "u2", name: "Bob" }, content: "Hey @alice can you review https://example.com ?" },
        { _id: "2", sender: { _id: "u3", name: "Carol" }, content: "Vote here", attachments: [{ type: "poll", question: "Dinner?" }] },
      ],
      2,
      "u1",
      "alice"
    );
    expect(recap.questions.length).toBe(1);
    expect(recap.mentions.length).toBe(1);
    expect(recap.links[0].url).toBe("https://example.com");
    expect(recap.highlights[0]).toContain("Dinner?");
  });
});

