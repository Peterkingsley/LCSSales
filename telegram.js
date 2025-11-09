require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_URL = 'https://lcssales-0txj.onrender.com';
const SECRET_PATH = `/bot/${TOKEN}`;
const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${WEB_URL}${SECRET_PATH}`);

const LOCALCOINSWAP_SIGNUP_URL = 'https://localcoinswap.com';
const LOCALCOINSWAP_X_URL = 'https://x.com/LocalCoinSwap_';
const LOCALCOINSWAP_TG_COMMUNITY_URL = 'https://t.me/LocalCoinSwapCommunity';

// --- Express Setup ---
const router = express.Router();
router.use(express.json());
let dbPool = null; // optional database pool if you want to save user data

router.post(SECRET_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});


// ====================================================================
// 🏠 MAIN MENU FUNCTION
// ====================================================================
const sendMainMenu = (chatId) => {
  const message = `👋 I am your *Personal LocalCoinSwap Assistant*  

Which of these would you love me to help you with today?`;
  
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
      await bot.sendMessage(chatId,
        `🎉 *Welcome to the LocalCoinSwap Referral Campaign!*  

Where P2P traders make the most out of the market.  

Invite other P2P traders to join the LocalCoinSwap Telegram Community and climb the leaderboard!  

🏆 *Top Referrers Win:*  
🥇 $100 | 🥈 $60 | 🥉 $40  

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
    // AFTER FOLLOWING X
    // -------------------------
    case 'follow_done':
      await bot.sendMessage(chatId,
        `Please enter your *X (Twitter) username* (without @).`,
        { parse_mode: 'Markdown' }
      );
      // Store user’s state temporarily
      userStates[chatId] = 'awaiting_twitter';
      break;

    // -------------------------
    // SELL USDT FLOW
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

  bot.answerCallbackQuery(query.id);
});


// ====================================================================
// ✍️ HANDLE TEXT INPUT (for usernames)
// ====================================================================
const userStates = {}; // { chatId: 'awaiting_twitter' | 'awaiting_telegram' }

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userStates[chatId]) return; // no active state

  // --- Step 1: Expecting Twitter username
  if (userStates[chatId] === 'awaiting_twitter') {
    userStates[chatId] = { twitter: text }; // store twitter
    await bot.sendMessage(chatId, 
      `Got it! Thanks *@${text}* 👏  

Now please enter your *Telegram handle* (without @).`, 
      { parse_mode: 'Markdown' });
    userStates[chatId].step = 'awaiting_telegram';
  }

  // --- Step 2: Expecting Telegram handle
  else if (userStates[chatId].step === 'awaiting_telegram') {
    const twitter = userStates[chatId].twitter;
    const telegram = text;

    await bot.sendMessage(chatId, 
      `Perfect! ✅  
X Username: *@${twitter}*  
Telegram: *@${telegram}*  

One last step! Join our Telegram Community to complete your campaign registration 👇`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Join Telegram Community', url: LOCALCOINSWAP_TG_COMMUNITY_URL }],
            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
          ]
        }
      }
    );

    // Optionally: Save to DB
    if (dbPool) {
      try {
        await dbPool.query(
          "INSERT INTO campaign_participants (chat_id, twitter, telegram, joined_at) VALUES ($1,$2,$3,NOW())",
          [chatId, twitter, telegram]
        );
      } catch (err) {
        console.error('DB SAVE ERROR:', err.message);
      }
    }

    delete userStates[chatId]; // clear state
  }
});


// ====================================================================
// EXPORTS
// ====================================================================
module.exports = {
  router,
  setDbPool: (pool) => { dbPool = pool; }
};
