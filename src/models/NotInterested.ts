import mongoose from "mongoose";

const notInterestedSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    eventOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

// Prevent duplicate entries for the same event by the same user
notInterestedSchema.index({ eventId: 1, userId: 1 }, { unique: true });

export const NotInterested = mongoose.model('NotInterested', notInterestedSchema, 'not_interested');
