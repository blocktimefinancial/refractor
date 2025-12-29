/**
 * Blockchain Handler Interface
 *
 * Abstract interface for blockchain-specific transaction handling.
 * Each blockchain implementation must provide these methods.
 *
 * @module business-logic/handlers/blockchain-handler
 */

/**
 * Abstract blockchain handler interface
 * @interface IBlockchainHandler
 */
class BlockchainHandler {
  /**
   * @param {string} blockchain - The blockchain identifier
   */
  constructor(blockchain) {
    if (new.target === BlockchainHandler) {
      throw new Error(
        "BlockchainHandler is abstract and cannot be instantiated directly"
      );
    }
    this.blockchain = blockchain;
  }

  /**
   * Parse a transaction from its encoded payload
   * @param {string} payload - The encoded transaction payload
   * @param {string} encoding - The encoding format (base64, hex, etc.)
   * @param {string} networkName - The network name
   * @returns {Object} Parsed transaction object
   * @abstract
   */
  parseTransaction(payload, encoding, networkName) {
    throw new Error("parseTransaction must be implemented by subclass");
  }

  /**
   * Compute the transaction hash
   * @param {Object} transaction - The parsed transaction
   * @returns {{ hash: string, hashRaw: Buffer }} Transaction hash in hex and raw buffer
   * @abstract
   */
  computeHash(transaction) {
    throw new Error("computeHash must be implemented by subclass");
  }

  /**
   * Extract signatures from a transaction
   * @param {Object} transaction - The parsed transaction
   * @returns {Array<Object>} Array of raw signature objects
   * @abstract
   */
  extractSignatures(transaction) {
    throw new Error("extractSignatures must be implemented by subclass");
  }

  /**
   * Clear signatures from a transaction (for fresh signing)
   * @param {Object} transaction - The parsed transaction
   * @returns {Object} Transaction with signatures removed
   * @abstract
   */
  clearSignatures(transaction) {
    throw new Error("clearSignatures must be implemented by subclass");
  }

  /**
   * Verify a signature against a public key
   * @param {string} publicKey - The public key to verify against
   * @param {Buffer} signature - The signature to verify
   * @param {Buffer} message - The message that was signed (usually the hash)
   * @returns {boolean} True if signature is valid
   * @abstract
   */
  verifySignature(publicKey, signature, message) {
    throw new Error("verifySignature must be implemented by subclass");
  }

  /**
   * Add a signature to a transaction
   * @param {Object} transaction - The parsed transaction
   * @param {string} publicKey - The signer's public key
   * @param {string} signature - The signature to add
   * @returns {Object} Transaction with signature added
   * @abstract
   */
  addSignature(transaction, publicKey, signature) {
    throw new Error("addSignature must be implemented by subclass");
  }

  /**
   * Serialize a transaction back to its encoded form
   * @param {Object} transaction - The transaction to serialize
   * @param {string} encoding - The encoding format
   * @returns {string} Encoded transaction
   * @abstract
   */
  serializeTransaction(transaction, encoding) {
    throw new Error("serializeTransaction must be implemented by subclass");
  }

  /**
   * Get the list of potential signers for a transaction
   * @param {Object} transaction - The parsed transaction
   * @param {string} networkName - The network name
   * @returns {Promise<Array<string>>} List of potential signer public keys
   * @abstract
   */
  async getPotentialSigners(transaction, networkName) {
    throw new Error("getPotentialSigners must be implemented by subclass");
  }

  /**
   * Check if all required signatures are present
   * @param {Object} transaction - The parsed transaction
   * @param {Array<string>} signerKeys - The keys that have signed
   * @returns {Promise<boolean>} True if transaction is fully signed
   * @abstract
   */
  async isFullySigned(transaction, signerKeys) {
    throw new Error("isFullySigned must be implemented by subclass");
  }

  /**
   * Match a signature hint to find the corresponding signer
   * @param {Object} signatureHint - The signature hint/identifier
   * @param {Array<string>} potentialSigners - List of potential signer keys
   * @returns {string|null} The matching signer key or null
   * @abstract
   */
  matchSignatureToSigner(signatureHint, potentialSigners) {
    throw new Error("matchSignatureToSigner must be implemented by subclass");
  }

  /**
   * Get network configuration for this blockchain
   * @param {string} networkName - The network name
   * @returns {Object} Network configuration (endpoints, chain ID, etc.)
   * @abstract
   */
  getNetworkConfig(networkName) {
    throw new Error("getNetworkConfig must be implemented by subclass");
  }

  /**
   * Validate a public key format
   * @param {string} publicKey - The public key to validate
   * @returns {boolean} True if key format is valid for this blockchain
   * @abstract
   */
  isValidPublicKey(publicKey) {
    throw new Error("isValidPublicKey must be implemented by subclass");
  }

  /**
   * Parse transaction parameters (timebounds, fees, etc.)
   * @param {Object} transaction - The parsed transaction
   * @param {Object} request - The original request
   * @returns {Object} Parsed transaction parameters for storage
   * @abstract
   */
  parseTransactionParams(transaction, request) {
    throw new Error("parseTransactionParams must be implemented by subclass");
  }
}

module.exports = BlockchainHandler;
