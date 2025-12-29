/**
 * Blockchain Handlers Index
 *
 * Exports all blockchain handlers and the handler factory.
 *
 * @module business-logic/handlers
 */

const BlockchainHandler = require("./blockchain-handler");
const handlerFactory = require("./handler-factory");
const stellarHandler = require("./stellar-handler");
const onemoneyHandler = require("./onemoney-handler");
const evmHandler = require("./evm-handler");

module.exports = {
  // Abstract interface
  BlockchainHandler,

  // Factory functions
  ...handlerFactory,

  // Individual handlers (for direct access if needed)
  stellarHandler,
  onemoneyHandler,

  // EVM handler module
  EvmHandler: evmHandler.EvmHandler,
  createEvmHandler: evmHandler.createEvmHandler,
  isEvmBlockchain: evmHandler.isEvmBlockchain,
  EVM_BLOCKCHAINS: evmHandler.EVM_BLOCKCHAINS,
};
