const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const prompt = require('prompt');
const chalk = require('chalk');
const ora = require('ora');

// Initialize the client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sessions' }),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' }
});

// Loading spinner
const spinner = ora('Initializing WhatsApp client...').start();

// Clear screen and display header
function clearScreen() {
    console.clear();
    console.log(chalk.green.bold('WhatsApp CLI Bot'));
    console.log(chalk.gray('Press Ctrl+C to exit\n'));
}

// Format JID for display
function formatJid(jid) {
    return jid.split('@')[0];
}

// When the client is ready
client.on('ready', () => {
    spinner.succeed('Client is ready!');
    clearScreen();
    startMessageLoop();
});

// Generate QR code for authentication
client.on('qr', qr => {
    spinner.stop();
    clearScreen();
    console.log(chalk.yellow('Scan the QR code below:'));
    qrcode.generate(qr, { small: true });
});

// Handle incoming messages
client.on('message', async message => {
    // Get contact name
    const contact = await message.getContact();
    const name = contact.pushname || contact.number || 'Unknown';
    
    // Display incoming message
    console.log(
        `${chalk.blue.bold(formatJid(message.from))} ${chalk.gray(`(${name})`)}\n` +
        `${chalk.green('>')} ${message.body}`
    );
});

// Handle authentication failure
client.on('auth_failure', () => {
    spinner.fail('Authentication failed. Please try again.');
});

// Handle disconnected events
client.on('disconnected', (reason) => {
    spinner.fail(`Client disconnected: ${reason}`);
    console.log(chalk.red('Restarting...'));
    client.initialize();
});

// Start the client
client.initialize();

// Function to handle sending messages
async function startMessageLoop() {
    // Configure prompt
    prompt.start();
    prompt.message = '';
    prompt.delimiter = '';

    while (true) {
        try {
            // Get user input
            const { input } = await prompt.get([{
                name: 'input',
                description: chalk.gray('\nEnter message (format: "jid message" or "jid -f filepath" for media):'),
                type: 'string',
                required: true
            }]);

            // Parse input
            const spaceIndex = input.indexOf(' ');
            if (spaceIndex === -1) {
                console.log(chalk.red('Invalid format. Use: "jid message" or "jid -f filepath"'));
                continue;
            }

            const jid = input.substring(0, spaceIndex).trim();
            const content = input.substring(spaceIndex + 1).trim();

            // Check if sending media
            if (content.startsWith('-f ')) {
                const filePath = content.substring(3).trim();
                try {
                    const media = await MessageMedia.fromFilePath(filePath);
                    await client.sendMessage(jid, media);
                    console.log(chalk.green(`Media sent to ${formatJid(jid)}`));
                } catch (error) {
                    console.log(chalk.red(`Error sending media: ${error.message}`));
                }
            } else {
                // Send text message
                try {
                    await client.sendMessage(jid, content);
                    console.log(chalk.green(`Message sent to ${formatJid(jid)}`));
                } catch (error) {
                    console.log(chalk.red(`Error sending message: ${error.message}`));
                }
            }
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down gracefully...'));
    client.destroy();
    process.exit();
});