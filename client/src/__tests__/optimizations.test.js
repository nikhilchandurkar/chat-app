import { describe, it, expect, vi } from "vitest";
import { compressImageToWebP, compressFilesBatch } from "../utils/imageCompressor";
import { getCachedMessages, saveCachedMessages } from "../utils/offlineStore";

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
});
