const Joi = require("joi");
const Joigoose = require("joigoose");
const mongoose = require("mongoose");

// Initialize Joigoose
const joigoose = Joigoose(mongoose);

// Transaction status enum
const txStatusEnum = ["pending", "ready", "processing", "processed", "failed"];

// Joi schema for TxSignature
const txSignatureSchema = Joi.object({
  key: Joi.string()
    .pattern(/^G[A-Z2-7]{55}$/)
    .required()
    .description("Stellar public key (Ed25519)"),
  signature: Joi.binary().required().description("Raw signature bytes"),
});

// Joi schema for TxModel
const txModelSchema = Joi.object({
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
  xdr: Joi.binary()
    .required()
    .description("Transaction XDR without signatures"),
  signatures: Joi.array()
    .items(txSignatureSchema)
    .default([])
    .description("Applied transaction signatures"),
  submit: Joi.boolean()
    .default(false)
    .description("Submit transaction to network once signed"),
  callbackUrl: Joi.string()
    .uri()
    .allow(null)
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
  status: Joi.string()
    .valid(...txStatusEnum)
    .default("pending")
    .description("Current transaction status"),
  submitted: Joi.number()
    .integer()
    .min(0)
    .allow(null)
    .description("Submitted transaction timestamp (UNIX timestamp)"),
  createdAt: Joi.date()
    .default(Date.now)
    .description("Record creation timestamp"),
  updatedAt: Joi.date()
    .default(Date.now)
    .description("Record last update timestamp"),
  retryCount: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .description("Number of processing retry attempts"),
  lastError: Joi.string()
    .allow(null)
    .description("Last error message if processing failed"),
});

// Convert Joi schemas to Mongoose schemas
const TxSignatureMongooseSchema = joigoose.convert(txSignatureSchema);
const TxModelMongooseSchema = joigoose.convert(txModelSchema);

// Add custom transformations and indexes
TxModelMongooseSchema.set("collection", "tx");
TxModelMongooseSchema.set("timestamps", true);

// Indexes for performance
TxModelMongooseSchema.index({ hash: 1 }, { unique: true });
TxModelMongooseSchema.index({ status: 1, minTime: 1 });
TxModelMongooseSchema.index({ network: 1, status: 1 });
TxModelMongooseSchema.index({ maxTime: 1 }, { sparse: true });
TxModelMongooseSchema.index({ createdAt: 1 });

// Pre-save middleware for validation and data processing
TxModelMongooseSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  // Validate signatures match desired signers if specified
  if (this.desiredSigners && this.desiredSigners.length > 0) {
    const signatureKeys = this.signatures.map((sig) => sig.key);
    const missingSigners = this.desiredSigners.filter(
      (signer) => !signatureKeys.includes(signer)
    );

    if (missingSigners.length === 0 && this.status === "pending") {
      this.status = "ready";
    }
  }

  next();
});

// Instance methods
TxModelMongooseSchema.methods.isExpired = function () {
  return this.maxTime && this.maxTime < Math.floor(Date.now() / 1000);
};

TxModelMongooseSchema.methods.isReady = function () {
  return this.status === "ready" && !this.isExpired();
};

TxModelMongooseSchema.methods.addSignature = function (key, signature) {
  // Check if signature already exists
  const existingIndex = this.signatures.findIndex((sig) => sig.key === key);

  if (existingIndex >= 0) {
    this.signatures[existingIndex].signature = signature;
  } else {
    this.signatures.push({ key, signature });
  }

  // Auto-update status if all desired signers have signed
  if (this.desiredSigners && this.desiredSigners.length > 0) {
    const signatureKeys = this.signatures.map((sig) => sig.key);
    const hasAllSignatures = this.desiredSigners.every((signer) =>
      signatureKeys.includes(signer)
    );

    if (hasAllSignatures && this.status === "pending") {
      this.status = "ready";
    }
  }
};

// Static methods for common queries
TxModelMongooseSchema.statics.findReady = function (limit = 100) {
  const now = Math.floor(Date.now() / 1000);
  return this.find({
    status: "ready",
    minTime: { $lte: now },
    $or: [{ maxTime: null }, { maxTime: { $gt: now } }],
  }).limit(limit);
};

TxModelMongooseSchema.statics.findExpired = function () {
  const now = Math.floor(Date.now() / 1000);
  return this.find({
    status: { $in: ["pending", "ready"] },
    maxTime: { $ne: null, $lte: now },
  });
};

module.exports = {
  txSignatureSchema,
  txModelSchema,
  TxSignatureMongooseSchema,
  TxModelMongooseSchema,
  txStatusEnum,
};
