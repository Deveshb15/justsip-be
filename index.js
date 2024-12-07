import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";

// Change this to the path of your API key file downloaded from CDP portal.
Coinbase.configureFromJson({ filePath: "./cdp_api_key.json" });

// Create a Wallet for the User.
let wallet = await Wallet.create();
// let wallet = await Wallet.import({
//     walletId: '13a5668a-95e6-465d-bf44-5c1f41e093e6',
//     seed: "9f8ba06fa0766497ed6088c155573da03480213a20c751fa4af10b2b23223986"
// })
console.log(`Wallet successfully created: `, wallet.toString());
console.log(`Seed: `, wallet.seed);
console.log(`Wallet ID: `, wallet.model.default_address.wallet_id);

// Wallets come with a single default Address, accessible via getDefaultAddress:
let address = await wallet.getDefaultAddress();
// console.log(`Default address for the wallet: `, wallet.seed);
console.log(`Default address for the wallet: `, address.toString());

// const faucetTransaction = await wallet.faucet();
// console.log(`Faucet transaction successfully completed: `, faucetTransaction.toString());

// let anotherWallet = "0xf44bfa57b61459cA40A3Ca21fB809D09088804ED"
// // console.log(`Second Wallet successfully created: `, anotherWallet.toString());

// const transfer = await wallet.createTransfer({
//   amount: 0.00001,
//   assetId: Coinbase.assets.Eth,
//   destination: anotherWallet,
// });

// // Wait for the transfer to complete or fail on-chain.
// await transfer.wait();

// console.log(`Transfer successfully completed: `, transfer.toString());