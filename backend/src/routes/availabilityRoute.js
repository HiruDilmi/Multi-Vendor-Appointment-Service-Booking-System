import express from 'express';
import {
    setAvailability,
    getAvailability,
    getAvailabilityById,
    updateAvailability,
    // deleteAvailability,
} from '../controllers/availabilityController.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

// POST /api/availability/set - Set or bulk-update opening dates and hours
router.post('/set', authenticateToken, requireRole('vendor'), setAvailability);

// GET /api/availability/entry/:id - Fetch a single availability entry by ID
router.get('/entry/:id', getAvailabilityById);

// GET /api/availability/get/:businessId - Opening hours for a business
router.get('/get/:businessId', getAvailability);

// PUT /api/availability/update/:id - Update an availability entry
router.put('/update/:id', authenticateToken, requireRole('vendor'), updateAvailability);

// DELETE /api/availability/delete/:id - Delete an availability entry
// router.delete('/availability/:id', authenticateToken, requireRole('vendor'), deleteAvailability);

export default router;