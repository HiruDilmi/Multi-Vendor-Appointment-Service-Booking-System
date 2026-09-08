import express from 'express';
import {
    createService,
    getServices,
    updateService,
    disableService,
    getServiceById,
} from '../controllers/businessController.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

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
