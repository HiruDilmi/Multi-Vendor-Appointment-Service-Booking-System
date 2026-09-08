import * as availabilityService from '../services/availabilityService.js';
import { verifyAccessToken } from '../utils/authUtils.js';

// BUSINESS OPEN HOURS
const VALID_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'everyday'];

const DAY_MAP = {
    sunday: 'sun',
    monday: 'mon',
    tuesday: 'tue',
    wednesday: 'wed',
    thursday: 'thu',
    friday: 'fri',
    saturday: 'sat',
    daily: 'everyday',
};

const normalizeDayOfWeek = (day) => {
    if (!day || typeof day !== 'string') return null;
    const lower = day.trim().toLowerCase();

    // Directly matches dropdown / checkbox values
    if (VALID_DAYS.includes(lower)) {
        return lower;
    }

    // Handles full day name if sent by frontend dropdown
    return DAY_MAP[lower] || null;
};

const normalizeTime = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const trimmed = timeStr.trim();
    const match = trimmed.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9]))?$/);
    if (!match) return null;
    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    const seconds = match[4] ? match[4] : '00';
    return `${hours}:${minutes}:${seconds}`;
};

const parseIsOpen = (val) => {
    if (val === undefined || val === null) return true;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0;
    if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
    }
    return Boolean(val);
};

const validateScheduleItem = (item, index = null) => {
    const prefix = index !== null ? `Schedule item at index ${index}: ` : '';
    if (!item || typeof item !== 'object') {
        return { error: `${prefix}Each schedule item must be an object.` };
    }

    const normalizedDay = normalizeDayOfWeek(item.day_of_week);
    if (!normalizedDay) {
        return {
            error: `${prefix}Invalid day_of_week '${item.day_of_week}'. Allowed values are: ${VALID_DAYS.join(', ')}.`,
        };
    }

    const isOpen = parseIsOpen(item.is_open);

    let startTime = null;
    let endTime = null;

    if (isOpen) {
        if (!item.start_time || !item.end_time) {
            return { error: `${prefix}start_time and end_time are required when is_open is true.` };
        }
        startTime = normalizeTime(item.start_time);
        endTime = normalizeTime(item.end_time);

        if (!startTime) {
            return { error: `${prefix}Invalid start_time format (${item.start_time}). Use HH:MM (e.g. '09:00').` };
        }
        if (!endTime) {
            return { error: `${prefix}Invalid end_time format (${item.end_time}). Use HH:MM (e.g. '17:00').` };
        }
        if (startTime >= endTime) {
            return { error: `${prefix}start_time (${item.start_time}) must be earlier than end_time (${item.end_time}).` };
        }
    } else {
        startTime = item.start_time ? normalizeTime(item.start_time) || '00:00:00' : '00:00:00';
        endTime = item.end_time ? normalizeTime(item.end_time) || '00:00:00' : '00:00:00';
    }

    return {
        data: {
            day_of_week: normalizedDay,
            is_open: isOpen,
            start_time: startTime,
            end_time: endTime,
        },
    };
};

// Set opening dates & hours
export const setAvailability = async (req, res) => {
    try {
        const userId = req.user?.id;
        const business = await servicesService.findBusinessByUserId(userId);
        if (!business) {
            return res.status(400).json({
                error: 'Business profile not found. Please register your business profile before configuring availability.',
            });
        }

        const body = req.body || {};
        let rawItems = [];
        if (Array.isArray(body)) {
            rawItems = body;
        } else if (Array.isArray(body.schedules)) {
            rawItems = body.schedules;
        } else if (body.day_of_week !== undefined) {
            rawItems = [body];
        } else {
            return res.status(400).json({
                error: 'Please provide either a schedule object or an array of schedule items in the request body.',
            });
        }

        if (rawItems.length === 0) {
            return res.status(400).json({ error: 'Schedule list cannot be empty.' });
        }

        const validatedSchedules = [];
        for (let i = 0; i < rawItems.length; i++) {
            const result = validateScheduleItem(rawItems[i], rawItems.length > 1 ? i : null);
            if (result.error) {
                return res.status(400).json({ error: result.error });
            }
            validatedSchedules.push(result.data);
        }

        const updatedAvailability = await availabilityService.setBusinessAvailability(
            business.business_id,
            validatedSchedules
        );

        return res.status(200).json({
            message: 'Business availability configured successfully.',
            business_id: business.business_id,
            count: updatedAvailability.length,
            availability: updatedAvailability,
        });
    } catch (error) {
        console.error('Error setting business availability:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Get availability schedule for a business
export const getAvailability = async (req, res) => {
    try {
        const businessIdParam = req.params.businessId || req.query.businessId || req.query.vendorId;
        let targetBusinessId = businessIdParam ? Number(businessIdParam) : null;

        // If no businessId passed, check if a logged-in user is calling (either via req.user or Authorization header)
        if (!targetBusinessId) {
            let userId = req.user?.id;

            if (!userId) {
                const authHeader = req.headers['authorization'] || req.headers['Authorization'];
                if (authHeader) {
                    try {
                        let token = authHeader.trim();
                        if (token.startsWith('Bearer ')) token = token.slice(7).trim();
                        if (token.startsWith('Bearer ')) token = token.slice(7).trim();
                        if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                            token = token.slice(1, -1).trim();
                        }
                        const decoded = verifyAccessToken(token);
                        userId = decoded?.id;
                    } catch {
                        // ignore token verification error for public viewing
                    }
                }
            }

            if (userId) {
                const business = await availabilityService.findBusinessByUserId(userId);
                if (business) {
                    targetBusinessId = business.business_id;
                }
            }
        }

        // Fetch availability (for specific business if targetBusinessId is set, or all businesses for public viewing)
        const availability = await availabilityService.getBusinessAvailability(targetBusinessId);

        const response = {
            count: availability.length,
            availability,
        };

        if (targetBusinessId) {
            response.business_id = targetBusinessId;
        }

        return res.json(response);
    } catch (error) {
        console.error('Error fetching business availability:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Fetch a single availability entry by ID
export const getAvailabilityById = async (req, res) => {
    try {
        const availabilityId = Number(req.params.id);
        if (!availabilityId || isNaN(availabilityId)) {
            return res.status(400).json({ error: 'Invalid availability ID.' });
        }

        const entry = await availabilityService.getAvailabilityById(availabilityId);
        if (!entry) {
            return res.status(404).json({ error: 'Availability entry not found.' });
        }

        return res.json(entry);
    } catch (error) {
        console.error('Error fetching availability entry by ID:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Update an existing availability entry
export const updateAvailability = async (req, res) => {
    try {
        const userId = req.user?.id;
        const availabilityId = Number(req.params.id);

        if (!availabilityId || isNaN(availabilityId)) {
            return res.status(400).json({ error: 'Invalid availability ID.' });
        }

        const existing = await availabilityService.getAvailabilityById(availabilityId);
        if (!existing) {
            return res.status(404).json({ error: 'Availability entry not found.' });
        }

        if (existing.vendor_user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to update this availability entry.' });
        }

        const { day_of_week, is_open, start_time, end_time } = req.body || {};
        const updates = {};

        if (day_of_week !== undefined) {
            const normalizedDay = normalizeDayOfWeek(day_of_week);
            if (!normalizedDay) {
                return res.status(400).json({
                    error: `Invalid day_of_week '${day_of_week}'. Allowed values are: ${VALID_DAYS.join(', ')}.`,
                });
            }
            updates.day_of_week = normalizedDay;
        }

        if (is_open !== undefined) {
            updates.is_open = parseIsOpen(is_open);
        }

        const finalIsOpen = updates.is_open !== undefined ? updates.is_open : existing.is_open;
        let finalStart = existing.start_time;
        let finalEnd = existing.end_time;

        if (start_time !== undefined) {
            const normalizedStart = normalizeTime(start_time);
            if (!normalizedStart) {
                return res.status(400).json({ error: `Invalid start_time format (${start_time}). Use HH:MM.` });
            }
            updates.start_time = normalizedStart;
            finalStart = normalizedStart;
        }

        if (end_time !== undefined) {
            const normalizedEnd = normalizeTime(end_time);
            if (!normalizedEnd) {
                return res.status(400).json({ error: `Invalid end_time format (${end_time}). Use HH:MM.` });
            }
            updates.end_time = normalizedEnd;
            finalEnd = normalizedEnd;
        }

        if (finalIsOpen && finalStart && finalEnd && finalStart >= finalEnd) {
            return res.status(400).json({
                error: `start_time (${finalStart}) must be earlier than end_time (${finalEnd}).`,
            });
        }

        const updated = await availabilityService.updateAvailabilityById(availabilityId, updates);

        return res.json({
            message: 'Availability entry updated successfully.',
            availability: updated,
        });
    } catch (error) {
        console.error('Error updating availability entry:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Delete an availability entry
export const deleteAvailability = async (req, res) => {
    try {
        const userId = req.user?.id;
        const availabilityId = Number(req.params.id);

        if (!availabilityId || isNaN(availabilityId)) {
            return res.status(400).json({ error: 'Invalid availability ID.' });
        }

        const existing = await availabilityService.getAvailabilityById(availabilityId);
        if (!existing) {
            return res.status(404).json({ error: 'Availability entry not found.' });
        }

        if (existing.vendor_user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this availability entry.' });
        }

        await availabilityService.deleteAvailabilityById(availabilityId);

        return res.json({
            message: 'Availability entry deleted successfully.',
        });
    } catch (error) {
        console.error('Error deleting availability entry:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};