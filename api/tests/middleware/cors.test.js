/**
 * CORS Middleware Tests
 *
 * Tests for blacklist-based CORS middleware.
 */

const {
  createCorsMiddleware,
  isBlacklisted,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  reloadBlacklist,
} = require("../../middleware/cors");

describe("CORS Middleware", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.CORS_BLACKLIST;
    delete process.env.CORS_BLACKLIST;
    // Clear the blacklist before each test
    reloadBlacklist();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CORS_BLACKLIST = originalEnv;
    } else {
      delete process.env.CORS_BLACKLIST;
    }
  });

  describe("isBlacklisted()", () => {
    it("should return false for null origin", () => {
      expect(isBlacklisted(null)).toBe(false);
    });

    it("should return false for undefined origin", () => {
      expect(isBlacklisted(undefined)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isBlacklisted("")).toBe(false);
    });

    it("should return false when origin is not blacklisted", () => {
      expect(isBlacklisted("https://example.com")).toBe(false);
    });

    it("should return true when origin is blacklisted", () => {
      addToBlacklist("https://evil.com");
      expect(isBlacklisted("https://evil.com")).toBe(true);
    });

    it("should be case-insensitive", () => {
      addToBlacklist("https://EVIL.COM");
      expect(isBlacklisted("https://evil.com")).toBe(true);
    });
  });

  describe("getBlacklist()", () => {
    it("should return empty array initially", () => {
      expect(getBlacklist()).toEqual([]);
    });

    it("should return array of blacklisted origins", () => {
      addToBlacklist("https://evil.com");
      addToBlacklist("https://bad.org");

      const blacklist = getBlacklist();
      expect(blacklist).toContain("https://evil.com");
      expect(blacklist).toContain("https://bad.org");
      expect(blacklist.length).toBe(2);
    });
  });

  describe("addToBlacklist()", () => {
    it("should add origin to blacklist", () => {
      addToBlacklist("https://evil.com");
      expect(getBlacklist()).toContain("https://evil.com");
    });

    it("should normalize origin to lowercase", () => {
      addToBlacklist("https://EVIL.COM");
      expect(getBlacklist()).toContain("https://evil.com");
    });

    it("should not add duplicate entries", () => {
      addToBlacklist("https://evil.com");
      addToBlacklist("https://evil.com");
      expect(getBlacklist().length).toBe(1);
    });

    it("should handle origin without protocol", () => {
      addToBlacklist("evil.com");
      // Should still be added (though as-is since it's not a valid URL)
      expect(getBlacklist().length).toBe(1);
    });
  });

  describe("removeFromBlacklist()", () => {
    beforeEach(() => {
      addToBlacklist("https://evil.com");
      addToBlacklist("https://bad.org");
    });

    it("should remove origin from blacklist", () => {
      const result = removeFromBlacklist("https://evil.com");

      expect(result).toBe(true);
      expect(getBlacklist()).not.toContain("https://evil.com");
    });

    it("should return false when origin not found", () => {
      const result = removeFromBlacklist("https://notfound.com");
      expect(result).toBe(false);
    });

    it("should leave other entries intact", () => {
      removeFromBlacklist("https://evil.com");
      expect(getBlacklist()).toContain("https://bad.org");
    });

    it("should be case-insensitive", () => {
      const result = removeFromBlacklist("https://EVIL.COM");
      expect(result).toBe(true);
    });
  });

  describe("reloadBlacklist()", () => {
    it("should clear existing blacklist", () => {
      addToBlacklist("https://evil.com");
      reloadBlacklist();
      expect(getBlacklist()).toEqual([]);
    });

    it("should load from CORS_BLACKLIST env var", () => {
      process.env.CORS_BLACKLIST = "https://evil.com,https://bad.org";
      const count = reloadBlacklist();

      expect(count).toBe(2);
      expect(getBlacklist()).toContain("https://evil.com");
      expect(getBlacklist()).toContain("https://bad.org");
    });

    it("should trim whitespace from entries", () => {
      process.env.CORS_BLACKLIST = " https://evil.com , https://bad.org ";
      reloadBlacklist();

      expect(getBlacklist()).toContain("https://evil.com");
      expect(getBlacklist()).toContain("https://bad.org");
    });

    it("should ignore empty entries", () => {
      process.env.CORS_BLACKLIST = "https://evil.com,,https://bad.org,";
      const count = reloadBlacklist();

      expect(count).toBe(2);
    });

    it("should return count of loaded entries", () => {
      process.env.CORS_BLACKLIST = "https://a.com,https://b.com,https://c.com";
      const count = reloadBlacklist();

      expect(count).toBe(3);
    });
  });

  describe("createCorsMiddleware()", () => {
    it("should return a function", () => {
      const middleware = createCorsMiddleware();
      expect(typeof middleware).toBe("function");
    });

    it("should accept custom options", () => {
      const middleware = createCorsMiddleware({
        maxAge: 3600,
      });
      expect(typeof middleware).toBe("function");
    });
  });
});
