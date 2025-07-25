// Import necessary modules
const { default: makeWASocket, useMultiFileAuthState } = require('@adiwajshing/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Simple coloring function since chalk is causing issues
const colors = {
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`
};

// Status update tracking
const statusUpdates = new Map();

// Print formatted messages
function printMessage(from, message, isStatus = false) {
    const prefix = isStatus ? colors.yellow('[STATUS]') : colors.green('[MESSAGE]');
    console.log(`${prefix} ${colors.blue(from)}: ${message}`);
}

async function startMonitor() {
    try {
        // Initialize auth state
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');

        // Create WhatsApp socket
        const sock = makeWASocket({
            printQRInTerminal: true,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['WhatsApp Monitor Bot', 'Chrome', '1.0'],
            getMessage: async () => null
        });

        // QR code and connection handling
        sock.ev.on('connection.update', (update) => {
            const { connection, qr } = update;
            if (qr) {
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'open') {
                console.log(colors.green('Connected to WhatsApp!'));
            }
            if (connection === 'close') {
                console.log(colors.red('Connection closed, attempting to reconnect...'));
                setTimeout(() => startMonitor().catch(console.error), 5000);
            }
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);

        // Message handler
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (!msg.message) continue;

                const sender = msg.key.remoteJid;
                const messageText = msg.message.conversation || 
                                  msg.message.extendedTextMessage?.text || 
                                  '[Media message]';
                
                const contact = await sock.onWhatsApp(sender);
                const name = contact[0]?.verifiedName || contact[0]?.pushname || sender.split('@')[0];
                
                printMessage(name, messageText);
            }
        });

        // Status update handler
        sock.ev.on('status.update', async (updates) => {
            for (const update of updates) {
                const jid = update.jid;
                const status = update.status || '[No text status]';
                
                const contact = await sock.onWhatsApp(jid);
                const name = contact[0]?.verifiedName || contact[0]?.pushname || jid.split('@')[0];
                
                if (!statusUpdates.has(jid) || statusUpdates.get(jid) !== status) {
                    statusUpdates.set(jid, status);
                    printMessage(name, status, true);
                }
            }
        });

        // Presence updates
        sock.ev.on('presence.update', ({ id, presences }) => {
            Object.entries(presences).forEach(([jid, presence]) => {
                const action = presence.lastKnownPresence || 'unknown';
                if (action === 'composing') {
                    console.log(colors.gray(`${jid.split('@')[0]} is typing...`));
                }
            });
        });

        // Keep connection alive
        setInterval(() => {
            sock.sendPresenceUpdate('available').catch(() => {});
        }, 60 * 1000);

    } catch (err) {
        console.error(colors.red('Error starting monitor:'), err);
        process.exit(1);
    }
}

// Start the monitor
startMonitor();