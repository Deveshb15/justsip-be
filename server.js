const express = require('express');
const walletController = require('./lib/controllers/wallet.controller');
require('dotenv').config();
const cors = require('cors');

const app = express();

// More specific CORS configuration
const corsOptions = {
  origin: '*', // or specify allowed origins like ['http://localhost:3000', 'https://yourapp.com']
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use(express.json());

// Wallet routes
app.post('/create-wallet', walletController.createWallet.bind(walletController));
app.get('/wallet/:wallet_id', walletController.getWalletById.bind(walletController));
app.get('/wallet/address/:address', walletController.getWalletByAddress.bind(walletController));
app.get('/wallet/balances/:address', walletController.getTokenBalances.bind(walletController));
app.post('/transfer', walletController.transfer.bind(walletController));
app.post('/trade', walletController.trade.bind(walletController));
app.get('/trades/:wallet_id', walletController.getTradeHistory.bind(walletController));

// SIP routes
app.post('/sip', walletController.createSIP.bind(walletController));
app.get('/sip/:wallet_id', walletController.getSIPs.bind(walletController));
app.put('/sip/:wallet_id/:sip_id/status', walletController.updateSIPStatus.bind(walletController));
app.put('/sip/:wallet_id/:sip_id', walletController.updateSIP.bind(walletController));
app.post('/sip/:sip_id/execute', walletController.executeSIP.bind(walletController));
app.delete('/sip/:wallet_id/:sip_id', walletController.deleteSIP.bind(walletController));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 