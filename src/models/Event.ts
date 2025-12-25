import mongoose, { Document, Schema } from "mongoose";

export interface IEvent extends Document {
    name: string;
    headline?: string;
    description: string;
    dateTime: Date;
    location: string;
    photos: string[]; // Base64 strings
    videos: string[]; // URLs or Base64 (limited support)
    tags: string[];
    isVerified: boolean;
    createdBy: mongoose.Types.ObjectId;
    attendees: mongoose.Types.ObjectId[];
    eventEmbedding?: number[];
    attachments?: {
        url: string;
        name: string;
        type?: string;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
    {
        // ... existing fields ...
        name: {
            type: String,
            required: true,
            trim: true,
        },
        headline: {
            type: String,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        dateTime: {
            type: Date,
            required: true,
        },
        location: {
            type: String,
            required: true,
        },
        photos: [
            {
                type: String, // Base64 strings
            },
        ],
        videos: [
            {
                type: String,
            },
        ],
        attachments: [
            {
                url: { type: String, required: true },
                name: { type: String, required: true },
                type: { type: String }
            }
        ],
        tags: [
            {
                type: String,
                trim: true,
            },
        ],
        isVerified: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        attendees: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        eventEmbedding: [
            {
                type: Number,
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Indexes
eventSchema.index({ createdBy: 1 });
eventSchema.index({ dateTime: 1 });

export const Event = mongoose.model<IEvent>("Event", eventSchema);
