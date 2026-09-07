import { verifyAccessToken } from '../utils/authUtils.js';

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ error: 'Access token required.' });
    }

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded; // Contains user_id, email, role
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired access token.' });
    }
};
