const TelegramBot = require('node-telegram-bot-api');
const { Counter } = require('collections'); // A simple utility, or we can write our own

// --- Configuration ---
// It's highly recommended to use environment variables for sensitive data
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Replace with your bot token
const ADMIN_PASSWORD = "YOUR_SECRET_PASSWORD"; // Replace with your desired password
let authorizedUserId = null; // Will be set after successful login

// --- In-memory Data Storage (for simplicity) ---
// In a real-world scenario, you would use a database like Redis, MongoDB, or PostgreSQL
const groupData = {}; // {chatId: { name: "Group Name", messages: [], admins: [] }}

// --- Helper Functions ---
/**
 * A simple word counter function.
 * @param {string[]} words - An array of words.
 * @returns {Array<[string, number]>} - A sorted array of [word, count] pairs.
 */
function countWords(words) {
    const frequency = {};
    for (const word of words) {
        frequency[word] = (frequency[word] || 0) + 1;
    }
    return Object.entries(frequency).sort((a, b) => b[1] - a[1]);
}


if (!BOT_TOKEN) {
    console.error("Error: BOT_TOKEN is not set. Please set it in the script or as an environment variable.");
    process.exit(1);
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("Bot is running...");


// --- Authentication ---
bot.onText(/\/start/, (msg) => {
    const userId = msg.from.id;
    if (authorizedUserId && userId === authorizedUserId) {
        bot.sendMessage(userId, "You are already logged in.");
        return;
    }
    bot.sendMessage(userId, "Welcome! This is a private bot. Please enter the password using /login <password>");
});

bot.onText(/\/login (.+)/, (msg, match) => {
    const userId = msg.from.id;
    if (authorizedUserId && userId === authorizedUserId) {
        bot.sendMessage(userId, "You are already logged in.");
        return;
    }

    const password = match[1];
    if (password === ADMIN_PASSWORD) {
        authorizedUserId = userId;
        bot.sendMessage(userId, "✅ Login successful! You can now use the bot's commands.");
        console.log(`User ${msg.from.username} (ID: ${authorizedUserId}) logged in successfully.`);
    } else {
        bot.sendMessage(userId, "❌ Incorrect password.");
    }
});

const isAuthorized = (msg) => msg.from.id === authorizedUserId;


// --- Bot Functionality ---

// Listen for when the bot is added to a new group
bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    const botId = bot.id; // We need to get the bot's own ID

    // Check if the new member is the bot itself
    for (const member of msg.new_chat_members) {
        if (member.id.toString() === botId) { // The ID might be a number or string
            if (!groupData[chatId]) {
                groupData[chatId] = {
                    name: msg.chat.title,
                    messages: [],
                    admins: []
                };
                console.log(`Bot added to a new group: ${msg.chat.title} (ID: ${chatId})`);
                if (authorizedUserId) {
                    bot.sendMessage(authorizedUserId, `I've been added to a new group: *${msg.chat.title}*`, { parse_mode: 'Markdown' });
                }
            }
            break;
        }
    }
});


// Store messages from groups for word frequency analysis
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ensure it's a group message, has text, and is not a command
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (groupData[chatId] && text && !text.startsWith('/')) {
            groupData[chatId].messages.push({
                text: text,
                date: new Date()
            });
        }
    }
});


bot.onText(/\/list_groups/, (msg) => {
    if (!isAuthorized(msg)) {
        return bot.sendMessage(msg.chat.id, "You are not authorized. Please /login first.");
    }

    if (Object.keys(groupData).length === 0) {
        return bot.sendMessage(msg.chat.id, "I haven't been added to any groups yet.");
    }

    let message = "I am currently in the following groups:\n\n";
    Object.entries(groupData).forEach(([chatId, data], index) => {
        message += `${index + 1}. *${data.name}* (ID: \`${chatId}\`)\n`;
    });

    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});


bot.onText(/\/broadcast (.+)/s, async (msg, match) => {
    if (!isAuthorized(msg)) {
        return bot.sendMessage(msg.chat.id, "You are not authorized. Please /login first.");
    }

    const messageToSend = match[1];
    let successfulSends = 0;
    let failedSends = 0;

    const chatIds = Object.keys(groupData);
    for (const chatId of chatIds) {
        try {
            await bot.sendMessage(chatId, messageToSend);
            successfulSends++;
        } catch (error) {
            console.error(`Failed to send message to group ${chatId}:`, error.response ? error.response.body : error.message);
            failedSends++;
        }
    }

    let feedback = `📢 Broadcast complete!\n\n`;
    feedback += `✅ Sent successfully to ${successfulSends} groups.\n`;
    if (failedSends > 0) {
        feedback += `❌ Failed to send to ${failedSends} groups.`;
    }
    bot.sendMessage(msg.chat.id, feedback);
});


bot.onText(/\/top_words/, (msg) => {
    if (!isAuthorized(msg)) {
        return bot.sendMessage(msg.chat.id, "You are not authorized. Please /login first.");
    }

    if (Object.keys(groupData).length === 0) {
        return bot.sendMessage(msg.chat.id, "I'm not in any groups to analyze.");
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let response = "📊 *Top 5 Most Used Words (Last 7 Days)*\n\n";

    for (const [chatId, data] of Object.entries(groupData)) {
        const recentMessages = data.messages
            .filter(msg => msg.date > sevenDaysAgo)
            .map(msg => msg.text);

        if (recentMessages.length === 0) {
            response += `*${data.name}*: Not enough message data from the last 7 days.\n\n`;
            continue;
        }

        const words = recentMessages.join(' ').toLowerCase().split(/\s+/);
        const wordCounts = countWords(words);
        const top5Words = wordCounts.slice(0, 5);

        response += `*${data.name}*:\n`;
        if (top5Words.length > 0) {
            top5Words.forEach(([word, count], index) => {
                response += `  ${index + 1}. '${word}' (${count} times)\n`;
            });
        } else {
            response += "  No words found.\n";
        }
        response += "\n";
    }

    bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
});


bot.onText(/\/get_admins/, async (msg) => {
    if (!isAuthorized(msg)) {
        return bot.sendMessage(msg.chat.id, "You are not authorized. Please /login first.");
    }

    if (Object.keys(groupData).length === 0) {
        return bot.sendMessage(msg.chat.id, "I'm not in any groups.");
    }

    let response = "👑 *Group Administrators*\n\n";
    for (const [chatId, data] of Object.entries(groupData)) {
        try {
            const administrators = await bot.getChatAdministrators(chatId);
            const adminUsernames = administrators.map(admin =>
                admin.user.username ? `@${admin.user.username}` : admin.user.first_name
            );
            groupData[chatId].admins = adminUsernames; // Cache the admins

            response += `*${data.name}*:\n`;
            if (adminUsernames.length > 0) {
                response += adminUsernames.join(', ') + "\n\n";
            } else {
                response += "  Could not find any admins.\n\n";
            }
        } catch (error) {
            response += `*${data.name}*: Could not retrieve admins. The bot might not have the right permissions.\nError: ${error.response ? error.response.body.description : error.message}\n\n`;
        }
    }

    bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
});


bot.onText(/\/help/, (msg) => {
    if (!isAuthorized(msg)) {
        return bot.sendMessage(msg.chat.id, "You must /login to see the available commands.");
    }

    const helpText = `
Here are the commands you can use:

*Authentication*
/login <password> - Log in to use the bot.

*Group Management*
/list_groups - Shows all groups the bot is in.
/broadcast <message> - Sends a message to all groups.
/get_admins - Lists the administrators of each group.

*Analytics*
/top_words - Shows the top 5 most used words in each group in the last 7 days.

*General*
/help - Shows this help message.
    `;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});
