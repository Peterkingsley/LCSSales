// Import the necessary library
const TelegramBot = require('node-telegram-bot-api');

// --- IMPORTANT ---
// Replace the placeholder text below with the real token you got from BotFather.
// It should be a long string of characters and numbers.
const token = 'YOUR_TELEGRAM_BOT_TOKEN';

// --- DEPLOYMENT NOTE FOR RENDER ---
// Render uses the 'polling' method by default, which is what we are setting up here.
// For production apps, 'webhooks' are often preferred, but polling is perfect for getting started.
console.log("Bot starting with polling...");

// Create a bot that uses 'polling' to fetch new updates from Telegram
const bot = new TelegramBot(token, { polling: true });

// Listen for any kind of message.
// The 'msg' object contains all the information about the incoming message.
bot.on('message', (msg) => {
  // The chatId is the unique identifier for the chat where the message was sent.
  // We use this to know where to send our reply.
  const chatId = msg.chat.id;

  // We'll log the received message to our console, which is helpful for debugging.
  console.log(`Received message from ${msg.from.first_name} in chat ${chatId}: "${msg.text}"`);

  // This is the core logic: the bot sends back the same text it received.
  const replyText = `You said: "${msg.text}"`;
  bot.sendMessage(chatId, replyText);
});

// A simple message to confirm that the bot's script is running.
console.log('Telegram bot is running...');

