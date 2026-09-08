import express from 'express';
import cors from 'cors';
import authRoutes from './src/routes/authRoutes.js';
import businessRoutes from './src/routes/businessRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes
app.use('/api/auth', authRoutes);

// Service routes
app.use('/api/services', businessRoutes);

// Base health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;