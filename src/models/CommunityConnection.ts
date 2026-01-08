
import mongoose, { Schema, Document } from 'mongoose';

// Interface is same as EventConnection (extended)
export interface ICommunityConnection extends Document {
    eventId: mongoose.Types.ObjectId;
    organizerId: mongoose.Types.ObjectId;
    participantId: mongoose.Types.ObjectId;
    joinedAt: Date;
    // Added fields
    name?: string;
    phoneNumber?: string;
    source?: string;
    isJoined?: boolean;
    isCommunity?: boolean;
}

const CommunityConnectionSchema: Schema = new Schema({
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    participantId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // Equivalent to userId
    joinedAt: { type: Date, default: Date.now },
    // Added fields
    name: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    source: { type: String, default: 'join' },
    isJoined: { type: Boolean, default: true },
    isCommunity: { type: Boolean, default: true },
});

// Explicitly use 'communityconnections' collection
export default mongoose.model<ICommunityConnection>('CommunityConnection', CommunityConnectionSchema, 'communityconnections');
