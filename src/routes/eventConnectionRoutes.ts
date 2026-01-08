
import express from 'express';
import multer from 'multer';
import { invalidateCache } from "../middleware/cacheMiddleware";
import {
  toggleEventParticipation,
  checkEventParticipation,
  getEventParticipants,
  addManualMember,
  uploadMembersExcel
} from '../controllers/eventConnectionController';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });



// Invalidate event cache on connection changes
router.use(invalidateCache('route:/api/events'));

// Toggle event participation (join/leave)
router.post('/toggle-participation', toggleEventParticipation);

// Check if user has joined an event
router.get('/check/:eventId/:participantId', checkEventParticipation);

// Get all participants for an event
router.get('/participants/:eventId', getEventParticipants);

// Manual add member
router.post('/add-member', addManualMember);

// Upload members from Excel
router.post('/upload-members', upload.single('file'), uploadMembersExcel);

export default router;
