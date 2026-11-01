import { describe, it, expect } from "vitest";
import { server } from "../constants/config";

describe("Frontend configuration", () => {
  it("server constant should be defined as a string", () => {
    expect(typeof server).toBe("string");
  });

  it("server constant should not end with a trailing slash", () => {
    expect(server.endsWith("/")).toBe(false);
  });
});

