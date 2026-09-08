import { verifyAccessToken } from '../utils/authUtils.js';

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader) {
        return res.status(401).json({ error: 'Access token required.' });
    }

    // Handles accidental duplicate "Bearer ", extra spaces, or wrapping quotes
    let token = authHeader.trim();
    if (token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
    }
    if (token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
    }
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        token = token.slice(1, -1).trim();
    }

    if (!token) {
        return res.status(401).json({ error: 'Access token required.' });
    }

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        console.error(`[Auth Error] ${err.name}: ${err.message}`);
        return res.status(403).json({
            error: 'Invalid or expired access token.',
            details: err.message,
        });
    }
};

export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const userRole = req.user.role;
        const allowedRoles = roles.flatMap((role) => {
            if (role === 'vendor') return ['vendor'];
            return [role];
        });

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ error: 'Access denied: insufficient permissions.' });
        }

        next();
    };
};
