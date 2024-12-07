const { Worker } = require('bullmq');
const { createRedisConnection } = require('./redis.config');
const walletService = require('../lib/services/wallet.service');
const supabase = require('../lib/config/supabase');
const sipScheduler = require('./sip.scheduler');

// Queue names
const QUEUE_NAME = 'sip-execution';

// Create worker
const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
        console.log("JOB DATA", job.data);

        const { sip_id, frequency } = job.data;
        console.log(`Processing SIP execution for ID: ${sip_id} with frequency: ${frequency}`);

        try {
            // First check if SIP exists in database
            const { data: sip, error: sipError } = await supabase
                .from('sips')
                .select('*')
                .eq('id', sip_id)
                .single();

            if (sipError || !sip) {
                console.log(`SIP ${sip_id} not found in database, removing scheduler...`);
                // Remove the scheduler for this non-existent SIP
                await sipScheduler.removeSIPScheduler(sip_id);
                throw new Error(`SIP ${sip_id} not found in database`);
            }

            // Check if SIP is still active
            if (sip.status !== 'active') {
                console.log(`SIP ${sip_id} is not active, removing scheduler...`);
                await sipScheduler.removeSIPScheduler(sip_id);
                throw new Error(`SIP ${sip_id} is not active`);
            }

            // Execute the SIP
            const result = await walletService.executeSIP(sip_id);
            console.log(`Successfully executed SIP ${sip_id}:`, result);

            // The next execution will be automatically scheduled by the Job Scheduler
            return result;
        } catch (error) {
            console.error(`Error executing SIP ${sip_id}:`, error?.message);
            
            // If the error is due to SIP not found or inactive, we don't want to retry
            if (error.message.includes('not found') || error.message.includes('not active')) {
                // Mark the job as completed to prevent retries
                return { 
                    success: false, 
                    error: error.message,
                    shouldRemoveScheduler: true 
                };
            }
            
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
worker.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed for SIP ${job.data.sip_id}`);
    
    // If the job indicates the scheduler should be removed, do it here
    if (result && result.shouldRemoveScheduler) {
        sipScheduler.removeSIPScheduler(job.data.sip_id)
            .catch(err => console.error(`Error removing scheduler for SIP ${job.data.sip_id}:`, err));
    }
});

worker.on('failed', (job, error) => {
    console.error(`Job ${job.id} failed for SIP ${job.data.sip_id}:`, error);
    
    // If the error indicates the SIP doesn't exist or is inactive, remove the scheduler
    if (error.message && (error.message.includes('not found') || error.message.includes('not active'))) {
        sipScheduler.removeSIPScheduler(job.data.sip_id)
            .catch(err => console.error(`Error removing scheduler for SIP ${job.data.sip_id}:`, err));
    }
});

module.exports = worker; 