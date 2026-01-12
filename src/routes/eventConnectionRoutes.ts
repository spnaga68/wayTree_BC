
import express from 'express';
import multer from 'multer';
import { invalidateCache } from "../middleware/cacheMiddleware";
import {
  toggleEventParticipation,
  checkEventParticipation,
  getEventParticipants,
  addManualMember,
  askAssistant
} from '../controllers/eventConnectionController';
import {
  addMembersFromJSON,
  addSingleMember,
  updateMemberProfile,
  removeMemberFromEvent
} from '../controllers/memberManagementController';
import { uploadMembersExcelEnhanced } from '../controllers/excelUploadController';

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

// Upload members from Excel (uses MemberManagementService with embeddings)
router.post('/upload-members', upload.single('file'), uploadMembersExcelEnhanced);

// ========== NEW MEMBER MANAGEMENT ROUTES ==========

// Add members from JSON array (bulk upload)
router.post('/add-members-json', addMembersFromJSON);

// Add a single member manually (enhanced version)
router.post('/add-member-enhanced', addSingleMember);

// Update member profile and regenerate embedding
router.put('/update-member', updateMemberProfile);

// Remove member from event and delete embedding
router.delete('/remove-member', removeMemberFromEvent);

// Ask Event Assistant
router.post('/ask', askAssistant);

export default router;
