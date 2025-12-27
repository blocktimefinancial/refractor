/**
 * Request ID Middleware
 *
 * Generates or propagates a unique request ID for each request.
 * The ID is used for distributed tracing and log correlation.
 *
 * Headers:
 * - X-Request-ID: Incoming request ID (if provided by client/load balancer)
 * - X-Request-ID: Outgoing response header with the request ID
 */

const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Generate a unique request ID
 * Format: timestamp-randomhex (e.g., "1703683200000-a1b2c3d4e5f6")
 * @returns {string} Unique request ID
 */
function generateRequestId() {
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString("hex");
  return `${timestamp}-${random}`;
}

/**
 * Request ID middleware
 * Attaches a unique request ID to each request and response.
 * Uses X-Request-ID header if provided, otherwise generates a new one.
 *
 * @returns {function} Express middleware
 */
function requestIdMiddleware() {
  return (req, res, next) => {
    // Use existing request ID from header or generate new one
    const requestId = req.get("X-Request-ID") || generateRequestId();

    // Attach to request object for use in handlers
    req.requestId = requestId;

    // Create a request-scoped logger
    req.logger = logger.forRequest(requestId);

    // Set response header so client can correlate
    res.set("X-Request-ID", requestId);

    // Log request start (at http level to avoid noise)
    req.logger.http("Request started", {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Track response time
    const startTime = Date.now();

    // Log response on finish
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const logLevel =
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
          ? "warn"
          : "http";

      req.logger[logLevel]("Request completed", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    });

    next();
  };
}

/**
 * Get request ID from request object
 * @param {object} req - Express request object
 * @returns {string|null} Request ID or null if not set
 */
function getRequestId(req) {
  return req?.requestId || null;
}

/**
 * Get request-scoped logger from request object
 * @param {object} req - Express request object
 * @returns {Logger} Request-scoped logger or default logger
 */
function getRequestLogger(req) {
  return req?.logger || logger;
}

module.exports = {
  requestIdMiddleware,
  generateRequestId,
  getRequestId,
  getRequestLogger,
};
