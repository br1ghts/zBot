import OpenAI from "openai";
import 'dotenv/config';
import tmi from 'tmi.js';

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.OPENAI_API_KEY,
});

// Twitch Bot Configuration
const client = new tmi.Client({
  identity: {
    username: process.env.TWITCH_BOT_USERNAME, // Your bot's username
    password: process.env.TWITCH_OAUTH_TOKEN,   // Your bot's OAuth token (format: oauth:xxxxxxxxxx)
  },
  channels: [process.env.TWITCH_CHANNEL],       // Channel to join
});

client.connect();

// In-memory store to track user messages
const userMessages = {};

// Function to classify messages using Deepseek API
async function classifyMessages(messages) {
  // Build a system message containing the prompt and the chat log
  const systemMessage =
`You are an AI moderator analyzing a Twitch user's chat history. Analyze the provided chat log and output the following metrics as percentages (0–100%):

• Toxicity – percentage of messages containing toxic language.
• Spam – percentage of messages that appear to be spam.
• Negativity – percentage of messages with negative sentiment.
• Friendliness – percentage of messages that are friendly.
• Helpfulness – percentage of messages that are helpful.

Also, based on these metrics, calculate a "mod_alert_level" percentage that reflects the likelihood that moderators should monitor this user. For example, a higher mod_alert_level indicates a greater need for mod attention.

Additionally, identify any potential issues with their behavior (e.g., “High negativity”, “Excessive spam”, etc.) and include the user's most recent messages.

Output your results in strict JSON format with the following structure:
{
  "toxicity": "<percentage>%",
  "spam": "<percentage>%",
  "negativity": "<percentage>%",
  "friendliness": "<percentage>%",
  "helpfulness": "<percentage>%",
  "mod_alert_level": "<percentage>%",
  "problems": ["<issue1>", "<issue2>", ...],
  "recent_messages": ["<most recent message 1>", "<most recent message 2>", ...]
}

Do not output any additional text or commentary.

Chat log:
${JSON.stringify(messages)}`;

  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: "system", content: systemMessage }],
      model: "deepseek-chat",
      max_tokens: 200,
      temperature: 0.3,
    });
    
    const outputText = completion.choices[0].message.content.trim();
    const result = JSON.parse(outputText);
    return result;
  } catch (error) {
    console.error('Deepseek API error:', error);
    return null;
  }
}

// Listen to chat messages
client.on('message', async (channel, tags, message, self) => {
  if (self) return; // Ignore the bot's own messages

  const username = tags.username;
  if (!userMessages[username]) {
    userMessages[username] = [];
  }
  
  // Collect the user's messages (here, we classify after one message for demo purposes)
  if (userMessages[username].length < 5) {
    userMessages[username].push(message);
  }
  
  // Trigger classification when the user has sent 1 message (adjust this threshold as needed)
  if (userMessages[username].length === 1) {
    const classification = await classifyMessages(userMessages[username]);
    
    if (classification) {
      if (classification.mod_alert_level && parseInt(classification.mod_alert_level) > 50) {
        console.log(`${username} flagged for mod attention with mod_alert_level: ${classification.mod_alert_level}`);
      } else {
        console.log(`${username} is clear, mod_alert_level: ${classification.mod_alert_level}`);
      }
    } else {
      console.log(`Could not classify ${username} due to an error.`);
    }
    
    // Clear stored messages for the user after classification
    delete userMessages[username];
  }
});
