require('dotenv').config();
const sipScheduler = require('./sip.scheduler');
require('./sip.processor'); // This will start the worker

async function start() {
    try {
        console.log('Starting SIP scheduler...');
        await sipScheduler.start();
        console.log('SIP scheduler started successfully');
    } catch (error) {
        console.error('Error starting SIP scheduler:', error);
        process.exit(1);
    }
}

// Handle shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await sipScheduler.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await sipScheduler.stop();
    process.exit(0);
});

start(); 