// ============================================================
// FeedTrack Discord Bot (Fly.io Production Version)
// ============================================================

import "dotenv/config";
import fetch from "node-fetch";
import http from "http";
import { createRequire } from "module";
import { detectCategory, extractChatter, extractModel } from "./parser.mjs";

const require = createRequire(import.meta.url);
const { Client, GatewayIntentBits, Events, ChannelType } = require("discord.js");

// ────────────────────────────────────────────────────────────
// Keep-alive server (REQUIRED for Fly.io)
// ────────────────────────────────────────────────────────────

http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is alive");
  })
  .listen(3000, () => {
    console.log("[BOT] Keep-alive server running on port 3000");
  });

// ────────────────────────────────────────────────────────────
// Environment Variables
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// Helper: sanitize headers
// ────────────────────────────────────────────────────────────

function sanitizeHeaderValue(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

// ────────────────────────────────────────────────────────────
// Send data to Supabase
// ────────────────────────────────────────────────────────────

async function sendToSupabase(payload) {
  try {
    const sanitizedSecret = sanitizeHeaderValue(BOT_SECRET);

    if (!sanitizedSecret) {
      console.error("[BOT] BOT_API_SECRET invalid");
      return null;
    }

    console.log("[BOT] Sending →", JSON.stringify(payload));

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
      console.error(`[BOT] Webhook error ${res.status}:`, text.slice(0, 200));
      return null;
    }

    const data = await res.json();
    console.log("[BOT] Supabase response →", data);

    return data;
  } catch (err) {
    console.error("[BOT] Network error:", err.message);
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Guild filtering
// ────────────────────────────────────────────────────────────

function shouldWatchGuild(guildId) {
  if (WATCH_GUILDS.length === 0) return true;
  return WATCH_GUILDS.includes(guildId);
}

// ────────────────────────────────────────────────────────────
// Discord Client
// ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ────────────────────────────────────────────────────────────
// Startup
// ────────────────────────────────────────────────────────────

client.once(Events.ClientReady, (c) => {
  console.log("─────────────────────────────────────────────");
  console.log(`[BOT] Online as: ${c.user.tag}`);
  console.log(`[BOT] Servers: ${c.guilds.cache.size}`);
  console.log(`[BOT] Webhook: ${WEBHOOK_URL}`);
  console.log(
    `[BOT] Guild filter: ${
      WATCH_GUILDS.length ? WATCH_GUILDS.join(", ") : "ALL"
    }`
  );
  console.log("[BOT] Watching: all text channels");
  console.log("[BOT] Triggers: FB CR SF GS MS DOCK");
  console.log("─────────────────────────────────────────────\n");
});

// ────────────────────────────────────────────────────────────
// Message Listener
// ────────────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content?.trim()) return;
    if (message.channel.type !== ChannelType.GuildText) return;
    if (!shouldWatchGuild(message.guildId)) return;

    const channelName = message.channel.name ?? "";
    const content = message.content;

    console.log("[BOT] Message received →", content);

    const category = detectCategory(content, channelName);
    if (!category) {
      console.log("[BOT] Skipped (no category match)");
      return;
    }

    const manager =
      message.member?.displayName ?? message.author.username;

    const chatter = extractChatter(content);
    const model = extractModel(content, channelName);

    const payload = {
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
    };

    const result = await sendToSupabase(payload);

    if (result?.success) {
      const parts = [`[${category}]`, `manager: ${manager}`];
      if (chatter) parts.push(`chatter: @${chatter}`);
      if (model) parts.push(`model: ${model}`);
      parts.push(`#${channelName}`);

      console.log("[BOT] Saved →", parts.join(" | "));
    } else {
      console.warn("[BOT] Not saved");
    }
  } catch (err) {
    console.error("[BOT] Message processing error:", err);
  }
});

// ────────────────────────────────────────────────────────────
// Connection diagnostics
// ────────────────────────────────────────────────────────────

client.on("disconnect", () => {
  console.warn("[BOT] Disconnected from Discord");
});

client.on("reconnecting", () => {
  console.log("[BOT] Reconnecting...");
});

client.on("resume", () => {
  console.log("[BOT] Connection resumed");
});

client.on(Events.Error, (err) => {
  console.error("[BOT] Discord error:", err);
});

// ────────────────────────────────────────────────────────────
// Global error handling
// ────────────────────────────────────────────────────────────

process.on("unhandledRejection", (err) => {
  console.error("[BOT] Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("[BOT] Uncaught exception:", err);
});

// ────────────────────────────────────────────────────────────
// Start bot
// ────────────────────────────────────────────────────────────

console.log("[BOT] Starting Discord connection...");
client.login(DISCORD_TOKEN);

// ────────────────────────────────────────────────────────────
// Heartbeat
// ────────────────────────────────────────────────────────────

setInterval(() => {
  const status = client.isReady() ? "✓ Connected" : "✗ Disconnected";
  console.log(`[BOT] Heartbeat - ${status}`);
}, 60000);
