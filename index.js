// Import the necessary libraries
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const { Pool } = require('pg'); // Import the PostgreSQL client

// This line loads the environment variables from your Render environment
dotenv.config();

// --- IMPORTANT ---
// Read the token, password, and DATABASE_URL from the environment variables.
const token = process.env.TELEGRAM_BOT_TOKEN;
const password = process.env.BOT_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;

// --- Database Connection Setup ---
// The 'pg' library will automatically use the DATABASE_URL from Render's environment.
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- State Management ---
// This Set will now store the USER IDs of authenticated users.
const authenticatedUsers = new Set();
// This Map will store the group IDs and names the bot is a part of.
const knownGroups = new Map();

// --- Functions to Save and Load Data from the Database ---
async function loadGroupsFromDB() {
  try {
    const { rows } = await pool.query('SELECT group_id, group_title FROM groups');
    rows.forEach(row => {
      // The group_id from PostgreSQL might be a string, ensure it is consistent.
      knownGroups.set(row.group_id.toString(), row.group_title);
    });
    console.log(`Successfully loaded ${knownGroups.size} groups from the database.`);
  } catch (error) {
    console.error('Error loading groups from database:', error);
  }
}

async function saveGroupToDB(chatId, chatTitle) {
  try {
    // Use an "UPSERT" query.
    // This will INSERT a new row if the group_id doesn't exist.
    // If it DOES exist, it will UPDATE the group_title instead.
    const query = `
      INSERT INTO groups (group_id, group_title) 
      VALUES ($1, $2) 
      ON CONFLICT (group_id) 
      DO UPDATE SET group_title = $2;
    `;
    await pool.query(query, [chatId, chatTitle]);
    console.log(`Successfully saved/updated group ${chatTitle} (${chatId}) to the database.`);
  } catch (error) {
    console.error('Error saving group to database:', error);
  }
}

// This check is crucial. If the token isn't found, the bot will log an error and stop.
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set.');
  process.exit(1);
}

if (!password) {
  console.error('Error: BOT_PASSWORD is not set.');
  process.exit(1);
}

// We also need the DATABASE_URL now.
if (!databaseUrl) {
    console.error('Error: DATABASE_URL is not set.');
    console.error('Please add a PostgreSQL database on Render and ensure the DATABASE_URL is in your environment variables.');
    process.exit(1);
}

console.log("Bot starting with polling...");

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// --- Load Data on Startup ---
loadGroupsFromDB();

// --- Bot Information ---
let botInfo;
bot.getMe().then(info => {
    botInfo = info;
    console.log(`Bot is running as ${botInfo.first_name} (@${botInfo.username})`);
}).catch(error => {
    console.error("CRITICAL: Could not fetch bot information. Exiting.", error);
    process.exit(1);
});

// Listen for any kind of message
bot.on('message', async (msg) => {
  // --- Automatic Group ID detection ---
  if (msg.new_chat_members && botInfo) {
    const botWasAdded = msg.new_chat_members.some(member => member.id === botInfo.id);

    if (botWasAdded) {
      const chatId = msg.chat.id;
      const chatTitle = msg.chat.title;
      
      // Store the group info in our in-memory Map
      knownGroups.set(chatId.toString(), chatTitle);
      // Save the updated info to our database
      await saveGroupToDB(chatId, chatTitle);

      console.log('--- BOT ADDED TO NEW GROUP ---');
      console.log(`Group Name: ${chatTitle}`);
      console.log(`Group ID: ${chatId}`);
      console.log('--------------------------------');

      bot.sendMessage(chatId, `Hello! Thanks for adding me to "${chatTitle}". I've automatically saved your group ID to my database.`);
      return;
    }
  }

  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const chatType = msg.chat.type;

  if (!text) {
    return;
  }

  // --- Public Command ---
  if (text === '/getid') {
    if (chatType === 'group' || chatType === 'supergroup') {
      const groupTitle = msg.chat.title;
      bot.sendMessage(userId, `The ID for the group "${groupTitle}" is: \`${chatId}\``, { parse_mode: 'Markdown' })
        .catch(() => {
          bot.sendMessage(chatId, `Hi ${msg.from.first_name}, I couldn't send you a private message. Please start a chat with me first!`);
        });
      bot.sendMessage(chatId, `Hi ${msg.from.first_name}, I've sent you the group ID in a private message.`);
    } else {
      bot.sendMessage(chatId, `This is your private chat. Your user ID is: \`${chatId}\``, { parse_mode: 'Markdown' });
    }
    return;
  }

  // --- Private Chat Logic ---
  if (chatType === 'private') {
    if (authenticatedUsers.has(userId)) {

      // --- Command to list all stored groups ---
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

      // Handle the /send command
      if (text.startsWith('/send ')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
          bot.sendMessage(chatId, 'Invalid format. Please use: `/send [ID] [your message]`', { parse_mode: 'Markdown' });
          return;
        }
        const targetId = parts[1];
        const messageToSend = parts.slice(2).join(' ');
        bot.sendMessage(targetId, messageToSend)
          .then(() => {
            bot.sendMessage(chatId, `✅ Message successfully sent to ${targetId}.`);
          })
          .catch((error) => {
            console.error('Failed to send message:', error.response.body.description);
            bot.sendMessage(chatId, `❌ Failed to send message. Error: ${error.response.body.description}`);
          });
      } else {
        const replyText = `You said: "${text}"`;
        bot.sendMessage(chatId, replyText);
      }
    } else {
      // --- Authentication Logic ---
      if (text === password) {
        authenticatedUsers.add(userId);
        console.log(`User ${msg.from.first_name} (${userId}) has authenticated.`);
        bot.sendMessage(chatId, '✅ Password accepted! You can now use the bot.\n\nTo see all stored groups, use the `/listgroups` command.\n\nTo send a message, use:\n`/send [GROUP_ID] [your message]`', { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, '🔒 Please enter the correct password to access this bot.');
      }
    }
  }
});

console.log('Telegram bot is running and listening for messages...');

