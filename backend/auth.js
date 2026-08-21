const jwt = require('jsonwebtoken');
const redisClient = require('./DB/cache');
const USER_model = require('./models/User');
const URL_model = require('./models/Url');

async function createRefreshToken(user){
    const refreshToken = jwt.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET);
    try{
        await redisClient.set(`refreshToken:${refreshToken}`, user._id.toString(), { EX: 7 * 24 * 60 * 60 }); // Store for 7 days
        return refreshToken;
    }catch (error) {
        console.error('Error storing refresh token in Redis:', error);
        throw new Error('Failed to store refresh token');
    }
}



async function createAccessToken(refreshToken) {
    const userId = await redisClient.get(`refreshToken:${refreshToken}`);
    if (!userId) {
        throw new Error('Invalid or expired refresh token.');
    }
    return jwt.sign({ userId: userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

function authToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

async function authorize(req,res,next){  // TODO: check if user exists in DB
    const user = req.user;
    if(!user){
        return res.status(401).json({error: 'Access denied. Login required.'});
    }
    const { shortUrl } = req.params;
    const urlDoc= await URL_model.findOne({shortUrl});
    if(!urlDoc){
        return res.status(404).json({error: 'URL not found.'});
    }
    if(user.userId.toString() !== urlDoc.userId.toString() && user.role !== 'admin'){
        return res.status(403).json({error: 'Access denied. You do not have permission to access this resource.'});
    }
    next();
}

module.exports = { 
    createRefreshToken, 
    createAccessToken, 
    authToken, 
    authorize 
};
