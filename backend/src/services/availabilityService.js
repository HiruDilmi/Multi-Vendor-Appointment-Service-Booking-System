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

// Check if this specific date is marked as a business closure, holiday, or custom open hours
    const [closures] = await pool.query(
        `SELECT 
            closure_id, 
            reason, 
            is_open, 
            start_time, 
            end_time 
         FROM business_closures 
         WHERE business_id = ? AND closure_date = ? 
         LIMIT 1`,
        [targetBusinessId, dateStr]
    );

    if (closures.length > 0) {
        const closure = closures[0];
        const isOpen = Boolean(closure.is_open);

        // Case A: Full-day closure/holiday
        if (!isOpen || !closure.start_time || !closure.end_time) {
            return {
                vendorId: Number(vendorId) || vendorId,
                businessName: business?.business_name || null,
                date: dateStr,
                dayOfWeek: dayName,
                isClosed: true,
                isHoliday: true,
                reason: closure.reason || 'Holiday',
                operatingHours: null,
                availableSlots: [],
            };
        }

        // Case B: Custom opening hours for this specific date
        const openTime = closure.start_time;
        const closeTime = closure.end_time;

        // Query appointments for that vendorId and booking_date = dateStr where status != 'cancelled'
        const [appointments] = await pool.query(
            `SELECT app_id, start_time, end_time, status
             FROM appointments
             WHERE business_id = ? AND booking_date = ? AND status != 'cancelled'
             ORDER BY start_time ASC`,
            [targetBusinessId, dateStr]
        );

        // Calculate free times within the custom operating hours
        const freeTimes = calculateFreeTimes({
            openTime,
            closeTime,
            existingBookings: appointments.map((a) => ({
                start_time: a.start_time,
                end_time: a.end_time,
            })),
        });

        return {
            vendorId: Number(vendorId) || vendorId,
            businessName: business?.business_name || null,
            date: dateStr,
            dayOfWeek: dayName,
            isClosed: false,
            isHoliday: false,
            isCustomHours: true,
            reason: closure.reason || 'Custom Open Hours',
            operatingHours: {
                openTime,
                closeTime,
            },
            availableSlots: freeTimes.map((ft) => ({
                startTime: ft.startTime,
                endTime: ft.endTime,
            })),
        };
    }

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

// Add or update a business holiday/custom open hours for a specific date
export const addBusinessClosure = async (
    businessId,
    closureDate,
    reason = 'Holiday',
    isOpen = false,
    startTime = null,
    endTime = null
) => {
    const cleanReason = reason && typeof reason === 'string' ? reason.trim() : 'Holiday';
    const numericIsOpen = isOpen ? 1 : 0;
    const finalStart = numericIsOpen && startTime ? startTime : null;
    const finalEnd = numericIsOpen && endTime ? endTime : null;

    const [existing] = await pool.query(
        'SELECT closure_id FROM business_closures WHERE business_id = ? AND closure_date = ? LIMIT 1',
        [businessId, closureDate]
    );

    if (existing.length > 0) {
        await pool.query(
            `UPDATE business_closures 
             SET reason = ?, is_open = ?, start_time = ?, end_time = ? 
             WHERE closure_id = ?`,
            [cleanReason, numericIsOpen, finalStart, finalEnd, existing[0].closure_id]
        );
        return {
            closure_id: existing[0].closure_id,
            business_id: businessId,
            closure_date: closureDate,
            reason: cleanReason,
            is_open: Boolean(numericIsOpen),
            start_time: finalStart,
            end_time: finalEnd,
            is_new: false,
        };
    } else {
        const [result] = await pool.query(
            `INSERT INTO business_closures 
             (business_id, closure_date, reason, is_open, start_time, end_time) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [businessId, closureDate, cleanReason, numericIsOpen, finalStart, finalEnd]
        );
        return {
            closure_id: result.insertId,
            business_id: businessId,
            closure_date: closureDate,
            reason: cleanReason,
            is_open: Boolean(numericIsOpen),
            start_time: finalStart,
            end_time: finalEnd,
            is_new: true,
        };
    }
};

// Get list of closures/holidays for a business
export const getBusinessClosures = async (businessId, startDate = null) => {
    let sql = `
        SELECT 
            bc.closure_id,
            bc.business_id,
            DATE_FORMAT(bc.closure_date, '%Y-%m-%d') AS closure_date,
            bc.reason,
            bc.is_open,
            bc.start_time,
            bc.end_time,
            bc.created_at,
            b.business_name
        FROM business_closures bc
        JOIN businesses b ON bc.business_id = b.business_id
        WHERE bc.business_id = ?
    `;
    const params = [businessId];

    if (startDate) {
        sql += ' AND bc.closure_date >= ?';
        params.push(startDate);
    }

    sql += ' ORDER BY bc.closure_date ASC';

    const [rows] = await pool.query(sql, params);
    return rows.map((row) => ({
        ...row,
        is_open: Boolean(row.is_open),
    }));
};

// Get a single closure by ID
export const getClosureById = async (closureId) => {
    const [rows] = await pool.query(
        `SELECT 
            bc.closure_id,
            bc.business_id,
            DATE_FORMAT(bc.closure_date, '%Y-%m-%d') AS closure_date,
            bc.reason,
            bc.is_open,
            bc.start_time,
            bc.end_time,
            bc.created_at,
            b.user_id AS vendor_user_id,
            b.business_name
        FROM business_closures bc
        JOIN businesses b ON bc.business_id = b.business_id
        WHERE bc.closure_id = ?
        LIMIT 1`,
        [closureId]
    );
    if (rows.length === 0) return null;
    return {
        ...rows[0],
        is_open: Boolean(rows[0].is_open),
    };
};

// Delete a business closure by ID
export const deleteBusinessClosure = async (businessId, closureId) => {
    const [result] = await pool.query(
        'DELETE FROM business_closures WHERE closure_id = ? AND business_id = ?',
        [closureId, businessId]
    );
    return result.affectedRows > 0;
};
