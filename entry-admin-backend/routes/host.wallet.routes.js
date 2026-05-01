import express from 'express';
import { 
    getWalletDetails, 
    updateBankDetails, 
    requestWithdrawal 
} from '../controllers/host.wallet.controller.js';
import { protect, requireHost } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);
router.use(requireHost);

router.get('/details', getWalletDetails);
router.put('/bank-details', updateBankDetails);
router.post('/withdraw', requestWithdrawal);

export default router;
