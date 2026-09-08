import * as businessService from '../services/businessService.js';
import * as servicesService from '../services/servicesService.js';
import * as availabilityService from '../services/availabilityService.js';

// Public: List all registered businesses with optional ?city= or ?search= query parameters.
export const getBusinesses = async (req, res) => {
    try {
        const { search, city } = req.query;
        const businesses = await businessService.getAllBusinesses({ search, city });

        return res.status(200).json({
            count: businesses.length,
            businesses,
        });
    } catch (error) {
        console.error('Error fetching businesses:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Public: Get a single business with all its active services and opening hours.
export const getBusinessById = async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        if (!businessId || isNaN(businessId) || businessId <= 0) {
            return res.status(400).json({ error: 'Valid positive numeric business ID is required.' });
        }

        const business = await businessService.getBusinessProfile(businessId);
        if (!business) {
            return res.status(404).json({ error: 'Business not found.' });
        }

        return res.status(200).json(business);
    } catch (error) {
        console.error('Error fetching business profile:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Public: Get active services for a specific business.
export const getBusinessServices = async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        if (!businessId || isNaN(businessId) || businessId <= 0) {
            return res.status(400).json({ error: 'Valid positive numeric business ID is required.' });
        }

        const services = await servicesService.getActiveServices({ vendorId: businessId });
        return res.status(200).json({
            businessId,
            count: services.length,
            services,
        });
    } catch (error) {
        console.error('Error fetching business services:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// Public: Get weekly opening hours for a specific business.
export const getBusinessOpeningHours = async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        if (!businessId || isNaN(businessId) || businessId <= 0) {
            return res.status(400).json({ error: 'Valid positive numeric business ID is required.' });
        }

        const availability = await availabilityService.getBusinessAvailability(businessId);
        return res.status(200).json({
            businessId,
            count: availability.length,
            availability,
        });
    } catch (error) {
        console.error('Error fetching business availability:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

export default {
    getBusinesses,
    getBusinessById,
    getBusinessServices,
    getBusinessOpeningHours,
};
