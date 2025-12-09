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
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
    {
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
        tags: [
            {
                type: String,
                trim: true,
            },
        ],
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
eventSchema.index({ createdBy: 1 });
eventSchema.index({ dateTime: 1 });

export const Event = mongoose.model<IEvent>("Event", eventSchema);
