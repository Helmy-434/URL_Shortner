const Redis = require('redis');

const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://redis:6379 '
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));


if(redisClient.isOpen === false){
    redisClient.connect().then(() => {
        console.log('Connected to Redis');
    }).catch((err) => {
        console.error('Redis connection error:', err);
    });
}

module.exports = redisClient;