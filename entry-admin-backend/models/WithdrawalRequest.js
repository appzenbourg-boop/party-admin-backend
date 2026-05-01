import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema({
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Host', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAID'], default: 'PENDING' },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        upiId: String,
        bankName: String
    },
    adminNote: { type: String, default: '' },
    payoutId: { type: String, default: '' }, // Razorpay Payout ID or Transaction Reference
    processedAt: { type: Date }
}, { timestamps: true });

withdrawalRequestSchema.index({ hostId: 1, status: 1 });
withdrawalRequestSchema.index({ createdAt: -1 });

export const WithdrawalRequest = mongoose.models.WithdrawalRequest || mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
