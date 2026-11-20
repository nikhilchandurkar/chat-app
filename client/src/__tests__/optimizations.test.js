import { describe, it, expect, vi } from "vitest";
import { compressImageToWebP, compressFilesBatch } from "../utils/imageCompressor";
import { getCachedMessages, saveCachedMessages } from "../utils/offlineStore";
import { areChatItemPropsEqual } from "../components/shared/ChatItem";

describe("Performance Optimizations Tests", () => {
  it("compressImageToWebP should pass through non-image or GIF files untouched", async () => {
    const textFile = new File(["hello world"], "test.txt", { type: "text/plain" });
    const resText = await compressImageToWebP(textFile);
    expect(resText).toBe(textFile);

    const gifFile = new File(["GIF89a..."], "anim.gif", { type: "image/gif" });
    const resGif = await compressImageToWebP(gifFile);
    expect(resGif).toBe(gifFile);

    const svgFile = new File(["<svg></svg>"], "icon.svg", { type: "image/svg+xml" });
    const resSvg = await compressImageToWebP(svgFile);
    expect(resSvg).toBe(svgFile);
  });

  it("compressFilesBatch handles array of files safely", async () => {
    const files = [
      new File(["data"], "doc.pdf", { type: "application/pdf" }),
      new File(["abc"], "note.txt", { type: "text/plain" }),
    ];
    const results = await compressFilesBatch(files);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("doc.pdf");
    expect(results[1].name).toBe("note.txt");
  });

  it("offlineStore provides resilient fallbacks for getCachedMessages and saveCachedMessages", async () => {
    const empty = await getCachedMessages("non_existent_chat");
    expect(empty).toEqual([]);

    await saveCachedMessages("chat_123", [{ _id: "m1", content: "hello" }]);
    const loaded = await getCachedMessages("chat_123");
    expect(Array.isArray(loaded)).toBe(true);
  });

  it("areChatItemPropsEqual prevents unnecessary re-renders when irrelevant props are steady", () => {
    const baseProps = {
      _id: "c1",
      name: "General",
      lastMessage: "Hello",
      unreadCount: 0,
      isOnline: false,
      isTyping: false,
      isPinned: false,
      isMuted: false,
      isArchived: false,
      sameSender: false,
      index: 0,
      draftTick: 0,
      avatar: ["url1"],
    };

    // Identical props should return true (skip re-render)
    expect(areChatItemPropsEqual(baseProps, { ...baseProps })).toBe(true);

    // Typing change should return false (re-render)
    expect(areChatItemPropsEqual(baseProps, { ...baseProps, isTyping: true })).toBe(false);

    // Online status change should return false (re-render)
    expect(areChatItemPropsEqual(baseProps, { ...baseProps, isOnline: true })).toBe(false);

    // Unread count change should return false (re-render)
    expect(areChatItemPropsEqual(baseProps, { ...baseProps, unreadCount: 1 })).toBe(false);

    // Last message change should return false (re-render)
    expect(areChatItemPropsEqual(baseProps, { ...baseProps, lastMessage: "New message" })).toBe(false);
  });
});
