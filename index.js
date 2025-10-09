// Import the necessary libraries
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

// This line loads the environment variables from your Render environment
dotenv.config();

// --- IMPORTANT ---
// We now read the token from the environment variable named 'TELEGRAM_BOT_TOKEN'.
const token = process.env.TELEGRAM_BOT_TOKEN;

// This check is crucial. If the token isn't found, the bot will log an error and stop.
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set.');
  console.error('Please go to your Render dashboard, find the "Environment" section, and add this variable.');
  process.exit(1); // Exit the script with an error code
}

console.log("Bot starting with polling...");

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Listen for any kind of message
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  console.log(`Received message from ${msg.from.first_name} in chat ${chatId}: "${msg.text}"`);

  // The bot sends back the same text it received
  const replyText = `You said: "${msg.text}"`;
  bot.sendMessage(chatId, replyText);
});

// A simple message to confirm that the bot's script is running
console.log('Telegram bot is running and listening for messages...');

