import { User } from '../models/user.model.js';
import { Host } from '../models/Host.js';
import { Venue } from '../models/Venue.js';
import { Booking } from '../models/booking.model.js';
import { Payout } from '../models/Payout.js';
import { Media } from '../models/Media.js';
import { Coupon } from '../models/Coupon.js';
import { Waitlist } from '../models/Waitlist.js';
import { Staff } from '../models/Staff.js';
import { MenuItem } from '../models/MenuItem.js';
import { uploadToCloudinary } from '../config/cloudinary.config.js';
import { FoodOrder } from '../models/FoodOrder.js';
import { IncidentReport } from '../models/IncidentReport.js';
import { Review } from '../models/Review.js';
import { Gift } from '../models/Gift.js';
import { Event as EventModel } from '../models/Event.js';
import { cacheService } from '../services/cache.service.js';

// Cache TTL constants
const TTL = { profile: 300, dashboard: 120, list: 180, payments: 300 };
const ckey = (type, hostId) => `host:${type}:${hostId}`;

// --- HOST ACCOUNT PROFILE ---
export const getHostProfile = async (req, res, next) => {
    try {
        const hostId = req.user.id;
        console.log('[getHostProfile] 🔍 Fetching fresh data from DB for host:', hostId);

        let [hostUser, venue] = await Promise.all([
            Host.findById(hostId).select('-password -refreshToken').lean(),
            Venue.findOne({ hostId }).select('name address venueType _id').lean()
        ]);

        if (!hostUser) {
            const legacyUser = await User.findById(hostId).lean();
            if (legacyUser && ['host', 'HOST', 'superadmin', 'admin'].includes(legacyUser.role)) {
                const newHost = await Host.create({
                    _id: legacyUser._id, name: legacyUser.name || 'Migrated Host',
                    username: legacyUser.username || `host_${legacyUser._id.toString().slice(-5)}`,
                    email: legacyUser.email, phone: legacyUser.phone,
                    role: 'HOST', hostStatus: legacyUser.onboardingCompleted ? 'ACTIVE' : 'CREATED', isActive: true,
                });
                hostUser = newHost.toObject();
            }
        }

        if (!hostUser) return res.status(404).json({ success: false, message: 'Host not found' });

        const profileData = {
            name: hostUser.name || 'Anonymous Host',
            username: hostUser.username || '',
            profileImage: hostUser.profileImage || '',
            bio: '',
            brandName: venue?.name || '',
            location: hostUser.location?.address || venue?.address || '',
            hostType: venue?.venueType?.toLowerCase() || 'club',
            contactNumber: hostUser.phone || '',
            email: hostUser.email || '',
            instagram: '', website: '',
            venueId: venue?._id,
            hostStatus: hostUser.hostStatus || 'CREATED'
        };

        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.status(200).json({ success: true, data: profileData });
    } catch (error) { next(error); }
};

export const updateHostProfile = async (req, res, next) => {
    try {
        const { name, username, profileImage, bio, brandName, location, hostType, contactNumber, email, instagram, website } = req.body;
        const hostId = req.user.id;

        if (username) {
            const usernameLower = username.toLowerCase().trim();
            const existing = await Host.findOne({ username: usernameLower, _id: { $ne: hostId } }).select('_id').lean();
            if (existing) return res.status(400).json({ success: false, message: 'Username is already taken' });
        }

        const updatePayload = {};
        if (name !== undefined) updatePayload.name = name;
        if (username !== undefined) updatePayload.username = username.toLowerCase().trim();
        if (location !== undefined) updatePayload['location.address'] = location;
        if (contactNumber !== undefined) updatePayload.phone = contactNumber;
        if (email !== undefined) updatePayload.email = email;

        let finalProfileImage = profileImage;
        if (finalProfileImage && (finalProfileImage.startsWith('data:image') || finalProfileImage.startsWith('file://'))) {
            try {
                finalProfileImage = await uploadToCloudinary(finalProfileImage, 'entry-club/hosts');
            } catch (e) { }
        }
        if (finalProfileImage !== undefined) updatePayload.profileImage = finalProfileImage;

        const hostUser = await Host.findByIdAndUpdate(hostId, { $set: updatePayload }, { new: true }).select('name username profileImage').lean();
        if (!hostUser) return res.status(404).json({ success: false, message: 'Host not found' });

        await cacheService.delete(ckey('profile', hostId));
        res.status(200).json({ success: true, message: 'Profile updated successfully', data: hostUser });
    } catch (error) { next(error); }
};

export const completeProfile = async (req, res, next) => {
    try {
        const { aadhaarUrl, panUrl, profileImage, name, dob, location } = req.body;
        const hostId = req.user.id;

        const host = await Host.findById(hostId);
        if (!host) return res.status(404).json({ success: false, message: 'Host not found' });

        if (host.hostStatus !== 'INVITED' && host.hostStatus !== 'CREATED') {
            return res.status(403).json({ success: false, message: 'Onboarding is only available for invited hosts.' });
        }

        host.hostStatus = 'KYC_PENDING';
        host.kycSubmitted = true;
        host.profileCompletion = 100;
        if (name) host.name = name;
        if (dob) host.dateOfBirth = dob;
        if (location) {
            host.location = host.location || {};
            host.location.address = location;
        }

        await host.save();
        await cacheService.delete(ckey('profile', hostId));

        res.status(200).json({
            success: true,
            message: 'Profile submitted for review successfully!',
            data: { id: host._id, hostStatus: 'KYC_PENDING', profileCompletion: 100 }
        });

        (async () => {
            try {
                const uploadTask = async (data, folder) => {
                    if (data && data.startsWith('data:')) return await uploadToCloudinary(data, folder);
                    return data;
                };

                const [finalProfileImage, finalAadhaar, finalPan] = await Promise.all([
                    uploadTask(profileImage, 'host-profiles'),
                    uploadTask(aadhaarUrl, 'host-kyc'),
                    uploadTask(panUrl, 'host-kyc')
                ]);

                const updateData = {};
                if (finalProfileImage) updateData.profileImage = finalProfileImage;
                
                const kycDocs = [];
                if (finalAadhaar) kycDocs.push({ type: 'AADHAR', url: finalAadhaar, status: 'PENDING', uploadedAt: new Date() });
                if (finalPan) kycDocs.push({ type: 'PAN', url: finalPan, status: 'PENDING', uploadedAt: new Date() });
                
                if (kycDocs.length > 0) updateData['kyc.documents'] = kycDocs;

                await Host.findByIdAndUpdate(hostId, { $set: updateData });
                await cacheService.delete(ckey('profile', hostId));

                const existingVenue = await Venue.findOne({ hostId: host._id });
                if (!existingVenue) {
                    await Venue.create({
                        hostId: host._id, name: name || 'My Venue', venueType: 'Nightclub',
                        address: location || '', heroImage: '', images: [], amenities: []
                    });
                }
            } catch (bgError) { console.error('[completeProfile] BG error:', bgError); }
        })();
    } catch (error) { next(error); }
};

export const getVenueProfile = async (req, res, next) => {
    try {
        const hostId = req.user.id;
        const venue = await Venue.findOne({ hostId }).lean();
        res.status(200).json({ success: true, data: venue || {} });
    } catch (error) { next(error); }
};

export const updateVenueProfile = async (req, res, next) => {
    try {
        const { name, venueType, description, address, capacity, openingTime, closingTime, rules, heroImage, images, amenities, menu, coordinates } = req.body;
        const updateObj = { name, venueType, description, address, capacity, openingTime, closingTime, rules, heroImage, images, amenities, menu, coordinates };
        
        const venue = await Venue.findOneAndUpdate(
            { hostId: req.user.id },
            { $set: updateObj },
            { new: true, upsert: true }
        );

        await cacheService.delete(ckey('venue', req.user.id));
        res.status(200).json({ success: true, message: 'Venue profile updated successfully', data: venue });
    } catch (error) { next(error); }
};

export const getPayments = async (req, res, next) => {
    try {
        const bookings = await Booking.find({ hostId: req.user.id })
            .populate('userId', 'name profileImage')
            .sort({ createdAt: -1 })
            .lean();

        const data = bookings.map(b => ({
            id: b._id, memberName: b.userId?.name || 'Unknown',
            memberImage: b.userId?.profileImage || '',
            plan: b.ticketType || 'Standard', amount: b.pricePaid || 0,
            status: b.paymentStatus === 'paid' ? 'Success' : 'Pending',
            date: b.createdAt
        }));
        res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

export const getPayouts = async (req, res, next) => {
    try {
        const hostId = req.user.id;
        const [payouts, earningsAgg] = await Promise.all([
            Payout.find({ hostId }).sort({ date: -1 }).lean(),
            Booking.aggregate([
                { $match: { hostId: new (await import('mongoose')).default.Types.ObjectId(hostId), paymentStatus: 'paid' } },
                { $group: { _id: null, totalEarnings: { $sum: "$pricePaid" } } }
            ])
        ]);

        const totalEarnings = earningsAgg[0] ? earningsAgg[0].totalEarnings : 0;
        const completedPayouts = payouts.filter(p => p.status === 'Success').reduce((sum, p) => sum + p.amount, 0);

        res.status(200).json({
            success: true,
            data: {
                history: payouts,
                summary: { totalEarnings, pendingPayout: Math.max(0, totalEarnings - completedPayouts), completedPayout: completedPayouts }
            }
        });
    } catch (error) { next(error); }
};

export const getStaff = async (req, res, next) => {
    try {
        const staff = await Staff.find({ hostId: req.user.id }).select('-password').lean();
        res.status(200).json({ success: true, data: staff });
    } catch (error) { next(error); }
};

export const addStaff = async (req, res, next) => {
    try {
        const staff = await Staff.create({ ...req.body, hostId: req.user.id, role: 'STAFF' });
        res.status(201).json({ success: true, data: staff });
    } catch (error) { next(error); }
};

export const removeStaff = async (req, res, next) => {
    try {
        await Staff.findOneAndDelete({ _id: req.params.staffId, hostId: req.user.id });
        res.status(200).json({ success: true, message: 'Staff removed' });
    } catch (error) { next(error); }
};

export const updateStaff = async (req, res, next) => {
    try {
        const staff = await Staff.findOneAndUpdate({ _id: req.params.staffId, hostId: req.user.id }, { $set: req.body }, { new: true });
        res.status(200).json({ success: true, data: staff });
    } catch (error) { next(error); }
};

export const getWaitlist = async (req, res, next) => {
    try {
        const waitlist = await Waitlist.find({ hostId: req.user.id }).populate('userId', 'name profileImage').lean();
        res.status(200).json({ success: true, data: waitlist });
    } catch (error) { next(error); }
};

export const processWaitlist = async (req, res, next) => {
    try {
        const entry = await Waitlist.findOneAndUpdate({ _id: req.params.waitlistId, hostId: req.user.id }, { status: req.body.action }, { new: true });
        res.status(200).json({ success: true, data: entry });
    } catch (error) { next(error); }
};

export const getIncidents = async (req, res, next) => {
    try {
        const venue = await Venue.findOne({ hostId: req.user.id }).select('_id').lean();
        if (!venue) return res.status(200).json({ success: true, data: [] });
        const incidents = await IncidentReport.find({ venueId: venue._id }).populate('userId', 'name profileImage').lean();
        res.status(200).json({ success: true, data: incidents });
    } catch (error) { next(error); }
};

export const resolveIncident = async (req, res, next) => {
    try {
        const incident = await IncidentReport.findByIdAndUpdate(req.params.incidentId, { status: 'resolved' }, { new: true });
        res.status(200).json({ success: true, data: incident });
    } catch (error) { next(error); }
};

export const deleteIncident = async (req, res, next) => {
    try {
        await IncidentReport.findByIdAndDelete(req.params.incidentId);
        res.status(200).json({ success: true, message: 'Deleted' });
    } catch (error) { next(error); }
};

export const submitReview = async (req, res, next) => {
    try {
        const review = await Review.create({ ...req.body, userId: req.user.id });
        res.status(201).json({ success: true, data: review });
    } catch (error) { next(error); }
};

export const getReviews = async (req, res, next) => {
    try {
        const reviews = await Review.find({ hostId: req.user.id }).populate('userId', 'name profileImage').lean();
        res.status(200).json({ success: true, data: reviews });
    } catch (error) { next(error); }
};

export const getMedia = async (req, res, next) => {
    try {
        const media = await Media.find({ hostId: req.user.id }).lean();
        res.status(200).json({ success: true, data: media });
    } catch (error) { next(error); }
};

export const uploadMedia = async (req, res, next) => {
    try {
        const media = await Media.create({ ...req.body, hostId: req.user.id, status: 'Approved' });
        res.status(201).json({ success: true, data: media });
    } catch (error) { next(error); }
};

export const removeMedia = async (req, res, next) => {
    try {
        await Media.findOneAndDelete({ _id: req.params.mediaId, hostId: req.user.id });
        res.status(200).json({ success: true, message: 'Removed' });
    } catch (error) { next(error); }
};

export const getMenuItems = async (req, res, next) => {
    try {
        const items = await MenuItem.find({ hostId: req.user.id }).lean();
        res.status(200).json({ success: true, data: items });
    } catch (error) { next(error); }
};

export const addMenuItem = async (req, res, next) => {
    try {
        const item = await MenuItem.create({ ...req.body, hostId: req.user.id });
        res.status(201).json({ success: true, data: item });
    } catch (error) { next(error); }
};

export const updateMenuItem = async (req, res, next) => {
    try {
        const item = await MenuItem.findOneAndUpdate({ _id: req.params.itemId, hostId: req.user.id }, { $set: req.body }, { new: true });
        res.status(200).json({ success: true, data: item });
    } catch (error) { next(error); }
};

export const removeMenuItem = async (req, res, next) => {
    try {
        await MenuItem.findOneAndDelete({ _id: req.params.itemId, hostId: req.user.id });
        res.status(200).json({ success: true, message: 'Removed' });
    } catch (error) { next(error); }
};

export const getCoupons = async (req, res, next) => {
    try {
        const coupons = await Coupon.find({ hostId: req.user.id }).lean();
        res.status(200).json({ success: true, data: coupons });
    } catch (error) { next(error); }
};

export const createCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.create({ ...req.body, hostId: req.user.id });
        res.status(201).json({ success: true, data: coupon });
    } catch (error) { next(error); }
};

export const removeCoupon = async (req, res, next) => {
    try {
        await Coupon.findOneAndDelete({ _id: req.params.couponId, hostId: req.user.id });
        res.status(200).json({ success: true, message: 'Removed' });
    } catch (error) { next(error); }
};

export const approveMedia = async (req, res, next) => {
    try {
        await Media.updateMany({ hostId: req.user.id, status: 'Pending' }, { status: 'Approved' });
        res.status(200).json({ success: true, message: 'Approved' });
    } catch (error) { next(error); }
};

export const getDashboardStats = async (req, res, next) => {
    try {
        const [bookingStats] = await Promise.all([
            Booking.aggregate([
                { $match: { hostId: new (await import('mongoose')).default.Types.ObjectId(req.user.id), paymentStatus: 'paid' } },
                { $group: { _id: null, totalRevenue: { $sum: '$pricePaid' }, ticketsSold: { $sum: 1 } } }
            ])
        ]);
        const bData = bookingStats[0] || { totalRevenue: 0, ticketsSold: 0 };
        res.status(200).json({ success: true, data: { totalRevenue: bData.totalRevenue, ticketsSold: bData.ticketsSold } });
    } catch (error) { next(error); }
};

export const getOrders = async (req, res, next) => {
    try {
        const orders = await FoodOrder.find({ hostId: req.user.id }).populate('userId', 'name phone profileImage').sort({ createdAt: -1 }).lean();
        res.status(200).json({ success: true, data: orders });
    } catch (error) { next(error); }
};

export const updateOrderStatus = async (req, res, next) => {
    try {
        const order = await FoodOrder.findByIdAndUpdate(req.params.orderId, { status: req.body.status }, { new: true });
        res.status(200).json({ success: true, data: order });
    } catch (error) { next(error); }
};

export const getHostGifts = async (req, res, next) => {
    try {
        const gifts = await Gift.find({ hostId: req.user.id }).lean();
        res.status(200).json({ success: true, data: gifts });
    } catch (error) { next(error); }
};

export const createHostGift = async (req, res, next) => {
    try {
        const gift = await Gift.create({ ...req.body, hostId: req.user.id });
        res.status(201).json({ success: true, data: gift });
    } catch (error) { next(error); }
};

export const updateHostGift = async (req, res, next) => {
    try {
        const gift = await Gift.findOneAndUpdate({ _id: req.params.giftId, hostId: req.user.id }, { $set: req.body }, { new: true });
        res.status(200).json({ success: true, data: gift });
    } catch (error) { next(error); }
};

export const removeHostGift = async (req, res, next) => {
    try {
        await Gift.findOneAndDelete({ _id: req.params.giftId, hostId: req.user.id });
        res.status(200).json({ success: true, message: 'Removed' });
    } catch (error) { next(error); }
};

export const submitIncidentReport = async (req, res, next) => {
    try {
        const report = await IncidentReport.create({ ...req.body, userId: req.user.id });
        res.status(201).json({ success: true, data: report });
    } catch (error) { next(error); }
};

export const updateBankDetails = async (req, res, next) => {
    try {
        const { accountHolderName, accountNumber, ifsc, bankName } = req.body;
        const hostId = req.user.id;
        const updatedHost = await Host.findByIdAndUpdate(hostId, { $set: { 'bankDetails.accountHolderName': accountHolderName, 'bankDetails.accountNumber': accountNumber, 'bankDetails.ifsc': ifsc, 'bankDetails.bankName': bankName, 'bankDetails.isVerified': true } }, { new: true });
        
        if (!updatedHost.razorpayAccountId) {
            try {
                const { default: Razorpay } = await import('razorpay');
                const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
                const rzpAccount = await razorpay.accounts.create({ email: updatedHost.email, type: 'route', contact_name: accountHolderName, legal_entity_type: 'individual', bank_account: { account_number: accountNumber, ifsc_code: ifsc, beneficiary_name: accountHolderName } });
                if (rzpAccount?.id) { updatedHost.razorpayAccountId = rzpAccount.id; await updatedHost.save(); }
            } catch (e) { console.error('Razorpay Error:', e.message); }
        }
        res.status(200).json({ success: true, data: updatedHost.bankDetails });
    } catch (error) { next(error); }
};

export const requestWithdrawal = async (req, res, next) => {
    try {
        const hostId = req.user.id;
        const { amount } = req.body;
        const withdrawAmount = Number(amount);
        const updatedHost = await Host.findOneAndUpdate({ _id: hostId, currentBalance: { $gte: withdrawAmount } }, { $inc: { currentBalance: -withdrawAmount } }, { new: true });
        if (!updatedHost) return res.status(400).json({ success: false, message: 'Insufficient balance' });
        
        const payout = await Payout.create({ hostId, amount: withdrawAmount, status: 'Pending', date: new Date() });
        res.status(200).json({ success: true, message: 'Withdrawal requested', data: { newBalance: updatedHost.currentBalance, payoutId: payout._id } });
    } catch (error) { next(error); }
};
