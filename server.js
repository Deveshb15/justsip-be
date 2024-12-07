const express = require('express');
const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');
const { createClient } = require('@supabase/supabase-js');
const { encrypt, decrypt } = require('./utils/encryption');
require('dotenv').config();

const app = express();
app.use(express.json());

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configure Coinbase SDK
Coinbase.configureFromJson({ filePath: "./cdp_api_key.json" },);

// Helper function to remove sensitive data from user object
const sanitizeUserData = (userData) => {
    const { seed, ...sanitizedData } = userData;
    return sanitizedData;
};

// Endpoint to create wallet
app.post('/create-wallet', async (req, res) => {
    try {
        const { name, wallet_address, image_url } = req.body;

        // Create a new wallet
        const wallet = await Wallet.create({
            networkId: Coinbase.networks.BaseMainnet
        });
        
        // Get the default address
        const address = await wallet.getDefaultAddress();
        
        // Encrypt the seed before saving
        const encryptedSeed = encrypt(wallet.seed);
        
        // Create user in database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([
                {
                    wallet_address: wallet_address || '',
                    mpc_wallet_address: address.model.address_id,
                    seed: encryptedSeed,
                    wallet_id: wallet.model.default_address.wallet_id,
                    name: name || '',
                    image_url: image_url || ''
                }
            ])
            .select();

        if (userError) throw userError;

        // Initialize balances for the user
        const { data: balanceData, error: balanceError } = await supabase
            .from('balances')
            .insert([
                {
                    wallet_id: wallet.model.default_address.wallet_id,
                    eth_balance: 0,
                    cbbtc_balance: 0
                }
            ])
            .select();

        if (balanceError) throw balanceError;

        // Remove seed from response
        const sanitizedUserData = sanitizeUserData(userData[0]);

        res.json({
            success: true,
            data: {
                user: sanitizedUserData,
                balance: balanceData[0]
            }
        });
    } catch (error) {
        console.error('Error creating wallet:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Transfer funds endpoint
app.post('/withdraw', async (req, res) => {
    try {
        const { wallet_id, amount } = req.body;

        if (!wallet_id || !amount) {
            return res.status(400).json({
                success: false,
                error: 'wallet_id and amount are required'
            });
        }

        // Get user data from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('wallet_id', wallet_id)
            .single();

        if (userError) throw userError;
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'Wallet not found'
            });
        }

        // Decrypt the seed
        const decryptedSeed = decrypt(userData.seed);

        // Import the wallet using the seed
        const wallet = await Wallet.import({
            walletId: wallet_id,
            seed: decryptedSeed,
        });

        // Create the transfer
        const transfer = await wallet.createTransfer({
            amount: parseFloat(amount),
            assetId: Coinbase.assets.Eth,
            destination: userData.wallet_address
        });
        // Wait for the transfer to complete
        await transfer.wait();
        console.log(`Transfer successfully completed: `, transfer.toString());

        // Update balance in database (you might want to get the actual balance from the blockchain)
        // const { error: balanceError } = await supabase
        //     .from('balances')
        //     .update({
        //         eth_balance: supabase.sql`eth_balance + ${amount}`,
        //         updated_at: new Date().toISOString()
        //     })
        //     .eq('wallet_id', wallet_id);

        // if (balanceError) throw balanceError;

        res.json({
            success: true,
            data: {
                transfer: {
                    id: transfer.model.id,
                    status: transfer.toString(),
                    amount: amount,
                    destination: userData.wallet_address
                }
            }
        });
    } catch (error) {
        console.error('Error making transfer:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get wallet by wallet_id
app.get('/wallet/:wallet_id', async (req, res) => {
    try {
        const { wallet_id } = req.params;

        // Get user data
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('wallet_id', wallet_id)
            .single();

        if (userError) throw userError;
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'Wallet not found'
            });
        }

        // Get balance data
        const { data: balanceData, error: balanceError } = await supabase
            .from('balances')
            .select('*')
            .eq('wallet_id', wallet_id)
            .single();

        if (balanceError) throw balanceError;

        // Remove seed from response
        const sanitizedUserData = sanitizeUserData(userData);

        res.json({
            success: true,
            data: {
                user: sanitizedUserData,
                balance: balanceData
            }
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get wallet by wallet address (either mpc_wallet_address or wallet_address)
app.get('/wallet/address/:address', async (req, res) => {
    try {
        const { address } = req.params;

        // Search in both mpc_wallet_address and wallet_address columns
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .or(`mpc_wallet_address.eq.${address},wallet_address.eq.${address}`)
            .single();

        if (userError) throw userError;
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'Wallet not found'
            });
        }

        // Get balance data
        const { data: balanceData, error: balanceError } = await supabase
            .from('balances')
            .select('*')
            .eq('wallet_id', userData.wallet_id)
            .single();

        if (balanceError) throw balanceError;

        // Remove seed from response
        const sanitizedUserData = sanitizeUserData(userData);

        res.json({
            success: true,
            data: {
                user: sanitizedUserData,
                balance: balanceData
            }
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 