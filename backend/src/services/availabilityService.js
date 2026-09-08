import pool from '../config/db.js';
import { calculateFreeTimes, calculateOpenSlots } from '../utils/slotCalculator.js';

// Find business profile by user ID
export const findBusinessByUserId = async (userId) => {
    const [rows] = await pool.query(
        `SELECT
            business_id, 
            user_id, 
            business_name, 
            bio, 
            address, 
            city, 
            phone, 
            created_at, 
            updated_at 
        FROM businesses 
        WHERE user_id = ? LIMIT 1`,
        [userId]
    );
    return rows.length > 0 ? rows[0] : null;
};

// Get availability schedule for a business
export const getBusinessAvailability = async (businessId = null) => {
    let sql = `
        SELECT 
            ba.availability_id,
            ba.business_id,
            ba.day_of_week,
            ba.is_open,
            ba.start_time,
            ba.end_time,
            ba.created_at,
            ba.updated_at,
            b.business_name,
            b.city,
            b.phone
        FROM business_availability ba
        JOIN businesses b ON ba.business_id = b.business_id
    `;
    const params = [];

    if (businessId !== null && businessId !== undefined && businessId !== '') {
        sql += ' WHERE ba.business_id = ?';
        params.push(businessId);
    }

    sql += ' ORDER BY ba.business_id ASC, FIELD(ba.day_of_week, \'mon\', \'tue\', \'wed\', \'thu\', \'fri\', \'sat\', \'sun\', \'everyday\'), ba.availability_id ASC';

    const [rows] = await pool.query(sql, params);
    return rows.map((row) => ({
        ...row,
        is_open: Boolean(row.is_open),
    }));
};

// Get a single availability entry by ID
export const getAvailabilityById = async (availabilityId) => {
    const [rows] = await pool.query(
        `SELECT 
            ba.availability_id,
            ba.business_id,
            ba.day_of_week,
            ba.is_open,
            ba.start_time,
            ba.end_time,
            ba.created_at,
            ba.updated_at,
            b.user_id AS vendor_user_id,
            b.business_name
        FROM business_availability ba
        JOIN businesses b ON ba.business_id = b.business_id
        WHERE ba.availability_id = ?
        LIMIT 1`,
        [availabilityId]
    );
    if (rows.length === 0) return null;
    return {
        ...rows[0],
        is_open: Boolean(rows[0].is_open),
    };
};

// Set availability schedules for a business
export const setBusinessAvailability = async (businessId, scheduleInput) => {
    const scheduleList = Array.isArray(scheduleInput) ? scheduleInput : [scheduleInput];
    if (scheduleList.length === 0) {
        return getBusinessAvailability(businessId);
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const item of scheduleList) {
            const dayOfWeek = item.day_of_week;
            const isOpen = item.is_open ? 1 : 0;
            const startTime = item.start_time;
            const endTime = item.end_time;

            const [existing] = await connection.query(
                'SELECT availability_id FROM business_availability WHERE business_id = ? AND day_of_week = ? LIMIT 1',
                [businessId, dayOfWeek]
            );

            if (existing.length > 0) {
                await connection.query(
                    `UPDATE business_availability 
                     SET is_open = ?, start_time = ?, end_time = ? 
                     WHERE availability_id = ?`,
                    [isOpen, startTime, endTime, existing[0].availability_id]
                );
            } else {
                await connection.query(
                    `INSERT INTO business_availability 
                     (business_id, day_of_week, is_open, start_time, end_time) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [businessId, dayOfWeek, isOpen, startTime, endTime]
                );
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return getBusinessAvailability(businessId);
};

// Update an availability entry by ID
export const updateAvailabilityById = async (availabilityId, updates) => {
    const fields = [];
    const values = [];

    if (updates.day_of_week !== undefined) {
        fields.push('day_of_week = ?');
        values.push(updates.day_of_week);
    }
    if (updates.is_open !== undefined) {
        fields.push('is_open = ?');
        values.push(updates.is_open ? 1 : 0);
    }
    if (updates.start_time !== undefined) {
        fields.push('start_time = ?');
        values.push(updates.start_time);
    }
    if (updates.end_time !== undefined) {
        fields.push('end_time = ?');
        values.push(updates.end_time);
    }

    if (fields.length === 0) {
        return getAvailabilityById(availabilityId);
    }

    values.push(availabilityId);
    await pool.query(
        `UPDATE business_availability SET ${fields.join(', ')} WHERE availability_id = ?`,
        values
    );

    return getAvailabilityById(availabilityId);
};

// // Delete an availability record by ID
// export const deleteAvailabilityById = async (availabilityId) => {
//     const [result] = await pool.query(
//         'DELETE FROM business_availability WHERE availability_id = ?',
//         [availabilityId]
//     );
//     return result.affectedRows > 0;
// };

// Day mapping helpers for day of week conversion
const DAY_MAP_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];


// Calculates free times for a vendor on a specific date after existing appointments.
export const getAvailableSlots = async (vendorId, dateStr) => {
    // Resolve business
    const [businesses] = await pool.query(
        'SELECT business_id, user_id, business_name FROM businesses WHERE business_id = ? OR user_id = ? LIMIT 1',
        [vendorId, vendorId]
    );

    const business = businesses[0];
    const targetBusinessId = business ? business.business_id : Number(vendorId);

    // etermine the day of week (0 for Sunday, 6 for Saturday) from dateStr (e.g. '2026-09-15')
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(dateObj.getTime())) {
        const error = new Error('Invalid date format. Expected YYYY-MM-DD.');
        error.statusCode = 400;
        throw error;
    }

    const dayOfWeek = dateObj.getUTCDay(); // 0 for Sunday, 6 for Saturday
    const dayName = DAY_MAP_SHORT[dayOfWeek];

    // Query business_availability for that vendor and day_of_week
    const [availabilityRows] = await pool.query(
        `SELECT 
            availability_id, 
            business_id, 
            day_of_week, 
            is_open, 
            start_time, 
            end_time
         FROM business_availability
         WHERE business_id = ? AND (day_of_week = ? OR day_of_week = 'everyday')
         ORDER BY (day_of_week = ?) DESC
         LIMIT 1`,
        [targetBusinessId, dayName, dayName]
    );

    const availability = availabilityRows[0];

    // If no operating hours exist for that day, or marked closed, return indicator
    if (!availability || !availability.is_open || !availability.start_time || !availability.end_time) {
        return {
            vendorId: Number(vendorId) || vendorId,
            businessName: business?.business_name || null,
            date: dateStr,
            dayOfWeek: dayName,
            isClosed: true,
            operatingHours: null,
            existingAppointments: [],
            freeTimes: [],
            availableSlots: [],
        };
    }

    // Query appointments for that vendorId and booking_date = dateStr where status != 'cancelled'
    const [appointments] = await pool.query(
        `SELECT app_id, start_time, end_time, status
         FROM appointments
         WHERE business_id = ? AND booking_date = ? AND status != 'cancelled'
         ORDER BY start_time ASC`,
        [targetBusinessId, dateStr]
    );

    // Call calculateFreeTimes from slotCalculator.js
    const freeTimes = calculateFreeTimes({
        openTime: availability.start_time,
        closeTime: availability.end_time,
        existingBookings: appointments.map((a) => ({
            start_time: a.start_time,
            end_time: a.end_time,
        })),
    });

    // Return result object
    return {
        vendorId: Number(vendorId) || vendorId,
        businessName: business?.business_name || null,
        date: dateStr,
        dayOfWeek: dayName,
        isClosed: false,
        operatingHours: {
            openTime: availability.start_time,
            closeTime: availability.end_time,
        },
        // existingAppointments: appointments.map((a) => ({
        //     startTime: a.start_time,
        //     endTime: a.end_time,
        // })),
        availableSlots: freeTimes.map((ft) => ({
            startTime: ft.startTime,
            endTime: ft.endTime,
        })),
    };
};
