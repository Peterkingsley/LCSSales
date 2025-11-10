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

// 💡 NEW: The username of the group for the membership check
// Use your specific group ID: @localtest21
const LOCALCOINSWAP_TG_COMMUNITY_ID = '@localtest21'; 

// --- Express Setup ---
const router = express.Router();
router.use(express.json());
let dbPool = null; 

// Function to inject the DB Pool (used by server.js)
const setDbPool = (pool) => {
  dbPool = pool;
};

router.post(SECRET_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====================================================================
// 🏠 MAIN MENU FUNCTION
// ====================================================================
const sendMainMenu = (chatId) => {
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎯 Register for Campaign', callback_data: 'register' }],
        [{ text: '🔗 Get Referral Link', callback_data: 'referral_link' }],
        [{ text: '💰 View Rewards', callback_data: 'view_rewards' }],
      ],
    },
  };
  bot.sendMessage(chatId, 'Welcome back! Choose an option:', keyboard);
};

// ====================================================================
// 💾 DATABASE OPERATIONS
// ====================================================================

// Utility function to get or insert user and return record/state
const getOrCreateUser = async (userId, user, state = 'main_menu') => {
  const telegramHandle = user.username || null;
  const tgDisplayName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
  
  if (!dbPool) {
    console.error('DB Pool not initialized.');
    return null;
  }
  
  try {
    const result = await dbPool.query(
      // 💡 MODIFIED: Added telegram_display_name and x_handle to the INSERT/UPDATE lists
      "INSERT INTO users (id, chat_id, username, telegram_display_name, user_state, joined_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (chat_id) DO UPDATE SET username = EXCLUDED.username, telegram_display_name = EXCLUDED.telegram_display_name, user_state = EXCLUDED.user_state RETURNING *",
      [userId, userId, telegramHandle, tgDisplayName, state]
    );
    return result.rows[0];
  } catch (err) {
    console.error('DB ERROR (getOrCreateUser):', err.message);
    return null;
  }
};

// Utility function to update user state
const updateUserState = async (userId, newState) => {
  if (!dbPool) return;
  try {
    await dbPool.query(
      'UPDATE users SET user_state = $1 WHERE chat_id = $2',
      [newState, userId]
    );
  } catch (err) {
    console.error('DB ERROR (updateUserState):', err.message);
  }
};


// ====================================================================
// 💬 HANDLE USER INPUT MESSAGES
// ====================================================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = msg.from; // Contains user details like username, first_name, etc.

  let userRecord = await getOrCreateUser(userId, user);

  // 0. HANDLE /start command
  if (msg.text === '/start') {
    userRecord = await getOrCreateUser(userId, user, 'main_menu'); // Reset state
    await bot.sendMessage(chatId, 'Welcome to the LocalCoinSwap Referral Bot! Use the menu below to get started:');
    sendMainMenu(chatId);
    return;
  }

  // Handle case where user record is not found (DB error)
  if (!userRecord) {
    await bot.sendMessage(chatId, 'An error occurred. Please try the /start command.');
    return;
  }
  
  // 1. AWAITING REFERRAL ID
  // User is expected to provide a referral link/ID from another user.
  if (userRecord.user_state === 'awaiting_referral_id') {
    const referredBy = msg.text.trim();
    // Validate the referral ID format here (e.g., must be a number or specific format)
    
    // For now, let's just assume the input is the user ID of the referrer
    const referrerId = parseInt(referredBy, 10);

    if (isNaN(referrerId)) {
        await bot.sendMessage(chatId, 'Invalid Referral ID. Please enter the number provided by your friend.');
        return;
    }
    
    if (referrerId === userId) {
        await bot.sendMessage(chatId, 'You cannot refer yourself. Please enter your friend\'s Referral ID.');
        return;
    }
    
    // Check if referrer exists
    const referrerResult = await dbPool.query('SELECT chat_id FROM users WHERE chat_id = $1', [referrerId]);
    if (referrerResult.rows.length === 0) {
        await bot.sendMessage(chatId, `Referral ID *${referrerId}* not found. Please check the ID and try again.`, { parse_mode: 'Markdown' });
        return;
    }
    
    // Update the referred_by_user_id
    try {
        await dbPool.query(
          'UPDATE users SET referred_by_user_id = $1, user_state = $2 WHERE chat_id = $3',
          [referrerId, 'awaiting_x_handle', userId]
        );
        // Continue to the next step
        await bot.sendMessage(chatId, 
            `Thanks for providing your referrer's ID! The next step is to provide your X (Twitter) username (e.g., *LocalCoinSwap_*). Please make sure you are following us on X to complete the campaign.`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('DB UPDATE ERROR (referral ID):', err.message);
        await bot.sendMessage(chatId, 'An error occurred while saving your referrer. Please try again or contact support.');
    }
    
    return;
  }


  // 2. AWAITING X HANDLE (Twitter)
  // User is expected to provide their X handle.
  if (userRecord.user_state === 'awaiting_x_handle') {
    const twitter = msg.text.trim().replace(/^@/, ''); // Clean up the handle (remove leading @)
    const telegram = user.username; // The user's Telegram @handle

    // 💡 NEW: Get the Telegram user's full name to populate the (renamed) telegram_display_name column
    const tgDisplayName = user.first_name + (user.last_name ? ' ' + user.last_name : ''); 

    // 💡 FIX: Update the DB query to save X handle to the new 'x_handle' column
    // and save the Telegram display name to the (renamed) 'telegram_display_name' column.
    if (dbPool) {
      try {
        await dbPool.query(
          // 💡 MODIFIED: Renamed column to 'telegram_display_name' and added 'x_handle'
          "INSERT INTO users (id, chat_id, username, telegram_display_name, x_handle, user_state) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (chat_id) DO UPDATE SET username = EXCLUDED.username, telegram_display_name = EXCLUDED.telegram_display_name, x_handle = EXCLUDED.x_handle, user_state = EXCLUDED.user_state",
          // 💡 MODIFIED: Corrected the mapping array: $4 is tgDisplayName, $5 is twitter (X handle), $6 is the new state
          [userId, userId, telegram, tgDisplayName, twitter, 'awaiting_membership_check'] 
        );
      } catch (err) {
        console.error('DB SAVE ERROR (after X handle):', err.message);
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

  // 3. Any other message (default handler)
  else if (userRecord.user_state === 'main_menu') {
    await bot.sendMessage(chatId, "I'm not sure what you mean. Please use the menu buttons to navigate.", {
        reply_markup: {
            remove_keyboard: true
        }
    });
    sendMainMenu(chatId);
  } else {
     // For any other state, just prompt the user with the current task
     const stateMessage = {
        'awaiting_referral_id': 'Please enter your friend\'s Referral ID.',
        'awaiting_x_handle': 'Please enter your X (Twitter) handle now.',
        'awaiting_membership_check': 'Please click "✅ I have joined" below after joining the community.',
        'registration_complete': 'Your registration is complete! Use the main menu to get your referral link.',
    }[userRecord.user_state] || "Please use the /start command or the menu buttons.";

     await bot.sendMessage(chatId, stateMessage);
  }
});


// ====================================================================
// 🔘 HANDLE INLINE BUTTON CALLBACKS
// ====================================================================
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const user = callbackQuery.from;
  
  // Acknowledge the callback immediately to remove the loading state on the button
  bot.answerCallbackQuery(callbackQuery.id);
  
  let userRecord = await getOrCreateUser(userId, user);

  if (!userRecord) {
    await bot.sendMessage(chatId, 'An error occurred. Please try the /start command.');
    return;
  }

  switch (data) {
    case 'register':
      // Check if user has Telegram @username
      if (!user.username) {
        await bot.sendMessage(chatId, 
          '⚠️ *Please set a Telegram @username in your Telegram settings* to participate in the campaign. Once set, try again.', 
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Check if registration is already complete
      if (userRecord.user_state === 'registration_complete') {
        await bot.sendMessage(chatId, 'Your campaign registration is already complete! You can now get your referral link.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔗 Get Referral Link', callback_data: 'referral_link' }]
              ]
            }
        });
        return;
      }

      // Start the registration flow
      await updateUserState(userId, 'awaiting_referral_id');
      await bot.sendMessage(chatId, 
        `To register for the campaign, please enter the *Referral ID* provided by your friend (e.g., *123456789*). If you don't have one, just reply with *0*.`, 
        { parse_mode: 'Markdown' }
      );
      break;

    case 'referral_link':
      if (userRecord.user_state !== 'registration_complete') {
        await bot.sendMessage(chatId, 'Please complete the campaign registration first to get your unique referral link.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎯 Register for Campaign', callback_data: 'register' }]
              ]
            }
        });
        return;
      }
      
      // Generate and send the referral link
      const referralLink = `${LOCALCOINSWAP_SIGNUP_URL}?ref=${userId}`;
      await bot.sendMessage(chatId, 
        `Here is your unique Referral ID: *${userId}* and your link:\n\n*${referralLink}*`, 
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'view_rewards':
      // Placeholder for rewards logic
      await bot.sendMessage(chatId, 'Rewards tracking is coming soon! Check back later.');
      break;

    case 'check_membership':
      // The user claims they have joined the group. Check if they are a member.
      
      try {
        const chatMember = await bot.getChatMember(LOCALCOINSWAP_TG_COMMUNITY_ID, userId);
        
        // Status can be 'creator', 'administrator', 'member', 'restricted', 'left', or 'kicked'
        if (['creator', 'administrator', 'member'].includes(chatMember.status)) {
          // User is a member!
          await updateUserState(userId, 'registration_complete');
          
          await bot.sendMessage(chatId, 
            `🎉 *Registration Complete!* Your status has been confirmed. You can now start referring!`, 
            { parse_mode: 'Markdown' }
          );
          
          // Send main menu with a slight delay
          setTimeout(() => sendMainMenu(chatId), 1000); 

        } else {
          // User is not a member
          await bot.sendMessage(chatId, 
            '❌ Membership not confirmed. Please ensure you have correctly joined the Telegram Community and try clicking "✅ I have joined" again.',
            {
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
        console.error('Error checking membership:', error.message);
        await bot.sendMessage(chatId, 'A system error occurred while checking your membership. Please try again later.');
      }
      break;

    case 'back_to_main_menu':
      await updateUserState(userId, 'main_menu');
      sendMainMenu(chatId);
      break;
      
    default:
      await bot.sendMessage(chatId, "Unknown command. Please use the menu.");
  }
});

// ====================================================================
// 🚀 API ENDPOINTS
// ====================================================================

// API endpoint to send a broadcast message to all users
router.post('/api/broadcast', async (req, res) => {
  if (!dbPool) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  const { message, commands } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const usersResult = await dbPool.query('SELECT chat_id FROM users');
    const userIds = usersResult.rows.map(row => row.chat_id);
    
    // Convert JSON commands array to inline keyboard structure
    let reply_markup = {};
    if (commands && commands.length > 0) {
        const inline_keyboard = commands.map(command => {
            // Commands are expected to be simple callback_data for this example
            return [{ text: command.charAt(0).toUpperCase() + command.slice(1).replace(/_/g, ' '), callback_data: command }];
        });
        reply_markup = { inline_keyboard };
    }

    let successCount = 0;
    for (const chatId of userIds) {
      try {
        // Send message with or without the inline keyboard
        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: Object.keys(reply_markup).length > 0 ? reply_markup : undefined
        });
        successCount++;
      } catch (error) {
        // Log errors but continue to the next user
        console.warn(`Could not send message to user ${chatId}: ${error.message}`);
      }
    }

    res.json({ 
      totalUsers: userIds.length, 
      messagesSent: successCount,
      failedSends: userIds.length - successCount 
    });
  } catch (err) {
    console.error('Broadcast DB Error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});


// ====================================================================
// 📦 MODULE EXPORTS (Used by server.js)
// ====================================================================
module.exports = {
  router,
  setDbPool,
  bot // Export the bot instance if other files need to use it
};