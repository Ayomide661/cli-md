const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@adiwajshing/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Define color object at the top level
const color = {
    red: text => `\x1b[31m${text}\x1b[0m`,
    green: text => `\x1b[32m${text}\x1b[0m`,
    yellow: text => `\x1b[33m${text}\x1b[0m`,
    blue: text => `\x1b[34m${text}\x1b[0m`,
    gray: text => `\x1b[90m${text}\x1b[0m`
};

let sock;
let reconnectAttempts = 0;
const MAX_RECONNECTS = 5;

async function connectToWhatsApp() {
    try {
        console.log(color.yellow('Initializing WhatsApp connection...'));
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        sock = makeWASocket({
            printQRInTerminal: false, // We'll handle QR display ourselves
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['WhatsApp Monitor', 'Chrome', '1.0'],
            getMessage: async () => null
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, isNewLogin } = update;
            
            // Display QR code if available
            if (qr) {
                console.log(color.yellow('\nScan this QR code with your phone:'));
                console.log(color.yellow('1. Open WhatsApp on your phone'));
                console.log(color.yellow('2. Tap Menu → Linked Devices → Link a Device\n'));
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'open') {
                console.log(color.green('\n✓ Successfully connected to WhatsApp!'));
                reconnectAttempts = 0;
            }
            
            if (connection === 'close') {
                const { lastDisconnect } = update;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(color.red('\n✗ You were logged out. Please delete the "auth_info" folder and restart.'));
                    process.exit(1);
                }
                
                if (reconnectAttempts < MAX_RECONNECTS) {
                    console.log(color.yellow(`\n⚠ Connection lost. Reconnecting... (Attempt ${reconnectAttempts + 1}/${MAX_RECONNECTS})`));
                    await delay(5000);
                    reconnectAttempts++;
                    connectToWhatsApp();
                } else {
                    console.log(color.red('\n✗ Maximum reconnection attempts reached. Please check your internet connection and restart.'));
                    process.exit(1);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Message handler
        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const msg of messages) {
                if (!msg.message) continue;
                
                const sender = msg.key.remoteJid;
                const text = msg.message.conversation || 
                            msg.message.extendedTextMessage?.text || 
                            '[Media message]';
                
                const contact = await sock.onWhatsApp(sender);
                const name = contact[0]?.verifiedName || contact[0]?.pushname || sender.split('@')[0];
                
                console.log(color.green(`[Message from ${name}]: ${text}`));
            }
        });

        // Presence handler
        sock.ev.on('presence.update', ({ presences }) => {
            Object.entries(presences).forEach(([jid, presence]) => {
                if (presence.lastKnownPresence === 'composing') {
                    const name = jid.split('@')[0];
                    console.log(color.gray(`✏ ${name} is typing...`));
                }
            });
        });

    } catch (err) {
        console.log(color.red('Connection error:'), err.message);
        if (reconnectAttempts < MAX_RECONNECTS) {
            await delay(5000);
            reconnectAttempts++;
            connectToWhatsApp();
        } else {
            console.log(color.red('✗ Max connection attempts reached. Exiting...'));
            process.exit(1);
        }
    }
}

// Start the connection
connectToWhatsApp();

// Clean exit handler
process.on('SIGINT', () => {
    console.log(color.yellow('\nShutting down WhatsApp monitor...'));
    process.exit(0);
});