import express from 'express';
import { 
    getAllWithdrawalRequests, 
    processWithdrawal 
} from '../controllers/admin.wallet.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect); // Ensure admin is authenticated

router.get('/requests', getAllWithdrawalRequests);
router.put('/requests/:requestId', processWithdrawal);

export default router;
