import pool from '../config/db.js';

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

// Create a new service
export const createService = async ({ businessId, title, description, duration_minutes, price }) => {
    const [result] = await pool.query(
        `INSERT INTO services (
            business_id, 
            title, 
            description, 
            duration_minutes, 
            price, 
            is_active
        ) VALUES (?, ?, ?, ?, ?, 1)`,
        [businessId, title, description || null, duration_minutes, price]
    );
    return getServiceById(result.insertId);
};

// Get all active services, optionally filtered by vendorId (business_id or user_id)
export const getActiveServices = async ({ vendorId } = {}) => {
    let sql = `
        SELECT 
            s.service_id,
            s.business_id,
            s.title,
            s.description,
            s.duration_minutes,
            s.price,
            s.is_active,
            s.created_at,
            s.updated_at,
            b.business_name,
            b.city,
            b.phone,
            b.address,
            b.user_id AS vendor_user_id
        FROM services s
        JOIN businesses b ON s.business_id = b.business_id
        WHERE s.is_active = 1
    `;
    const params = [];

    if (vendorId !== undefined && vendorId !== null && vendorId !== '') {
        sql += ' AND (s.business_id = ? OR b.user_id = ?)';
        params.push(vendorId, vendorId);
    }
    sql += ' ORDER BY s.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
};

// Get a service by ID
export const getServiceById = async (serviceId) => {
    const [rows] = await pool.query(
        `SELECT 
            s.service_id,
            s.business_id,
            s.title,
            s.description,
            s.duration_minutes,
            s.price,
            s.is_active,
            s.created_at,
            s.updated_at,
            b.user_id AS vendor_user_id,
            b.business_name
        FROM services s
        JOIN businesses b ON s.business_id = b.business_id
        WHERE s.service_id = ?
        LIMIT 1`,
        [serviceId]
    );
    return rows.length > 0 ? rows[0] : null;
};

// Update a service
export const updateService = async (serviceId, updates) => {
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
    }
    if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description || null);
    }
    if (updates.duration_minutes !== undefined) {
        fields.push('duration_minutes = ?');
        values.push(updates.duration_minutes);
    }
    if (updates.price !== undefined) {
        fields.push('price = ?');
        values.push(updates.price);
    }

    if (fields.length === 0) {
        return getServiceById(serviceId);
    }

    values.push(serviceId);
    await pool.query(
        `UPDATE services SET ${fields.join(', ')} WHERE service_id = ?`,
        values
    );

    return getServiceById(serviceId);
};

// Soft delete a service (set is_active = 0)
export const softDeleteService = async (serviceId) => {
    const [result] = await pool.query(
        'UPDATE services SET is_active = 0 WHERE service_id = ?',
        [serviceId]
    );
    return result.affectedRows > 0;
};
