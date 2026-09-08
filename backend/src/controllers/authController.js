import pool from '../config/db.js';
import {
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    clearRefreshToken,
    clearUserRefreshTokens,
} from '../utils/authUtils.js';

// User registration
export const userRegister = async (req, res) => {
    const { first_name, last_name, email, password, role } = req.body || {};

    if (!first_name) {
        return res.status(400).json({ error: 'First name is required.' });
    }
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    if (!password) {
        return res.status(400).json({ error: 'Password is required.' });
    }

    const assignedRole = role === 'vendor' ? 'vendor' : 'customer';
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Check if email already exists
        const [existingUsers] = await connection.query(
            'SELECT user_id FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (existingUsers.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // Hash password and insert into users table
        const hashedPassword = await hashPassword(password);
        const [userResult] = await connection.query(
            'INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [first_name, last_name || '', email, hashedPassword, assignedRole]
        );

        const userId = userResult.insertId;

        // Generate initial tokens
        const tokenPayload = { id: userId, email, role: assignedRole };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken({ id: userId });

        // Save refresh token in DB
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await connection.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [userId, refreshToken, expiresAt]
        );

        await connection.commit();

        return res.status(201).json({
            message: 'Registration successful.',
            accessToken,
            refreshToken,
            user: {
                id: userId,
                first_name,
                last_name: last_name || '',
                email,
                role: assignedRole,
                hasBusinessProfile: false,
            },
        });
    } catch (error) {
        await connection.rollback();
        console.error('Registration error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    } finally {
        connection.release();
    }
};

// Login
export const login = async (req, res) => {
    const { email, password } = req.body || {};

    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    if (!password) {
        return res.status(400).json({ error: 'Password is required.' });
    }

    try {
        const [users] = await pool.query(
            'SELECT user_id, first_name, last_name, email, password, role FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];
        const isMatch = await comparePassword(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Check if business profile exists if role is vendor
        let hasBusinessProfile = false;
        if (user.role === 'vendor') {
            const [biz] = await pool.query(
                'SELECT business_id FROM businesses WHERE user_id = ? LIMIT 1',
                [user.user_id]
            );
            hasBusinessProfile = biz.length > 0;
        }

        const tokenPayload = { id: user.user_id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken({ id: user.user_id });

        // Store refresh token
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.user_id, refreshToken, expiresAt]
        );

        return res.json({
            message: 'Login successful.',
            accessToken,
            refreshToken,
            user: {
                id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                hasBusinessProfile,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Refresh Access Token
export const refreshToken = async (req, res) => {
    const refreshToken = req.body?.refreshToken;

    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required.' });
    }

    try {
        const decoded = verifyRefreshToken(refreshToken);

        // Verify token exists in database
        const [storedTokens] = await pool.query(
            'SELECT token_id FROM refresh_tokens WHERE token = ? AND user_id = ? LIMIT 1',
            [refreshToken, decoded.id]
        );

        if (storedTokens.length === 0) {
            return res.status(403).json({ error: 'Token has been revoked or is invalid.' });
        }

        const [users] = await pool.query(
            'SELECT user_id, email, role FROM users WHERE user_id = ? LIMIT 1',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'User no longer exists.' });
        }

        const user = users[0];
        const newAccessToken = generateAccessToken({
            id: user.user_id,
            email: user.email,
            role: user.role,
        });

        return res.json({ accessToken: newAccessToken });
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
};

// Register the business
export const registerBusiness = async (req, res) => {
    const { business_name, bio, address, city, phone } = req.body || {};
    const userId = req.user.id;

    if (req.user?.role !== 'vendor') {
        return res.status(403).json({ error: 'Only business accounts can register a business profile.' });
    }

    if (!business_name) {
        return res.status(400).json({ error: 'Business name is required.' });
    }
    if (!city) {
        return res.status(400).json({ error: 'City is required.' });
    }
    if (!phone) {
        return res.status(400).json({ error: 'Phone is required.' });
    }

    try {
        const [existing] = await pool.query(
            'SELECT business_id FROM businesses WHERE user_id = ? LIMIT 1',
            [userId]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'Business profile already registered for this user.' });
        }

        const [result] = await pool.query(
            'INSERT INTO businesses (user_id, business_name, bio, city, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, business_name, bio || null, city, phone, address || null]
        );

        return res.status(201).json({
            message: 'Business profile created successfully.',
            businessId: result.insertId,
            hasBusinessProfile: true,
        });
    } catch (error) {
        console.error('Business profile registration error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Get current user info
export const getMe = async (req, res) => {
    const userId = req.user?.id;

    try {
        const [users] = await pool.query(
            'SELECT user_id, first_name, last_name, email, role FROM users WHERE user_id = ? LIMIT 1',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = users[0];
        let hasBusinessProfile = false;
        let business = null;

        if (user.role === 'vendor') {
            const [biz] = await pool.query(
                'SELECT business_id, business_name, bio, city, phone, address FROM businesses WHERE user_id = ? LIMIT 1',
                [user.user_id]
            );
            if (biz.length > 0) {
                hasBusinessProfile = true;
                business = biz[0];
            }
        }

        return res.json({
            user: {
                id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                hasBusinessProfile,
                business,
            },
        });
    } catch (error) {
        console.error('getMe error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Logout user and clear tokens
export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body || {};
        let userId = req.user?.id;

        // If no user attached via middleware, attempt to extract and decode from Authorization header
        if (!userId) {
            const authHeader = req.headers['authorization'] || req.headers['Authorization'];
            if (authHeader) {
                try {
                    let token = authHeader.trim();
                    if (token.startsWith('Bearer ')) token = token.slice(7).trim();
                    if (token.startsWith('Bearer ')) token = token.slice(7).trim();
                    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                        token = token.slice(1, -1).trim();
                    }
                    const decoded = verifyAccessToken(token);
                    userId = decoded?.id;
                } catch {
                    // Ignore expired access token during logout
                }
            }
        }

        // If specific refreshToken provided in body, clear it from database
        if (refreshToken && typeof refreshToken === 'string') {
            await clearRefreshToken(refreshToken);
            // If userId still unknown, attempt to decode userId from refresh token
            if (!userId) {
                try {
                    const decodedRefresh = verifyRefreshToken(refreshToken.trim());
                    userId = decodedRefresh?.id;
                } catch {
                    // Ignore invalid or expired refresh token
                }
            }
        }

        // If userId is known, clear all refresh tokens for this user
        if (userId) {
            await clearUserRefreshTokens(userId);
        }

        // Clear HTTP cookies if any were set
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        res.clearCookie('token');

        return res.status(200).json({
            message: 'Logged out successfully. Access token and refresh token cleared.',
            accessToken: null,
            refreshToken: null,
        });
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ error: 'Internal server error during logout.' });
    }
};