const walletService = require('../services/wallet.service');
const { getErrorStatusCode } = require('../../utils/errorUtils');

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
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to create wallet'
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
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to fetch wallet'
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
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to fetch wallet'
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
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to execute transfer'
            });
        }
    }

    async trade(req, res) {
        try {
            const { wallet_id, amount, from_token, to_token } = req.body;
            const trade = await walletService.trade(wallet_id, amount, from_token, to_token);

            res.json({
                success: true,
                data: { trade }
            });
        } catch (error) {
            console.error('Error executing trade:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to execute trade'
            });
        }
    }

    async createSIP(req, res) {
        try {
            const { wallet_id, from_token, to_token, amount, frequency } = req.body;
            const result = await walletService.createSIP(wallet_id, from_token, to_token, amount, frequency);

            // If there was an error with initial trade
            if (result.error) {
                return res.status(402).json({
                    success: false,
                    error: result.error,
                    data: { sip: result.sip }
                });
            }

            res.json({
                success: true,
                data: {
                    sip: result.sip,
                    initial_trade: result.initial_trade
                }
            });
        } catch (error) {
            console.error('Error creating SIP:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to create SIP'
            });
        }
    }

    async getSIPs(req, res) {
        try {
            const { wallet_id } = req.params;
            const sips = await walletService.getSIPs(wallet_id);

            res.json({
                success: true,
                data: { sips }
            });
        } catch (error) {
            console.error('Error fetching SIPs:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to fetch SIPs'
            });
        }
    }

    async updateSIPStatus(req, res) {
        try {
            const { sip_id, wallet_id } = req.params;
            const { status } = req.body;
            const sip = await walletService.updateSIPStatus(sip_id, wallet_id, status);

            res.json({
                success: true,
                data: { sip }
            });
        } catch (error) {
            console.error('Error updating SIP status:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to update SIP status'
            });
        }
    }

    async executeSIP(req, res) {
        try {
            const { sip_id } = req.params;
            const result = await walletService.executeSIP(sip_id);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error executing SIP:', error);
            const status = error.status === 'insufficient_funds' ? 402 : getErrorStatusCode(error);
            res.status(status).json({
                success: false,
                error: error.message || 'Failed to execute SIP',
                sip_id: error.sip_id,
                status: error.status
            });
        }
    }

    async deleteSIP(req, res) {
        try {
            const { sip_id, wallet_id } = req.params;
            await walletService.deleteSIP(sip_id, wallet_id);

            res.json({
                success: true,
                message: 'SIP deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting SIP:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to delete SIP'
            });
        }
    }

    async getTradeHistory(req, res) {
        try {
            const { wallet_id } = req.params;
            const trades = await walletService.getTradeHistory(wallet_id);

            res.json({
                success: true,
                data: { trades }
            });
        } catch (error) {
            console.error('Error fetching trade history:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to fetch trade history'
            });
        }
    }
}

module.exports = new WalletController(); 