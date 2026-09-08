import express from 'express';
import cors from 'cors';
import authRoutes from './src/routes/authRoutes.js';
import availabilityRoutes from './src/routes/availabilityRoutes.js';
import servicesRoutes from './src/routes/servicesRoutes.js';
import appointmentRoutes from './src/routes/appointmentRoutes.js';
import businessRoutes from './src/routes/businessRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes
app.use('/api/auth', authRoutes);

// Business & Public routes
app.use('/api/businesses', businessRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/appointments', appointmentRoutes);

// Base health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;