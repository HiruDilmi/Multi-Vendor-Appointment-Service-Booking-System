import pool from '../config/db.js';

// Retrieves all registered businesses with optional city / search filtering and active services count.
export const getAllBusinesses = async ({ search, city } = {}) => {
    let sql = `
        SELECT 
            b.business_id,
            b.user_id,
            b.business_name,
            b.bio,
            b.address,
            b.city,
            b.phone,
            b.created_at,
            COUNT(DISTINCT s.service_id) AS active_services_count
        FROM businesses b
        LEFT JOIN services s ON b.business_id = s.business_id AND s.is_active = 1
        WHERE 1=1
    `;
    const params = [];

    if (city && typeof city === 'string' && city.trim() !== '') {
        sql += ' AND LOWER(b.city) = LOWER(?)';
        params.push(city.trim());
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
        sql += ' AND (LOWER(b.business_name) LIKE LOWER(?) OR LOWER(b.bio) LIKE LOWER(?))';
        params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    sql += ' GROUP BY b.business_id ORDER BY b.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return rows;
};

// Retrieves full public profile of a business, including active services and opening hours.
export const getBusinessProfile = async (businessId) => {
    const [businesses] = await pool.query(
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
        WHERE business_id = ? OR user_id = ?
        LIMIT 1`,
        [businessId, businessId]
    );

    if (businesses.length === 0) {
        return null;
    }

    const business = businesses[0];
    const resolvedBusinessId = business.business_id;

    // Fetch active services offered by this business
    const [services] = await pool.query(
        `SELECT 
            service_id,
            business_id,
            title,
            description,
            duration_minutes,
            price,
            is_active,
            created_at
        FROM services
        WHERE business_id = ? AND is_active = 1
        ORDER BY created_at DESC`,
        [resolvedBusinessId]
    );

    // Fetch weekly opening hours / availability
    const [availability] = await pool.query(
        `SELECT 
            availability_id,
            business_id,
            day_of_week,
            is_open,
            start_time,
            end_time
        FROM business_availability
        WHERE business_id = ?
        ORDER BY FIELD(day_of_week, 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'everyday'), availability_id ASC`,
        [resolvedBusinessId]
    );

    return {
        ...business,
        services,
        openingHours: availability.map((row) => ({
            ...row,
            is_open: Boolean(row.is_open),
        })),
    };
};

export default {
    getAllBusinesses,
    getBusinessProfile,
};
