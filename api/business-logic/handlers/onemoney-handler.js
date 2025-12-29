/**
 * 1Money Blockchain Handler
 *
 * Implements the BlockchainHandler interface for 1Money Network.
 * 1Money uses Stellar-compatible transaction format with ed25519 keys,
 * but may have EVM-compatible features at a higher level.
 *
 * Key characteristics:
 * - ed25519 key format (G-prefixed public keys like Stellar)
 * - base64 encoding for transactions
 * - Network passphrases for transaction signing
 *
 * @module business-logic/handlers/onemoney-handler
 */

const {
  TransactionBuilder,
  FeeBumpTransaction,
  Keypair,
  StrKey,
} = require("@stellar/stellar-sdk");
const BlockchainHandler = require("./blockchain-handler");
const { standardError } = require("../std-error");
const {
  getBlockchainConfig,
  getNetworkConfig,
} = require("../blockchain-registry");
const { hintMatchesKey, hintToMask } = require("../signature-hint-utils");
const logger = require("../../utils/logger").forComponent("onemoney-handler");

/**
 * Network name to passphrase mapping for 1Money
 */
const NETWORK_PASSPHRASES = {
  mainnet: "1Money Mainnet ; 2024",
  testnet: "1Money Testnet ; 2024",
};

class OneMoneyHandler extends BlockchainHandler {
  constructor() {
    super("onemoney");
    this.config = getBlockchainConfig("onemoney");
  }

  /**
   * Parse a 1Money transaction from base64-encoded XDR
   * Uses Stellar SDK since 1Money uses Stellar-compatible format
   * @param {string} payload - The base64-encoded transaction
   * @param {string} encoding - The encoding format (only base64 supported)
   * @param {string} networkName - The network name (mainnet, testnet)
   * @returns {Object} Parsed transaction object
   */
  parseTransaction(payload, encoding, networkName) {
    if (encoding !== "base64") {
      throw standardError(
        400,
        `1Money only supports base64 encoding, got: ${encoding}`
      );
    }

    const passphrase = this.getNetworkPassphrase(networkName);

    let txEnvelope;
    try {
      txEnvelope = TransactionBuilder.fromXDR(payload, passphrase);
    } catch (e) {
      logger.warn("Failed to parse 1Money transaction", { error: e.message });
      throw standardError(400, "Invalid 1Money transaction data");
    }

    if (txEnvelope instanceof FeeBumpTransaction) {
      throw standardError(406, "FeeBump transactions not supported");
    }

    return txEnvelope;
  }

  /**
   * Compute the transaction hash
   * @param {Object} transaction - The 1Money transaction
   * @returns {{ hash: string, hashRaw: Buffer }} Transaction hash
   */
  computeHash(transaction) {
    const hashRaw = transaction.hash();
    return {
      hash: hashRaw.toString("hex"),
      hashRaw,
    };
  }

  /**
   * Extract signatures from a 1Money transaction
   * @param {Object} transaction - The transaction
   * @returns {Array<Object>} Array of signature objects
   */
  extractSignatures(transaction) {
    return transaction.signatures.slice();
  }

  /**
   * Clear signatures from a transaction
   * @param {Object} transaction - The transaction
   * @returns {Object} Transaction with signatures cleared
   */
  clearSignatures(transaction) {
    transaction._signatures = [];
    return transaction;
  }

  /**
   * Verify a signature against a 1Money public key
   * @param {string} publicKey - The public key (G...)
   * @param {Buffer} signature - The signature to verify
   * @param {Buffer} message - The transaction hash
   * @returns {boolean} True if signature is valid
   */
  verifySignature(publicKey, signature, message) {
    try {
      return Keypair.fromPublicKey(publicKey).verify(message, signature);
    } catch (e) {
      logger.debug("Signature verification failed", {
        publicKey,
        error: e.message,
      });
      return false;
    }
  }

  /**
   * Add a signature to a 1Money transaction
   * @param {Object} transaction - The transaction
   * @param {string} publicKey - The signer's public key
   * @param {string} signature - The base64-encoded signature
   * @returns {Object} Transaction with signature added
   */
  addSignature(transaction, publicKey, signature) {
    transaction.addSignature(publicKey, signature);
    return transaction;
  }

  /**
   * Serialize a 1Money transaction back to base64
   * @param {Object} transaction - The transaction to serialize
   * @param {string} encoding - The encoding format (only base64)
   * @returns {string} Encoded transaction
   */
  serializeTransaction(transaction, encoding = "base64") {
    if (encoding !== "base64") {
      throw standardError(400, `1Money only supports base64 encoding`);
    }
    return transaction.toXDR();
  }

  /**
   * Get potential signers for a 1Money transaction
   * For now, returns the source account
   * Future: Could integrate with 1Money-specific signer discovery
   * @param {Object} transaction - The transaction
   * @param {string} networkName - The network name
   * @returns {Promise<Array<string>>} List of potential signer public keys
   */
  async getPotentialSigners(transaction, networkName) {
    // Extract source account(s) from the transaction
    const signers = [];

    if (transaction.source) {
      signers.push(transaction.source);
    }

    // Check operations for additional source accounts
    if (transaction.operations) {
      for (const op of transaction.operations) {
        if (op.source && !signers.includes(op.source)) {
          signers.push(op.source);
        }
      }
    }

    return signers;
  }

  /**
   * Check if all required signatures are present
   * @param {Array<string>} signerKeys - The keys that have signed
   * @param {Object} transaction - The transaction
   * @returns {boolean} True if transaction is fully signed
   */
  isFullySigned(signerKeys, transaction) {
    // For simple transactions, at least one valid signature is needed
    return signerKeys.length > 0;
  }

  /**
   * Match a signature hint to find the corresponding signer
   * @param {Object} rawSignature - The raw signature object from transaction
   * @param {Array<string>} potentialSigners - List of potential signer keys
   * @param {Buffer} hashRaw - The transaction hash for verification
   * @returns {{ key: string|null, signature: string, hint: string }} Match result
   */
  matchSignatureToSigner(rawSignature, potentialSigners, hashRaw) {
    const { hint, signature } = rawSignature._attributes;

    // Convert signature to base64 for storage
    const signatureBase64 =
      signature instanceof Buffer ? signature.toString("base64") : signature;

    // Find matching signer
    const matchedKey = potentialSigners.find(
      (key) =>
        hintMatchesKey(hint, key) &&
        this.verifySignature(key, signature, hashRaw)
    );

    return {
      key: matchedKey || null,
      signature: signatureBase64,
      hint: matchedKey ? null : hintToMask(hint),
    };
  }

  /**
   * Get network configuration for 1Money
   * @param {string} networkName - The network name
   * @returns {Object} Network configuration
   */
  getNetworkConfig(networkName) {
    const normalizedNetwork = this.normalizeNetworkName(networkName);
    return getNetworkConfig("onemoney", normalizedNetwork);
  }

  /**
   * Get the network passphrase
   * @param {string} networkName - The network name
   * @returns {string} Network passphrase
   */
  getNetworkPassphrase(networkName) {
    const normalized = this.normalizeNetworkName(networkName);
    const passphrase = NETWORK_PASSPHRASES[normalized];
    if (!passphrase) {
      throw standardError(400, `Unknown 1Money network: ${networkName}`);
    }
    return passphrase;
  }

  /**
   * Normalize network name to canonical form
   * @param {string} networkName - The network name
   * @returns {string} Normalized network name
   */
  normalizeNetworkName(networkName) {
    if (!networkName) return "mainnet";
    const normalized = String(networkName).toLowerCase();

    switch (normalized) {
      case "main":
      case "mainnet":
        return "mainnet";
      case "test":
      case "testnet":
        return "testnet";
      default:
        return normalized;
    }
  }

  /**
   * Validate a 1Money public key format
   * Uses Stellar's ed25519 format (G-prefixed)
   * @param {string} publicKey - The public key to validate
   * @returns {boolean} True if valid 1Money public key
   */
  isValidPublicKey(publicKey) {
    return StrKey.isValidEd25519PublicKey(publicKey);
  }

  /**
   * Parse transaction parameters for storage
   * @param {Object} transaction - The 1Money transaction
   * @param {Object} request - The original request
   * @returns {Object} Parsed parameters
   */
  parseTransactionParams(transaction, request) {
    const { callbackUrl, submit, desiredSigners, expires = 0 } = request;
    const now = Math.floor(Date.now() / 1000);

    const params = {
      blockchain: "onemoney",
      networkName: this.normalizeNetworkName(request.networkName),
      payload: transaction.toXDR(),
      encoding: "base64",
      signatures: [],
    };

    // Parse callback URL
    if (callbackUrl) {
      if (
        !/^http(s)?:\/\/[-a-zA-Z0-9_+.]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_+.~#?&/=]*)?$/m.test(
          callbackUrl
        )
      ) {
        throw standardError(
          400,
          'Invalid URL supplied in "callbackUrl" parameter.'
        );
      }
      params.callbackUrl = callbackUrl;
    }

    // Parse desired signers
    if (desiredSigners?.length) {
      if (!Array.isArray(desiredSigners)) {
        throw standardError(
          400,
          'Invalid "desiredSigners" parameter. Expected an array of 1Money public keys.'
        );
      }
      for (const key of desiredSigners) {
        if (!this.isValidPublicKey(key)) {
          throw standardError(
            400,
            `Invalid "desiredSigners" parameter. Key ${key} is not a valid 1Money public key.`
          );
        }
      }
      params.desiredSigners = desiredSigners;
    }

    // Parse time bounds
    params.minTime =
      (transaction.timeBounds && parseInt(transaction.timeBounds.minTime)) || 0;

    // Handle expiration
    if (expires) {
      if (expires > 2147483647 || expires < 0) {
        throw standardError(
          400,
          `Invalid "expires" parameter. ${expires} is not a valid UNIX date.`
        );
      }
      if (expires < now) {
        throw standardError(
          400,
          `Invalid "expires" parameter. ${expires} date has already passed.`
        );
      }
    }

    const txExpiration =
      (transaction.timeBounds && parseInt(transaction.timeBounds.maxTime)) || 0;
    if (txExpiration && txExpiration < now) {
      throw standardError(
        400,
        "Invalid transaction timebounds.maxTime value - the transaction already expired."
      );
    }

    let maxTime = expires;
    if (txExpiration > 0 && (maxTime === 0 || txExpiration < maxTime)) {
      maxTime = txExpiration;
    }
    if (maxTime > 0) {
      params.maxTime = maxTime;
    }

    // Submit flag
    if (submit === true) {
      params.submit = true;
    }

    return params;
  }
}

// Export singleton instance
module.exports = new OneMoneyHandler();
