import express from 'express';
import {
    userRegister,
    login,
    logout,
    refreshToken,
    registerBusiness,
    getMe,
} from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public Auth Routes
// api/auth/user/register
router.post('/user/register', userRegister);

// api/auth/login
router.post('/login', login);

// api/auth/logout
router.post('/logout', logout);

// api/auth/refresh
router.post('/refresh', refreshToken);

// Protected Routes
// api/auth/me
router.get('/me', authenticateToken, getMe);

// api/auth/business/register
router.post('/business/register', authenticateToken, registerBusiness);

export default router;
