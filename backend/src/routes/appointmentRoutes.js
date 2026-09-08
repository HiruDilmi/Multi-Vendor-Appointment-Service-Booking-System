import { Router } from 'express';
import {
    bookAppointment,
    getMyAppointments,
    getVendorSchedule,
    changeStatus,
} from '../controllers/appointmentController.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();

// /api/appointments/book
router.post('/book', authenticateToken, bookAppointment);

// /api/appointments/my-bookings
router.get('/my-bookings', authenticateToken, getMyAppointments);

// /api/appointments.business - fetch business's all bookings
router.get('/business', authenticateToken, requireRole('vendor', 'admin'), getVendorSchedule);

// /api/appointments/status/:id
router.patch('/status/:id', authenticateToken, changeStatus);

export default router;