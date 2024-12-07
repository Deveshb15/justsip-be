const Redis = require('ioredis');

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
};

const createRedisConnection = () => new Redis(redisConfig);

module.exports = {
    createRedisConnection,
    redisConfig
}; 