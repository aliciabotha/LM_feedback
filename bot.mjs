// ============================================================
// FeedTrack Discord Bot — drop this file into VS Code
// Run: node bot.mjs
// Requires Node 18+ and npm install (discord.js + dotenv)
// ============================================================
//
// WHAT THIS BOT DOES
// ─────────────────────────────────────────────────────────
// • Connects to Discord and reads EVERY text channel
// in every server the bot is invited to
// • ONLY acts when a message contains a feedback category:
// FB CR SF GS MS DOCK
// • From each matching message it extracts:
// manager — the Discord display name of the sender
// chatter — the first @mention in the message
// model — parsed from channel name or message text
// category — FB / CR / SF / GS / MS / DOCK
// • Sends that data silently to Supabase (via Edge Function)
// • NEVER writes or replies to any Discord channel
//
// SETUP IN VS CODE
// ─────────────────────────────────────────────────────────
// 1. Copy this folder (discord-bot/) to any location
// 2. Open a terminal in that folder
// 3. Run: npm install
// 4. Create a file called .env (copy from .env.example)
// DISCORD_TOKEN=your_bot_token
// SUPABASE_WEBHOOK_URL=https://xxx.supabase.co/functions/v1/discord-webhook
// BOT_API_SECRET=same_secret_as_in_supabase
// 5. Run: node bot.mjs
//
// DISCORD BOT PERMISSIONS NEEDED
// ─────────────────────────────────────────────────────────
// In the Discord Developer Portal, under Bot → Privileged Intents
// enable: MESSAGE CONTENT INTENT
// Bot invite scopes needed: bot
// Bot permissions needed: Read Messages / View Channels
// ============================================================
import "dotenv/config";
import { createRequire } from "module";
import { detectCategory, extractChatter, extractModel } from "./parser.mjs";
const require = createRequire(import.meta.url);
const { Client, GatewayIntentBits, Events, ChannelType } = require("discord.js");

// ─── Config ──────────────────────────────────────────────────────────────────

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const WEBHOOK_URL = (process.env.SUPABASE_WEBHOOK_URL || "").trim();
const BOT_SECRET = (process.env.BOT_API_SECRET || "").trim();

// Optional: restrict to specific guild (server) IDs — comma-separated.
// Leave blank to work in ALL servers.
const WATCH_GUILDS = process.env.WATCH_GUILDS
  ? process.env.WATCH_GUILDS.split(",").map((s) => s.trim())
  : [];

if (!DISCORD_TOKEN) {
  console.error("[BOT] ERROR: DISCORD_TOKEN is missing in .env");
  process.exit(1);
}
if (!WEBHOOK_URL) {
  console.error("[BOT] ERROR: SUPABASE_WEBHOOK_URL is missing in .env");
  process.exit(1);
}

// ─── Sanitize header values ──────────────────────────────────────────────────

function sanitizeHeaderValue(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

// ─── Supabase poster ─────────────────────────────────────────────────────────

// Sends parsed feedback data to the Supabase Edge Function.
// The bot NEVER writes to Discord — only here.
async function sendToSupabase(payload) {
  try {
    const sanitizedSecret = sanitizeHeaderValue(BOT_SECRET);

    if (!sanitizedSecret) {
      console.error("[BOT] ERROR: BOT_API_SECRET is empty or invalid");
      return null;
    }

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": sanitizedSecret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[BOT] HTTP ${res.status} from webhook:`, text.slice(0, 200));
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[BOT] Network error posting to webhook:", err.message);
    return null;
  }
}

// ─── Guild filter ────────────────────────────────────────────────────────────

function shouldWatchGuild(guildId) {
  if (WATCH_GUILDS.length === 0) return true;
  return WATCH_GUILDS.includes(guildId);
}

// ─── Discord client ──────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // access server + channel list
    GatewayIntentBits.GuildMessages, // receive messages
    GatewayIntentBits.MessageContent, // read message text (privileged intent)
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log("─────────────────────────────────────────────");
  console.log(`[BOT] Online as: ${c.user.tag}`);
  console.log(`[BOT] Webhook: ${WEBHOOK_URL}`);
  console.log(`[BOT] Guilds: ${WATCH_GUILDS.length > 0 ? WATCH_GUILDS.join(", ") : "ALL"}`);
  console.log("[BOT] Watching: ALL channels (read-only, no Discord replies)");
  console.log("[BOT] Triggers: FB CR SF GS MS DOCK");
  console.log("[BOT] Extracting: manager | chatter | model (when available)");
  console.log("─────────────────────────────────────────────\n");
});

// This fires for every new message in every channel the bot can see.
client.on(Events.MessageCreate, async (message) => {
  // Never process bot messages or empty messages
  if (message.author.bot) return;
  if (!message.content?.trim()) return;

  // Only text channels inside guilds (not DMs, threads, forums, etc.)
  if (message.channel.type !== ChannelType.GuildText) return;

  // Apply optional guild filter
  if (!shouldWatchGuild(message.guildId)) return;

  const channelName = message.channel.name ?? "";
  const content = message.content;

  // Check if this message contains a feedback category
  const category = detectCategory(content, channelName);
  if (!category) return; // not a feedback message — silently ignore

  // Extract the three key fields
  const manager = message.member?.displayName ?? message.author.username;
  const chatter = extractChatter(content);
  const model = extractModel(content, channelName);

  // Build the payload and send to Supabase
  const result = await sendToSupabase({
    type: "single",
    message: {
      content,
      author: manager,
      channel: channelName,
      message_id: message.id,
      timestamp: message.createdAt.toISOString(),
      has_image: message.attachments.size > 0,
    },
  });

  // Log the outcome — no Discord reply is ever sent
  if (result?.success) {
    const parts = [`[${category}]`];
    parts.push(`manager: ${manager}`);
    if (chatter) parts.push(`chatter: @${chatter}`);
    if (model) parts.push(`model: ${model}`);
    parts.push(`#${channelName}`);
    console.log("[BOT] Saved →", parts.join(" | "));
  } else if (result?.message === "Not a feedback message") {
    // edge function didn't recognize it — safe to ignore
  } else if (result) {
    console.warn("[BOT] Not saved:", result.error ?? result.message ?? "unknown reason");
  }
  // if result is null, the network error was already logged in sendToSupabase
});

// Reconnection is handled automatically by discord.js
client.on(Events.Error, (err) => {
  console.error("[BOT] Discord client error:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("[BOT] Unhandled rejection:", err);
});

client.login(DISCORD_TOKEN);
