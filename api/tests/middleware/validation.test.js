/**
 * Validation Middleware Tests
 *
 * Tests for request validation middleware using Joi schemas.
 */

const ValidationMiddleware = require("../../middleware/validation");

describe("Validation Middleware", () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      method: "POST",
      body: {},
      query: {},
      params: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe("validateTransactionSubmission()", () => {
    const middleware = ValidationMiddleware.validateTransactionSubmission();

    describe("valid requests", () => {
      it("should accept valid transaction submission", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          network: 0,
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      it("should accept testnet network (1)", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          network: 1,
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it("should accept optional callback URL", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          network: 0,
          callbackUrl: "https://example.com/callback",
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it("should accept submit flag", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          network: 0,
          submit: true,
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe("invalid requests", () => {
      it("should reject missing xdr", () => {
        mockReq.body = {
          network: 0,
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: "Validation failed",
            // With the new blockchain-agnostic schema, we get an "alternatives" error
            // because neither legacy (xdr+network) nor blockchain-agnostic (txUri/payload) format is complete
            details: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringMatching(
                  /does not match any of the allowed types/
                ),
              }),
            ]),
          })
        );
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject missing network", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject invalid network value (3)", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          network: 3, // Values 0-2 are valid (pubnet, testnet, futurenet)
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject negative network value", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          network: -1,
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject invalid callback URL", () => {
        mockReq.body = {
          xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
          network: 0,
          callbackUrl: "not-a-valid-url",
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject empty body", () => {
        mockReq.body = {};

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });

  describe("validateTransactionHash()", () => {
    const middleware = ValidationMiddleware.validateTransactionHash();

    describe("valid requests", () => {
      it("should accept valid 64-character hex hash", () => {
        mockReq.params = {
          hash: "a".repeat(64),
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      it("should accept valid hash with mixed hex characters", () => {
        mockReq.params = {
          hash: "89d6c423a51e030b392f0e7505e9f3b66be11cb1477aecda79a34e5ae61060e4",
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe("invalid requests", () => {
      it("should reject hash that is too short", () => {
        mockReq.params = {
          hash: "a".repeat(63),
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject hash that is too long", () => {
        mockReq.params = {
          hash: "a".repeat(65),
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject hash with uppercase letters", () => {
        mockReq.params = {
          hash: "A".repeat(64),
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject hash with non-hex characters", () => {
        mockReq.params = {
          hash: "g".repeat(64),
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject missing hash", () => {
        mockReq.params = {};

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it("should reject empty hash", () => {
        mockReq.params = {
          hash: "",
        };

        middleware(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });

  describe("errorHandler()", () => {
    const errorHandler = ValidationMiddleware.errorHandler();

    it("should handle Joi ValidationError", () => {
      const error = new Error("Validation failed");
      error.name = "ValidationError";
      error.details = [{ message: "Field is required" }];

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Validation failed",
        details: [{ message: "Field is required" }],
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should handle MongoDB duplicate key error (11000)", () => {
      const error = new Error("Duplicate key");
      error.code = 11000;
      error.keyPattern = { hash: 1 };

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Resource already exists",
        details: [
          {
            field: "hash",
            message: "Value already exists",
          },
        ],
      });
    });

    it("should pass through unhandled errors", () => {
      const error = new Error("Some other error");

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
