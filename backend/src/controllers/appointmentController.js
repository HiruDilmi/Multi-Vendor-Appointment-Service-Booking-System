import * as appointmentService from '../services/appointmentService.js';

 // Books a new appointment for the authenticated customer.
export const bookAppointment = async (req, res) => {
    try {
        const body = req.body || {};
        const vendorId = body.vendorId || body.businessId || body.vendor_id || body.business_id;
        const bookingDate = body.bookingDate || body.booking_date || body.date;
        const startTime = body.startTime || body.start_time;
        const rawServiceIds = body.serviceIds || body.service_ids || body.serviceId || body.service_id;

        if (!vendorId || isNaN(Number(vendorId)) || Number(vendorId) <= 0) {
            return res.status(400).json({ error: 'Valid positive numeric vendorId is required.' });
        }

        if (!bookingDate || typeof bookingDate !== 'string') {
            return res.status(400).json({ error: 'bookingDate is required (YYYY-MM-DD).' });
        }

        const trimmedDate = bookingDate.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
            return res.status(400).json({ error: 'Invalid bookingDate format. Expected YYYY-MM-DD.' });
        }

        if (!startTime || typeof startTime !== 'string') {
            return res.status(400).json({ error: 'startTime is required (HH:MM or HH:MM:SS).' });
        }

        const trimmedStartTime = startTime.trim();
        if (!/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9]))?$/.test(trimmedStartTime)) {
            return res.status(400).json({ error: 'Invalid startTime format. Expected HH:MM or HH:MM:SS.' });
        }

        if (!rawServiceIds) {
            return res.status(400).json({ error: 'serviceIds is required (e.g. [11] or "11,12").' });
        }

        // Normalize serviceIds to an array of valid positive integers
        const parseServiceIds = (input) => {
            if (!input) return [];
            if (Array.isArray(input)) {
                return input.flatMap((item) => parseServiceIds(item)).filter((id) => !isNaN(id) && id > 0);
            }
            if (typeof input === 'number' && !isNaN(input) && input > 0) {
                return [input];
            }
            if (typeof input === 'string') {
                const cleaned = input.replace(/[\[\]"'\s]/g, '');
                if (!cleaned) return [];
                return cleaned
                    .split(',')
                    .map((s) => Number(s))
                    .filter((id) => !isNaN(id) && id > 0);
            }
            return [];
        };

        const serviceIds = parseServiceIds(rawServiceIds);

        if (serviceIds.length === 0) {
            return res.status(400).json({ error: 'serviceIds must contain at least one valid numeric service ID.' });
        }

        const booking = await appointmentService.createBooking({
            customerId: req.user.id,
            vendorId: Number(vendorId),
            bookingDate: trimmedDate,
            startTime: trimmedStartTime,
            serviceIds,
        });

        return res.status(201).json({ message: 'Appointment booked successfully.', booking });
    } catch (error) {
        console.error('Error booking appointment:', error);
        return res.status(error.status || error.statusCode || 500).json({
            error: error.message || 'Internal server error.',
        });
    }
};

// Retrieves all bookings for the currently authenticated customer.
export const getMyAppointments = async (req, res) => {
    try {
        const appointments = await appointmentService.getCustomerAppointments(req.user.id);
        return res.status(200).json({ appointments });
    } catch (error) {
        console.error('Error fetching customer appointments:', error);
        return res.status(error.status || error.statusCode || 500).json({
            error: error.message || 'Internal server error.',
        });
    }
};

// Retrieves the appointment schedule for the currently authenticated vendor.
export const getVendorSchedule = async (req, res) => {
    try {
        const appointments = await appointmentService.getVendorAppointments(req.user.id);
        return res.status(200).json({ appointments });
    } catch (error) {
        console.error('Error fetching vendor schedule:', error);
        return res.status(error.status || error.statusCode || 500).json({
            error: error.message || 'Internal server error.',
        });
    }
};

// Changes status of an appointment (confirm, cancel, complete).
export const changeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const appointmentId = Number(id);

        if (!appointmentId || isNaN(appointmentId) || appointmentId <= 0) {
            return res.status(400).json({ error: 'Valid positive numeric appointment ID is required in URL parameter.' });
        }

        const { status } = req.body || {};
        if (!status || typeof status !== 'string') {
            return res.status(400).json({ error: 'status is required (pending, confirmed, cancelled, completed).' });
        }

        const normalizedStatus = status.trim().toLowerCase();

        const updated = await appointmentService.updateAppointmentStatus(
            appointmentId,
            req.user.id,
            req.user.role,
            normalizedStatus
        );

        return res.status(200).json({ message: 'Status updated successfully.', updated });
    } catch (error) {
        console.error('Error updating appointment status:', error);
        return res.status(error.status || error.statusCode || 500).json({
            error: error.message || 'Internal server error.',
        });
    }
};

export default {
    bookAppointment,
    getMyAppointments,
    getVendorSchedule,
    changeStatus,
};