
import express from 'express';
import multer from 'multer';
import {
  toggleEventParticipation,
  checkEventParticipation,
  getEventParticipants,
  addManualMember,
  uploadMembersExcel
} from '../controllers/eventConnectionController';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
