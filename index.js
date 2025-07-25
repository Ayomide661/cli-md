const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@adiwajshing/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Simple coloring using ANSI escape codes
const colors = {
    red: text => `\x1b[31m${text}\x1b[0m`,
    green: text => `\x1b[32m${text}\x1b[0m`,
    yellow: text => `\x1b[33m${text}\x1b[0m`,
    blue: text => `\x1b[34m${text}\x1b[0m`,
    gray: text => `\x1b[90m${text}\x1b[0m`
};

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // 5 seconds

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');

        const sock = makeWASocket({
            printQRInTerminal: true,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['WhatsApp Monitor', 'Chrome', '1.0'],
            getMessage: async () => null
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log(colors.green('✓ Connected to WhatsApp'));
                reconnectAttempts = 0; // Reset counter on successful connection
            }

            if (connection === 'close') {
                const shouldReconnect = update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    console.log(colors.yellow(`⚠ Connection closed. Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`));
                    setTimeout(connectToWhatsApp, RECONNECT_INTERVAL);
                } else {
                    console.log(colors.red('✗ Unable to reconnect. Please restart the app.'));
                    process.exit(1);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

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
                
                console.log(colors.green(`[MSG] ${name}: ${messageText}`));
            }
        });

        sock.ev.on('presence.update', ({ id, presences }) => {
            Object.entries(presences).forEach(([jid, presence]) => {
                if (presence.lastKnownPresence === 'composing') {
                    const name = jid.split('@')[0];
                    console.log(colors.gray(`✏ ${name} is typing...`));
                }
            });
        });

        // Keep connection alive
        setInterval(() => {
            sock.sendPresenceUpdate('available').catch(() => {});
        }, 30000);

    } catch (err) {
        console.error(colors.red('⚠ Connection error:'), err.message);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(connectToWhatsApp, RECONNECT_INTERVAL);
        } else {
            console.log(colors.red('✗ Max reconnection attempts reached. Exiting...'));
            process.exit(1);
        }
    }
}

// Start the connection
connectToWhatsApp();