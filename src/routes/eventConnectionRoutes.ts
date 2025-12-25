import express from 'express';
import { 
  toggleEventParticipation,
  checkEventParticipation,
  getEventParticipants 
} from '../controllers/eventConnectionController';

const router = express.Router();

// Toggle event participation (join/leave)
router.post('/toggle', toggleEventParticipation);

// Check if user has joined an event
router.get('/check/:eventId/:participantId', checkEventParticipation);

// Get all participants for an event
router.get('/participants/:eventId', getEventParticipants);

export default router;
