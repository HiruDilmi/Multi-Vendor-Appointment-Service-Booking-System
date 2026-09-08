import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

dotenv.config();

export const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};

// Generates the access token
export const generateAccessToken = (payload) => {
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    return jwt.sign(payload, secret, {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m',
    });
};

// Generates the refresh token
export const generateRefreshToken = (payload) => {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    return jwt.sign(payload, secret, {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRES || '7d',
    });
};

// Verifies the access token
export const verifyAccessToken = (token) => {
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    return jwt.verify(token, secret);
};

// Verifies the refresh token
export const verifyRefreshToken = (token) => {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    return jwt.verify(token, secret);
};

// Generates both access and refresh tokens at once
export const generateAuthTokens = (payload) => {
    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
};

// Delete a specific refresh token from the database
export const clearRefreshToken = async (token) => {
    if (!token || typeof token !== 'string') return false;
    const [result] = await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [token.trim()]);
    return result.affectedRows > 0;
};

// Clears all refresh tokens for a user
export const clearUserRefreshTokens = async (userId) => {
    if (!userId) return false;
    const [result] = await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    return result.affectedRows > 0;
};

export const generateToken = generateAccessToken;

export default {
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    generateAuthTokens,
    clearRefreshToken,
    clearUserRefreshTokens,
    generateToken,
};