import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema({
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Host', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true }, // CREDIT (earning), DEBIT (withdrawal)
    description: { type: String, required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }, // If it's a credit from a booking
    withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'WithdrawalRequest' }, // If it's a debit from a withdrawal
    balanceAfter: { type: Number, required: true } // Snapshot of balance after this transaction
}, { timestamps: true });

walletTransactionSchema.index({ hostId: 1, createdAt: -1 });

export const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', walletTransactionSchema);
