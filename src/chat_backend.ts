import express, { Request, Response } from 'express';
import { Account, Aptos, AptosConfig, Network, AccountAddress, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import Moralis from 'moralis';

const app = express();
const port = 3000;

app.use(express.json()); // For parsing application/json

// Define the structure of the expected user input (message)
interface ChatRequestBody {
    message: string;
    senderAddress: string;
    privateKeyHex: string;  // Needed for transactions
}

// Function to parse the message and determine the action (balance request or transfer)
function parseMessage(message: string) {
    message = message.toLowerCase();

    if (message.includes('send') && message.includes('aptos')) {
        const regex = /send\s+(\d+)\s+aptos\s+to\s+(\w+)/;  // Example: send 100 aptos to 0xReceiverAddress
        const match = message.match(regex);

        if (match) {
            const amount = parseInt(match[1], 10);
            const receiverAddress = match[2];
            return { action: 'transfer', amount, receiverAddress };
        }
    }

    if (message.includes('balance')) {
        const regexAptos = /aptos\s+balance/;  // Check if the message specifically asks for "Aptos balance"
        const regexGeneral = /balance\s+of\s+(\w+)/;  // Example: balance of 0xSenderAddress
        
        if (regexAptos.test(message)) {
            return { action: 'balance', blockchain: 'aptos' };  // For Aptos balance request
        }

        const match = message.match(regexGeneral);
        if (match) {
            return { action: 'balance', blockchain: 'moralis', accountAddress: match[1] };
        }
    }

    return { action: 'unknown' };  // Unknown action
}

// Function to get the balance of an Aptos account
async function getAptosBalance(accountAddress: string): Promise<number> {
    const config = new AptosConfig({ network: Network.TESTNET });
    const aptos = new Aptos(config);
    const COIN_STORE = "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>";

    const accountBalance = await aptos.getAccountResource({
        accountAddress: AccountAddress.from(accountAddress),
        resourceType: COIN_STORE,
    });

    return Number(accountBalance.coin.value);  // Return the balance as a number
}

// Function to get the balance from Moralis (for Ethereum or other supported blockchains)
async function getMoralisBalance(tokenType:String): Promise<number> {
    const MORALIS_API_URL = "https://api.moralis.io";
    // define accountAdress from DB
    const accountAddress = "0x8Be5A176Ff441425321D21dF3821A222E62a16b0"
    const url = `${MORALIS_API_URL}/v1/erc20/${accountAddress}/balance`;
  
  try {
    try {
        const balance = await Moralis.EvmApi.balance.getNativeBalance({ chain: 'eth', address: accountAddress });
        return   // Moralis balance is a string, convert to number
    } catch (error) {
        throw new Error('Error fetching balance from Moralis');
    }
  } catch (error) {
    throw new Error("Failed to fetch balance: " + error.message);
  }
}

// Function to handle the transfer of Aptos
async function transferAptos(senderAddress: string, privateKeyHex: string, receiverAddress: string, amount: number): Promise<string> {
    const config = new AptosConfig({ network: Network.TESTNET });
    const aptos = new Aptos(config);

    const sender = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(privateKeyHex),
        address: AccountAddress.from(senderAddress),
    });

    const txn = await aptos.transaction.build.simple({
        sender: sender.accountAddress,
        data: {
            function: "0x1::aptos_account::transfer",
            functionArguments: [receiverAddress, amount],
        },
    });

    const committedTxn = await aptos.signAndSubmitTransaction({ signer: sender, transaction: txn });
    const executedTxn = await aptos.waitForTransaction({ transactionHash: committedTxn.hash });

    return `Transaction committed: ${committedTxn.hash}`;
}

// Route to handle user input and trigger actions based on the message
app.post('/chat', async (req: Request<{}, {}, ChatRequestBody>, res: Response) => {
    const { message } = req.body;

    // Parse the message to determine the action
    const parsedData = parseMessage(message);
    const senderAddress = "0x4f550880539caed746ec60c277b64b054724aa234a8e4375a9507123651791b6";

    if (parsedData.action === 'balance') {
        try {
            let balance: number;
            if (parsedData.blockchain === 'aptos') {
                balance = await getAptosBalance(senderAddress);  // Get balance from Aptos blockchain
                res.json({ balance, blockchain: 'aptos' });
            } else if (parsedData.blockchain === 'moralis' && parsedData.accountAddress) {
                balance = await getMoralisBalance(parsedData.accountAddress);  // Get balance from Moralis
                res.json({ balance, blockchain: 'moralis', accountAddress: parsedData.accountAddress });
            } else {
                res.status(400).json({ error: 'Invalid request for balance' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else if (parsedData.action === 'transfer') {
        try {
            const { receiverAddress, amount } = parsedData;
            const privateKeyHex = "0xdb0171f6d7954a703404dc5aa6749fb06c293a311260c8ef727e0eb21f5fb405";
            const transactionResult = await transferAptos(senderAddress, privateKeyHex, receiverAddress, amount);
            res.json({ message: 'Transfer successful', transaction: transactionResult });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(400).json({ error: 'Unknown action' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
