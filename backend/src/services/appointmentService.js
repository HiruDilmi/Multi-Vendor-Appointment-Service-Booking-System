import pool from '../config/db.js';
import { timeToMinutes, minutesToTime } from '../utils/slotCalculator.js';

// Create a new appointment
export const createBooking = async ({ customerId, vendorId, bookingDate, startTime, serviceIds }) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Resolve business profile
        const [businesses] = await connection.query(
            'SELECT business_id, user_id, business_name FROM businesses WHERE business_id = ? OR user_id = ? LIMIT 1',
            [vendorId, vendorId]
        );

        const business = businesses[0];
        const businessId = business ? business.business_id : Number(vendorId);

        // Normalize serviceIds
        const normalizedServiceIds = (Array.isArray(serviceIds) ? serviceIds : String(serviceIds).split(','))
            .map((s) => Number(String(s).trim()))
            .filter((id) => !isNaN(id) && id > 0);

        if (normalizedServiceIds.length === 0) {
            throw { status: 400, message: 'Please provide at least one valid service ID.' };
        }

        // Fetch requested services and snapshot current prices
        const [services] = await connection.query(
            `SELECT service_id, price, duration_minutes 
             FROM services 
             WHERE service_id IN (?) AND business_id = ? AND is_active = 1`,
            [normalizedServiceIds, businessId]
        );

        if (services.length !== normalizedServiceIds.length) {
            throw { status: 400, message: 'One or more selected services are invalid for this vendor.' };
        }

        const totalDuration = services.reduce((sum, s) => sum + Number(s.duration_minutes || 0), 0);
        const startMinutes = timeToMinutes(startTime);
        const endTime = minutesToTime(startMinutes + totalDuration);

        // Lock and check for existing overlapping bookings
        const [conflicts] = await connection.query(
            `SELECT app_id FROM appointments 
             WHERE business_id = ? 
               AND booking_date = ? 
               AND status != 'cancelled'
               AND (start_time < ? AND end_time > ?)
             FOR UPDATE`,
            [businessId, bookingDate, endTime, startTime]
        );

        if (conflicts.length > 0) {
            throw { status: 409, message: 'The requested time slot is no longer available.' };
        }

        // Create appointment record
        const [appointmentResult] = await connection.query(
            `INSERT INTO appointments (
                customer_id, 
                business_id, 
                booking_date, 
                start_time, 
                end_time, 
                status,
                decision_by
            ) VALUES (?, ?, ?, ?, ?, 'pending', NULL)`,
            [customerId, businessId, bookingDate, startTime, endTime]
        );

        const appointmentId = appointmentResult.insertId;

        // Populate junction table with price snapshot
        const junctionRows = services.map((s) => [appointmentId, s.service_id, s.price]);
        await connection.query(
            `INSERT INTO appointment_services (app_id, service_id, price_at_booking) VALUES ?`,
            [junctionRows]
        );

        await connection.commit();

        return {
            appointmentId,
            businessId,
            bookingDate,
            startTime,
            endTime,
            totalDuration,
            status: 'pending',
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Retrieves all appointments for a given customer.
export const getCustomerAppointments = async (customerId) => {
    const [appointments] = await pool.query(
        `SELECT 
            a.app_id, 
            DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS booking_date, 
            a.start_time, 
            a.end_time, 
            a.status,
            a.created_at,
            b.business_id,
            b.business_name,
            b.city AS business_city,
            b.phone AS business_phone
        FROM appointments a
        JOIN businesses b ON a.business_id = b.business_id
        WHERE a.customer_id = ?
        ORDER BY a.booking_date DESC, a.start_time DESC`,
        [customerId]
    );

    if (appointments.length === 0) return [];

    const appIds = appointments.map((a) => a.app_id);
    const [services] = await pool.query(
        `SELECT 
            aps.app_id,
            s.service_id,
            s.title,
            aps.price_at_booking AS price,
            s.duration_minutes AS durationMinutes
        FROM appointment_services aps
        JOIN services s ON aps.service_id = s.service_id
        WHERE aps.app_id IN (?)`,
        [appIds]
    );

    const servicesByAppId = {};
    for (const s of services) {
        if (!servicesByAppId[s.app_id]) servicesByAppId[s.app_id] = [];
        servicesByAppId[s.app_id].push({
            serviceId: s.service_id,
            title: s.title,
            price: s.price,
            durationMinutes: s.durationMinutes,
        });
    }

    return appointments.map((a) => ({
        ...a,
        booked_services: servicesByAppId[a.app_id] || [],
    }));
};

// Retrieves all appointments for a business / vendor
export const getVendorAppointments = async (userId) => {
    const [appointments] = await pool.query(
        `SELECT 
            a.app_id, 
            DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS booking_date, 
            a.start_time, 
            a.end_time, 
            a.status,
            a.created_at,
            u.user_id AS customer_id,
            u.first_name AS customer_first_name, 
            u.last_name AS customer_last_name, 
            u.email AS customer_email
        FROM appointments a
        JOIN businesses b ON a.business_id = b.business_id
        JOIN users u ON a.customer_id = u.user_id
        WHERE b.user_id = ? OR b.business_id = ?
        ORDER BY a.booking_date DESC, a.start_time DESC`,
        [userId, userId]
    );

    if (appointments.length === 0) return [];

    const appIds = appointments.map((a) => a.app_id);
    const [services] = await pool.query(
        `SELECT 
            aps.app_id,
            s.service_id,
            s.title,
            aps.price_at_booking AS price,
            s.duration_minutes AS durationMinutes
        FROM appointment_services aps
        JOIN services s ON aps.service_id = s.service_id
        WHERE aps.app_id IN (?)`,
        [appIds]
    );

    const servicesByAppId = {};
    for (const s of services) {
        if (!servicesByAppId[s.app_id]) servicesByAppId[s.app_id] = [];
        servicesByAppId[s.app_id].push({
            serviceId: s.service_id,
            title: s.title,
            price: s.price,
            durationMinutes: s.durationMinutes,
        });
    }

    return appointments.map((a) => ({
        ...a,
        booked_services: servicesByAppId[a.app_id] || [],
    }));
};

/**
 * Updates an appointment's status according to role permissions and lifecycle rules:
 * - Initial state is 'pending'.
 * - Vendor can 'confirm' or 'cancel' an appointment.
 * - Customer can only 'cancel' their own appointment.
 * - Only vendor can mark an appointment as 'completed'.
 */
export const updateAppointmentStatus = async (appointmentId, userId, userRole, newStatus) => {
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(newStatus)) {
        throw { status: 400, message: `Invalid appointment status '${newStatus}'. Allowed statuses: ${validStatuses.join(', ')}.` };
    }

    const [appointments] = await pool.query(
        `SELECT 
            a.app_id, 
            a.customer_id, 
            a.business_id, 
            a.status, 
            b.user_id AS vendor_user_id 
        FROM appointments a
        JOIN businesses b ON a.business_id = b.business_id
        WHERE a.app_id = ? LIMIT 1`,
        [appointmentId]
    );

    if (appointments.length === 0) {
        throw { status: 404, message: 'Appointment not found.' };
    }

    const record = appointments[0];
    const isCustomerOwner = record.customer_id === userId;
    const isVendorOwner = record.vendor_user_id === userId;
    const isAdmin = userRole === 'admin';

    // Role authorization check
    if (!isCustomerOwner && !isVendorOwner && !isAdmin) {
        throw { status: 403, message: 'Unauthorized to modify this appointment.' };
    }

    // Ensure that already completed or cancelled appointments cannot be modified
    if (record.status === 'cancelled') {
        throw { status: 400, message: 'Cannot modify an appointment that is already cancelled.' };
    }
    if (record.status === 'completed') {
        throw { status: 400, message: 'Cannot modify an appointment that has already been completed.' };
    }

    // No-op if target status is identical to current status
    if (record.status === newStatus) {
        return {
            appointmentId,
            status: newStatus,
            message: `Appointment is already ${newStatus}.`,
        };
    }

    // Customers can ONLY cancel their own appointment
    if (isCustomerOwner && !isVendorOwner && !isAdmin) {
        if (newStatus !== 'cancelled') {
            throw { status: 403, message: 'Customers may only cancel appointments.' };
        }
    }

    // Vendor can 'confirm', 'cancel' or 'complete' the appointment
    if (isVendorOwner || isAdmin) {
        if (newStatus === 'completed' && record.status !== 'confirmed') {
            throw { status: 400, message: 'Only confirmed appointments can be marked as completed.' };
        }
        if (newStatus === 'pending' && record.status !== 'pending') {
            throw { status: 400, message: 'Cannot revert an appointment back to pending.' };
        }
    }

    // Persist new status and track who made the decision
    await pool.query(
        'UPDATE appointments SET status = ?, decision_by = ? WHERE app_id = ?',
        [newStatus, userId, appointmentId]
    );

    return {
        appointmentId,
        previousStatus: record.status,
        status: newStatus,
        decisionBy: userId,
    };
};

export default {
    createBooking,
    getCustomerAppointments,
    getVendorAppointments,
    updateAppointmentStatus,
};