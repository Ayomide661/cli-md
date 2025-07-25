const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@adiwajshing/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Simple coloring
const colors = {
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
        console.log(color.yellow('Initializing connection...'));
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        sock = makeWASocket({
            printQRInTerminal: true,
            auth: state,
            logger: pino({ level: 'error' }), // Only show errors
            browser: ['WhatsApp Monitor', 'Desktop', '1.0.0'],
            getMessage: async () => null
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, isNewLogin } = update;
            
            // Show QR code if available
            if (qr) {
                console.log(color.yellow('Scan this QR code:'));
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'open') {
                console.log(color.green('✓ Successfully connected!'));
                reconnectAttempts = 0;
            }
            
            if (connection === 'close') {
                const { lastDisconnect } = update;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(color.red('✗ You were logged out. Delete auth_info folder and restart.'));
                    process.exit(1);
                }
                
                if (reconnectAttempts < MAX_RECONNECTS) {
                    console.log(color.yellow(`⚠ Disconnected. Reconnecting... (${reconnectAttempts + 1}/${MAX_RECONNECTS})`));
                    await delay(5000);
                    reconnectAttempts++;
                    connectToWhatsApp();
                } else {
                    console.log(color.red('✗ Max reconnection attempts reached. Restart the app.'));
                    process.exit(1);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.log(color.red('Connection error:'), err.message);
        if (reconnectAttempts < MAX_RECONNECTS) {
            await delay(5000);
            reconnectAttempts++;
            connectToWhatsApp();
        }
    }
}

// Start connection
connectToWhatsApp();

// Handle process exit
process.on('SIGINT', () => {
    console.log(color.yellow('\nShutting down...'));
    process.exit(0);
});