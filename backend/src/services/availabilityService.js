import pool from '../config/db.js';

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

// Delete an availability record by ID
export const deleteAvailabilityById = async (availabilityId) => {
    const [result] = await pool.query(
        'DELETE FROM business_availability WHERE availability_id = ?',
        [availabilityId]
    );
    return result.affectedRows > 0;
};

// Delete all availability records for a business
export const clearBusinessAvailability = async (businessId) => {
    const [result] = await pool.query(
        'DELETE FROM business_availability WHERE business_id = ?',
        [businessId]
    );
    return result.affectedRows;
};
