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
const LOCALCOINSWAP_TG_COMMUNITY_URL = 'https://t.me/LocalCoinSwapCommunity';

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
// 🎬 START COMMAND
// ====================================================================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  sendMainMenu(chatId);
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
    // CREATE ACCOUNT FLOW
    // -------------------------
    case 'create_account':
      await bot.sendMessage(chatId, 
        `🚀 Awesome! Click below to create your LocalCoinSwap account.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Sign Up', url: LOCALCOINSWAP_SIGNUP_URL }],
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
      // Immediately tell the user the check is happening
      await bot.answerCallbackQuery(query.id, 'Checking your membership status...');

      try {
        // 1. Call the Telegram API to check membership status
        const chatMember = await bot.getChatMember(LOCALCOINSWAP_TG_COMMUNITY_ID, userId);
        const status = chatMember.status;

        // 2. Check if the status is one of the valid "member" statuses
        if (['member', 'administrator', 'creator'].includes(status)) {
          // Success: User is a member
          await bot.editMessageText(
            `🥳 *Membership Confirmed!* 👏
You are successfully registered for the campaign. Welcome to the community!
You can now access the full menu.`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                ]
              }
            }
          );
          
          // 3. Update the database to confirm membership
          if (dbPool) {
            // Note: This UPDATE query assumes you have added an 'is_member' column to the 'users' table
            await dbPool.query(
              "UPDATE users SET is_member = TRUE WHERE chat_id = $1",
              [userId]
            );
          }
          userStates[chatId].step = 'main_menu'; // Change user state
          
        } else {
          // Failure: User is not a member (status is 'left' or 'kicked')
          // Use the stored twitter handle for re-display
          const { twitter } = userStates[chatId]; 

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
        console.error('getChatMember Error:', error.message);
        await bot.answerCallbackQuery(query.id, 'An API error occurred. Make sure the bot is an admin in the group.', true);
      }
      break;


    // -------------------------
    // AFTER FOLLOWING X
    // -------------------------
    case 'follow_done':
      await bot.sendMessage(chatId,
        `Please enter your *X (Twitter) username* (without @).`,
        { parse_mode: 'Markdown' }
      );
      // Store user’s state temporarily
      userStates[chatId] = { step: 'awaiting_twitter' }; // Set state to await Twitter handle
      break;

    // -------------------------
    // SELL USDT FLOW
    // ... (existing sell_usdt case)
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
    // ... (existing buy_usdt case)
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
  }

  // Answer the query if it wasn't already answered by check_membership
  if (data !== 'check_membership') {
      bot.answerCallbackQuery(query.id);
  }
});


// ====================================================================
// ✍️ HANDLE TEXT INPUT (for usernames)
// ====================================================================
const userStates = {}; // { chatId: { step: 'awaiting_twitter' | 'awaiting_membership_check', twitter: 'handle', telegram: 'handle' } }

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = chatId; // The chatId is the user_id in a private chat with the bot

  if (!userStates[chatId] || !userStates[chatId].step) return; // no active state

  // --- Step 1 (Combined): Expecting Twitter username and proceeding to check
  if (userStates[chatId].step === 'awaiting_twitter') {
    const twitter = text.trim();
    // Use the user's Telegram username from their profile, or a fallback
    const telegram = msg.from.username ? msg.from.username.trim() : `tg_user_${userId}`;
    
    userStates[chatId].twitter = twitter; // store twitter
    userStates[chatId].telegram = telegram; // store Telegram handle for display/later use
    userStates[chatId].step = 'awaiting_membership_check'; // set next step: waiting for button click

    // Optionally: Save initial data to DB
    if (dbPool) {
      try {
        // Save data, using the user's provided X handle and their Telegram username
        await dbPool.query(
          // Uses ON CONFLICT to update existing users or insert new ones
          "INSERT INTO users (id, chat_id, username, display_name, user_state) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (chat_id) DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name, user_state = EXCLUDED.user_state",
          [userId, userId, telegram, twitter, 'awaiting_membership_check'] // Mapping: id, chat_id, telegram_handle, twitter_handle, user_state
        );
      } catch (err) {
        console.error('DB SAVE ERROR (after twitter handle):', err.message);
      }
    }

    // 💡 MODIFIED: Provide the Join link and the "I have joined" button
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
  }

  // The 'awaiting_telegram' step has been removed.
});


// ====================================================================
// EXPORTS
// ====================================================================
module.exports = {
  router,
  setDbPool: (pool) => { dbPool = pool; }
};