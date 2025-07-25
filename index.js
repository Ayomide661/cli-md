const { makeWASocket, useMultiFileAuthState, delay } = require('@adiwajshing/baileys');
const chalk = require('chalk').default;
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Status update tracking
const statusUpdates = new Map();

// CLI formatting helpers
const formatMessage = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    return `[${timestamp}] ${msg}`;
};

const printMessage = (from, message, isStatus = false) => {
    const prefix = isStatus ? chalk.yellow('[STATUS]') : chalk.green('[MESSAGE]');
    console.log(`${prefix} ${chalk.blue(from)}: ${message}`);
};

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

        // QR code generation
        sock.ev.on('connection.update', (update) => {
            const { connection, qr } = update;
            if (qr) {
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'open') {
                console.log(chalk.green('Connected to WhatsApp!'));
            }
            if (connection === 'close') {
                console.log(chalk.red('Connection closed, attempting to reconnect...'));
                startMonitor().catch(console.error);
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
                    console.log(chalk.gray(`${jid.split('@')[0]} is typing...`));
                }
            });
        });

        // Error handling
        sock.ev.on('connection.update', ({ lastDisconnect }) => {
            const error = lastDisconnect?.error;
            if (error?.output?.statusCode === 401) {
                console.log(chalk.red('Authentication failed. Please delete auth_info folder and rescan QR code.'));
                process.exit(1);
            }
        });

        // Keep connection alive
        setInterval(() => {
            sock.sendPresenceUpdate('available').catch(() => {});
        }, 60 * 1000);

    } catch (err) {
        console.error(chalk.red('Error starting monitor:'), err);
        process.exit(1);
    }
}

// Start the monitor
startMonitor();