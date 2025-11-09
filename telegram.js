require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Placeholder for the database pool instance (it will be set by server.js)
let dbPool;

// --- Configuration ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// IMPORTANT: Hardcoded to your live Render URL from the deploy logs
const WEB_URL = 'https://lcssales-0txj.onrender.com'; 
const SECRET_PATH = `/bot/${TOKEN}`; // Creates a secure, unique path for your webhook

const LOCALCOINSWAP_X_URL = 'https://x.com/LocalCoinSwap_';
const LOCALCOINSWAP_SIGNUP_URL = 'https://localcoinswap.com/signup';
const LOCALCOINSWAP_TG_COMMUNITY_URL = 'https://t.me/LocalCoinSwapCommunity';

// 1. Initialize the bot in webhook mode (polling: false)
const bot = new TelegramBot(TOKEN, { polling: false }); 

// 2. Set the Webhook: Tell Telegram to send updates to your server's endpoint
bot.setWebHook(`${WEB_URL}${SECRET_PATH}`);

// --- Express Router Setup for Webhook Listener and API Endpoints ---
const router = express.Router();
router.use(express.json());

// 3. Add the Webhook Listener Route
// This route will receive all updates from Telegram
router.post(SECRET_PATH, (req, res) => {
    // 💡 DEBUG LOG: Log the receipt of the update to confirm webhook functionality
    if (req.body) {
        console.log('TELEGRAM WEBHOOK RECEIVED UPDATE:', JSON.stringify(req.body).substring(0, 100) + '...'); 
        bot.processUpdate(req.body);
    }
    // Important: Always respond with 200 OK immediately
    res.sendStatus(200); 
});


/**
 * Endpoint to send a broadcast message to all users
 */
router.post('/api/broadcast', async (req, res) => {
    // Check if dbPool is initialized
    if (!dbPool) {
        console.error('Database pool is not initialized in telegram.js');
        return res.status(500).send({ error: 'Server configuration error: Database not ready.' });
    }

    const { message, commands = [] } = req.body;
    if (!message) {
        return res.status(400).send({ error: 'Message content is required.' });
    }

    let successfulSends = 0;
    let failedSends = 0;

    try {
        // Fetch all users who have started the bot
        const users = await dbPool.query("SELECT chat_id, id FROM users");
        const totalUsers = users.rows.length;

        // Construct keyboard dynamically based on commands array from the admin dashboard
        const TRADING_LINKS = {
            "X": { text: "🐦 Join X/Twitter", url: LOCALCOINSWAP_X_URL },
            "BUY": { text: "💰 Buy Any Crypto", url: LOCALCOINSWAP_SIGNUP_URL },
            "SELL": { text: "💸 Sell Any Crypto", url: LOCALCOINSWAP_SIGNUP_URL },
            "BUY_USDT": { text: "🟢 Buy USDT P2P", url: LOCALCOINSWAP_SIGNUP_URL },
            "SELL_USDT": { text: "🔴 Sell USDT P2P", url: LOCALCOINSWAP_SIGNUP_URL },
            "COMMUNITY": { text: "💬 Telegram Community", url: LOCALCOINSWAP_TG_COMMUNITY_URL }
        };

        const inline_keyboard = commands.map(key => TRADING_LINKS[key]).filter(link => link);
        
        const options = {
            parse_mode: 'Markdown',
            disable_web_page_preview: false,
            reply_markup: {
                inline_keyboard: inline_keyboard.length > 0 ? [inline_keyboard] : undefined
            }
        };

        const sendPromises = users.rows.map(user => 
            bot.sendMessage(user.chat_id, message, options)
                .then(() => { successfulSends++; })
                .catch(error => { 
                    failedSends++;
                    // Log errors only for specific users/chat_ids
                    console.error(`Failed to send broadcast to chat_id ${user.chat_id}:`, error.message);
                })
        );

        // Wait for all messages to attempt sending
        await Promise.allSettled(sendPromises);

        console.log(`Broadcast completed: ${successfulSends} success, ${failedSends} failed.`);
        return res.status(200).send({ 
            message: 'Broadcast started successfully', 
            totalUsers: totalUsers,
            successfulSends: successfulSends,
            failedSends: failedSends
        });

    } catch (err) {
        console.error('BROADCAST API ERROR:', err);
        res.status(500).send({ error: 'An error occurred during the broadcast process.' });
    }
});

// --- Telegram Bot Command Definitions ---

/**
 * Helper function to send the registration prompt with a unique start link
 */
const sendRegistrationPrompt = async (chatId, referralId = null) => {
    const referral_param = referralId ? `&ref=${referralId}` : '';
    const registrationLink = `${WEB_URL}?chatId=${chatId}${referral_param}`;

    const message = `👋 Welcome to LocalCoinSwap's Referral Campaign!

To start earning rewards, you need to link your Telegram account with your LocalCoinSwap account.

Click the link below to securely complete your registration:
🔗 *[Click here to Register Your LCS ID](${registrationLink})*

Once registered, you can start inviting others using your unique link.

You can also use /ranking to see the top referrers!
`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "✅ Register My LCS ID", url: registrationLink }],
                [{ text: "💬 Join Community", url: LOCALCOINSWAP_TG_COMMUNITY_URL }]
            ]
        }
    };

    bot.sendMessage(chatId, message, options);
};


/**
 * Helper function to send the ranking (requires dbPool to be set)
 */
const sendRanking = async (chatId) => {
    if (!dbPool) {
        console.error('Database pool is not initialized for ranking command');
        return bot.sendMessage(chatId, 'Could not fetch the ranking due to a server configuration error.');
    }
    
    try {
        const rankingQuery = `
            SELECT 
                u.id, 
                u.username, 
                u.display_name, 
                COALESCE(r.referral_count, 0) AS referral_count
            FROM 
                users u
            LEFT JOIN (
                SELECT 
                    referrer_user_id, 
                    COUNT(id) AS referral_count
                FROM 
                    referrals
                GROUP BY 
                    referrer_user_id
            ) r ON u.id = r.referrer_user_id
            WHERE
                u.localcoinswap_id IS NOT NULL -- Only show registered users in the ranking
            ORDER BY 
                referral_count DESC, u.joined_at ASC -- Tie-breaker is join date
            LIMIT 5;
        `;
        const result = await dbPool.query(rankingQuery);
        const topUsers = result.rows;

        let rankingMessage = '🏆 **Top 5 LocalCoinSwap Referrers** 🏆\n\n';

        if (topUsers.length === 0) {
            rankingMessage += 'No completed referrals yet! Be the first one!';
        } else {
            topUsers.forEach((user, index) => {
                let medal = '';
                if (index === 0) medal = '🥇';
                else if (index === 1) medal = '🥈';
                else if (index === 2) medal = '🥉';
                else medal = '✨';

                // Prefer display name, fallback to username, fallback to a generic name
                const userName = user.display_name || (user.username ? `@${user.username}` : `User ${user.id}`);

                rankingMessage += `${medal} #${index + 1}: ${userName} (${user.referral_count} referrals)\n`;
            });
        }
        
        bot.sendMessage(chatId, rankingMessage, { parse_mode: 'Markdown' });

    } catch (err) {
        console.error('RANKING COMMAND ERROR:', err);
        bot.sendMessage(chatId, 'Could not fetch the ranking at this time.');
    }
};

/**
 * Ensures the user exists in the database.
 * FIX: Uses the BIGINT 'chat_id' column to store the large Telegram User ID, 
 * avoiding the "out of range" error, and lets the internal 'id' be auto-generated.
 */
const ensureUserExists = async (msg) => {
    const user = msg.from;
    const fromId = user.id; // Telegram User ID (a large BIGINT number)
    const username = user.username || null;
    const displayName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    // Note: We use the unique 'fromId' (user.id) for lookup/storage, not msg.chat.id, as per standard practice.

    try {
        // Query by the chat_id (which is unique and BIGINT)
        const checkUserQuery = "SELECT id FROM users WHERE chat_id = $1";
        const checkUserResult = await dbPool.query(checkUserQuery, [fromId]); 

        if (checkUserResult.rows.length === 0) {
            // User does not exist, insert them. Let the internal 'id' be auto-generated.
            const insertUserQuery = `
                INSERT INTO users (chat_id, username, display_name, joined_at)
                VALUES ($1, $2, $3, NOW())
            `;
            // $1 = fromId (BIGINT), $2 = username, $3 = displayName
            await dbPool.query(insertUserQuery, [fromId, username, displayName]);
            return true; // New user
        } else {
            // User exists. Optional: Update username/display_name if needed.
            return false; // Existing user
        }
    } catch (err) {
        console.error('DB ERROR in ensureUserExists:', err);
        throw err; // Propagate error
    }
};


/**
 * Main function to handle the /start command, including referrals
 */
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;
    const referralId = match[1]; // The ID passed after /start 

    if (!dbPool) {
        return bot.sendMessage(chatId, 'Server is still starting up. Please try again in a moment.');
    }

    try {
        const isNewUser = await ensureUserExists(msg);

        // 1. Check if the referrer exists and is registered.
        // We use the referrer's ID (the BIGINT Telegram ID passed in the link) to look up the user.
        const referrerCheck = await dbPool.query(
            "SELECT id, localcoinswap_id FROM users WHERE chat_id = $1 AND localcoinswap_id IS NOT NULL", 
            [referralId]
        );
        const referrer = referrerCheck.rows[0];

        if (referrer) {
            if (isNewUser) {
                // New user referred by a registered user. Proceed to register referral.
                // Pass the referrer's internal, INTEGER user ID to the registration prompt for later linking
                await sendRegistrationPrompt(chatId, referrer.id); 
                bot.sendMessage(chatId, 
                    `You were invited by a friend! Finish registration to earn rewards and confirm the referral.`, 
                    { parse_mode: 'Markdown' });
            } else {
                // Existing user clicks referral link. Send standard prompt.
                await sendRegistrationPrompt(chatId);
            }
        } else {
            // Invalid or unregistered referrer. Send standard prompt.
            await sendRegistrationPrompt(chatId);
        }

    } catch (error) {
        console.error('START COMMAND (with ref) ERROR:', error);
        bot.sendMessage(chatId, 'An error occurred. Please try the command /start again.');
    }
});

bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!dbPool) {
        return bot.sendMessage(chatId, 'Server is still starting up. Please try again in a moment.');
    }
    
    try {
        await ensureUserExists(msg);
        await sendRegistrationPrompt(chatId);
    } catch (error) {
        console.error('START COMMAND ERROR:', error);
        bot.sendMessage(chatId, 'An error occurred. Please try the command again.');
    }
});

bot.onText(/\/register/, async (msg) => {
    const chatId = msg.chat.id;
    if (!dbPool) {
        return bot.sendMessage(chatId, 'Server is still starting up. Please try again in a moment.');
    }
    
    try {
        await ensureUserExists(msg);
        await sendRegistrationPrompt(chatId);
    } catch (error) {
        console.error('REGISTER COMMAND ERROR:', error);
        bot.sendMessage(chatId, 'An error occurred. Please try the command again.');
    }
});

bot.onText(/\/ranking/, async (msg) => {
    await sendRanking(msg.chat.id);
});


// --- Export the Express Router and a function to set the DB pool ---
module.exports = {
    router: router, // Export the router instance for server.js to use
    setDbPool: (poolInstance) => {
        dbPool = poolInstance; // Function to inject the DB pool from server.js
    }
};