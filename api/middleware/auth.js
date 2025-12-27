/**
 * Authentication middleware for admin/monitoring endpoints
 * Provides API key-based authentication for sensitive operations
 */

const logger = require("../utils/logger").forComponent("auth");

/**
 * Get the admin API key from environment or config
 * @returns {string|null}
 */
function getAdminApiKey() {
  return process.env.ADMIN_API_KEY || null;
}

/**
 * Middleware to require admin authentication via API key
 * Expects the API key in the X-Admin-API-Key header
 *
 * If ADMIN_API_KEY is not configured, all admin requests will be rejected
 * for security (fail-closed behavior)
 */
function requireAdminAuth() {
  return (req, res, next) => {
    const expectedKey = getAdminApiKey();

    // If no admin key is configured, reject all admin requests (fail-closed)
    if (!expectedKey) {
      logger.warn("Admin API key not configured - rejecting request");
      return res.status(503).json({
        error: "Admin endpoints not configured",
        message:
          "ADMIN_API_KEY environment variable must be set to enable admin endpoints",
      });
    }

    // Check for API key in header
    const providedKey = req.headers["x-admin-api-key"];

    if (!providedKey) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Missing X-Admin-API-Key header",
      });
    }

    // Constant-time comparison to prevent timing attacks
    if (!secureCompare(providedKey, expectedKey)) {
      logger.warn("Invalid admin API key attempt", { ip: req.ip });
      return res.status(403).json({
        error: "Forbidden",
        message: "Invalid API key",
      });
    }

    // Authentication successful
    next();
  };
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function secureCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  // Use a fixed-length comparison to prevent timing attacks
  const lenA = Buffer.byteLength(a);
  const lenB = Buffer.byteLength(b);

  // Always do a comparison even if lengths differ (timing attack prevention)
  const bufA = Buffer.alloc(Math.max(lenA, lenB));
  const bufB = Buffer.alloc(Math.max(lenA, lenB));

  Buffer.from(a).copy(bufA);
  Buffer.from(b).copy(bufB);

  let result = lenA === lenB ? 0 : 1;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }

  return result === 0;
}

/**
 * Optional middleware that allows unauthenticated access but marks the request
 * Useful for endpoints that behave differently for authenticated users
 */
function optionalAdminAuth() {
  return (req, res, next) => {
    const expectedKey = getAdminApiKey();
    const providedKey = req.headers["x-admin-api-key"];

    req.isAdmin = false;

    if (expectedKey && providedKey && secureCompare(providedKey, expectedKey)) {
      req.isAdmin = true;
    }

    next();
  };
}

module.exports = {
  requireAdminAuth,
  optionalAdminAuth,
  getAdminApiKey,
};
