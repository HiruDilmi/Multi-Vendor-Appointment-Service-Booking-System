import express from 'express';
import cors from 'cors';
import authRoutes from './src/routes/authRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes
app.use('/api/auth', authRoutes);

// Base health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;