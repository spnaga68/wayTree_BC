import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
    recipientId: mongoose.Types.ObjectId; // User who receives the notification
    actorId?: mongoose.Types.ObjectId;    // User who triggered the notification (optional for manual adds)
    externalActorName?: string;           // Name of actor if not a registered user
    eventId: mongoose.Types.ObjectId;     // Related event
    type: string;                         // 'EVENT_JOIN'
    isRead: boolean;
    isDismissed: boolean;
    createdAt: Date;
}

const notificationSchema = new Schema<INotification>({
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    externalActorName: { type: String, required: false },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    type: { type: String, enum: ['EVENT_JOIN'], required: true },
    isRead: { type: Boolean, default: false },
    isDismissed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
