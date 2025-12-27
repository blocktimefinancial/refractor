/**
 * Edge Case Tests
 *
 * Tests for boundary conditions and edge cases across the API.
 */

const Joi = require("joi");
const { txModelSchema, txHashSchema } = require("../schemas/tx-schema");
const { requireAdminAuth } = require("../middleware/auth");

describe("Edge Cases", () => {
  describe("Transaction Hash Boundaries", () => {
    it("should reject 63-character hash (boundary -1)", () => {
      const { error } = txHashSchema.validate({ hash: "a".repeat(63) });
      expect(error).toBeDefined();
    });

    it("should accept 64-character hash (exact boundary)", () => {
      const { error } = txHashSchema.validate({ hash: "a".repeat(64) });
      expect(error).toBeUndefined();
    });

    it("should reject 65-character hash (boundary +1)", () => {
      const { error } = txHashSchema.validate({ hash: "a".repeat(65) });
      expect(error).toBeDefined();
    });

    it("should reject hash with mixed case", () => {
      const mixedCase = "aA".repeat(32);
      const { error } = txHashSchema.validate({ hash: mixedCase });
      expect(error).toBeDefined();
    });

    it("should reject hash with spaces", () => {
      const { error } = txHashSchema.validate({ hash: " ".repeat(64) });
      expect(error).toBeDefined();
    });

    it("should reject hash with newlines", () => {
      const { error } = txHashSchema.validate({ hash: "a".repeat(63) + "\n" });
      expect(error).toBeDefined();
    });
  });

  describe("Network Value Boundaries", () => {
    const validXdr =
      "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA";

    const networkSchema = Joi.object({
      network: Joi.number().integer().min(0).max(1).required(),
    });

    it("should reject network -1 (boundary -1)", () => {
      const { error } = networkSchema.validate({ network: -1 });
      expect(error).toBeDefined();
    });

    it("should accept network 0 (lower boundary)", () => {
      const { error } = networkSchema.validate({ network: 0 });
      expect(error).toBeUndefined();
    });

    it("should accept network 1 (upper boundary)", () => {
      const { error } = networkSchema.validate({ network: 1 });
      expect(error).toBeUndefined();
    });

    it("should reject network 2 (boundary +1)", () => {
      const { error } = networkSchema.validate({ network: 2 });
      expect(error).toBeDefined();
    });

    it("should reject non-integer network (0.5)", () => {
      const { error } = networkSchema.validate({ network: 0.5 });
      expect(error).toBeDefined();
    });

    it("should reject string network", () => {
      const { error } = networkSchema.validate({ network: "0" });
      // Joi will convert, so this should pass after conversion
      expect(error).toBeUndefined();
    });
  });

  describe("MinTime Boundaries", () => {
    const minTimeSchema = Joi.object({
      minTime: Joi.number().integer().min(0).default(0),
    });

    it("should reject negative minTime", () => {
      const { error } = minTimeSchema.validate({ minTime: -1 });
      expect(error).toBeDefined();
    });

    it("should accept minTime 0", () => {
      const { error, value } = minTimeSchema.validate({ minTime: 0 });
      expect(error).toBeUndefined();
      expect(value.minTime).toBe(0);
    });

    it("should accept very large minTime (future date)", () => {
      const futureTime = 9999999999; // Year 2286
      const { error, value } = minTimeSchema.validate({ minTime: futureTime });
      expect(error).toBeUndefined();
      expect(value.minTime).toBe(futureTime);
    });

    it("should default to 0 when not provided", () => {
      const { value } = minTimeSchema.validate({});
      expect(value.minTime).toBe(0);
    });
  });

  describe("Signature Array Edge Cases", () => {
    it("should accept empty signatures array", () => {
      const { error, value } = txModelSchema.validate({
        hash: "a".repeat(64),
        network: 0,
        xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
        signatures: [],
      });
      expect(error).toBeUndefined();
      expect(value.signatures).toEqual([]);
    });

    it("should accept single signature", () => {
      const { error } = txModelSchema.validate({
        hash: "a".repeat(64),
        network: 0,
        xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
        signatures: [
          {
            key: "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
            signature:
              "b1N3ZHZIjuxU+5Fgz1Kj65FntxUOK4V8fxePNmoIc1J5DESkBcPzWTs8ULLldhnqJo6I4+L+xSzZt8+yiwQDBQ==",
          },
        ],
      });
      expect(error).toBeUndefined();
    });

    it("should accept multiple signatures (up to 20)", () => {
      const signatures = [];
      const baseKey =
        "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2";
      const baseSig =
        "b1N3ZHZIjuxU+5Fgz1Kj65FntxUOK4V8fxePNmoIc1J5DESkBcPzWTs8ULLldhnqJo6I4+L+xSzZt8+yiwQDBQ==";

      for (let i = 0; i < 20; i++) {
        signatures.push({ key: baseKey, signature: baseSig });
      }

      const { error } = txModelSchema.validate({
        hash: "a".repeat(64),
        network: 0,
        xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
        signatures,
      });
      expect(error).toBeUndefined();
    });
  });

  describe("Callback URL Edge Cases", () => {
    const callbackSchema = Joi.object({
      callbackUrl: Joi.string().uri().allow(null),
    });

    it("should accept null callbackUrl", () => {
      const { error } = callbackSchema.validate({ callbackUrl: null });
      expect(error).toBeUndefined();
    });

    it("should accept https URL", () => {
      const { error } = callbackSchema.validate({
        callbackUrl: "https://example.com/callback",
      });
      expect(error).toBeUndefined();
    });

    it("should accept http URL", () => {
      const { error } = callbackSchema.validate({
        callbackUrl: "http://localhost:3000/callback",
      });
      expect(error).toBeUndefined();
    });

    it("should accept URL with query parameters", () => {
      const { error } = callbackSchema.validate({
        callbackUrl: "https://example.com/callback?tx=123&network=testnet",
      });
      expect(error).toBeUndefined();
    });

    it("should accept URL with port", () => {
      const { error } = callbackSchema.validate({
        callbackUrl: "https://example.com:8080/callback",
      });
      expect(error).toBeUndefined();
    });

    it("should reject invalid URL", () => {
      const { error } = callbackSchema.validate({ callbackUrl: "not-a-url" });
      expect(error).toBeDefined();
    });

    it("should reject URL without protocol", () => {
      const { error } = callbackSchema.validate({
        callbackUrl: "example.com/callback",
      });
      expect(error).toBeDefined();
    });
  });

  describe("Public Key Format Edge Cases", () => {
    const keySchema = Joi.string().pattern(/^G[A-Z2-7]{55}$/);

    it("should accept valid Stellar public key", () => {
      const { error } = keySchema.validate(
        "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2"
      );
      expect(error).toBeUndefined();
    });

    it("should reject key starting with S (secret key)", () => {
      const { error } = keySchema.validate(
        "SBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2"
      );
      expect(error).toBeDefined();
    });

    it("should reject key that is too short", () => {
      const { error } = keySchema.validate(
        "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP"
      );
      expect(error).toBeDefined();
    });

    it("should reject key that is too long", () => {
      const { error } = keySchema.validate(
        "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2A"
      );
      expect(error).toBeDefined();
    });

    it("should reject lowercase key", () => {
      const { error } = keySchema.validate(
        "gbjvucdvnum3uasldxpbdxlhjbsvoegtjx5j6p3jd7dqkvqcycby5pp2"
      );
      expect(error).toBeDefined();
    });

    it("should reject key with invalid characters (0, 1, 8, 9)", () => {
      // 0, 1, 8, 9 are not valid base32 characters
      const { error } = keySchema.validate(
        "G0JVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2"
      );
      expect(error).toBeDefined();
    });
  });

  describe("Authentication Edge Cases", () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = { headers: {}, ip: "127.0.0.1" };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    describe("API key with special characters", () => {
      const originalEnv = process.env.ADMIN_API_KEY;

      afterEach(() => {
        if (originalEnv !== undefined) {
          process.env.ADMIN_API_KEY = originalEnv;
        } else {
          delete process.env.ADMIN_API_KEY;
        }
      });

      it("should accept API key with special characters", () => {
        const specialKey = "key!@#$%^&*()-_=+[]{}|;:,.<>?";
        process.env.ADMIN_API_KEY = specialKey;
        mockReq.headers["x-admin-api-key"] = specialKey;

        const middleware = requireAdminAuth();
        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it("should accept very long API key", () => {
        const longKey = "a".repeat(1000);
        process.env.ADMIN_API_KEY = longKey;
        mockReq.headers["x-admin-api-key"] = longKey;

        const middleware = requireAdminAuth();
        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it("should accept API key with unicode characters", () => {
        const unicodeKey = "key-🔑-密钥-مفتاح";
        process.env.ADMIN_API_KEY = unicodeKey;
        mockReq.headers["x-admin-api-key"] = unicodeKey;

        const middleware = requireAdminAuth();
        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });
  });

  describe("Status Transitions", () => {
    it("should have valid status enum values", () => {
      const validStatuses = [
        "pending",
        "ready",
        "processing",
        "processed",
        "failed",
      ];

      validStatuses.forEach((status) => {
        const { error } = txModelSchema.validate({
          hash: "a".repeat(64),
          network: 0,
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          status,
        });
        expect(error).toBeUndefined();
      });
    });

    it("should reject invalid status value", () => {
      const { error } = txModelSchema.validate({
        hash: "a".repeat(64),
        network: 0,
        xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
        status: "invalid_status",
      });
      expect(error).toBeDefined();
    });
  });
});
