import React, { useCallback, useState } from "react";
import {
  Button,
  ButtonGroup,
  withErrorBoundary,
} from "@stellar-expert/ui-framework";
import { apiSubmitTx } from "../../../infrastructure/tx-dispatcher";
import { delegateTxSigning, getAllProviders } from "../../../signer/tx-signer";
import AddXdrView from "../add-xdr-view";
import "./add-signatures.scss";

export default withErrorBoundary(function TxAddSignatureView({
  txInfo,
  onUpdate,
}) {
  const [inProgress, setInProgress] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const requestSignature = useCallback(
    (e) => {
      const { provider } = e.target.dataset;
      setInProgress(true);
      processSignature(provider, txInfo)
        .then((updatedTxInfo) => onUpdate(updatedTxInfo))
        .catch((e) => console.error(e))
        .finally(() => setInProgress(false));
    },
    [txInfo, onUpdate]
  );

  const toggleImportModal = useCallback(() => setIsOpen((prev) => !prev), []);

  if (txInfo.readyToSubmit || txInfo.submitted) return null;

  const providers = getAllProviders();
  return (
    <div className="space">
      <div className="text-small dimmed">Sign transaction</div>
      <div className="signature-options micro-space">
        <div className="desktop-only">
          <ButtonGroup style={{ display: "flex" }}>
            {providers.map((provider) => (
              <Button
                key={provider.title}
                block
                outline
                disabled={inProgress}
                onClick={requestSignature}
                data-provider={provider.title}
              >
                <img src={`/img/wallets/${provider.title.toLowerCase()}.svg`} />{" "}
                {provider.title}
              </Button>
            ))}
            <Button
              block
              outline
              disabled={inProgress}
              onClick={toggleImportModal}
            >
              <i className="icon icon-download" /> Import
            </Button>
          </ButtonGroup>
        </div>
        <div className="mobile-only">
          {providers
            .filter((p) => !!p.mobileSupported)
            .map((provider) => (
              <Button
                key={provider.title}
                outline
                block
                disabled={inProgress}
                onClick={requestSignature}
                data-provider={provider.title}
              >
                <img src={`/img/wallets/${provider.title.toLowerCase()}.svg`} />{" "}
                {provider.title}
              </Button>
            ))}
          <Button
            block
            outline
            disabled={inProgress}
            onClick={toggleImportModal}
          >
            <i className="icon icon-download" /> Import
          </Button>
        </div>
      </div>
      {!!inProgress && <div className="loader" />}
      <AddXdrView
        isOpen={isOpen}
        changeVisible={toggleImportModal}
        txInfo={txInfo}
        onUpdate={onUpdate}
      />
    </div>
  );
});

async function processSignature(provider, txInfo) {
  // Get payload (supports both legacy xdr and new payload field)
  const payload = txInfo.payload || txInfo.xdr;
  const network = txInfo.networkName || txInfo.network;

  let signedTx;
  try {
    signedTx = await delegateTxSigning(provider, payload, network);
  } catch (e) {
    notify({
      type: "warning",
      message: e?.msg || "Failed to obtain a transaction signature",
    });
    throw e;
  }
  try {
    // Submit with blockchain-agnostic format if available
    const submitData = txInfo.blockchain
      ? {
          blockchain: txInfo.blockchain,
          networkName: txInfo.networkName || txInfo.network,
          payload: signedTx,
          encoding: txInfo.encoding || "base64",
        }
      : {
          ...txInfo,
          xdr: signedTx,
        };
    return await apiSubmitTx(submitData);
  } catch (e) {
    notify({
      type: "error",
      message:
        "Failed to store transaction signature. Please repeat the process later.",
    });
    throw e;
  }
}
