const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@adiwajshing/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Debugging setup
const DEBUG = true;
function debugLog(message) {
    if (DEBUG) console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
}

async function connectToWhatsApp() {
    debugLog('Starting connection attempt');
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        debugLog('Auth state initialized');

        const sock = makeWASocket({
            printQRInTerminal: false, // We'll handle QR display manually
            auth: state,
            logger: pino({ level: DEBUG ? 'debug' : 'error' }),
            browser: ['WA-Monitor', 'Chrome', '1.0'],
            markOnlineOnConnect: false, // Reduces connection load
            connectTimeoutMs: 30000, // Longer timeout for CloudShell
            keepAliveIntervalMs: 15000 // More frequent keep-alive
        });

        sock.ev.on('connection.update', (update) => {
            debugLog(`Connection update: ${JSON.stringify(update)}`);
            
            if (update.qr) {
                console.log('\n=== WhatsApp Login Required ===');
                console.log('1. Open WhatsApp on your phone');
                console.log('2. Tap Menu → Linked Devices → Link a Device\n');
                qrcode.generate(update.qr, { small: true });
            }

            if (update.connection === 'open') {
                console.log('\n✓ Successfully connected!');
            }

            if (update.connection === 'close') {
                const reason = DisconnectReason[update.lastDisconnect?.error?.output?.statusCode] || 'unknown';
                console.log(`\n⚠ Connection closed (Reason: ${reason})`);
                
                if (reason === 'loggedOut') {
                    console.log('Please delete auth_info folder and restart');
                    process.exit(1);
                }
                
                // Immediate reconnect with delay
                setTimeout(connectToWhatsApp, 5000);
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error('\n⚠ Critical Error:', error.message);
        debugLog(`Error stack: ${error.stack}`);
        console.log('Retrying in 10 seconds...');
        setTimeout(connectToWhatsApp, 10000);
    }
}

// Start with clean state
console.log('Starting WhatsApp Monitor...');
connectToWhatsApp();

// Clean exit handler
process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    process.exit(0);
});