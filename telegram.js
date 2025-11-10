// telegram.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_URL = 'https://lcssales-0txj.onrender.com'; //
const SECRET_PATH = `/bot/${TOKEN}`;
const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${WEB_URL}${SECRET_PATH}`);

const LOCALCOINSWAP_SIGNUP_URL = 'https://localcoinswap.com';
const LOCALCOINSWAP_X_URL = 'https://x.com/LocalCoinSwap_';
const LOCALCOINSWAP_TG_COMMUNITY_URL = 'https://t.me/Localtest21';
const STATE_AWAITING_LOCALCOINSWAP_ID = 'awaiting_localcoinswap_id'; // New state to wait for user's ID
const LOCALCOINSWAP_BASE_REFERRAL_URL = 'https://localcoinswap.com/?ref='; // Base referral URL
// 💡 NEW: Base URL for bot-to-bot deep-linking
const BOT_BASE_URL = 'https://t.me/LCSContest_bot?start=';

// 💡 NEW: The username of the group for the membership check
// Use your specific group ID: @localtest21
const LOCALCOINSWAP_TG_COMMUNITY_ID = '@localtest21';

// --- Express Setup ---
const router = express.Router();
router.use(express.json());
let dbPool = null; 

router.post(SECRET_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====================================================================
// 💡 STATE HELPER FUNCTION (Using DB as requested)
// ====================================================================
/**
 * Fetches the user's current conversation state from the database.
 * @param {number} chatId - The ID of the chat.
 * @returns {Promise<string|null>} The user's state or null.
 */
const getUserState = async (chatId) => {
    // Only proceed if dbPool is initialized
    if (!dbPool) {
        console.warn('DB Pool not set. Cannot fetch user state.');
        return null;
    }
    try {
        // Fetch user_state from the users table
        const result = await dbPool.query("SELECT user_state FROM users WHERE chat_id = $1", [chatId]);
        return result.rows.length > 0 ? result.rows[0].user_state : null;
    } catch (err) {
        console.error('Error fetching user state:', err.message);
        return null;
    }
}


// ====================================================================
// 🏠 MAIN MENU FUNCTION
// ====================================================================
const sendMainMenu = (chatId) => {
  const message = `👋 I am your *Personal LocalCoinSwap Assistant* Which of these would you love me to help you with today?`;
  
  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🆕 Create Account', callback_data: 'create_account' },
          { text: '🎯 Join Campaign', callback_data: 'join_campaign' }
        ],
        [
          { text: '💸 Sell USDT', callback_data: 'sell_usdt' },
          { text: '🟢 Buy USDT', callback_data: 'buy_usdt' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, message, options);
};


// ====================================================================
// 🎬 START COMMAND (MODIFIED FOR REFERRAL TRACKING)
// ====================================================================
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const telegramUsername = msg.from.username || `tg_user_${userId}`;
    const refCode = match ? match[1] : null; // Extract referral code from deep link
    let referrerId = null;

    if (refCode && dbPool) {
        try {
            // Check if the refCode is a valid referrer's ID
            const referrerResult = await dbPool.query("SELECT id FROM users WHERE id = $1", [refCode]);
            if (referrerResult.rows.length > 0) {
                referrerId = parseInt(refCode, 10);
            }
        } catch (err) {
            console.error('Error checking referrer ID:', err.message);
        }
    }
    
    // UPSERT the user with the referrer's ID
    if (dbPool) {
        try {
            // 💡 NEW/FIXED: Use ON CONFLICT (id) to update existing user data, including setting the referred_by_user_id
            await dbPool.query(
                `
                INSERT INTO users (id, chat_id, username, telegram_display_name, referred_by_user_id) 
                VALUES ($1, $2, $3, $4, $5) 
                ON CONFLICT (id) 
                DO UPDATE SET 
                  chat_id = EXCLUDED.chat_id, 
                  username = EXCLUDED.username,
                  telegram_display_name = EXCLUDED.telegram_display_name,
                  referred_by_user_id = COALESCE(users.referred_by_user_id, EXCLUDED.referred_by_user_id)
                `,
                [userId, chatId, telegramUsername, msg.from.first_name, referrerId]
            );
        } catch (err) {
            console.error('DB UPSERT ERROR on /start:', err.message);
        }
    }
    
    sendMainMenu(chatId);
});

// 💡 ADDED: /menu command for convenience
bot.onText(/\/menu/, async (msg) => {
    sendMainMenu(msg.chat.id);
});


// ====================================================================
// 🤖 CALLBACK HANDLERS
// ====================================================================

// Handle all button clicks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id; // Get the user ID from the query
  const data = query.data;

  switch (data) {
    // -------------------------
    // CREATE ACCOUNT FLOW (MODIFIED TO DISPLAY PERSONAL BOT LINK)
    // -------------------------
    case 'create_account':
       let linkResult = await dbPool.query("SELECT ref_code FROM users WHERE id = $1", [userId]);
       let botReferralLink = BOT_BASE_URL + userId;
       let messageText = `🚀 Awesome! Click below to create your LocalCoinSwap account.`;
       
       // 💡 NEW: If the user has a ref_code (meaning they completed the campaign), 
       // let them share their *bot* referral link.
       if (linkResult.rows.length > 0 && linkResult.rows[0].ref_code) {
           messageText += `\n\n*Your Bot Referral Link:* \n\`${botReferralLink}\``;
       }

      await bot.sendMessage(chatId, 
        messageText,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Sign Up', url: LOCALCOINSWAP_SIGNUP_URL }],
              // 💡 NEW: Show 'Share Bot Link' only if they have a LocalCoinSwap ID saved
              ...(linkResult.rows.length > 0 && linkResult.rows[0].ref_code ? [[{ text: '📣 Share Bot Link', switch_inline_query: botReferralLink }]] : []),
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      break;

    // -------------------------
    // JOIN CAMPAIGN FLOW
    // -------------------------
    case 'join_campaign':
      // Existing logic to start the campaign flow
      await bot.sendMessage(chatId,
        `🎉 *Welcome to the LocalCoinSwap Referral Campaign!* Where P2P traders make the most out of the market.  

Invite other P2P traders to join the LocalCoinSwap Telegram Community and climb the leaderboard!  

🏆 *Top Referrers Win:* 🥇 $100 | 🥈 $60 | 🥉 $40  

To get started, follow our X account below 👇`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🐦 Follow our X', url: LOCALCOINSWAP_X_URL }],
              [{ text: '✅ Done', callback_data: 'follow_done' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      break;

    // -------------------------
    // MEMBERSHIP CHECK HANDLER (The core new logic)
    // -------------------------
    case 'check_membership':
      // ... (no changes needed here, as it sets the state to STATE_AWAITING_LOCALCOINSWAP_ID)
      // The old logic is kept for brevity and because it correctly sets the state for the next step.

      // Immediately tell the user the check is happening
      await bot.answerCallbackQuery(query.id, 'Checking your membership status...');

      try {
        // 1. Call the Telegram API to check membership status
        const chatMember = await bot.getChatMember(LOCALCOINSWAP_TG_COMMUNITY_ID, userId);
        const status = chatMember.status;
        const isMember = ['member', 'administrator', 'creator'].includes(status);

        // 2. Check if the status is one of the valid "member" statuses
        if (isMember) {
          // Success: User is a member
          
          // 💡 MODIFIED LOGIC: Update the user's state to wait for their LocalCoinSwap ID
          if (dbPool) {
             await dbPool.query(
                "UPDATE users SET is_member = TRUE, user_state = $1 WHERE chat_id = $2",
                [STATE_AWAITING_LOCALCOINSWAP_ID, chatId]
            );
          }
          
          // 3. Send the message asking for the ID
          await bot.editMessageText(
            `🎉 **Verification Complete!** You're now a member of the community.
            
            **Ready to earn?**
            1. **Sign up** on [Localcoinswap.com](${LOCALCOINSWAP_SIGNUP_URL})
            2. Find your unique **referral ID** in your account settings.
            3. **Paste your unique ID below** to get your personalized referral link and start monitoring your stats.
            
            *Example of an ID: ABC-123-XYZ*`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'Markdown',
               // Optional: Use ForceReply to visually prompt the user for input
                reply_markup: {
                    force_reply: true,
                    selective: true,
                    inline_keyboard: [ // Add a menu button for convenience after ID entry
                         [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            }
          );
          
        } else {
          // Failure: User is not a member (status is 'left' or 'kicked')
          // Fetch the stored twitter handle for re-display 
          let twitter = 'your X username';
          if (dbPool) {
             // 💡 FIX: Change 'display_name' to the correct column 'x_handle' for the Twitter handle.
             const result = await dbPool.query("SELECT x_handle FROM users WHERE chat_id = $1", [chatId]); 
             if (result.rows.length > 0) {
                 // 💡 FIX: Change 'display_name' to the correct column 'x_handle'.
                 twitter = result.rows[0].x_handle; 
             }
          }
           
          await bot.answerCallbackQuery(query.id, '❌ Please join the community first to proceed.', true);
          
          // Re-send the original message
          await bot.editMessageText(
            `❌ *Membership check failed.* Please ensure you have joined the Telegram Community and then click the 'I have joined' button again.

X Username: *@${twitter}*`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💬 Join Telegram Community', url: LOCALCOINSWAP_TG_COMMUNITY_URL }],
                  [{ text: '✅ I have joined', callback_data: 'check_membership' }]
                ]
              }
            }
          );
        }

      } catch (error) {
        console.error('getChatMember/DB Error:', error.message);
        await bot.answerCallbackQuery(query.id, 'An API or Database error occurred. Please try again.', true);
      }
      break;

    // -------------------------
    // AFTER FOLLOWING X
    // -------------------------
    case 'follow_done':
      // 💡 FIX: Set the state in the database immediately using a proper UPSERT.
      if (dbPool) {
            await dbPool.query(
                // UPSERT: Insert a new minimal user record or update the state of an existing one.
                `
                INSERT INTO users (id, chat_id, user_state) 
                VALUES ($1, $2, $3) 
                ON CONFLICT (id) 
                DO UPDATE SET user_state = EXCLUDED.user_state
                `,
                [userId, chatId, 'awaiting_twitter']
            );
        } else {
            // Handle case where dbPool is null (shouldn't happen if server.js is correct)
            console.error('DB Pool not available in follow_done handler.');
        }

      await bot.sendMessage(chatId,
        `Please enter your *X (Twitter) username* (without @).`,
        { parse_mode: 'Markdown' }
      );
      break;

    // -------------------------
    // SELL USDT FLOW
    // ... 
    // -------------------------
    case 'sell_usdt':
      await bot.sendMessage(chatId,
        `💸 Ready to sell your USDT safely? Click below to start selling instantly on LocalCoinSwap.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔴 Sell USDT Now', url: LOCALCOINSWAP_SIGNUP_URL }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      break;

    // -------------------------
    // BUY USDT FLOW
    // ... 
    // -------------------------
    case 'buy_usdt':
      await bot.sendMessage(chatId,
        `🟢 Want to buy USDT fast and securely? Click below to start trading instantly on LocalCoinSwap.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🟢 Buy USDT Now', url: LOCALCOINSWAP_SIGNUP_URL }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      break;

    // -------------------------
    // MAIN MENU RETURN
    // -------------------------
    case 'main_menu':
      sendMainMenu(chatId);
      break;
      
    default:
      // Answer the query if it wasn't already answered by check_membership
      bot.answerCallbackQuery(query.id);
      break;
  }
});


// ====================================================================
// ✍️ HANDLE TEXT INPUT (for usernames and IDs)
// ====================================================================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = chatId; // The chatId is the user_id in a private chat with the bot

  if (!text) return; // Ignore messages without text

  // Check for /start or /menu commands and handle them, then return
  if (text.startsWith('/')) {
    // Commands are handled by bot.onText
    if (text.toLowerCase() === '/start' || text.toLowerCase() === '/menu') {
        return; 
    }
  }

  // 1. Get user state from DB
  const userState = await getUserState(chatId);

  // ===================================================================
  // 💡 FIX: Handle AWAITING_TWITTER state (User enters X handle)
  // ===================================================================
  if (userState === 'awaiting_twitter') {
    const twitter = text.trim().replace(/^@/, ''); // Remove optional leading @
    // Use the user's Telegram username from their profile, or a fallback
    const telegram = msg.from.username ? msg.from.username.trim() : `tg_user_${userId}`;
    
    // 2. Save the X handle and update state to 'awaiting_membership_check'
    if (dbPool) {
      try {
        // Save data, using the user's provided X handle and their Telegram username
        await dbPool.query(
          // Uses ON CONFLICT to update existing users or insert new ones
          // 💡 FIX: Change 'display_name' to the correct column names: 'username' for Telegram and 'x_handle' for Twitter.
          `
            INSERT INTO users (id, chat_id, username, x_handle, user_state) 
            VALUES ($1, $2, $3, $4, $5) 
            ON CONFLICT (id) 
            DO UPDATE SET 
              username = EXCLUDED.username, 
              x_handle = EXCLUDED.x_handle, 
              user_state = EXCLUDED.user_state
          `,
          [userId, chatId, telegram, twitter, 'awaiting_membership_check'] // Mapping: id, chat_id, telegram_handle, twitter_handle, user_state
        );
      } catch (err) {
        console.error('DB SAVE ERROR (after twitter handle):', err.message);
        return bot.sendMessage(chatId, "🚫 A database error occurred. Please try again or type /menu.");
      }
    }

    // 3. Prompt for community join
    await bot.sendMessage(chatId, 
      `Perfect! ✅  
X Username: *@${twitter}* One last step! Join our Telegram Community to complete your campaign registration 👇
*Once you have joined, click 'I have joined' below to confirm your status.*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Join Telegram Community', url: LOCALCOINSWAP_TG_COMMUNITY_URL }],
            [{ text: '✅ I have joined', callback_data: 'check_membership' }] // New Check button
          ]
        }
      }
    );
    return;
  }
  
  // ===================================================================
  // 💡 MODIFIED: Handle AWAITING_LOCALCOINSWAP_ID state (Referral Logic Added)
  // ===================================================================
  if (userState === STATE_AWAITING_LOCALCOINSWAP_ID) {
    const localcoinswapId = text.trim();
    
    // Basic Validation
    if (localcoinswapId.length < 3 || localcoinswapId.includes(' ')) {
        return bot.sendMessage(chatId, 
            "❌ **Invalid ID.** Please paste the unique referral ID you received after signing up on Localcoinswap.com. (It usually contains letters, numbers, and hyphens)."
        );
    }
    // 1. Generate the referral link
    // encodeURIComponent ensures the ID is safe to use in a URL
    const referralLink = `${LOCALCOINSWAP_BASE_REFERRAL_URL}${encodeURIComponent(localcoinswapId)}`;

    try {
        let referrerId = null;
        
        // 2. Save the ID, referral link, and update state to 'active'
        if (dbPool) {
             // 💡 MODIFIED: Get the referred_by_user_id before updating the user
             const userResult = await dbPool.query("SELECT referred_by_user_id FROM users WHERE id = $1", [userId]);
             if (userResult.rows.length > 0) {
                 referrerId = userResult.rows[0].referred_by_user_id;
             }
            
             // 💡 NOTE: The DB schema has 'localcoinswap_id' and 'ref_code'
             // Mapping to: localcoinswap_id = user's ID, ref_code = generated link.
             await dbPool.query(
                "UPDATE users SET localcoinswap_id = $1, ref_code = $2, user_state = 'active' WHERE id = $3",
                [localcoinswapId, referralLink, userId]
            );
        }
        
        // 3. Referral Completion Logic: Increment referrer count and send notification
        if (referrerId) {
            // Increment the referrer's count
            await dbPool.query("UPDATE users SET referral_count = referral_count + 1 WHERE id = $1", [referrerId]);

            // Send notification to the referrer
            await bot.sendMessage(referrerId,
                `🥳 *Congratulations!* A user you referred, @${msg.from.username || 'a friend'}, has successfully completed the LocalCoinSwap campaign steps!
                
*Your referral count has been updated.* Keep sharing your bot link: \`${BOT_BASE_URL}${referrerId}\``,
                { parse_mode: 'Markdown' }
            );
        }
       
        // 4. Send the final confirmation message to the new user
        await bot.sendMessage(chatId, 
            `✨ **Success! Your LocalCoinSwap ID has been saved.**
            
            **Your Personal LocalCoinSwap Referral Link:**
            \`${referralLink}\`
            
            **Your Bot Referral Link (to invite P2P traders to the campaign):**
            \`${BOT_BASE_URL}${userId}\`
            
            Share these links to start earning. You can now type **/menu** or click the button below to see other options.`,
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            }
        );
    } catch (err) {
        console.error('DB SAVE ERROR (Localcoinswap ID/Referral Logic):', err.message);
        // Check for unique constraint violation if Localcoinswap IDs are unique globally
        if (err.code === '23505') { // PostgreSQL unique violation error code
            return bot.sendMessage(chatId, "🚫 This LocalCoinSwap ID is already registered. Please check your ID or contact support.");
        }
        return bot.sendMessage(chatId, 
            "🚫 A database error occurred while saving your ID. Please try again later."
        );
    }
    return; // Stop processing this message as the conversation step is complete
  }

  // Default response if not in any active state
  if (userState === 'initial' || userState === 'active' || userState === 'awaiting_membership_check') {
    // Ignore non-command messages when the user is waiting for a button click or is active.
    // Optionally: send a gentle prompt to use /menu
    // bot.sendMessage(chatId, "Please use the menu buttons or type /menu to continue.");
  }
});


// ====================================================================
// EXPORTS
// ====================================================================
module.exports = {
  router,
  setDbPool: (pool) => { dbPool = pool; }
};