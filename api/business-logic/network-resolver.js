// Edit LJM - Added MAINNET to the network resolver

const { standardError } = require("./std-error"),
  { networks } = require("../app.config.json");

function normalizeNetworkName(network) {
  switch (network) {
    case "public":
    case "PUBLIC":
    case "mainnet":
    case "MAINNET":
    case "main":
    case "MAIN":
    case "0":
    case 0:
      return "public";
    case "testnet":
    case "test":
    case "TESTNET":
    case "TEST":
    case "1":
    case 1:
      return "testnet";
    case "FUTURENET":
    case "futurenet":
    case 2:
    case "2":
      return "futurenet";
    default:
      throw standardError(400, "Unidentified network: " + network);
  }
}

/**
 *
 * @param {String} network
 * @return {{horizon: String, network: String, passphrase: String}}
 */
function resolveNetwork(network) {
  return networks[normalizeNetworkName(network)];
}

/**
 *
 * @param {String} network
 * @return {Number}
 */
function resolveNetworkId(network) {
  switch (normalizeNetworkName(network)) {
    case "public":
    case "0":
      return 0;
    case "testnet":
    case "1":
      return 1;
    case "futurenet":
    case "2":
      return 2;
    default:
      throw standardError(400, "Unidentified network: " + network);
  }
}

function resolveNetworkParams(network) {
  return networks[normalizeNetworkName(network)];
}

module.exports = {
  resolveNetwork,
  resolveNetworkId,
  resolveNetworkParams,
  normalizeNetworkName,
};
