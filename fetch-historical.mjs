import "dotenv/config";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const WEBHOOK_URL = (process.env.SUPABASE_WEBHOOK_URL || "").trim();
const BOT_SECRET = (process.env.BOT_API_SECRET || "").trim();

if (!DISCORD_TOKEN || !WEBHOOK_URL || !BOT_SECRET) {
  console.error("[FETCH] Missing required env vars");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function detectCategory(content, channelName) {
  const triggers = {
    FB: /\bFB\b/i,
    CR: /\bCR\b/i,
    SF: /\bSF\b/i,
    GS: /\bGS\b/i,
    MS: /\bMS\b/i,
    DOCK: /\bDOCK\b/i,
  };

  for (const [category, regex] of Object.entries(triggers)) {
    if (regex.test(content)) return category;
  }
  return null;
}

async function sendToSupabase(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": BOT_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[FETCH] Webhook error ${res.status}:`, text.slice(0, 100));
      return false;
    }

    return true;
  } catch (err) {
    console.error("[FETCH] Network error:", err.message);
    return false;
  }
}

client.once("ready", async (c) => {
  console.log(`[FETCH] Logged in as ${c.user.tag}`);
  console.log(`[FETCH] Fetching messages from March 1, 2026...`);

  const startOfMonth = new Date(2026, 2, 1);
  let totalFetched = 0;
  let totalSent = 0;

  for (const guild of c.guilds.cache.values()) {
    console.log(`\n[FETCH] Processing guild: ${guild.name}`);

    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildText) continue;

      try {
        let lastId = null;
        let batchCount = 0;

        while (true) {
          const options = { limit: 100 };
          if (lastId) options.before = lastId;

          const messages = await channel.messages.fetch(options);
          if (messages.size === 0) break;

          for (const msg of messages.values()) {
            if (msg.createdAt < startOfMonth) {
              console.log(`[FETCH] Reached start of month in #${channel.name}`);
              break;
            }

            if (msg.author.bot) continue;
            if (!msg.content?.trim()) continue;

            const category = detectCategory(msg.content, channel.name);
            if (!category) continue;

            const manager = msg.member?.displayName ?? msg.author.username;

            const success = await sendToSupabase({
              type: "single",
              message: {
                content: msg.content,
                author: manager,
                channel: channel.name,
                message_id: msg.id,
                timestamp: msg.createdAt.toISOString(),
                has_image: msg.attachments.size > 0,
              },
            });

            if (success) {
              totalSent++;
              console.log(
                `[FETCH] Sent [${category}] from ${manager} in #${channel.name}`
              );
            }

            totalFetched++;
          }

          batchCount++;
          lastId = messages.last().id;

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log(
          `[FETCH] #${channel.name}: fetched ${batchCount} batches`
        );
      } catch (err) {
        console.error(`[FETCH] Error in #${channel.name}:`, err.message);
      }
    }
  }

  console.log(`\n[FETCH] ✅ Complete!`);
  console.log(`[FETCH] Total messages fetched: ${totalFetched}`);
  console.log(`[FETCH] Total messages sent: ${totalSent}`);

  client.destroy();
  process.exit(0);
});

client.login(DISCORD_TOKEN);
