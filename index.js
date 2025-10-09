// Import the necessary libraries
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

// This line loads the environment variables from your Render environment
dotenv.config();

// --- IMPORTANT ---
// Read the token and password from the environment variables.
const token = process.env.TELEGRAM_BOT_TOKEN;
const password = process.env.BOT_PASSWORD;

// --- State Management ---
// This Set will store the chat IDs of users who have successfully entered the password.
const authenticatedUsers = new Set();

// This check is crucial. If the token isn't found, the bot will log an error and stop.
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set.');
  console.error('Please go to your Render dashboard, find the "Environment" section, and add this variable.');
  process.exit(1); // Exit the script with an error code
}

// We also check for the password now.
if (!password) {
  console.error('Error: BOT_PASSWORD is not set.');
  console.error('Please go to your Render dashboard and add a BOT_PASSWORD environment variable.');
  process.exit(1);
}

console.log("Bot starting with polling...");

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Listen for any kind of message
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // It's possible for a message to not have text (e.g., a photo), so we check for that.
  if (!text) {
    return;
  }

  // --- Public Command ---
  // Handle the /getid command. This works in any chat (private or group).
  if (text === '/getid') {
    console.log(`Responding to /getid in chat ${chatId}`);
    bot.sendMessage(chatId, `This chat's ID is: \`${chatId}\`\n\nYou can use this ID to send messages to this group.`, { parse_mode: 'Markdown' });
    return; // Stop processing after handling the command
  }

  // --- Authenticated User Logic ---
  // Check if the user's chat ID is in our set of authenticated users.
  if (authenticatedUsers.has(chatId)) {
    // Handle the /send command for authenticated users.
    if (text.startsWith('/send ')) {
      // The command should be in the format: /send [targetChatId] [message]
      const parts = text.split(' ');
      if (parts.length < 3) {
        bot.sendMessage(chatId, 'Invalid format. Please use: `/send [ID] [your message]`', { parse_mode: 'Markdown' });
        return;
      }
      
      const targetId = parts[1];
      const messageToSend = parts.slice(2).join(' ');

      console.log(`Authenticated user ${msg.from.first_name} is sending "${messageToSend}" to ${targetId}`);
      
      // Send the message to the target group/user.
      bot.sendMessage(targetId, messageToSend)
        .then(() => {
          bot.sendMessage(chatId, `✅ Message successfully sent to ${targetId}.`);
        })
        .catch((error) => {
          console.error('Failed to send message:', error.response.body.description);
          bot.sendMessage(chatId, `❌ Failed to send message. The bot might not be in that group, or the ID is incorrect.\nError: ${error.response.body.description}`);
        });

    } else {
      // If it's not a command, just echo the message back.
      console.log(`Received message from authenticated user ${msg.from.first_name}: "${text}"`);
      const replyText = `You said: "${text}"`;
      bot.sendMessage(chatId, replyText);
    }
  } else {
    // --- Authentication Logic for New Users ---
    // If they are not authenticated, check if their message is the password.
    if (text === password) {
      authenticatedUsers.add(chatId);
      console.log(`User ${msg.from.first_name} (${chatId}) has authenticated.`);
      bot.sendMessage(chatId, '✅ Password accepted! You can now use the bot.\n\nTo send a message to a group, use the format:\n`/send [GROUP_ID] [your message]`', { parse_mode: 'Markdown' });
    } else {
      // If the password is wrong, tell them to try again.
      console.log(`Failed authentication attempt from ${msg.from.first_name} (${chatId}).`);
      bot.sendMessage(chatId, '🔒 Please enter the correct password to access this bot.');
    }
  }
});

// A simple message to confirm that the bot's script is running
console.log('Telegram bot is running and listening for messages...');

