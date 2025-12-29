import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  BlockSelect,
  CopyToClipboard,
  isDocumentVisible,
  useDependantState,
  withErrorBoundary,
} from "@stellar-expert/ui-framework";
import {
  loadTx,
  checkTxSubmitted,
  apiSubmitTx,
  isSigningSupported,
} from "../../infrastructure/tx-dispatcher";
import TxDetailsOperationsView from "./details/tx-details-operations-view";
import TxTransactionXDRView from "./details/tx-transaction-xdr-view";
import TxSignaturesView from "./details/tx-signatures-view";
import TxAddSignatureView from "./details/tx-add-signature-view";
import HorizonSubmitTxView from "./submit/horizon-submit-tx-view";
import TxPropsView from "./details/tx-props-view";

const statusRefreshInterval = 4; //4 sec.

export default withErrorBoundary(function TxView() {
  const { txhash } = useParams();
  const statusWatcher = useRef();
  const [error, setError] = useState(null);
  const [txInfo, setTxInfo] = useDependantState(
    () => {
      setError("");
      loadTx(txhash)
        .then(async (txInfo) => {
          // Only check Horizon for Stellar transactions
          const blockchain = txInfo.blockchain || "stellar";
          if (blockchain === "stellar") {
            const horizonTx = await checkTxSubmitted(txInfo);
            if (!horizonTx.submitted) return setTxInfo(txInfo);
            //Send transaction to the server to sync status
            await apiSubmitTx({
              blockchain: horizonTx.blockchain || "stellar",
              networkName: horizonTx.networkName || horizonTx.network,
              payload: horizonTx.payload || horizonTx.xdr,
            }).then(async () => {
              const txInfo = await loadTx(txhash);
              setTxInfo(txInfo);
            });
          } else {
            // Non-Stellar: just set the info
            setTxInfo(txInfo);
          }
        })
        .catch((e) => setError(e));
      return null;
    },
    [txhash],
    () => clearTimeout(statusWatcher.current)
  );

  const loadPeriodicallyTx = useCallback(() => {
    loadTx(txhash)
      .then((txInfo) => {
        setTxInfo(txInfo);
        clearTimeout(statusWatcher.current);
        if (txInfo.submitted || txInfo.status === "failed") return null;
        statusWatcher.current = setTimeout(
          loadPeriodicallyTx,
          statusRefreshInterval * 1000
        );
      })
      .catch((e) => console.error(e));
  }, [txhash, setTxInfo]);

  //periodically check the transaction status when the transaction tab is active
  const checkStatus = useCallback(() => {
    if (
      !isDocumentVisible() ||
      txInfo?.submitted ||
      txInfo?.status === "failed"
    ) {
      return clearTimeout(statusWatcher.current);
    }
    loadPeriodicallyTx();
  }, [txInfo, loadPeriodicallyTx]);

  useEffect(() => {
    if (!txInfo?.submitted) {
      statusWatcher.current = setTimeout(
        checkStatus,
        statusRefreshInterval * 1000
      );

      //check active tab
      document.addEventListener("visibilitychange", checkStatus);
    }
    return () => {
      clearTimeout(statusWatcher.current);
      document.removeEventListener("visibilitychange", checkStatus);
    };
  }, [txInfo?.status, checkStatus]);

  const updateTx = useCallback((txInfo) => setTxInfo(txInfo), [setTxInfo]);

  if (error) throw error;
  if (!txInfo) return <div className="loader" />;

  const blockchain = txInfo.blockchain || "stellar";
  const isStellar = blockchain === "stellar";
  const xdr = txInfo.payload || txInfo.xdr;
  const networkName = txInfo.networkName || txInfo.network;
  const signingSupported = isSigningSupported(blockchain);

  return (
    <>
      <h2 style={{ display: "inline-flex", maxWidth: "100%" }}>
        Transaction&nbsp;
        <BlockSelect className="condensed" style={{ overflow: "hidden" }}>
          {txhash}
        </BlockSelect>
        <span className="text-small">
          <CopyToClipboard text={txhash} />
        </span>
      </h2>
      <div className="row">
        <div className="column column-50">
          <div className="flex-column h-100">
            <div className="segment h-100">
              <h3>{isStellar ? "Transaction" : "Payload"}</h3>
              <hr />
              <div className="space">
                <TxTransactionXDRView
                  xdr={xdr}
                  blockchain={blockchain}
                  encoding={txInfo.encoding}
                />
              </div>
              {isStellar && (
                <TxDetailsOperationsView xdr={xdr} network={networkName} />
              )}
            </div>
          </div>
        </div>
        <div className="column column-50">
          <div className="flex-column h-100">
            <div className="segment h-100 mobile-space">
              <h3>Properties</h3>
              <hr />
              <TxPropsView txInfo={txInfo} />
            </div>
          </div>
        </div>
        {signingSupported && (
          <div className="column column-50">
            <div className="flex-column h-100">
              <div className="segment h-100 space">
                <h3>
                  Signatures
                  <span className="text-small dimmed">
                    &emsp;{getSignaturesStatus(txInfo)}
                  </span>
                </h3>
                <hr />
                <TxSignaturesView {...txInfo} />
              </div>
            </div>
          </div>
        )}
        <div className="column column-50">
          <div className="flex-column h-100">
            <div className="segment h-100 space">
              <h3>Status</h3>
              <hr />
              {signingSupported ? (
                <>
                  <div className="space">
                    <HorizonSubmitTxView txInfo={txInfo} onUpdate={updateTx} />
                  </div>
                  <TxAddSignatureView txInfo={txInfo} onUpdate={updateTx} />
                </>
              ) : (
                <div className="dimmed">
                  Signing and submission not yet supported for this blockchain.
                  <br />
                  Current status: <strong>{txInfo.status}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

function getSignaturesStatus({ readyToSubmit, signatures, schema }) {
  if (!signatures?.length || !schema?.requirements) return "";
  if (schema.requirements.length > 1)
    //complex case
    return readyToSubmit ? "✓ fully signed" : "more signatures required";
  let totalWeight = 0;
  let signedWeight = 0;
  const requirements = schema.requirements[0];
  for (const signer of requirements.signers) {
    totalWeight += signer.weight;
    const matchingSignature = signatures.find(
      (signature) => signature.key === signer.key
    );
    if (matchingSignature) {
      matchingSignature.weight = signer.weight;
      signedWeight += signer.weight;
    }
  }
  return `${readyToSubmit ? "✓ " : ""}${signatures.length}/${
    requirements.minThreshold
  } of ${totalWeight} possible`;
}
