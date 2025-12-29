import React from "react";
import {
  BlockSelect,
  CopyToClipboard,
  InfoTooltip,
  withErrorBoundary,
} from "@stellar-expert/ui-framework";

/**
 * Transaction payload/XDR view
 * @param {String} xdr - Transaction XDR or payload
 * @param {String} [blockchain] - Blockchain identifier
 * @param {String} [encoding] - Payload encoding
 */
export default withErrorBoundary(function TxTransactionXDRView({
  xdr,
  blockchain = "stellar",
  encoding = "base64",
}) {
  const isStellar = blockchain === "stellar";
  const label = isStellar ? "Raw XDR" : "Payload";
  const tooltip = isStellar
    ? "Base64-encoded Stellar transaction XDR with signatures"
    : `${encoding}-encoded transaction data`;

  return (
    <div style={{ display: "inline-flex", maxWidth: "100%" }}>
      <span className="dimmed">
        {label}:<InfoTooltip>{tooltip}</InfoTooltip>
      </span>
      &emsp;
      <BlockSelect
        className="condensed"
        style={{ overflow: "hidden", whiteSpace: "nowrap" }}
      >
        {xdr}
      </BlockSelect>
      <CopyToClipboard text={xdr} />
    </div>
  );
});
