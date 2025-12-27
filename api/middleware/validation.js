const Joi = require("joi");
const {
  txSubmissionSchema,
  txHashSchema,
  monitoringQuerySchema,
  txStatusEnum,
} = require("../schemas/tx-schema");

/**
 * Validation middleware factory for different endpoints
 * Uses centralized schemas from schemas/tx-schema.js
 */
class ValidationMiddleware {
  /**
   * Create validation middleware for transaction submission
   * Uses txSubmissionSchema from tx-schema.js
   */
  static validateTransactionSubmission() {
    return this.createValidationMiddleware(txSubmissionSchema);
  }

  /**
   * Create validation middleware for transaction hash parameter
   * Uses txHashSchema from tx-schema.js
   */
  static validateTransactionHash() {
    return (req, res, next) => {
      const { error, value } = txHashSchema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.details.map((detail) => ({
            field: detail.path.join("."),
            message: detail.message,
            value: detail.context?.value,
          })),
        });
      }

      req.params = value;
      next();
    };
  }

  /**
   * Create validation middleware for monitoring endpoints
   * Uses monitoringQuerySchema from tx-schema.js
   */
  static validateMonitoringRequest() {
    return this.createValidationMiddleware(monitoringQuerySchema, {
      allowUnknown: true,
    });
  }

  /**
   * Generic validation middleware creator
   */
  static createValidationMiddleware(schema, options = {}) {
    const defaultOptions = {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
      ...options,
    };

    return (req, res, next) => {
      const dataToValidate = req.method === "GET" ? req.query : req.body;

      const { error, value } = schema.validate(dataToValidate, defaultOptions);

      if (error) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.details.map((detail) => ({
            field: detail.path.join("."),
            message: detail.message,
            value: detail.context?.value,
          })),
        });
      }

      // Replace the original data with validated/converted data
      if (req.method === "GET") {
        req.query = value;
      } else {
        req.body = value;
      }

      next();
    };
  }

  /**
   * Error handling middleware for validation errors
   */
  static errorHandler() {
    return (err, req, res, next) => {
      if (err.name === "ValidationError") {
        return res.status(400).json({
          error: "Validation failed",
          details: err.details || [{ message: err.message }],
        });
      }

      // Handle Mongoose validation errors
      if (err.name === "ValidationError" && err.errors) {
        return res.status(400).json({
          error: "Database validation failed",
          details: Object.values(err.errors).map((error) => ({
            field: error.path,
            message: error.message,
            value: error.value,
          })),
        });
      }

      // Handle duplicate key errors (MongoDB)
      if (err.code === 11000) {
        return res.status(409).json({
          error: "Resource already exists",
          details: [
            {
              field: Object.keys(err.keyPattern)[0],
              message: "Value already exists",
            },
          ],
        });
      }

      next(err);
    };
  }
}

module.exports = ValidationMiddleware;
