const { Coinbase, Wallet } = require("@coinbase/coinbase-sdk");
const { encrypt, decrypt } = require("../../utils/encryption");
const supabase = require("../config/supabase");
const { isInsufficientFundsError } = require("../../utils/errorUtils");
const { Alchemy, Network } = require("alchemy-sdk");
const ethers = require("ethers");
require("dotenv").config();

// Configure Alchemy
const alchemyConfig = {
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.BASE_MAINNET,
};
const alchemy = new Alchemy(alchemyConfig);

// SIP Status enum
const SIP_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  INSUFFICIENT_FUNDS: "insufficient_funds",
};

const TOKEN_MAP = {
  ETH: Coinbase.assets.Eth,
  CBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// Helper function to resolve asset ID
const resolveAssetId = (token) => {
  if (TOKEN_MAP[token?.toUpperCase()]) {
    return TOKEN_MAP[token?.toUpperCase()];
  }

  if (Coinbase.assets[token]) {
    return Coinbase.assets[token];
  }
  // Otherwise, assume it's a contract address
  return token;
};

// Helper function to calculate next execution time
const calculateNextExecution = (frequency, lastExecution = null) => {
  const now = lastExecution ? new Date(lastExecution) : new Date();

  switch (frequency) {
    case "daily":
      return new Date(now.setDate(now.getDate() + 1));
    case "weekly":
      return new Date(now.setDate(now.getDate() + 7));
    case "monthly":
      return new Date(now.setMonth(now.getMonth() + 1));
    default:
      throw new Error("Invalid frequency");
  }
};

// Helper function to get token balances from Alchemy
async function getTokenBalances(address) {
    try {
        // Get ETH balance
        const ethBalance = await alchemy.core.getBalance(address);
        // Convert the BigNumber to string format that ethers can handle
        const ethBalanceInEther = ethers.formatEther(ethBalance.toString());

        // Get token balances including USDC and CBTC
        const tokenBalances = await alchemy.core.getTokenBalances(address, [
            TOKEN_MAP.CBTC,
            TOKEN_MAP.USDC
        ]);
        // Get token metadata for price information
        const usdcMetadata = await alchemy.core.getTokenMetadata(TOKEN_MAP.USDC);
        const cbtcMetadata = await alchemy.core.getTokenMetadata(TOKEN_MAP.CBTC);

        // Calculate balances
        const cbbtcBalance = parseFloat(ethers.formatUnits(
            tokenBalances.tokenBalances.find(t => t.contractAddress.toLowerCase() === TOKEN_MAP.CBTC.toLowerCase())?.tokenBalance || '0',
            cbtcMetadata.decimals
        ));

        const usdcBalance = parseFloat(ethers.formatUnits(
            tokenBalances.tokenBalances.find(t => t.contractAddress.toLowerCase() === TOKEN_MAP.USDC.toLowerCase())?.tokenBalance || '0',
            usdcMetadata.decimals
        ));

        return {
            eth_balance: parseFloat(ethBalanceInEther),
            cbbtc_balance: cbbtcBalance,
            usd_balance: usdcBalance // USDC balance represents USD balance
        };
    } catch (error) {
        console.error('Error fetching token balances:', error);
        throw error;
    }
}

async function updateWalletBalances(wallet_id, mpc_wallet_address) {
    try {
        const balances = await getTokenBalances(mpc_wallet_address);
        
        const { error: upsertError } = await supabase
            .from("balances")
            .upsert({
                wallet_id, // Include wallet_id for new records
                eth_balance: balances.eth_balance,
                cbbtc_balance: balances.cbbtc_balance,
                usd_balance: balances.usd_balance,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'wallet_id' // Use wallet_id as the unique constraint
            });

        if (upsertError) throw upsertError;
        return balances;
    } catch (error) {
        console.error('Error updating wallet balances:', error);
        throw error;
    }
}

class WalletService {
  constructor() {
    // Configure Coinbase SDK
    Coinbase.configureFromJson({ filePath: "./cdp_api_key.json" });
  }

  async createWallet(name, wallet_address, image_url) {
    // First check if wallet exists with the given wallet_address
    const { data: existingUser, error: searchError } = await supabase
      .from("users")
      .select("*")
      .eq("wallet_address", wallet_address)
      .single();

    if (searchError && searchError.code !== 'PGRST116') throw searchError;
    
    // If wallet exists, return the existing wallet data with 200 OK status
    if (existingUser) {
      const { data: balanceData, error: balanceError } = await supabase
        .from("balances")
        .select("*")
        .eq("wallet_id", existingUser.wallet_id)
        .single();

      console.log("EXISTING USER", existingUser)

      if (balanceError) throw balanceError;
      return { 
        status: 200,
        message: "Wallet already exists",
        data: {
          userData: existingUser, 
          balanceData
        }
      };
    }

    // If wallet doesn't exist, create a new one
    const wallet = await Wallet.create();
    const address = await wallet.getDefaultAddress();
    const encryptedSeed = encrypt(wallet.seed);

    // Create user in database
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert([
        {
          wallet_address: wallet_address || "",
          mpc_wallet_address: address.model.address_id,
          seed: encryptedSeed,
          wallet_id: wallet.model.default_address.wallet_id,
          name: name || "",
          image_url: image_url || "",
        },
      ])
      .select();

    if (userError) throw userError;

    // Initialize balances
    const { data: balanceData, error: balanceError } = await supabase
      .from("balances")
      .insert([
        {
          wallet_id: wallet.model.default_address.wallet_id,
          eth_balance: 0,
          cbbtc_balance: 0,
          usd_balance: 0,
        },
      ])
      .select();

    if (balanceError) throw balanceError;

    return { 
      status: 201,
      message: "Wallet created successfully",
      data: {
        userData: userData[0], 
        balanceData: balanceData[0]
      }
    };
  }

  async getWalletById(wallet_id) {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("wallet_id", wallet_id)
      .single();

    if (userError) throw userError;
    if (!userData) throw new Error("Wallet not found");

    const { data: balanceData, error: balanceError } = await supabase
      .from("balances")
      .select("*")
      .eq("wallet_id", wallet_id)
      .maybeSingle();

    if (balanceError) throw balanceError;

    return { userData, balanceData };
  }

  async getWalletByAddress(address) {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .or(`mpc_wallet_address.eq.${address},wallet_address.eq.${address}`)
      .single();

    if (userError) throw userError;
    if (!userData) throw new Error("Wallet not found");

    const { data: balanceData, error: balanceError } = await supabase
      .from("balances")
      .select("*")
      .eq("wallet_id", userData.wallet_id)
      .single();

    if (balanceError) throw balanceError;

    return { userData, balanceData };
  }

  async transfer(wallet_id, amount) {
    if (!wallet_id || !amount) {
      throw new Error("wallet_id and amount are required");
    }

    // Get user data
    const { userData } = await this.getWalletById(wallet_id);

    // Decrypt the seed
    const decryptedSeed = decrypt(userData.seed);

    // Import the wallet
    const wallet = await Wallet.import({
      walletId: wallet_id,
      seed: decryptedSeed,
    });

    // Create transfer
    const transfer = await wallet.createTransfer({
      amount: parseFloat(amount),
      assetId: Coinbase.assets.Eth,
      destination: userData.wallet_address,
    });

    // Wait for completion
    await transfer.wait();

    // Update balance
    const { error: balanceError } = await supabase
      .from("balances")
      .update({
        eth_balance: supabase.sql`eth_balance + ${amount}`,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_id", wallet_id);

    if (balanceError) throw balanceError;

    return {
      id: transfer.model.id,
      status: transfer.model.status,
      amount: amount,
      destination: userData.wallet_address,
    };
  }

  async trade(wallet_id, amount, from_token, to_token) {
    try {
      console.log("Trade params ", wallet_id, amount, from_token, to_token)
      if (!wallet_id || !amount || !from_token || !to_token) {
        throw new Error(
          "wallet_id, amount, from_token, and to_token are required"
        );
      }
      // Get user data
      const { userData } = await this.getWalletById(wallet_id);

      // Decrypt the seed
      const decryptedSeed = decrypt(userData.seed);

      // Import the wallet
      const wallet = await Wallet.import({
        walletId: wallet_id,
        seed: decryptedSeed,
      });

      // Resolve asset IDs for both tokens
      const fromAssetId = resolveAssetId(from_token);
      const toAssetId = resolveAssetId(to_token);

      // Create trade
      const trade = await wallet.createTrade({
        amount: parseFloat(amount),
        fromAssetId,
        toAssetId,
      });

      // Wait for the trade to settle
      await trade.wait();

      console.log("TRADE SUCCESSFUL", trade.toString());

      // Update balances using Alchemy API
      const updatedBalances = await updateWalletBalances(wallet_id, userData.mpc_wallet_address);
      console.log("UPDATED BALANCES", updatedBalances)

      // Store trade in database
      const { data: tradeData, error: tradeError } = await supabase
        .from("trades")
        .insert([
          {
            wallet_id,
            mpc_wallet_address: userData.mpc_wallet_address,
            wallet_address: userData.wallet_address,
            from_token: fromAssetId,
            to_token: toAssetId,
            amount: parseFloat(amount),
            trade_id: trade?.model?.trade_id,
            transaction_hash: trade?.model?.transaction?.transaction_hash,
            network: trade?.model?.transaction?.network_id,
          },
        ])
        .select();

      if (tradeError) throw tradeError;

      return {
        id: trade?.model?.trade_id,
        amount: amount,
        from_token: fromAssetId,
        to_token: toAssetId,
        transaction_hash: trade?.model?.transaction?.transaction_hash,
        network: trade?.model?.transaction?.network_id,
        updated_balances: updatedBalances
      };
    } catch (error) {
      console.error("Trade error:", error);
      throw error;
    }
  }

  async createSIP(wallet_id, from_token, to_token, amount, frequency) {
    if (!wallet_id || !from_token || !to_token || !amount || !frequency) {
      throw new Error(
        "wallet_id, from_token, to_token, amount, and frequency are required"
      );
    }

    // Validate frequency
    if (!["daily", "weekly", "monthly"].includes(frequency)) {
      throw new Error("Invalid frequency. Must be daily, weekly, or monthly");
    }

    try {
      // Execute first trade immediately
      const initialTrade = await this.trade(
        wallet_id,
        amount,
        from_token,
        to_token
      );

      // Calculate next execution time from now
      const nextExecution = calculateNextExecution(frequency);

      // Create SIP in database
      const { data: sipData, error: sipError } = await supabase
        .from("sips")
        .insert([
          {
            wallet_id,
            from_token: resolveAssetId(from_token),
            to_token: resolveAssetId(to_token),
            amount: parseFloat(amount),
            frequency,
            next_execution: nextExecution.toISOString(),
            status: SIP_STATUS.ACTIVE,
            total_executions: 1,
            last_execution: new Date().toISOString(),
          },
        ])
        .select();

      if (sipError) throw sipError;

      return {
        sip: sipData[0],
        initial_trade: initialTrade,
      };
    } catch (error) {
      console.error("Trade error during SIP creation:", error);

      // Create SIP with appropriate status based on error
      const { data: sipData, error: sipError } = await supabase
        .from("sips")
        .insert([
          {
            wallet_id,
            from_token: resolveAssetId(from_token),
            to_token: resolveAssetId(to_token),
            amount: parseFloat(amount),
            frequency,
            next_execution: calculateNextExecution(frequency).toISOString(),
            status: isInsufficientFundsError(error)
              ? SIP_STATUS.INSUFFICIENT_FUNDS
              : SIP_STATUS.PAUSED,
            total_executions: 0,
          },
        ])
        .select();

      if (sipError) throw sipError;

      return {
        sip: sipData[0],
        error: isInsufficientFundsError(error)
          ? "Insufficient funds for initial trade"
          : "Failed to execute initial trade",
      };
    }
  }

  async executeSIP(sip_id) {
    // Get SIP details
    const { data: sip, error: sipError } = await supabase
      .from("sips")
      .select("*")
      .eq("id", sip_id)
      .single();

    if (sipError) throw sipError;
    if (!sip) throw new Error("SIP not found");

    let lastError;
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Execute the trade
        const trade = await this.trade(
          sip.wallet_id,
          sip.amount,
          sip.from_token,
          sip.to_token
        );

        // Update SIP execution details
        const nextExecution = calculateNextExecution(sip.frequency, new Date());
        const { error: updateError } = await supabase
          .from("sips")
          .update({
            last_execution: new Date().toISOString(),
            next_execution: nextExecution.toISOString(),
            total_executions: sip.total_executions + 1,
            status: SIP_STATUS.ACTIVE,
          })
          .eq("id", sip_id);

        if (updateError) throw updateError;

        return {
          sip_id,
          trade,
          next_execution: nextExecution,
        };
      } catch (error) {
        // exponential backoff
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log("DELAY", delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
        console.error(
          `Error executing SIP (attempt ${attempt}/${MAX_RETRIES}):`,
          error
        );
        lastError = error;

        // If it's the last attempt or if we have insufficient funds, break the retry loop
        if (attempt === MAX_RETRIES || isInsufficientFundsError(error)) {
          break;
        }

        // Wait for 1 second before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // If we reach here, all retries failed
    console.error("All retry attempts failed for SIP execution");

    // Update SIP status based on last error
    const newStatus = isInsufficientFundsError(lastError)
      ? SIP_STATUS.INSUFFICIENT_FUNDS
      : SIP_STATUS.PAUSED;

    await this.updateSIPStatus(sip_id, sip.wallet_id, newStatus);

    throw {
      message: isInsufficientFundsError(lastError)
        ? "Insufficient funds for SIP execution"
        : "Failed to execute SIP trade after multiple attempts",
      sip_id,
      status: newStatus,
    };
  }

  async updateSIPStatus(sip_id, wallet_id, status) {
    // Validate status
    if (!Object.values(SIP_STATUS).includes(status)) {
      throw new Error(
        `Invalid status. Must be one of: ${Object.values(SIP_STATUS).join(
          ", "
        )}`
      );
    }

    const { data: sipData, error } = await supabase
      .from("sips")
      .update({ status })
      .match({ id: sip_id, wallet_id })
      .select();

    if (error) throw error;
    if (!sipData?.length) throw new Error("SIP not found");

    return sipData[0];
  }

  async updateSIP(sip_id, wallet_id, updates) {
    // Validate updates
    if (updates.status && !Object.values(SIP_STATUS).includes(updates.status)) {
      throw new Error(
        `Invalid status. Must be one of: ${Object.values(SIP_STATUS).join(", ")}`
      );
    }

    if (updates.frequency && !["daily", "weekly", "monthly"].includes(updates.frequency)) {
      throw new Error("Invalid frequency. Must be daily, weekly, or monthly");
    }

    if (updates.amount && parseFloat(updates.amount) <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    // Calculate next execution if frequency is being updated
    const updateData = { ...updates };
    if (updates.frequency) {
      updateData.next_execution = calculateNextExecution(updates.frequency).toISOString();
    }

    // Update SIP in database
    const { data: sipData, error } = await supabase
      .from("sips")
      .update(updateData)
      .match({ id: sip_id, wallet_id })
      .select();

    if (error) throw error;
    if (!sipData?.length) throw new Error("SIP not found");

    return sipData[0];
  }

  async getSIPById(sip_id) {
    const { data: sip, error } = await supabase
      .from("sips")
      .select("*")
      .eq("id", sip_id)
      .single();

    if (error) throw error;
    return sip;
  }

  async getSIPs(wallet_id) {
    const { data: sips, error } = await supabase
      .from("sips")
      .select("*")
      .eq("wallet_id", wallet_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return sips;
  }

  async deleteSIP(sip_id, wallet_id) {
    const { error } = await supabase
      .from("sips")
      .delete()
      .match({ id: sip_id, wallet_id });

    if (error) throw error;
  }

  async getTradeHistory(wallet_id) {
    if (!wallet_id) {
      throw new Error("wallet_id is required");
    }

    const { data: trades, error } = await supabase
      .from("trades")
      .select("*")
      .eq("wallet_id", wallet_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return trades || [];
  }

  async getTokenBalances(address) {
    try {
        // Get ETH balance
        const ethBalance = await alchemy.core.getBalance(address);
        // Convert the BigNumber to string format that ethers can handle
        const ethBalanceInEther = ethers.formatEther(ethBalance.toString());

        // Get token balances including USDC and CBTC
        const tokenBalances = await alchemy.core.getTokenBalances(address, [
            TOKEN_MAP.CBTC,
            TOKEN_MAP.USDC
        ]);
        // Get token metadata for price information
        const usdcMetadata = await alchemy.core.getTokenMetadata(TOKEN_MAP.USDC);
        const cbtcMetadata = await alchemy.core.getTokenMetadata(TOKEN_MAP.CBTC);

        // Calculate balances
        const cbbtcBalance = parseFloat(ethers.formatUnits(
            tokenBalances.tokenBalances.find(t => t.contractAddress.toLowerCase() === TOKEN_MAP.CBTC.toLowerCase())?.tokenBalance || '0',
            cbtcMetadata.decimals
        ));

        const usdcBalance = parseFloat(ethers.formatUnits(
            tokenBalances.tokenBalances.find(t => t.contractAddress.toLowerCase() === TOKEN_MAP.USDC.toLowerCase())?.tokenBalance || '0',
            usdcMetadata.decimals
        ));

        return {
            eth_balance: parseFloat(ethBalanceInEther),
            cbbtc_balance: cbbtcBalance,
            usd_balance: usdcBalance // USDC balance represents USD balance
        };
    } catch (error) {
        console.error('Error fetching token balances:', error);
        throw error;
    }
  }

  async updateWalletBalances(wallet_id, mpc_wallet_address) {
    try {
        const balances = await this.getTokenBalances(mpc_wallet_address);
        
        const { error: upsertError } = await supabase
            .from("balances")
            .upsert({
                wallet_id, // Include wallet_id for new records
                eth_balance: balances.eth_balance,
                cbbtc_balance: balances.cbbtc_balance,
                usd_balance: balances.usd_balance,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'wallet_id' // Use wallet_id as the unique constraint
            });

        if (upsertError) throw upsertError;
        return balances;
    } catch (error) {
        console.error('Error updating wallet balances:', error);
        throw error;
    }
  }
}

module.exports = new WalletService();
