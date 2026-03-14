# LM_feedback

## Run the bot

1. Install dependencies:

```bash
npm install
```

2. Create `.env` with:

```ini
DISCORD_TOKEN=...
SUPABASE_WEBHOOK_URL=...
BOT_API_SECRET=...
```

3. Start:

```bash
npm start
```

This runs `bot.mjs`, which listens for FB/CR/SF/GS/MS/DOCK messages and posts events to Supabase.

## Tests

Run parser regression tests:

```bash
npm test
```
