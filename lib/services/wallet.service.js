const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');
const { encrypt, decrypt } = require('../../utils/encryption');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class WalletService {
    constructor() {
        // Configure Coinbase SDK
        Coinbase.configureFromJson({ filePath: "./cdp_api_key.json" });
    }

    async createWallet(name, wallet_address, image_url) {
        // Create a new wallet
        const wallet = await Wallet.create();
        
        // Get the default address
        const address = await wallet.getDefaultAddress();
        
        // Encrypt the seed before saving
        const encryptedSeed = encrypt(wallet.seed);
        
        // Create user in database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([{
                wallet_address: wallet_address || '',
                mpc_wallet_address: address.model.address_id,
                seed: encryptedSeed,
                wallet_id: wallet.model.default_address.wallet_id,
                name: name || '',
                image_url: image_url || ''
            }])
            .select();

        if (userError) throw userError;

        // Initialize balances
        const { data: balanceData, error: balanceError } = await supabase
            .from('balances')
            .insert([{
                wallet_id: wallet.model.default_address.wallet_id,
                eth_balance: 0,
                cbbtc_balance: 0
            }])
            .select();

        if (balanceError) throw balanceError;

        return { userData: userData[0], balanceData: balanceData[0] };
    }

    async getWalletById(wallet_id) {
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('wallet_id', wallet_id)
            .single();

        if (userError) throw userError;
        if (!userData) throw new Error('Wallet not found');

        const { data: balanceData, error: balanceError } = await supabase
            .from('balances')
            .select('*')
            .eq('wallet_id', wallet_id)
            .single();

        if (balanceError) throw balanceError;

        return { userData, balanceData };
    }

    async getWalletByAddress(address) {
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .or(`mpc_wallet_address.eq.${address},wallet_address.eq.${address}`)
            .single();

        if (userError) throw userError;
        if (!userData) throw new Error('Wallet not found');

        const { data: balanceData, error: balanceError } = await supabase
            .from('balances')
            .select('*')
            .eq('wallet_id', userData.wallet_id)
            .single();

        if (balanceError) throw balanceError;

        return { userData, balanceData };
    }

    async transfer(wallet_id, amount) {
        if (!wallet_id || !amount) {
            throw new Error('wallet_id and amount are required');
        }

        // Get user data
        const { userData } = await this.getWalletById(wallet_id);
        
        // Decrypt the seed
        const decryptedSeed = decrypt(userData.seed);

        // Import the wallet
        const wallet = await Wallet.import({
            walletId: wallet_id,
            seed: decryptedSeed
        });

        // Create transfer
        const transfer = await wallet.createTransfer({
            amount: parseFloat(amount),
            assetId: Coinbase.assets.Eth,
            destination: userData.wallet_address
        });

        // Wait for completion
        await transfer.wait();

        // Update balance
        const { error: balanceError } = await supabase
            .from('balances')
            .update({
                eth_balance: supabase.sql`eth_balance + ${amount}`,
                updated_at: new Date().toISOString()
            })
            .eq('wallet_id', wallet_id);

        if (balanceError) throw balanceError;

        return {
            id: transfer.model.id,
            status: transfer.model.status,
            amount: amount,
            destination: userData.wallet_address
        };
    }
}

module.exports = new WalletService(); 