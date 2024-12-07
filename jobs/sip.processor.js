const { Worker } = require('bullmq');
const { createRedisConnection } = require('./redis.config');
const walletService = require('../lib/services/wallet.service');

// Queue names
const QUEUE_NAME = 'sip-execution';

// Create worker
const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
        const { sip_id, frequency, scheduled_time } = job.data;
        console.log(`Processing SIP execution for ID: ${sip_id} scheduled for ${scheduled_time}`);

        try {
            // Execute the SIP
            const result = await walletService.executeSIP(sip_id);
            console.log(`Successfully executed SIP ${sip_id}:`, result);

            // The next execution will be automatically scheduled by the Job Scheduler
            return result;
        } catch (error) {
            console.error(`Error executing SIP ${sip_id}:`, error);
            throw error;
        }
    },
    {
        connection: createRedisConnection(),
        concurrency: 1, // Process one job at a time
        limiter: {
            max: 1,
            duration: 1000 // Limit to 1 job per second
        }
    }
);

// Handle worker events
worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed for SIP ${job.data.sip_id}`);
});

worker.on('failed', (job, error) => {
    console.error(`Job ${job.id} failed for SIP ${job.data.sip_id}:`, error);
});

module.exports = worker; 