// ============================================================
// FeedTrack Discord Bot
// Production version with improved stability
// ============================================================

import "dotenv/config";
import express from "express"; // ✅ keep-alive server
import { createRequire } from "module";
import { detectCategory, extractChatter, extractModel } from "./parser.mjs";

const require = createRequire(import.meta.url);
const { Client, GatewayIntentBits, Events, ChannelType } = require("discord.js");

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const WEBHOOK_URL = (process.env.SUPABASE_WEBHOOK_URL || "").trim();
const BOT_SECRET = (process.env.BOT_API_SECRET || "").trim();
const WATCH_GUILDS = process.env.WATCH_GUILDS
  ? process.env.WATCH_GUILDS.split(",").map((s) => s.trim())
  : [];

if (!DISCORD_TOKEN) {
  console.error("[BOT] ERROR: DISCORD_TOKEN missing");
  process.exit(1);
}
if (!WEBHOOK_URL) {
  console.error("[BOT] ERROR: SUPABASE_WEBHOOK_URL missing");
  process.exit(1);
}

function sanitizeHeaderValue(value) {
  if (!value) return "";
  return String(value).trim().replace(/[\r\n\t]/g, "").replace(/[^\x20-\x7E]/g, "");
}

async function sendToSupabase(payload) {
  try {
    const sanitizedSecret = sanitizeHeaderValue(BOT_SECRET);
    if (!sanitizedSecret) {
      console.error("[BOT] BOT_API_SECRET invalid");
      return null;
    }
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-secret": sanitizedSecret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[BOT] Webhook error ${res.status}:`, text.slice(0, 200));
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[BOT] Network error:", err.message);
    return null;
  }
}

function shouldWatchGuild(guildId) {
  return WATCH_GUILDS.length === 0 || WATCH_GUILDS.includes(guildId);
}

// ────────────────────────────────────────────────────────────
// Discord client setup
// ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ────────────────────────────────────────────────────────────
// Events
// ────────────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log("─────────────────────────────────────────────");
  console.log(`[BOT] Online as: ${c.user.tag}`);
  console.log(`[BOT] Servers: ${c.guilds.cache.size}`);
  console.log(`[BOT] Webhook: ${WEBHOOK_URL}`);
  console.log(`[BOT] Guild filter: ${WATCH_GUILDS.length ? WATCH_GUILDS.join(", ") : "ALL"}`);
  console.log("[BOT] Watching: all text channels");
  console.log("[BOT] Triggers: FB CR SF GS MS DOCK");
  console.log("─────────────────────────────────────────────\n");
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || !message.content?.trim()) return;
    if (message.channel.type !== ChannelType.GuildText || !shouldWatchGuild(message.guildId)) return;

    const channelName = message.channel.name ?? "";
    const content = message.content;
    const category = detectCategory(content, channelName);
    if (!category) return;

    const manager = message.member?.displayName ?? message.author.username;
    const chatter = extractChatter(content);
    const model = extractModel(content, channelName);

    const result = await sendToSupabase({
      type: "single",
      message: {
        content,
        author: manager,
        channel: channelName,
        message_id: message.id,
        timestamp: message.createdAt.toISOString(),
        has_image: message.attachments.size > 0,
        category,
        chatter,
        model,
      },
    });

    if (result?.success) {
      const parts = [`[${category}]`, `manager: ${manager}`];
      if (chatter) parts.push(`chatter: @${chatter}`);
      if (model) parts.push(`model: ${model}`);
      parts.push(`#${channelName}`);
      console.log("[BOT] Saved →", parts.join(" | "));
    } else if (result) {
      console.warn("[BOT] Not saved:", result.error ?? result.message ?? "unknown");
    }
  } catch (err) {
    console.error("[BOT] Message processing error:", err);
  }
});

// ────────────────────────────────────────────────────────────
// Connection & stability events
// ────────────────────────────────────────────────────────────
client.on("disconnect", () => console.warn("[BOT] Disconnected from Discord"));
client.on("reconnecting", () => console.log("[BOT] Reconnecting..."));
client.on("resume", () => console.log("[BOT] Connection resumed"));
client.on("warn", (info) => console.warn("[BOT] Discord warning:", info));
client.on(Events.Error, (err) => console.error("[BOT] Discord client error:", err));

// ────────────────────────────────────────────────────────────
// Global error handling
// ────────────────────────────────────────────────────────────
process.on("unhandledRejection", (err) => console.error("[BOT] Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[BOT] Uncaught exception:", err));
process.on("SIGINT", () => {
  console.log("[BOT] Shutdown signal received");
  client.destroy();
  process.exit(0);
});

// ────────────────────────────────────────────────────────────
// Login with retry logic
// ────────────────────────────────────────────────────────────
async function startBot() {
  try {
    await client.login(DISCORD_TOKEN);
  } catch (err) {
    console.error("[BOT] Login failed, retrying in 5 seconds...", err);
    setTimeout(startBot, 5000);
  }
}

console.log("[BOT] Starting Discord connection...");
startBot();

// ────────────────────────────────────────────────────────────
// Keep-alive web server (REQUIRED for Fly.io)
// ────────────────────────────────────────────────────────────
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(3000, "0.0.0.0", () => console.log("[WEB] Server running on port 3000"));

// ────────────────────────────────────────────────────────────
// Heartbeat log
// ────────────────────────────────────────────────────────────
setInterval(() => {
  const status = client.isReady() ? "Connected" : "Disconnected";
  console.log(`[BOT] Heartbeat - ${status}`);
}, 60000);

import fetch from "node-fetch"; // add at top if not already imported

setInterval(async () => {
  const status = client.isReady() ? "Connected" : "Disconnected";
  console.log(`[BOT] Heartbeat - ${status}`);

  // Self-ping the keep-alive server
  try {
    await fetch("http://localhost:3000/");
    console.log("[BOT] Keep-alive ping successful");
  } catch (err) {
    console.warn("[BOT] Keep-alive ping failed:", err.message);
  }
}, 60000);
