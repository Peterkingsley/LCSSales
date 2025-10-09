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

  // First, check if the user's chat ID is in our set of authenticated users.
  if (authenticatedUsers.has(chatId)) {
    // If they are authenticated, run the normal bot logic.
    console.log(`Received message from authenticated user ${msg.from.first_name}: "${text}"`);
    const replyText = `You said: "${text}"`;
    bot.sendMessage(chatId, replyText);
  } else {
    // If they are not authenticated, check if their message is the password.
    if (text === password) {
      // If the password is correct, add their chat ID to the set and welcome them.
      authenticatedUsers.add(chatId);
      console.log(`User ${msg.from.first_name} (${chatId}) has authenticated.`);
      bot.sendMessage(chatId, '✅ Password accepted! You can now use the bot.');
    } else {
      // If the password is wrong, tell them to try again.
      console.log(`Failed authentication attempt from ${msg.from.first_name} (${chatId}).`);
      bot.sendMessage(chatId, '🔒 Please enter the correct password to access this bot.');
    }
  }
});

// A simple message to confirm that the bot's script is running
console.log('Telegram bot is running and listening for messages...');

