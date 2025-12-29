/**
 * Transaction URI Parser and Formatter
 *
 * Supports multiple URI formats:
 *
 * 1. Simple format (tx: prefix):
 *    tx:<blockchain>[:<network>];<encoding>,<payload>
 *    Examples:
 *    - tx:stellar:testnet;base64,AAAAAgAAAABT...
 *    - tx:ethereum:mainnet;hex,0x02f87...
 *
 * 2. CAIP-compliant format (Chain Agnostic Improvement Proposals):
 *    blockchain://<namespace>:<chain_id>/tx/<encoding>;<payload>
 *    Examples:
 *    - blockchain://stellar:testnet/tx/base64;AAAAAgAAAABT...
 *    - blockchain://eip155:1/tx/hex;0x02f87...
 *    - blockchain://solana:devnet/tx/base64;AQAAAA...
 *
 * CAIP Namespaces:
 *    - eip155: Ethereum and EVM-compatible chains
 *    - stellar: Stellar network
 *    - solana: Solana network
 *    - bip122: Bitcoin and UTXO chains
 *    - algorand: Algorand network
 *    - aptos: Aptos network
 *    - onemoney: 1Money network
 */

const {
  getBlockchainConfig,
  isValidBlockchain,
  isValidNetwork,
  getNetworkConfig,
} = require("./blockchain-registry");

// Supported encodings
const SUPPORTED_ENCODINGS = ["base64", "hex", "base58", "msgpack", "base32"];

// TX URI prefix (simple format)
const TX_URI_PREFIX = "tx:";

// CAIP URI prefix
const CAIP_URI_PREFIX = "blockchain://";

/**
 * CAIP namespace to blockchain mapping
 * Based on CAIP-2 chain identification
 */
const CAIP_NAMESPACE_MAP = {
  // EIP-155 for Ethereum and EVM chains
  eip155: {
    blockchain: "ethereum",
    chainIdToNetwork: {
      1: "mainnet",
      11155111: "sepolia",
      5: "goerli",
      17000: "holesky",
      137: "mainnet", // Polygon uses eip155 namespace
      80002: "amoy",
      43114: "mainnet", // Avalanche C-Chain
      43113: "fuji",
      42161: "mainnet", // Arbitrum
      421614: "sepolia",
      10: "mainnet", // Optimism
      11155420: "sepolia",
      8453: "mainnet", // Base
      84532: "sepolia",
    },
    // Map chainId to specific blockchain (for L2s)
    chainIdToBlockchain: {
      1: "ethereum",
      11155111: "ethereum",
      5: "ethereum",
      17000: "ethereum",
      137: "polygon",
      80002: "polygon",
      43114: "avalanche",
      43113: "avalanche",
      42161: "arbitrum",
      421614: "arbitrum",
      10: "optimism",
      11155420: "optimism",
      8453: "base",
      84532: "base",
    },
  },
  // Stellar
  stellar: {
    blockchain: "stellar",
    networkIdToNetwork: {
      public: "public",
      testnet: "testnet",
      futurenet: "futurenet",
    },
  },
  // Solana
  solana: {
    blockchain: "solana",
    networkIdToNetwork: {
      mainnet: "mainnet",
      devnet: "devnet",
      testnet: "testnet",
    },
  },
  // Bitcoin (BIP-122)
  bip122: {
    blockchain: "bitcoin",
    // Bitcoin uses genesis block hash as chain ID
    chainIdToNetwork: {
      "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f":
        "mainnet",
      "000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943":
        "testnet",
      "00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6":
        "signet",
    },
  },
  // Algorand
  algorand: {
    blockchain: "algorand",
    networkIdToNetwork: {
      mainnet: "mainnet",
      testnet: "testnet",
      betanet: "betanet",
    },
  },
  // Aptos
  aptos: {
    blockchain: "aptos",
    networkIdToNetwork: {
      mainnet: "mainnet",
      testnet: "testnet",
      devnet: "devnet",
    },
  },
  // 1Money
  onemoney: {
    blockchain: "onemoney",
    networkIdToNetwork: {
      mainnet: "mainnet",
      testnet: "testnet",
    },
  },
};

/**
 * Reverse mapping: blockchain + network -> CAIP namespace + chain_id
 */
const BLOCKCHAIN_TO_CAIP = {
  ethereum: {
    namespace: "eip155",
    networks: {
      mainnet: "1",
      sepolia: "11155111",
      goerli: "5",
      holesky: "17000",
    },
  },
  polygon: {
    namespace: "eip155",
    networks: {
      mainnet: "137",
      amoy: "80002",
    },
  },
  avalanche: {
    namespace: "eip155",
    networks: {
      mainnet: "43114",
      fuji: "43113",
    },
  },
  arbitrum: {
    namespace: "eip155",
    networks: {
      mainnet: "42161",
      sepolia: "421614",
    },
  },
  optimism: {
    namespace: "eip155",
    networks: {
      mainnet: "10",
      sepolia: "11155420",
    },
  },
  base: {
    namespace: "eip155",
    networks: {
      mainnet: "8453",
      sepolia: "84532",
    },
  },
  stellar: {
    namespace: "stellar",
    networks: {
      public: "public",
      testnet: "testnet",
      futurenet: "futurenet",
    },
  },
  solana: {
    namespace: "solana",
    networks: {
      mainnet: "mainnet",
      devnet: "devnet",
      testnet: "testnet",
    },
  },
  bitcoin: {
    namespace: "bip122",
    networks: {
      mainnet:
        "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
      testnet:
        "000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943",
      signet:
        "00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6",
    },
  },
  algorand: {
    namespace: "algorand",
    networks: {
      mainnet: "mainnet",
      testnet: "testnet",
      betanet: "betanet",
    },
  },
  aptos: {
    namespace: "aptos",
    networks: {
      mainnet: "mainnet",
      testnet: "testnet",
      devnet: "devnet",
    },
  },
  onemoney: {
    namespace: "onemoney",
    networks: {
      mainnet: "mainnet",
      testnet: "testnet",
    },
  },
};

/**
 * Parsed transaction URI structure
 * @typedef {Object} ParsedTxUri
 * @property {string} blockchain - The blockchain identifier (e.g., 'stellar', 'ethereum')
 * @property {string} network - The network identifier (e.g., 'public', 'testnet', 'mainnet')
 * @property {string} encoding - The payload encoding (e.g., 'base64', 'hex')
 * @property {string} payload - The encoded transaction payload
 * @property {string} uri - The original URI string
 */

/**
 * Parse a transaction URI into its components
 *
 * @param {string} uri - The transaction URI to parse
 * @returns {ParsedTxUri} Parsed components
 * @throws {Error} If the URI format is invalid
 */
function parseTxUri(uri) {
  if (!uri || typeof uri !== "string") {
    throw new Error("Transaction URI must be a non-empty string");
  }

  // Check for CAIP format first
  if (uri.startsWith(CAIP_URI_PREFIX)) {
    return parseCAIPUri(uri);
  }

  // Check for legacy format (raw base64 XDR without prefix)
  if (!uri.startsWith(TX_URI_PREFIX)) {
    // Attempt to detect legacy Stellar XDR format
    if (isLegacyStellarXdr(uri)) {
      return {
        blockchain: "stellar",
        network: null, // Network must be provided separately for legacy format
        encoding: "base64",
        payload: uri,
        uri: null, // Mark as legacy
        isLegacy: true,
        format: "legacy",
      };
    }
    throw new Error(
      `Invalid transaction URI: must start with "${TX_URI_PREFIX}" or "${CAIP_URI_PREFIX}"`
    );
  }

  // Remove prefix
  const withoutPrefix = uri.slice(TX_URI_PREFIX.length);

  // Split by semicolon to separate blockchain:network from encoding,payload
  const semicolonIndex = withoutPrefix.indexOf(";");
  if (semicolonIndex === -1) {
    throw new Error("Invalid transaction URI: missing semicolon separator");
  }

  const blockchainPart = withoutPrefix.slice(0, semicolonIndex);
  const dataPart = withoutPrefix.slice(semicolonIndex + 1);

  // Parse blockchain and optional network
  const blockchainParts = blockchainPart.split(":");
  if (blockchainParts.length < 1 || blockchainParts.length > 2) {
    throw new Error(
      "Invalid transaction URI: blockchain format should be <blockchain> or <blockchain>:<network>"
    );
  }

  const blockchain = blockchainParts[0].toLowerCase();
  const network =
    blockchainParts.length > 1 ? blockchainParts[1].toLowerCase() : null;

  // Validate blockchain
  if (!isValidBlockchain(blockchain)) {
    throw new Error(`Unsupported blockchain: ${blockchain}`);
  }

  // Validate network if provided
  if (network && !isValidNetwork(blockchain, network)) {
    throw new Error(
      `Invalid network "${network}" for blockchain "${blockchain}"`
    );
  }

  // Parse encoding and payload
  const commaIndex = dataPart.indexOf(",");
  if (commaIndex === -1) {
    throw new Error(
      "Invalid transaction URI: missing comma separator between encoding and payload"
    );
  }

  const encoding = dataPart.slice(0, commaIndex).toLowerCase();
  const payload = dataPart.slice(commaIndex + 1);

  // Validate encoding
  if (!SUPPORTED_ENCODINGS.includes(encoding)) {
    throw new Error(
      `Unsupported encoding: ${encoding}. Supported: ${SUPPORTED_ENCODINGS.join(
        ", "
      )}`
    );
  }

  // Validate payload is not empty
  if (!payload) {
    throw new Error("Invalid transaction URI: payload cannot be empty");
  }

  // Validate payload encoding
  validatePayloadEncoding(payload, encoding);

  return {
    blockchain,
    network,
    encoding,
    payload,
    uri,
    isLegacy: false,
    format: "simple",
  };
}

/**
 * Parse a CAIP-compliant transaction URI
 * Format: blockchain://<namespace>:<chain_id>/tx/<encoding>;<payload>
 *
 * @param {string} uri - The CAIP URI to parse
 * @returns {ParsedTxUri} Parsed components
 * @throws {Error} If the URI format is invalid
 */
function parseCAIPUri(uri) {
  // Remove the prefix
  const withoutPrefix = uri.slice(CAIP_URI_PREFIX.length);

  // Parse: <namespace>:<chain_id>/tx/<encoding>;<payload>
  const txIndex = withoutPrefix.indexOf("/tx/");
  if (txIndex === -1) {
    throw new Error("Invalid CAIP URI: missing /tx/ path segment");
  }

  const chainPart = withoutPrefix.slice(0, txIndex);
  const txPart = withoutPrefix.slice(txIndex + 4); // Skip "/tx/"

  // Parse namespace and chain_id
  const colonIndex = chainPart.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      "Invalid CAIP URI: chain identifier must be in format <namespace>:<chain_id>"
    );
  }

  const namespace = chainPart.slice(0, colonIndex).toLowerCase();
  const chainId = chainPart.slice(colonIndex + 1);

  // Resolve namespace and chainId to blockchain and network
  const { blockchain, network } = resolveCAIPChain(namespace, chainId);

  // Parse encoding and payload
  const semicolonIndex = txPart.indexOf(";");
  if (semicolonIndex === -1) {
    throw new Error(
      "Invalid CAIP URI: missing semicolon separator between encoding and payload"
    );
  }

  const encoding = txPart.slice(0, semicolonIndex).toLowerCase();
  const payload = txPart.slice(semicolonIndex + 1);

  // Validate encoding
  if (!SUPPORTED_ENCODINGS.includes(encoding)) {
    throw new Error(
      `Unsupported encoding: ${encoding}. Supported: ${SUPPORTED_ENCODINGS.join(
        ", "
      )}`
    );
  }

  // Validate payload is not empty
  if (!payload) {
    throw new Error("Invalid CAIP URI: payload cannot be empty");
  }

  // Validate payload encoding
  validatePayloadEncoding(payload, encoding);

  return {
    blockchain,
    network,
    encoding,
    payload,
    uri,
    isLegacy: false,
    format: "caip",
    caip: {
      namespace,
      chainId,
    },
  };
}

/**
 * Resolve CAIP namespace and chain ID to blockchain and network
 *
 * @param {string} namespace - CAIP namespace (e.g., 'eip155', 'stellar')
 * @param {string} chainId - Chain identifier
 * @returns {{ blockchain: string, network: string }} Resolved blockchain and network
 * @throws {Error} If the namespace or chain ID is not supported
 */
function resolveCAIPChain(namespace, chainId) {
  const namespaceConfig = CAIP_NAMESPACE_MAP[namespace];
  if (!namespaceConfig) {
    throw new Error(`Unsupported CAIP namespace: ${namespace}`);
  }

  let blockchain = namespaceConfig.blockchain;
  let network = null;

  // Handle different namespace types
  if (namespaceConfig.chainIdToNetwork) {
    // Try to find the network (works for both string and numeric keys in JS objects)
    network = namespaceConfig.chainIdToNetwork[chainId];

    // For EVM chains, check if it maps to a different blockchain (L2s)
    // We need to check using the chainId for the blockchain mapping
    if (network && namespaceConfig.chainIdToBlockchain) {
      blockchain = namespaceConfig.chainIdToBlockchain[chainId] || blockchain;
    }
  } else if (namespaceConfig.networkIdToNetwork) {
    // Direct network ID mapping
    network = namespaceConfig.networkIdToNetwork[chainId.toLowerCase()];
  }

  if (!network) {
    throw new Error(
      `Unknown chain ID "${chainId}" for namespace "${namespace}"`
    );
  }

  return { blockchain, network };
}

/**
 * Format transaction components into a URI string
 *
 * @param {Object} params - Transaction parameters
 * @param {string} params.blockchain - The blockchain identifier
 * @param {string} [params.network] - The network identifier (optional)
 * @param {string} params.encoding - The payload encoding
 * @param {string} params.payload - The encoded transaction payload
 * @returns {string} Formatted transaction URI
 */
function formatTxUri({ blockchain, network, encoding, payload }) {
  if (!blockchain || typeof blockchain !== "string") {
    throw new Error("Blockchain is required");
  }

  if (!encoding || typeof encoding !== "string") {
    throw new Error("Encoding is required");
  }

  if (!payload || typeof payload !== "string") {
    throw new Error("Payload is required");
  }

  const normalizedBlockchain = blockchain.toLowerCase();
  const normalizedEncoding = encoding.toLowerCase();

  // Validate blockchain
  if (!isValidBlockchain(normalizedBlockchain)) {
    throw new Error(`Unsupported blockchain: ${normalizedBlockchain}`);
  }

  // Validate encoding
  if (!SUPPORTED_ENCODINGS.includes(normalizedEncoding)) {
    throw new Error(`Unsupported encoding: ${normalizedEncoding}`);
  }

  // Build the URI
  let uri = `${TX_URI_PREFIX}${normalizedBlockchain}`;

  if (network) {
    const normalizedNetwork = network.toLowerCase();
    if (!isValidNetwork(normalizedBlockchain, normalizedNetwork)) {
      throw new Error(
        `Invalid network "${normalizedNetwork}" for blockchain "${normalizedBlockchain}"`
      );
    }
    uri += `:${normalizedNetwork}`;
  }

  uri += `;${normalizedEncoding},${payload}`;

  return uri;
}

/**
 * Convert legacy Stellar format to new URI format
 *
 * @param {string} xdr - The base64-encoded XDR
 * @param {number|string} network - Network identifier (0=public, 1=testnet, 2=futurenet or string)
 * @returns {string} Formatted transaction URI
 */
function convertLegacyStellarToUri(xdr, network) {
  const networkMap = {
    0: "public",
    1: "testnet",
    2: "futurenet",
    public: "public",
    testnet: "testnet",
    futurenet: "futurenet",
    PUBLIC: "public",
    TESTNET: "testnet",
    FUTURENET: "futurenet",
  };

  const networkName = networkMap[network];
  if (!networkName) {
    throw new Error(`Invalid Stellar network: ${network}`);
  }

  return formatTxUri({
    blockchain: "stellar",
    network: networkName,
    encoding: "base64",
    payload: xdr,
  });
}

/**
 * Extract legacy format from a parsed URI (for backward compatibility)
 *
 * @param {ParsedTxUri} parsed - Parsed transaction URI
 * @returns {{ xdr: string, network: number }} Legacy format
 */
function toLegacyStellarFormat(parsed) {
  if (parsed.blockchain !== "stellar") {
    throw new Error("Cannot convert non-Stellar transaction to legacy format");
  }

  const networkMap = {
    public: 0,
    testnet: 1,
    futurenet: 2,
  };

  const network = networkMap[parsed.network];
  if (network === undefined) {
    throw new Error(
      `Cannot convert network "${parsed.network}" to legacy format`
    );
  }

  return {
    xdr: parsed.payload,
    network,
  };
}

/**
 * Check if a string looks like legacy Stellar XDR (base64)
 *
 * @param {string} str - String to check
 * @returns {boolean} True if it appears to be legacy Stellar XDR
 */
function isLegacyStellarXdr(str) {
  // Stellar XDR typically starts with 'AAAA' when base64 encoded
  // This is because the transaction envelope starts with a 4-byte type indicator
  if (!str || typeof str !== "string") {
    return false;
  }

  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(str)) {
    return false;
  }

  // Stellar transaction envelopes typically start with 'AAAA' (TransactionEnvelope type)
  // and are at least 100 characters long
  return str.startsWith("AAAA") && str.length >= 100;
}

/**
 * Validate that a payload matches its declared encoding
 *
 * @param {string} payload - The payload to validate
 * @param {string} encoding - The declared encoding
 * @throws {Error} If the payload doesn't match the encoding
 */
function validatePayloadEncoding(payload, encoding) {
  switch (encoding) {
    case "base64": {
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      if (!base64Regex.test(payload)) {
        throw new Error("Invalid base64 payload");
      }
      break;
    }
    case "hex": {
      const hexRegex = /^(0x)?[0-9a-fA-F]+$/;
      if (!hexRegex.test(payload)) {
        throw new Error("Invalid hex payload");
      }
      break;
    }
    case "base58": {
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(payload)) {
        throw new Error("Invalid base58 payload");
      }
      break;
    }
    case "msgpack": {
      // MessagePack payloads are typically base64-encoded when in string form
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      if (!base64Regex.test(payload)) {
        throw new Error(
          "Invalid msgpack payload (expected base64-encoded msgpack)"
        );
      }
      break;
    }
    case "base32": {
      const base32Regex = /^[A-Z2-7]+=*$/i;
      if (!base32Regex.test(payload)) {
        throw new Error("Invalid base32 payload");
      }
      break;
    }
    default:
      throw new Error(`Unknown encoding: ${encoding}`);
  }
}

/**
 * Check if a string is a valid transaction URI
 *
 * @param {string} uri - String to check
 * @returns {boolean} True if valid
 */
function isValidTxUri(uri) {
  try {
    parseTxUri(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a valid CAIP transaction URI
 *
 * @param {string} uri - String to check
 * @returns {boolean} True if valid CAIP URI
 */
function isValidCAIPUri(uri) {
  if (!uri || typeof uri !== "string" || !uri.startsWith(CAIP_URI_PREFIX)) {
    return false;
  }
  try {
    parseCAIPUri(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format transaction components into a CAIP-compliant URI string
 * Format: blockchain://<namespace>:<chain_id>/tx/<encoding>;<payload>
 *
 * @param {Object} params - Transaction parameters
 * @param {string} params.blockchain - The blockchain identifier
 * @param {string} params.network - The network identifier (required for CAIP)
 * @param {string} params.encoding - The payload encoding
 * @param {string} params.payload - The encoded transaction payload
 * @returns {string} Formatted CAIP transaction URI
 */
function formatCAIPUri({ blockchain, network, encoding, payload }) {
  if (!blockchain || typeof blockchain !== "string") {
    throw new Error("Blockchain is required");
  }

  if (!network || typeof network !== "string") {
    throw new Error("Network is required for CAIP format");
  }

  if (!encoding || typeof encoding !== "string") {
    throw new Error("Encoding is required");
  }

  if (!payload || typeof payload !== "string") {
    throw new Error("Payload is required");
  }

  const normalizedBlockchain = blockchain.toLowerCase();
  const normalizedNetwork = network.toLowerCase();
  const normalizedEncoding = encoding.toLowerCase();

  // Validate blockchain
  if (!isValidBlockchain(normalizedBlockchain)) {
    throw new Error(`Unsupported blockchain: ${normalizedBlockchain}`);
  }

  // Validate network
  if (!isValidNetwork(normalizedBlockchain, normalizedNetwork)) {
    throw new Error(
      `Invalid network "${normalizedNetwork}" for blockchain "${normalizedBlockchain}"`
    );
  }

  // Validate encoding
  if (!SUPPORTED_ENCODINGS.includes(normalizedEncoding)) {
    throw new Error(`Unsupported encoding: ${normalizedEncoding}`);
  }

  // Get CAIP mapping
  const caipMapping = BLOCKCHAIN_TO_CAIP[normalizedBlockchain];
  if (!caipMapping) {
    throw new Error(
      `No CAIP mapping available for blockchain: ${normalizedBlockchain}`
    );
  }

  const chainId = caipMapping.networks[normalizedNetwork];
  if (!chainId) {
    throw new Error(
      `No CAIP chain ID available for network "${normalizedNetwork}" on blockchain "${normalizedBlockchain}"`
    );
  }

  return `${CAIP_URI_PREFIX}${caipMapping.namespace}:${chainId}/tx/${normalizedEncoding};${payload}`;
}

/**
 * Convert a simple format URI to CAIP format
 *
 * @param {string} uri - Simple format URI (tx:...)
 * @returns {string} CAIP format URI
 */
function toCAIPFormat(uri) {
  const parsed = parseTxUri(uri);

  if (!parsed.network) {
    throw new Error("Network is required to convert to CAIP format");
  }

  return formatCAIPUri({
    blockchain: parsed.blockchain,
    network: parsed.network,
    encoding: parsed.encoding,
    payload: parsed.payload,
  });
}

/**
 * Convert a CAIP format URI to simple format
 *
 * @param {string} uri - CAIP format URI (blockchain://...)
 * @returns {string} Simple format URI
 */
function toSimpleFormat(uri) {
  const parsed = parseTxUri(uri);

  return formatTxUri({
    blockchain: parsed.blockchain,
    network: parsed.network,
    encoding: parsed.encoding,
    payload: parsed.payload,
  });
}

/**
 * Get the blockchain from a transaction URI without full parsing
 *
 * @param {string} uri - Transaction URI
 * @returns {string|null} Blockchain identifier or null if invalid
 */
function getBlockchainFromUri(uri) {
  if (!uri || typeof uri !== "string") {
    return null;
  }

  // Handle CAIP format
  if (uri.startsWith(CAIP_URI_PREFIX)) {
    try {
      const parsed = parseCAIPUri(uri);
      return parsed.blockchain;
    } catch {
      return null;
    }
  }

  // Handle simple format
  if (!uri.startsWith(TX_URI_PREFIX)) {
    return null;
  }

  const withoutPrefix = uri.slice(TX_URI_PREFIX.length);
  const colonIndex = withoutPrefix.indexOf(":");
  const semicolonIndex = withoutPrefix.indexOf(";");

  if (semicolonIndex === -1) {
    return null;
  }

  const endIndex =
    colonIndex !== -1 && colonIndex < semicolonIndex
      ? colonIndex
      : semicolonIndex;
  return withoutPrefix.slice(0, endIndex).toLowerCase();
}

module.exports = {
  // Parsing
  parseTxUri,
  parseCAIPUri,

  // Formatting
  formatTxUri,
  formatCAIPUri,

  // Conversion
  convertLegacyStellarToUri,
  toLegacyStellarFormat,
  toCAIPFormat,
  toSimpleFormat,

  // Validation
  isLegacyStellarXdr,
  isValidTxUri,
  isValidCAIPUri,
  getBlockchainFromUri,
  validatePayloadEncoding,
  resolveCAIPChain,

  // Constants
  SUPPORTED_ENCODINGS,
  TX_URI_PREFIX,
  CAIP_URI_PREFIX,
  CAIP_NAMESPACE_MAP,
  BLOCKCHAIN_TO_CAIP,
};
