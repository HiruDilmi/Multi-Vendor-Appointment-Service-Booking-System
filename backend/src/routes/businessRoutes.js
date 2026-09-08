import express from 'express';
import {
    setAvailability,
    getAvailability,
    getAvailabilityById,
    updateAvailability,
    deleteAvailability,
    createService,
    getServices,
    updateService,
    disableService,
    getServiceById,
} from '../controllers/businessController.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

// BUSINESS AVAILABILITY / OPENING HOUR
// POST /api/business/set - Set or bulk-update opening dates and hours
router.post('/set', authenticateToken, requireRole('vendor'), setAvailability);

// GET /api/business/entry/:id - Fetch a single availability entry by ID
router.get('/entry/:id', getAvailabilityById);

// GET /api/business/get/:businessId - Opening hours for a business
router.get('/get/:businessId', getAvailability);

// PUT /api/business/update/:id - Update an availability entry
router.put('/update/:id', authenticateToken, requireRole('vendor'), updateAvailability);

// DELETE /api/business/delete/:id - Delete an availability entry
// router.delete('/availability/:id', authenticateToken, requireRole('vendor'), deleteAvailability);


// SERVICES
// POST /api/services/new - Create a service offering
router.post('/new', authenticateToken, requireRole('vendor'), createService);

// GET /api/services/all - List all active services across vendors or filter by ?vendorId=
router.get('/all', getServices);

// GET /api/services/view/:id - Fetch a single service by ID
router.get('/:id', getServiceById);

// PUT /api/services/:id - Update a service
router.put('/update/:id', authenticateToken, requireRole('vendor'), updateService);

// PATCH /api/services/:id - Soft-delete or remove a service
router.patch('/delete/:id', authenticateToken, requireRole('vendor'), disableService);

export default router;
