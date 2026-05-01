import { Host } from '../models/Host.js';
import mongoose from 'mongoose';

// ── Models (create inline if not exist) ─────────────────────────────────────
const withdrawalRequestSchema = new mongoose.Schema({
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Host', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'PAID', 'REJECTED'], default: 'PENDING' },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        upiId: String,
        bankName: String
    },
    adminNote: String,
    payoutId: String,
}, { timestamps: true });

const walletTransactionSchema = new mongoose.Schema({
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Host', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    description: String,
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    withdrawalId: { type: mongoose.Schema.Types.ObjectId },
    balanceAfter: Number,
}, { timestamps: true });

const WithdrawalRequest = mongoose.models.WithdrawalRequest || mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', walletTransactionSchema);

// ── GET WALLET DETAILS ──────────────────────────────────────────────────────
export const getWalletDetails = async (req, res, next) => {
    try {
        const hostId = req.user.id;
        const host = await Host.findById(hostId).select('wallet bankDetails').lean();

        if (!host) {
            return res.status(404).json({ success: false, message: 'Host not found' });
        }

        const transactions = await WalletTransaction.find({ hostId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        const pendingWithdrawals = await WithdrawalRequest.find({ hostId, status: 'PENDING' })
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            data: {
                wallet: host.wallet || { balance: 0, totalEarned: 0, pendingWithdrawal: 0 },
                bankDetails: host.bankDetails || {},
                transactions,
                pendingWithdrawals
            }
        });
    } catch (error) {
        next(error);
    }
};

// ── UPDATE BANK DETAILS ─────────────────────────────────────────────────────
export const updateBankDetails = async (req, res, next) => {
    try {
        const hostId = req.user.id;
        const { accountNumber, ifscCode, accountHolderName, upiId, bankName } = req.body;

        const host = await Host.findByIdAndUpdate(
            hostId,
            {
                bankDetails: {
                    accountNumber,
                    ifscCode,
                    accountHolderName,
                    upiId,
                    bankName
                }
            },
            { new: true }
        ).select('bankDetails').lean();

        if (!host) {
            return res.status(404).json({ success: false, message: 'Host not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Bank details updated successfully',
            data: host.bankDetails
        });
    } catch (error) {
        next(error);
    }
};

// ── REQUEST WITHDRAWAL ──────────────────────────────────────────────────────
export const requestWithdrawal = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const hostId = req.user.id;
        const { amount } = req.body;

        const amountNum = Number(amount);
        if (!amountNum || amountNum <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
        }

        const host = await Host.findById(hostId).session(session);
        if (!host) {
            throw new Error('Host not found');
        }

        if (!host.wallet || host.wallet.balance < amountNum) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }

        host.wallet.balance -= amountNum;
        host.wallet.pendingWithdrawal += amountNum;
        await host.save({ session });

        const withdrawal = await WithdrawalRequest.create([{
            hostId,
            amount: amountNum,
            status: 'PENDING',
            bankDetails: host.bankDetails
        }], { session });

        await WalletTransaction.create([{
            hostId,
            amount: -amountNum,
            type: 'DEBIT',
            description: `Withdrawal Request #${withdrawal[0]._id.toString().slice(-6)}`,
            withdrawalId: withdrawal[0]._id,
            balanceAfter: host.wallet.balance
        }], { session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data: withdrawal[0]
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};
