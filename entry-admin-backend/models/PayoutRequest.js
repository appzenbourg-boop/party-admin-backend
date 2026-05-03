import mongoose from 'mongoose';

const payoutRequestSchema = new mongoose.Schema({
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Host', required: true },
    amount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['PENDING', 'COMPLETED', 'REJECTED'], 
        default: 'PENDING' 
    },
    // Bank/UPI details snapshot at time of request
    bankDetails: {
        name: { type: String },
        upiId: { type: String },
        accountNumber: { type: String },
        bankName: { type: String },
        ifsc: { type: String },
    },
    // Admin filled after paying
    transactionId: { type: String },
    note: { type: String },
    processedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

export const PayoutRequest = mongoose.model('PayoutRequest', payoutRequestSchema);
