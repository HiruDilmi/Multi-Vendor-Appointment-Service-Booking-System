import express from 'express';
import {
    getBusinesses,
    getBusinessById,
    getBusinessServices,
    getBusinessOpeningHours,
} from '../controllers/businessController.js';

const router = express.Router();

// /api/businesses/all - list all businesses
router.get('/all', getBusinesses);

// /api/businesses/details/:id - Fetch business details + services + opening hours
router.get('/details/:id', getBusinessById);

// /api/businesses/services/:id - Fetch services of a business
router.get('/services/:id', getBusinessServices);

// /api/businesses/availability/:id - Fetch opening hours of a business
router.get('/availability/:id', getBusinessOpeningHours);

export default router;
