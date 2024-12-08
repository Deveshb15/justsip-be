const { Queue } = require('bullmq');
const { createRedisConnection } = require('./redis.config');
const supabase = require('../lib/config/supabase');
const walletService = require('../lib/services/wallet.service');

// Queue names
const QUEUE_NAME = 'sip-execution';

class SIPScheduler {
    constructor() {
        this.queue = new Queue(QUEUE_NAME, {
            connection: createRedisConnection(),
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                },
                removeOnComplete: true,
                removeOnFail: 1000
            }
        });
    }

    async schedulePendingSIPs() {
        try {
            // Get all active SIPs
            const { data: sips, error } = await supabase
                .from('sips')
                .select('*')
                .eq('status', 'active');

            if (error) throw error;

            console.log(`Found ${sips?.length || 0} active SIPs`);

            // Get all existing schedulers
            const existingSchedulers = await this.queue.getJobSchedulers();
            const existingSchedulerIds = new Set(existingSchedulers.map(s => s.id));

            // Schedule each SIP that doesn't already have a scheduler
            for (const sip of (sips || [])) {
                const schedulerId = `sip-scheduler-${sip.id}`;
                if (!existingSchedulerIds.has(schedulerId)) {
                    console.log(`Creating new scheduler for SIP ${sip.id || sip.sip_id}`);
                    await this.createSIPScheduler(sip);
                } else {
                    console.log(`Scheduler already exists for SIP ${sip.id || sip.sip_id}`);
                    // Optionally update the existing scheduler if needed
                    await this.updateSIPScheduler(sip);
                }
            }

            // Remove schedulers for inactive SIPs
            const activeIds = new Set(sips.map(sip => `sip-scheduler-${sip.id}`));
            for (const scheduler of existingSchedulers) {
                if (scheduler?.id?.startsWith('sip-scheduler-') && !activeIds.has(scheduler.id)) {
                    console.log(`Removing scheduler for inactive SIP: ${scheduler.id || scheduler.sip_id}`);
                    await this.queue.removeJobScheduler(scheduler.id);
                }
            }
        } catch (error) {
            console.error('Error scheduling pending SIPs:', error);
        }
    }

    getSchedulerPattern(frequency, nextExecution) {
        const executionTime = new Date(nextExecution);
        const minutes = executionTime.getMinutes();
        const hours = executionTime.getHours();

        switch (frequency) {
            case 'daily':
                // Run at the same time every day
                return `${minutes} ${hours} * * *`;
            case 'weekly':
                // Run at the same time on the same day of the week
                const dayOfWeek = executionTime.getDay();
                return `${minutes} ${hours} * * ${dayOfWeek}`;
            case 'monthly':
                // Run at the same time on the same day of the month
                const dayOfMonth = executionTime.getDate();
                return `${minutes} ${hours} ${dayOfMonth} * *`;
            default:
                throw new Error(`Invalid frequency: ${frequency}`);
        }
    }

    async createSIPScheduler(sip) {
        try {
            // const pattern = this.getSchedulerPattern(sip.frequency, sip.next_execution);
            const pattern = "* * * * *"; // every minute
            // const pattern = "*/3 * * * *"
            console.log(
                `Creating scheduler for SIP ${sip.id || sip.sip_id} with pattern: ${pattern}`
            );

            console.log("SIP IN SCHEDULER", sip);

            const firstJob = await this.queue.upsertJobScheduler(
                `sip-scheduler-${sip.id ? sip.id : sip.sip_id}`,
                { pattern },
                {
                    name: 'execute-sip',
                    data: {
                        sip_id: sip.sip_id ? sip.sip_id : sip.id,
                        frequency: sip.frequency,
                    },
                    opts: {
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 1000
                        },
                        removeOnComplete: true,
                        removeOnFail: 1000
                    }
                }
            );

            console.log(`Created scheduler for SIP ${sip.id || sip.sip_id}, first job ID: ${firstJob.id}`);
            return firstJob;
        } catch (error) {
            console.error(`Error creating scheduler for SIP ${sip.id}:`, error);
            throw error;
        }
    }

    async updateSIPScheduler(sip) {
        try {
            const pattern = this.getSchedulerPattern(sip.frequency, sip.next_execution);
            console.log(`Updating scheduler for SIP ${sip.id} with pattern: ${pattern}`);

            // Using upsertJobScheduler will update the existing scheduler
            const updatedJob = await this.queue.upsertJobScheduler(
                `sip-scheduler-${sip.id}`,
                { pattern },
                {
                    name: 'execute-sip',
                    data: {
                        sip_id: sip.id,
                        frequency: sip.frequency,
                        scheduled_time: sip.next_execution
                    }
                }
            );

            console.log(`Updated scheduler for SIP ${sip.id}`);
            return updatedJob;
        } catch (error) {
            console.error(`Error updating scheduler for SIP ${sip.id}:`, error);
            throw error;
        }
    }

    async removeSIPScheduler(sip_id) {
        try {
            await this.queue.removeJobScheduler(`sip-scheduler-${sip_id}`);
            console.log(`Removed scheduler for SIP ${sip_id}`);
        } catch (error) {
            console.error(`Error removing scheduler for SIP ${sip_id}:`, error);
            throw error;
        }
    }

    async start() {
        console.log('Starting SIP scheduler...');
        await this.schedulePendingSIPs();

        // Check for changes every hour
        setInterval(async () => {
            console.log('Running periodic scheduler check...');
            await this.schedulePendingSIPs();
        }, 10 * 60 * 1000); // Every 10 minutes
    }

    async stop() {
        await this.queue.close();
    }
}

module.exports = new SIPScheduler(); 
