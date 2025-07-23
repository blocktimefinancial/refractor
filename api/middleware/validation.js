const Joi = require("joi");
const { txModelSchema } = require("../schemas/tx-schema");

/**
 * Validation middleware factory for different endpoints
 */
class ValidationMiddleware {
  /**
   * Create validation middleware for transaction submission
   */
  static validateTransactionSubmission() {
    const submissionSchema = Joi.object({
      hash: Joi.string()
        .pattern(/^[a-f0-9]{64}$/)
        .required()
        .description("Transaction hash (SHA-256)"),
      network: Joi.number()
        .integer()
        .min(0)
        .max(1)
        .required()
        .description("Network identifier (0=pubnet, 1=testnet)"),
      xdr: Joi.string()
        .required()
        .description("Transaction XDR without signatures"),
      signatures: Joi.array()
        .items(
          Joi.object({
            key: Joi.string()
              .pattern(/^G[A-Z2-7]{55}$/)
              .required()
              .description("Stellar public key (Ed25519)"),
            signature: Joi.string()
              .base64()
              .required()
              .description("Base64-encoded signature"),
          })
        )
        .default([])
        .description("Applied transaction signatures"),
      submit: Joi.boolean()
        .default(false)
        .description("Submit transaction to network once signed"),
      callbackUrl: Joi.string()
        .uri()
        .allow(null, "")
        .description("Callback URL for transaction notification"),
      desiredSigners: Joi.array()
        .items(Joi.string().pattern(/^G[A-Z2-7]{55}$/))
        .default([])
        .description("List of signers requested by transaction author"),
      minTime: Joi.number()
        .integer()
        .min(0)
        .default(0)
        .description(
          "Point in time when transaction becomes valid (UNIX timestamp)"
        ),
      maxTime: Joi.number()
        .integer()
        .min(0)
        .allow(null)
        .description("Transaction expiration date (UNIX timestamp)"),
    });

    return this.createValidationMiddleware(submissionSchema);
  }

  /**
   * Create validation middleware for transaction hash parameter
   */
  static validateTransactionHash() {
    const hashSchema = Joi.object({
      hash: Joi.string()
        .pattern(/^[a-f0-9]{64}$/)
        .required()
        .description("Transaction hash (SHA-256)"),
    });

    return (req, res, next) => {
      const { error, value } = hashSchema.validate(req.params, {
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
   */
  static validateMonitoringRequest() {
    const monitoringSchema = Joi.object({
      concurrency: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .when(Joi.ref("$endpoint"), {
          is: "concurrency",
          then: Joi.required(),
          otherwise: Joi.forbidden(),
        }),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(100)
        .description("Maximum number of results to return"),
      status: Joi.string()
        .valid("pending", "ready", "processing", "processed", "failed")
        .description("Filter by transaction status"),
      network: Joi.number()
        .integer()
        .min(0)
        .max(1)
        .description("Filter by network"),
    });

    return this.createValidationMiddleware(monitoringSchema, {
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
