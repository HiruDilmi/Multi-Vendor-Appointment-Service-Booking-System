// Converts a time string ("HH:MM:SS" or "HH:MM") to total minutes from midnight.
export const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.trim().split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
};

// Converts total minutes from midnight back to "HH:MM:00" format.
export const minutesToTime = (totalMinutes) => {
    const total = Math.max(0, Math.floor(totalMinutes));
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    const paddedHours = String(hours).padStart(2, '0');
    const paddedMinutes = String(minutes).padStart(2, '0');
    return `${paddedHours}:${paddedMinutes}:00`;
};

// Calculates free time intervals during operating hours after subtracting booked appointments.
export const calculateFreeTimes = ({
    openTime,
    closeTime,
    existingBookings = [],
}) => {
    const startLimit = typeof openTime === 'number' ? openTime : timeToMinutes(openTime);
    const endLimit = typeof closeTime === 'number' ? closeTime : timeToMinutes(closeTime);

    if (startLimit >= endLimit) {
        return [];
    }

    // Normalize and filter bookings within the operating window
    const normalizedBookings = (existingBookings || [])
        .map((booking) => {
            let start = 0;
            let end = 0;

            if (typeof booking.start === 'number') start = booking.start;
            else if (typeof booking.start_time === 'string') start = timeToMinutes(booking.start_time);
            else if (typeof booking.startTime === 'string') start = timeToMinutes(booking.startTime);
            else if (typeof booking.start === 'string') start = timeToMinutes(booking.start);

            if (typeof booking.end === 'number') end = booking.end;
            else if (typeof booking.end_time === 'string') end = timeToMinutes(booking.end_time);
            else if (typeof booking.endTime === 'string') end = timeToMinutes(booking.endTime);
            else if (typeof booking.end === 'string') end = timeToMinutes(booking.end);

            return {
                start: Math.max(startLimit, start),
                end: Math.min(endLimit, end),
            };
        })
        .filter((b) => b.start < b.end)
        .sort((a, b) => a.start - b.start);

    // Merge overlapping or adjacent bookings
    const mergedBookings = [];
    for (const b of normalizedBookings) {
        if (mergedBookings.length === 0) {
            mergedBookings.push({ ...b });
        } else {
            const prev = mergedBookings[mergedBookings.length - 1];
            if (b.start <= prev.end) {
                prev.end = Math.max(prev.end, b.end);
            } else {
                mergedBookings.push({ ...b });
            }
        }
    }

    // Extract free time gaps between operating hours and booked appointments
    const freeTimes = [];
    let currentTime = startLimit;

    for (const booking of mergedBookings) {
        if (booking.start > currentTime) {
            freeTimes.push({
                startTime: minutesToTime(currentTime),
                endTime: minutesToTime(booking.start),
                durationMinutes: booking.start - currentTime,
            });
        }
        currentTime = Math.max(currentTime, booking.end);
    }

    if (currentTime < endLimit) {
        freeTimes.push({
            startTime: minutesToTime(currentTime),
            endTime: minutesToTime(endLimit),
            durationMinutes: endLimit - currentTime,
        });
    }

    return freeTimes;
};

// Calculates available booking slots within an operating time window.
export const calculateOpenSlots = ({
    openTime,
    closeTime,
    requiredDuration,
    existingBookings = [],
    slotInterval = 15,
}) => {
    const duration = Number(requiredDuration);
    if (!duration || duration <= 0) {
        return [];
    }

    const startLimit = typeof openTime === 'number' ? openTime : timeToMinutes(openTime);
    const endLimit = typeof closeTime === 'number' ? closeTime : timeToMinutes(closeTime);

    if (startLimit >= endLimit || startLimit + duration > endLimit) {
        return [];
    }

    const interval = Math.max(1, Number(slotInterval) || 15);

    // Normalize existing bookings to minutes intervals [{ start, end }]
    const normalizedBookings = (existingBookings || []).map((booking) => {
        let start = 0;
        let end = 0;

        if (typeof booking.start === 'number') {
            start = booking.start;
        } else if (typeof booking.start_time === 'string') {
            start = timeToMinutes(booking.start_time);
        } else if (typeof booking.startTime === 'string') {
            start = timeToMinutes(booking.startTime);
        } else if (typeof booking.start === 'string') {
            start = timeToMinutes(booking.start);
        }

        if (typeof booking.end === 'number') {
            end = booking.end;
        } else if (typeof booking.end_time === 'string') {
            end = timeToMinutes(booking.end_time);
        } else if (typeof booking.endTime === 'string') {
            end = timeToMinutes(booking.endTime);
        } else if (typeof booking.end === 'string') {
            end = timeToMinutes(booking.end);
        }

        return { start, end };
    });

    const availableSlots = [];

    // Iterate through working window in slotInterval increments
    for (let slotStart = startLimit; slotStart + duration <= endLimit; slotStart += interval) {
        const slotEnd = slotStart + duration;

        // Overlap condition: slotStart < booking.end && slotEnd > booking.start
        const hasOverlap = normalizedBookings.some((booking) => {
            return slotStart < booking.end && slotEnd > booking.start;
        });

        if (!hasOverlap) {
            availableSlots.push({
                startTime: minutesToTime(slotStart),
                endTime: minutesToTime(slotEnd),
            });
        }
    }

    return availableSlots;
};

export default {
    timeToMinutes,
    minutesToTime,
    calculateFreeTimes,
    calculateOpenSlots,
};
