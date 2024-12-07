const express = require('express');
const walletController = require('./lib/controllers/wallet.controller');
require('dotenv').config();

const app = express();
app.use(express.json());

// Wallet routes
app.post('/create-wallet', walletController.createWallet.bind(walletController));
app.get('/wallet/:wallet_id', walletController.getWalletById.bind(walletController));
app.get('/wallet/address/:address', walletController.getWalletByAddress.bind(walletController));
app.post('/transfer', walletController.transfer.bind(walletController));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 