// Import the necessary libraries
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const fs = require('fs'); // Import the File System module

// This line loads the environment variables from your Render environment
dotenv.config();

// --- IMPORTANT ---
// Read the token and password from the environment variables.
const token = process.env.TELEGRAM_BOT_TOKEN;
const password = process.env.BOT_PASSWORD;

// --- Persistent Storage Setup ---
const DATA_FILE = './groups.json'; // The file where we'll store group data

// --- State Management ---
// This Set will now store the USER IDs of authenticated users.
const authenticatedUsers = new Set();
// This Map will store the group IDs and names the bot is a part of.
const knownGroups = new Map();

// --- Functions to Save and Load Data ---
function loadGroupsFromFile() {
  try {
    // Check if the file exists before trying to read it
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE);
      // Convert the file content (JSON string) into a JavaScript object
      const groupsObject = JSON.parse(data);
      // Loop through the object and add each entry to our in-memory Map
      for (const [id, title] of Object.entries(groupsObject)) {
        knownGroups.set(id, title);
      }
      console.log(`Successfully loaded ${knownGroups.size} groups from ${DATA_FILE}`);
    } else {
      console.log('No data file found. Starting with an empty group list.');
    }
  } catch (error) {
    console.error('Error loading groups from file:', error);
  }
}

function saveGroupsToFile() {
  try {
    // Convert the Map into a standard JavaScript object to be able to save it as JSON
    const groupsObject = Object.fromEntries(knownGroups);
    // Convert the object to a JSON string (with nice formatting)
    const data = JSON.stringify(groupsObject, null, 2);
    fs.writeFileSync(DATA_FILE, data);
    console.log(`Successfully saved ${knownGroups.size} groups to ${DATA_FILE}`);
  } catch (error) {
    console.error('Error saving groups to file:', error);
  }
}

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

// --- Load Data on Startup ---
loadGroupsFromFile();

// --- Bot Information ---
// We need to know the bot's own ID to check if it has been added to a group.
let botInfo;
bot.getMe().then(info => {
    botInfo = info;
    console.log(`Bot is running as ${botInfo.first_name} (@${botInfo.username})`);
}).catch(error => {
    console.error("CRITICAL: Could not fetch bot information. Exiting.", error);
    process.exit(1);
});


// Listen for any kind of message
bot.on('message', (msg) => {
  // --- NEW: Automatic Group ID detection ---
  // Check if the message is a service message about new members joining
  if (msg.new_chat_members && botInfo) {
    // Check if one of the new members is the bot itself
    const botWasAdded = msg.new_chat_members.some(member => member.id === botInfo.id);

    if (botWasAdded) {
      const chatId = msg.chat.id;
      const chatTitle = msg.chat.title;
      
      // Store the group info in our Map
      knownGroups.set(chatId.toString(), chatTitle);
      // Save the updated map to our file
      saveGroupsToFile();

      console.log('--- BOT ADDED TO NEW GROUP ---');
      console.log(`Group Name: ${chatTitle}`);
      console.log(`Group ID: ${chatId}`);
      console.log('--------------------------------');

      // Optionally, send a welcome message to the group.
      bot.sendMessage(chatId, `Hello! Thanks for adding me to "${chatTitle}". I've automatically saved your group ID to my database.`);
      return; // Stop processing this service message further.
    }
  }

  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id; // The ID of the user who sent the message
  const chatType = msg.chat.type;

  // It's possible for a message to not have text (e.g., a photo or service message), so we check for that.
  if (!text) {
    return;
  }

  // --- Public Command ---
  // Handle the /getid command. This works in any chat.
  if (text === '/getid') {
    if (chatType === 'group' || chatType === 'supergroup') {
      const groupTitle = msg.chat.title;
      console.log(`User ${msg.from.first_name} requested ID for group "${groupTitle}". Sending to their DM.`);
      bot.sendMessage(userId, `The ID for the group "${groupTitle}" is: \`${chatId}\``, { parse_mode: 'Markdown' })
        .catch(() => {
          bot.sendMessage(chatId, `Hi ${msg.from.first_name}, I couldn't send you a private message. Please start a chat with me first and try again!`);
        });
      bot.sendMessage(chatId, `Hi ${msg.from.first_name}, I've sent you the group ID in a private message.`);
    } else {
      bot.sendMessage(chatId, `This is your private chat. Your user ID is: \`${chatId}\``, { parse_mode: 'Markdown' });
    }
    return; // Stop processing after handling the command
  }

  // --- Private Chat Logic ---
  // All other commands and authentication should only happen in a private chat.
  if (chatType === 'private') {
    // Check if the user is authenticated by their USER ID.
    if (authenticatedUsers.has(userId)) {

      // --- NEW: Command to list all stored groups ---
      if (text === '/listgroups') {
        if (knownGroups.size === 0) {
            bot.sendMessage(chatId, 'I haven\'t been added to any groups yet.');
            return;
        }

        let message = '📑 *Here are the groups I have stored:*\n\n';
        for (const [id, title] of knownGroups.entries()) {
            message += `*Name:* ${title}\n*ID:* \`${id}\`\n\n`;
        }
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        return;
      }

      // Handle the /send command for authenticated users.
      if (text.startsWith('/send ')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
          bot.sendMessage(chatId, 'Invalid format. Please use: `/send [ID] [your message]`', { parse_mode: 'Markdown' });
          return;
        }
        const targetId = parts[1];
        const messageToSend = parts.slice(2).join(' ');
        console.log(`Authenticated user ${msg.from.first_name} is sending "${messageToSend}" to ${targetId}`);
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
        const replyText = `You said: "${text}"`;
        bot.sendMessage(chatId, replyText);
      }
    } else {
      // --- Authentication Logic for New Users in a Private Chat ---
      if (text === password) {
        authenticatedUsers.add(userId); // Authenticate the USER ID
        console.log(`User ${msg.from.first_name} (${userId}) has authenticated.`);
        bot.sendMessage(chatId, '✅ Password accepted! You can now use the bot.\n\nTo see all stored groups, use the `/listgroups` command.\n\nTo send a message to a group, use the format:\n`/send [GROUP_ID] [your message]`', { parse_mode: 'Markdown' });
      } else {
        console.log(`Failed authentication attempt from ${msg.from.first_name} (${userId}).`);
        bot.sendMessage(chatId, '🔒 Please enter the correct password to access this bot.');
      }
    }
  }
});

// A simple message to confirm that the bot's script is running
console.log('Telegram bot is running and listening for messages...');

