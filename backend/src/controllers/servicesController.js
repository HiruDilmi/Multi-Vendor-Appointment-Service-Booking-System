import * as servicesService from '../services/servicesService.js';

// create a service
export const createService = async (req, res) => {
    try {
        const userId = req.user?.id;
        const {
            title,
            description,
            duration_minutes,
            price,
        } = req.body || {};

        const serviceTitle = (title || '').trim();
        const serviceDuration = duration_minutes !== undefined ? Number(duration_minutes) : NaN;
        const servicePrice = price !== undefined ? Number(price) : NaN;

        if (!serviceTitle) {
            return res.status(400).json({ error: 'Service title is required.' });
        }

        if (isNaN(serviceDuration) || serviceDuration <= 0) {
            return res.status(400).json({ error: 'Duration in minutes must be a positive number.' });
        }

        if (isNaN(servicePrice) || servicePrice < 0) {
            return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
        }

        // Verify the logged-in vendor has a business profile
        const business = await servicesService.findBusinessByUserId(userId);
        if (!business) {
            return res.status(400).json({
                error: 'Business profile not found. Please register your business profile before creating services.',
            });
        }

        const newService = await servicesService.createService({
            businessId: business.business_id,
            title: serviceTitle,
            description: description ? description.trim() : null,
            duration_minutes: serviceDuration,
            price: servicePrice,
        });

        return res.status(201).json({
            message: 'Service created successfully.',
            service: newService,
        });
    } catch (error) {
        console.error('Error creating service:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// List all active services across vendors, or filter by ?vendorId=
export const getServices = async (req, res) => {
    try {
        const { vendorId } = req.query;
        const services = await servicesService.getActiveServices({ vendorId });

        return res.json({
            services,
            count: services.length,
        });
    } catch (error) {
        console.error('Error fetching services:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// fetch a single service by id
export const getServiceById = async (req, res) => {
    try {
        const serviceId = Number(req.params.id);
        const service = await servicesService.getServiceById(serviceId);
        if (!service) {
            return res.status(404).json({ error: 'Service not found.' });
        }
        return res.json(service);
    } catch (error) {
        console.error('Error fetching service by ID:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

// Update a service
export const updateService = async (req, res) => {
    try {
        const userId = req.user?.id;
        const serviceId = Number(req.params.id);

        if (!serviceId || isNaN(serviceId)) {
            return res.status(400).json({ error: 'Invalid service ID.' });
        }

        const existingService = await servicesService.getServiceById(serviceId);
        if (!existingService || !existingService.is_active) {
            return res.status(404).json({ error: 'Service not found.' });
        }

        // Verify logged-in vendor owns this service
        if (existingService.vendor_user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to update this service.' });
        }

        const {
            title,
            description,
            duration_minutes,
            price,
        } = req.body || {};

        const updates = {};

        if (title !== undefined) {
            const trimmedTitle = title.trim();
            if (!trimmedTitle) {
                return res.status(400).json({ error: 'Service title cannot be empty.' });
            }
            updates.title = trimmedTitle;
        }

        if (description !== undefined) {
            updates.description = description ? description.trim() : null;
        }

        if (duration_minutes !== undefined) {
            const numDuration = Number(duration_minutes);
            if (isNaN(numDuration) || numDuration <= 0) {
                return res.status(400).json({ error: 'Duration in minutes must be a positive number.' });
            }
            updates.duration_minutes = numDuration;
        }

        if (price !== undefined) {
            const numPrice = Number(price);
            if (isNaN(numPrice) || numPrice < 0) {
                return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
            }
            updates.price = numPrice;
        }

        const updated = await servicesService.updateService(serviceId, updates);

        return res.json({
            message: 'Service updated successfully.',
            service: updated,
        });
    } catch (error) {
        console.error('Error updating service:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Disable a service
export const disableService = async (req, res) => {
    try {
        const userId = req.user?.id;
        const serviceId = Number(req.params.id);

        if (!serviceId || isNaN(serviceId)) {
            return res.status(400).json({ error: 'Invalid service ID.' });
        }

        const existingService = await servicesService.getServiceById(serviceId);
        if (!existingService || !existingService.is_active) {
            return res.status(404).json({ error: 'Service not found.' });
        }

        // Verify logged-in vendor owns this service
        if (existingService.vendor_user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this service.' });
        }

        await servicesService.softDeleteService(serviceId);

        return res.json({
            message: 'Service deleted successfully.',
        });
    } catch (error) {
        console.error('Error deleting service:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};