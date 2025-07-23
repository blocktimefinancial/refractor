const stellarSdk = require("@stellar/stellar-sdk");
const { get } = require("http");
const { Keypair, TransactionBuilder, Networks, Operation } = stellarSdk;
const util = require("util");

// Get two of BTF's MAINNET public keys
// DEMO Mitchell Default Account
const btfPublicKey1 =
  "GAYL2DRPLHUYIMYFCW5E6RY25OQ6CVGG25HU2Z6IW7L65S36ZTIRPO4F";
const btfSecretKey1 =
  "SCADQSE4FF5HOTET3OWMFQXQSYT4YQXARJYDAMBKDYNWS7IPS3TPFWVX";
// DEMO Lou6's Default Account
const btfPublicKey2 =
  "GA34UJFM3TGXSSXPZHB4YFB5HSQIPJZ33QQWX5MLCYPWFPFG2FFJWPEK";

async function createTx() {
  // Create a keypair from the public key
  const keypair = Keypair.fromPublicKey(btfPublicKey1);

  // Create a new Stellar SDK server instance
  const server = new stellarSdk.Horizon.Server("https://horizon.stellar.org");
  // Fetch the account details
  const account = await server.loadAccount(keypair.publicKey());
  // Print the account details

  // Create a transaction
  const transaction = new TransactionBuilder(account, {
    fee: stellarSdk.BASE_FEE,
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      Operation.payment({
        destination: btfPublicKey2,
        asset: stellarSdk.Asset.native(),
        amount: "0.0000008",
      })
    )
    .setTimeout(60 * 15)
    .build();

  console.log(`Transaction hash: ${transaction.hash().toString("hex")}`);
  // Print the transaction envelope
  console.log(
    "Transaction Envelope:",
    transaction.toEnvelope().toXDR("base64")
  );
  // Upload the transaction to the Stellar Expert Refractor server
  const result = await fetch("https://api.refractor.space/tx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network: "public",
      xdr: transaction.toEnvelope().toXDR("base64"),
    }),
  });

  // Check if the transaction was successful
  if (result.status === 200) {
    console.log("Transaction successful");
  } else {
    console.log("Transaction failed");
  }
  // Print the result
  const data = await result.json();
  console.log(`Transaction result: ${util.inspect(data)}`);
  return data;
}

async function getTx(txHash) {
  // Get the transaction details from refractor.space
  const response = await fetch(`https://api.refractor.space/tx/${txHash}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  // Check if the request was successful
  if (response.status === 200) {
    const data = await response.json();
    console.log("Transaction details:", util.inspect(data));
    return data;
  } else {
    console.error("Failed to fetch transaction details");
  }
}

async function signTx(xdr, network, secretKey, txHash) {
  // Create a keypair from the secret key
  const keypair = Keypair.fromSecret(secretKey);
  // Create a Stellar transaction from the XDR
  const transaction = new stellarSdk.Transaction(xdr, network);
  // Sign the transaction with the keypair
  transaction.sign(keypair);
  // Print the signed transaction envelope
  console.log(
    "Signed Transaction Envelope:",
    transaction.toEnvelope().toXDR("base64")
  );
  // Upload the signed transaction to the Stellar Expert Refractor server
  const url = `https://api.refractor.space/tx`;
  console.log(`Uploading signed transaction to ${url}`);
  const result = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network: "public",
      xdr: transaction.toEnvelope().toXDR("base64"),
    }),
  });
  // Check if the transaction was successful
  if (result.status === 200) {
    console.log("Transaction successful");
  } else {
    console.log("Transaction failed");
    console.log("Error:", result.statusText);
    console.log("Response:", await result.text());
    console.log(`Result: ${util.inspect(result)}`);
    return;
  }
  // Print the result
  const data = await result.json();
  console.log(`Transaction result: ${util.inspect(data)}`);
}

async function getAndSignTx(txHash) {
  const txData = await getTx(txHash);

  await signTx(txData.xdr, Networks.PUBLIC, btfSecretKey1, txHash);
}

async function main() {
  const txData = await createTx();
  // Wait for the transaction to be created
  console.log("Waiting for transaction to be created...");
  await new Promise((resolve) => setTimeout(resolve, 60000));
  // Get the transaction hash
  //await getAndSignTx(txData.hash);
}

main()
  .then(() => {
    console.log("All done!");
  })
  .catch((error) => {
    console.error("Error:", error);
  });
