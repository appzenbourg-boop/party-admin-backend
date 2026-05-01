import { Host } from '../models/Host.js';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import mongoose from 'mongoose';

// ── GET ALL WITHDRAWAL REQUESTS (ADMIN) ──────────────────────────────────────
export const getAllWithdrawalRequests = async (req, res, next) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};

        const requests = await WithdrawalRequest.find(filter)
            .populate('hostId', 'name email phone profileImage')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            data: requests
        });
    } catch (error) {
        next(error);
    }
};

// ── APPROVE/REJECT WITHDRAWAL ───────────────────────────────────────────────
export const processWithdrawal = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { requestId } = req.params;
        const { status, adminNote, payoutId } = req.body; // status can be 'APPROVED', 'REJECTED', 'PAID'

        if (!['APPROVED', 'REJECTED', 'PAID'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const request = await WithdrawalRequest.findById(requestId).session(session);
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        if (request.status === 'PAID' || request.status === 'REJECTED') {
            return res.status(400).json({ success: false, message: 'Request already processed' });
        }

        const host = await Host.findById(request.hostId).session(session);
        if (!host) {
            throw new Error('Host not found');
        }

        if (status === 'REJECTED') {
            // Give money back to available balance from pending
            host.wallet.balance += request.amount;
            host.wallet.pendingWithdrawal -= request.amount;
            
            // Create CREDIT transaction to restore balance
            await WalletTransaction.create([{
                hostId: host._id,
                amount: request.amount,
                type: 'CREDIT',
                description: `Rejected Withdrawal Refund: #${request._id.toString().slice(-6)}`,
                withdrawalId: request._id,
                balanceAfter: host.wallet.balance
            }], { session });
        } else if (status === 'PAID') {
            // Deduct from pendingWithdrawal permanently
            host.wallet.pendingWithdrawal -= request.amount;
            request.processedAt = new Date();
        }

        request.status = status;
        request.adminNote = adminNote || request.adminNote;
        request.payoutId = payoutId || request.payoutId;

        await host.save({ session });
        await request.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: `Withdrawal request ${status.toLowerCase()} successfully`,
            data: request
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};
