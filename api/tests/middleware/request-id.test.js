/**
 * Request ID Middleware Tests
 *
 * Tests for request ID generation and propagation middleware.
 */

const {
  requestIdMiddleware,
  generateRequestId,
  getRequestId,
  getRequestLogger,
} = require("../../middleware/request-id");

describe("Request ID Middleware", () => {
  describe("generateRequestId()", () => {
    it("should generate a unique request ID", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it("should return a string", () => {
      const id = generateRequestId();
      expect(typeof id).toBe("string");
    });

    it("should follow timestamp-hex format", () => {
      const id = generateRequestId();
      const parts = id.split("-");

      expect(parts.length).toBe(2);
      expect(/^\d+$/.test(parts[0])).toBe(true); // Timestamp is numeric
      expect(/^[a-f0-9]+$/.test(parts[1])).toBe(true); // Hex random part
    });

    it("should have 12-character hex portion", () => {
      const id = generateRequestId();
      const hexPart = id.split("-")[1];

      expect(hexPart.length).toBe(12);
    });

    it("should include current timestamp", () => {
      const before = Date.now();
      const id = generateRequestId();
      const after = Date.now();

      const timestamp = parseInt(id.split("-")[0], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("requestIdMiddleware()", () => {
    let mockReq;
    let mockRes;
    let mockNext;
    let finishCallback;

    beforeEach(() => {
      mockReq = {
        get: jest.fn(),
        method: "GET",
        path: "/test",
        ip: "127.0.0.1",
      };
      mockRes = {
        set: jest.fn(),
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === "finish") {
            finishCallback = callback;
          }
        }),
      };
      mockNext = jest.fn();
    });

    it("should generate a new request ID when none provided", () => {
      mockReq.get.mockReturnValue(undefined);

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBeDefined();
      expect(typeof mockReq.requestId).toBe("string");
      expect(mockReq.requestId.length).toBeGreaterThan(0);
    });

    it("should use existing X-Request-ID header when provided", () => {
      const existingId = "my-custom-request-id";
      mockReq.get.mockReturnValue(existingId);

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe(existingId);
    });

    it("should set X-Request-ID response header", () => {
      mockReq.get.mockReturnValue(undefined);

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.set).toHaveBeenCalledWith(
        "X-Request-ID",
        mockReq.requestId
      );
    });

    it("should attach logger to request", () => {
      mockReq.get.mockReturnValue(undefined);

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.logger).toBeDefined();
    });

    it("should call next()", () => {
      mockReq.get.mockReturnValue(undefined);

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should register finish event listener", () => {
      mockReq.get.mockReturnValue(undefined);

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.on).toHaveBeenCalledWith("finish", expect.any(Function));
    });

    it("should call get with X-Request-ID header name", () => {
      mockReq.get.mockReturnValue(undefined);

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.get).toHaveBeenCalledWith("X-Request-ID");
    });
  });

  describe("getRequestId()", () => {
    it("should return request ID from request object", () => {
      const req = { requestId: "test-id-123" };
      expect(getRequestId(req)).toBe("test-id-123");
    });

    it("should return null when requestId is not set", () => {
      const req = {};
      expect(getRequestId(req)).toBeNull();
    });

    it("should return null for null request", () => {
      expect(getRequestId(null)).toBeNull();
    });

    it("should return null for undefined request", () => {
      expect(getRequestId(undefined)).toBeNull();
    });
  });

  describe("getRequestLogger()", () => {
    it("should return logger from request object", () => {
      const mockLogger = { info: jest.fn() };
      const req = { logger: mockLogger };

      expect(getRequestLogger(req)).toBe(mockLogger);
    });

    it("should return default logger when request logger is not set", () => {
      const req = {};
      const result = getRequestLogger(req);

      // Should return the mocked logger from setup-jest.js
      expect(result).toBeDefined();
    });

    it("should return default logger for null request", () => {
      const result = getRequestLogger(null);
      expect(result).toBeDefined();
    });
  });
});
