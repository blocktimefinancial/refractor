const { normalizeNetworkName, resolveNetwork } = require("./network-resolver"),
  storageLayer = require("../storage/storage-layer"),
  { TransactionBuilder } = require("@stellar/stellar-sdk");

async function loadRehydrateTx(hash) {
  const txInfo = await storageLayer.dataProvider.findTransaction(hash);
  if (!txInfo) {
    const notFound = new Error(`Transaction ${hash} not found.`);
    notFound.status = 404;
    return Promise.reject(notFound);
  }
  return rehydrateTx(txInfo);
}

/**
 *
 * @param {TxModel} txInfo
 * @return {TxModel}
 */
function rehydrateTx(txInfo) {
  const { network, xdr, ...res } = txInfo;
  const tx = TransactionBuilder.fromXDR(
    xdr,
    resolveNetwork(network).passphrase
  );
  //rehydrate - set network and add signatures from tx info
  res.network = normalizeNetworkName(network);
  for (const { key, signature } of txInfo.signatures) {
    // Signature is already a base64 string from MongoDB
    const signatureString =
      typeof signature === "string" ? signature : signature.toString("base64");
    tx.addSignature(key, signatureString);
  }
  res.xdr = tx.toXDR();
  return res;
}

module.exports = { loadRehydrateTx, rehydrateTx };
