export const CHANNEL_CATEGORY_MAP = {
  fb: "FB",
  feedback: "FB",
  audits: "FB",
  audit: "FB",
  cr: "CR",
  "coaching-call": "CR",
  "coaching-calls": "CR",
  coaching: "CR",
  sf: "SF",
  "strategy-forum": "SF",
  strategy: "SF",
  gs: "GS",
  "general-support": "GS",
  support: "GS",
  ms: "MS",
  "model-support": "MS",
  dock: "DOCK",
  docking: "DOCK",
  dockings: "DOCK",
};

export function isRealDock(content) {
  const lower = content.toLowerCase();
  const hasMoney = content.includes("$") || lower.includes("commission");
  const isRetracted = lower.includes("retracted") || lower.includes("warning only") || lower.includes("caution");
  return hasMoney && !isRetracted;
}

export function categoryFromChannel(channelName) {
  const lower = channelName.toLowerCase();
  const entries = Object.entries(CHANNEL_CATEGORY_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [key, val] of entries) {
    if (
      lower === key ||
      lower.startsWith(key + "-") ||
      lower.endsWith("-" + key) ||
      lower.includes("-" + key + "-")
    ) {
      return val;
    }
  }
  return null;
}

export function categoryFromContent(content) {
  const CATS = ["FB", "CR", "SF", "GS", "MS", "DOCK"];
  for (const line of content.split("\n")) {
    const l = line.trim().toUpperCase();
    for (const cat of CATS) {
      if (
        l === cat ||
        l.startsWith(cat + " ") ||
        l.startsWith(cat + ":") ||
        l.startsWith(cat + "/") ||
        l.startsWith(cat + "-")
      ) {
        if (cat === "DOCK") return isRealDock(content) ? "DOCK" : "FB";
        return cat;
      }
    }
  }
  return null;
}

export function detectCategory(content, channelName) {
  const fromChannel = categoryFromChannel(channelName);
  if (fromChannel) {
    if (fromChannel === "DOCK") return isRealDock(content) ? "DOCK" : "FB";
    return fromChannel;
  }
  return categoryFromContent(content);
}

export function extractChatter(content) {
  const match = content.match(/@([A-Za-z0-9_.\u0080-\uFFFF]+)/u);
  return match ? match[1] : "";
}

const SKIP_WORDS = new Set([
  "The","This","That","His","Her","Our","Your","Their",
  "But","And","Also","With","From","Into","After","Before",
  "Now","When","Than","Good","Very","Just","Even","Still",
  "Only","Sure","Let","Can","Has","Had","Was","Are","All",
  "You","Him","She","He","We","It","Top","New","Last",
  "Hey","Okay","Please","Make","Sure","Try","Fans","Fan",
  "God","Me","My","Am","An","As","At","Be","By","Do",
  "Not","Get","Got","One","Two","Big","Low","High","Day",
]);

export function extractModel(content, channelName) {
  const chanPats = [
    /^(?:fb|cr|sf|gs|ms|dock)[\/\\-](.+)/i,
    /^(.+?)[\/\\-](?:fb|cr|sf|gs|ms|dock)(?:[\/\\-]|$)/i,
  ];
  for (const pat of chanPats) {
    const m = channelName.match(pat);
    if (m?.[1]) {
      const candidate = m[1].replace(/-/g, " ").trim();
      if (candidate.length > 1) return toTitleCase(candidate);
    }
  }

  const firstLine = content.split("\n")[0];
  const prefixModel = firstLine.match(/^(?:fb|cr|sf|gs|ms|dock)[\/\\-]([A-Za-z][a-zA-Z]{2,})/i);
  if (prefixModel?.[1]) return toTitleCase(prefixModel[1]);

  const contextPats = [
    /\bon\s+([A-Z][a-zA-Z]{2,})'s\b/,
    /\bon\s+([A-Z][a-zA-Z]{2,})\b/,
    /\bfor\s+([A-Z][a-zA-Z]{2,})\b/,
  ];
  for (const pat of contextPats) {
    const m = content.match(pat);
    if (m?.[1] && !SKIP_WORDS.has(m[1])) return m[1];
  }

  const statsM = content.match(/(?:stats|activity|traffic|page)\s+(?:on|for)\s+([A-Z][a-zA-Z]{2,})/i);
  if (statsM?.[1] && !SKIP_WORDS.has(statsM[1])) return statsM[1];

  return "";
}

function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
