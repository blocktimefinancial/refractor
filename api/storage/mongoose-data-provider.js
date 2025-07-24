const mongoose = require("mongoose");
const { name: appname } = require("../package.json");
const config = require("../app.config");
const DataProvider = require("./data-provider");
const { TxModel } = require("../models/mongoose-models");
const { txModelSchema } = require("../schemas/tx-schema");
const Joi = require("joi");

class MongooseDataProvider extends DataProvider {
  async init() {
    const options = {
      appName: appname,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4
      retryWrites: true,
      retryReads: true,
      bufferCommands: false,
    };

    try {
      await mongoose.connect(config.db, options);
      console.log(
        `Connected to MongoDB via Mongoose: ${mongoose.connection.name}`
      );

      // Set up connection event handlers
      mongoose.connection.on("error", (err) => {
        console.error("MongoDB connection error:", err);
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected");
      });

      mongoose.connection.on("reconnected", () => {
        console.log("MongoDB reconnected");
      });

      this.db = mongoose.connection.db;
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  /**
   * @type {Db}
   */
  db = null;

  /**
   * Validate transaction data using Joi schema
   * @param {Object} txData
   * @returns {Object} Validated data
   */
  validateTransaction(txData) {
    const { error, value } = txModelSchema.validate(txData, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const validationError = new Error("Transaction validation failed");
      validationError.details = error.details;
      throw validationError;
    }

    return value;
  }

  /**
   * Store transaction using Mongoose model
   * @param {Object} txModelData
   * @returns {Promise}
   */
  async saveTransaction(txModelData) {
    try {
      // Validate input data
      const validatedData = this.validateTransaction(txModelData);

      // Set _id to the transaction hash
      validatedData._id = validatedData.hash;
      // Remove the separate hash field since _id serves as hash
      delete validatedData.hash;

      // Use upsert to handle existing transactions
      const result = await TxModel.findOneAndUpdate(
        { _id: validatedData._id },
        validatedData,
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

      return result;
    } catch (error) {
      if (error.name === "ValidationError") {
        const validationError = new Error("Transaction validation failed");
        validationError.details = Object.values(error.errors).map((err) => ({
          message: err.message,
          path: err.path,
          value: err.value,
        }));
        throw validationError;
      }
      throw error;
    }
  }

  /**
   * Find transaction by hash
   * @param {String} hash
   * @returns {Promise<Object|null>}
   */
  async findTransaction(hash) {
    try {
      const transaction = await TxModel.findById(hash).lean();

      if (!transaction) {
        return null;
      }

      // Set hash field from _id for backward compatibility
      transaction.hash = transaction._id;
      delete transaction._id;
      delete transaction.__v;

      return transaction;
    } catch (error) {
      console.error("Error finding transaction:", error);
      throw error;
    }
  }

  /**
   * Update transaction with optimistic concurrency control
   * @param {String} hash
   * @param {Object} update
   * @param {String} expectedCurrentStatus
   * @returns {Promise<Boolean>}
   */
  async updateTransaction(hash, update, expectedCurrentStatus) {
    try {
      const filter = { _id: hash }; // Use _id instead of hash for Mongoose

      if (expectedCurrentStatus !== undefined) {
        filter.status = expectedCurrentStatus;
      }

      console.log(
        `[DEBUG] updateTransaction - filter:`,
        JSON.stringify(filter)
      );
      console.log(
        `[DEBUG] updateTransaction - update:`,
        JSON.stringify(update)
      );

      // Add update timestamp
      update.updatedAt = new Date();

      const result = await TxModel.updateOne(filter, { $set: update });

      console.log(
        `[DEBUG] updateTransaction - result:`,
        JSON.stringify(result)
      );
      return result.matchedCount > 0;
    } catch (error) {
      console.error("Error updating transaction:", error);
      throw error;
    }
  }

  /**
   * Update transaction status with error handling
   * @param {String} hash
   * @param {String} newStatus
   * @param {String} expectedCurrentStatus
   * @param {Error} error
   * @returns {Promise<Boolean>}
   */
  async updateTxStatus(hash, newStatus, expectedCurrentStatus, error = null) {
    const update = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (error) {
      update.lastError = error.message || error.toString();
      // Fix: Use $inc operator correctly for retryCount increment
      update.$inc = { retryCount: 1 };
    }

    return this.updateTransaction(hash, update, expectedCurrentStatus);
  }

  /**
   * List transactions with enhanced filtering
   * @param {Object} filter
   * @returns {AsyncIterable}
   */
  listTransactions(filter = {}) {
    // Convert filter format for Mongoose
    const mongooseFilter = { ...filter };

    if (mongooseFilter.hash) {
      mongooseFilter._id = mongooseFilter.hash;
      delete mongooseFilter.hash;
    }

    // Handle special operators
    if (mongooseFilter.minTime && typeof mongooseFilter.minTime === "object") {
      // Convert {$lte: timestamp} format
      mongooseFilter.minTime = mongooseFilter.minTime;
    }

    const projection = {
      hash: "$_id",
      _id: 0,
      status: 1,
      network: 1,
      xdr: 1,
      callbackUrl: 1,
      maxTime: 1,
      minTime: 1,
      signatures: 1,
      submit: 1,
      submitted: 1,
      desiredSigners: 1,
      createdAt: 1,
      updatedAt: 1,
      retryCount: 1,
      lastError: 1,
    };

    return TxModel.find(mongooseFilter, projection).cursor();
  }

  /**
   * Get transaction statistics
   * @returns {Promise<Object>}
   */
  async getTransactionStats() {
    const stats = await TxModel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgRetryCount: { $avg: "$retryCount" },
        },
      },
    ]);

    const total = await TxModel.countDocuments();

    return {
      total,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          avgRetryCount: stat.avgRetryCount,
        };
        return acc;
      }, {}),
    };
  }

  /**
   * Clean up expired transactions
   * @returns {Promise<Number>} Number of cleaned up transactions
   */
  async cleanupExpiredTransactions() {
    const result = await TxModel.updateMany(
      {
        status: { $in: ["pending", "ready"] },
        maxTime: {
          $ne: null,
          $lte: Math.floor(Date.now() / 1000),
        },
      },
      {
        $set: {
          status: "failed",
          lastError: "Transaction expired",
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount;
  }

  /**
   * Close database connection
   */
  async close() {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
    }
  }
}

module.exports = MongooseDataProvider;
