import express from 'express';
import {
    getVendorAvailability,
    setAvailability,
    getAvailability,
    getAvailabilityById,
    updateAvailability,
    addHoliday,
    getHolidays,
    deleteHoliday,
    // deleteAvailability
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

// DELETE /api/availability/delete/:id
// router.delete('/delete/:id', authenticateToken, requireRole('vendor'), deleteAvailability);

// POST /api/availability/holidays - Declare one or more specific calendar dates as closed/holiday
router.post('/holidays', authenticateToken, requireRole('vendor'), addHoliday);

// GET /api/availability/holidays/:businessId - List declared holidays for a business
router.get('/holidays/:businessId', getHolidays);

// DELETE /api/availability/holidays/:id - Remove a holiday and restore standard operating hours
router.delete('/holidays/:id', authenticateToken, requireRole('vendor'), deleteHoliday);

// GET /api/availability/:vendorId/slots - Public route to calculate open booking slots
router.get('/:vendorId/slots', getVendorAvailability);

export default router;
