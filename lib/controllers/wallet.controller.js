const walletService = require('../services/wallet.service');
const { getErrorStatusCode } = require('../../utils/errorUtils');
const sipScheduler = require('../../jobs/sip.scheduler');

// Helper function to remove sensitive data from user object
const sanitizeUserData = (userData) => {
    const { seed, ...sanitizedData } = userData;
    return sanitizedData;
};

class WalletController {
    async createWallet(req, res) {
        try {
            const { name, wallet_address, image_url } = req.body;
            const result = await walletService.createWallet(name, wallet_address, image_url);
            
            // Send response with appropriate status code
            res.status(result.status).json({
                success: true,
                message: result.message,
                data: {
                    user: sanitizeUserData(result.data.userData),
                    balance: result.data.balanceData
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

    // Scheduler processor functions
    async processSIPCreate(sipData) {
        try {
            const { sip_id, wallet_id, from_token, to_token, amount, frequency } = sipData;
            
            // First check if SIP exists and is active
            const sip = await walletService.getSIPById(sip_id);
            if (!sip || sip.status !== 'active') {
                console.log(`Not scheduling SIP ${sip_id} as it doesn't exist or is not active`);
                return {
                    success: false,
                    message: 'SIP not found or not active'
                };
            }
            
            // Remove any existing job before creating new one
            await sipScheduler.removeSIPScheduler(sip_id);
            
            // Schedule the SIP job
            await sipScheduler.createSIPScheduler({
                sip_id,
                wallet_id,
                from_token,
                to_token,
                amount,
                frequency
            });

            return {
                success: true,
                message: 'SIP scheduled successfully'
            };
        } catch (error) {
            console.error('Error processing SIP creation:', error);
            throw error;
        }
    }

    async processSIPUpdate(sipData) {
        try {
            const { sip_id, status } = sipData;
            
            // First check if SIP exists
            const sip = await walletService.getSIPById(sip_id);
            if (!sip) {
                console.log(`Cannot update SIP ${sip_id} as it doesn't exist`);
                return {
                    success: false,
                    message: 'SIP not found'
                };
            }
            
            if (status === 'paused') {
                // Pause the scheduled job
                await sipScheduler.removeSIPScheduler(sip_id);
            } else if (status === 'active') {
                // Remove any existing job before creating new one
                await sipScheduler.removeSIPScheduler(sip_id);
                // Resume the scheduled job with full SIP data
                await sipScheduler.createSIPScheduler({
                    sip_id: sip.id,
                    wallet_id: sip.wallet_id,
                    from_token: sip.from_token,
                    to_token: sip.to_token,
                    amount: sip.amount,
                    frequency: sip.frequency
                });
            }

            return {
                success: true,
                message: `SIP ${status === 'paused' ? 'paused' : 'resumed'} successfully`
            };
        } catch (error) {
            console.error('Error processing SIP update:', error);
            throw error;
        }
    }

    async processSIPDelete(sipId) {
        try {
            // Remove the scheduled job
            await sipScheduler.removeSIPScheduler(sipId);
            console.log(`Successfully removed scheduler for SIP ${sipId}`);

            return {
                success: true,
                message: 'SIP scheduler job removed successfully'
            };
        } catch (error) {
            console.error('Error processing SIP deletion:', error);
            throw error;
        }
    }

    // Modify existing createSIP method to use the processor
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

            // Schedule the SIP using the processor
            await this.processSIPCreate({
                sip_id: result.sip.id,
                wallet_id,
                from_token,
                to_token,
                amount,
                frequency
            });

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

    // Modify existing updateSIPStatus method to use the processor
    async updateSIPStatus(req, res) {
        try {
            const { sip_id, wallet_id } = req.params;
            const { status } = req.body;
            const sip = await walletService.updateSIPStatus(sip_id, wallet_id, status);

            // Update the scheduler using the processor
            await this.processSIPUpdate({
                sip_id,
                status
            });

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

    async updateSIP(req, res) {
        try {
            const { sip_id, wallet_id } = req.params;
            const updates = req.body;
            
            // Update SIP in database
            const sip = await walletService.updateSIP(sip_id, wallet_id, updates);

            // If status or frequency is updated, update the scheduler
            if (updates.status || updates.frequency) {
                // Remove existing scheduler first
                await sipScheduler.removeSIPScheduler(sip_id);

                // If SIP is active, create new scheduler with updated frequency
                if ((updates.status) === 'active') {
                    await sipScheduler.createSIPScheduler({
                        sip_id: sip.id,
                        wallet_id: sip.wallet_id,
                        from_token: sip.from_token,
                        to_token: sip.to_token,
                        amount: sip.amount,
                        frequency: updates.frequency || sip.frequency
                    });
                }
            }

            res.json({
                success: true,
                data: { sip }
            });
        } catch (error) {
            console.error('Error updating SIP:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to update SIP'
            });
        }
    }

    async executeSIP(req, res) {
        try {
            const { sip_id } = req.params;
            
            // First check if SIP exists
            const sip = await walletService.getSIPById(sip_id);
            if (!sip) {
                // If SIP doesn't exist, remove it from scheduler
                await this.processSIPDelete(sip_id);
                throw {
                    status: 'not_found',
                    message: `SIP with ID ${sip_id} not found`,
                    sip_id
                };
            }

            // Only execute if SIP is active
            if (sip.status !== 'active') {
                throw {
                    status: 'inactive',
                    message: `SIP with ID ${sip_id} is not active`,
                    sip_id
                };
            }

            const result = await walletService.executeSIP(sip_id);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error executing SIP:', error);
            let status = getErrorStatusCode(error);
            if (error.status === 'insufficient_funds') {
                status = 402;
            } else if (error.status === 'not_found') {
                status = 404;
            }
            
            res.status(status).json({
                success: false,
                error: error.message || 'Failed to execute SIP',
                sip_id: error.sip_id,
                status: error.status
            });
        }
    }

    // Modify existing deleteSIP method to use the processor
    async deleteSIP(req, res) {
        try {
            const { sip_id, wallet_id } = req.params;
            await walletService.deleteSIP(sip_id, wallet_id);

            // Remove the scheduled job using the processor
            await this.processSIPDelete(sip_id);

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

    async getTokenBalances(req, res) {
        try {
            const { address } = req.params;
            const balances = await walletService.getTokenBalances(address);

            res.json({
                success: true,
                data: { balances }
            });
        } catch (error) {
            console.error('Error fetching token balances:', error);
            res.status(getErrorStatusCode(error)).json({
                success: false,
                error: error.message || 'Failed to fetch token balances'
            });
        }
    }
}

module.exports = new WalletController(); 