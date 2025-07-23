const mongoose = require("mongoose");
const {
  TxModelMongooseSchema,
  TxSignatureMongooseSchema,
} = require("../schemas/tx-schema");

// Create models
const TxSignature = mongoose.model("TxSignature", TxSignatureMongooseSchema);
const TxModel = mongoose.model("TxModel", TxModelMongooseSchema);

module.exports = {
  TxSignature,
  TxModel,
};
