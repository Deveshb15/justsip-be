const walletService = require('../services/wallet.service');

// Helper function to remove sensitive data from user object
const sanitizeUserData = (userData) => {
    const { seed, ...sanitizedData } = userData;
    return sanitizedData;
};

class WalletController {
    async createWallet(req, res) {
        try {
            const { name, wallet_address, image_url } = req.body;
            const { userData, balanceData } = await walletService.createWallet(name, wallet_address, image_url);
            
            res.json({
                success: true,
                data: {
                    user: sanitizeUserData(userData),
                    balance: balanceData
                }
            });
        } catch (error) {
            console.error('Error creating wallet:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getWalletById(req, res) {
        try {
            const { wallet_id } = req.params;
            const { userData, balanceData } = await walletService.getWalletById(wallet_id);

            res.json({
                success: true,
                data: {
                    user: sanitizeUserData(userData),
                    balance: balanceData
                }
            });
        } catch (error) {
            console.error('Error fetching wallet:', error);
            const status = error.message === 'Wallet not found' ? 404 : 500;
            res.status(status).json({
                success: false,
                error: error.message
            });
        }
    }

    async getWalletByAddress(req, res) {
        try {
            const { address } = req.params;
            const { userData, balanceData } = await walletService.getWalletByAddress(address);

            res.json({
                success: true,
                data: {
                    user: sanitizeUserData(userData),
                    balance: balanceData
                }
            });
        } catch (error) {
            console.error('Error fetching wallet:', error);
            const status = error.message === 'Wallet not found' ? 404 : 500;
            res.status(status).json({
                success: false,
                error: error.message
            });
        }
    }

    async transfer(req, res) {
        try {
            const { wallet_id, amount } = req.body;
            const transfer = await walletService.transfer(wallet_id, amount);

            res.json({
                success: true,
                data: { transfer }
            });
        } catch (error) {
            console.error('Error making transfer:', error);
            const status = error.message.includes('required') ? 400 : 500;
            res.status(status).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new WalletController(); 