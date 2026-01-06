import mongoose, { Document, Schema } from "mongoose";

console.log("LOADING EVENT SCHEMA DEFINITION v3 - " + new Date().toISOString());

export interface IEvent extends Document {
    name: string;
    headline?: string;
    description: string;
    dateTime?: Date; // Optional for communities
    location: string;
    photos: string[]; // Base64 strings
    videos: string[]; // URLs or Base64 (limited support)
    tags: string[];
    pdfFiles?: string[]; // Array of Base64 encoded PDFs
    pdfExtractedTexts?: string[]; // Array of extracted texts from PDFs
    isEvent: boolean;
    isCommunity: boolean;
    isVerified: boolean;
    isAdmin: boolean;
    createdBy: mongoose.Types.ObjectId;
    attendees: mongoose.Types.ObjectId[];
    metadataEmbedding?: number[]; // NEW: Embeddings for just basic info
    eventEmbedding?: number[];    // Now primarily for PDF-related/Combined info
    pdfChunks?: {
        chunkId: string;
        text: string;
        embedding: number[];
    }[];
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
            required: false, // Optional for communities
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
        pdfFiles: [
            {
                type: String, // Base64 encoded PDFs
            },
        ],
        pdfExtractedTexts: [
            {
                type: String, // Extracted texts from PDFs
            },
        ],
        isEvent: {
            type: Boolean,
            default: true,
        },
        isCommunity: {
            type: Boolean,
            default: false,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        isAdmin: {
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
        metadataEmbedding: [
            {
                type: Number,
            },
        ],
        eventEmbedding: [
            {
                type: Number,
            },
        ],
        pdfChunks: [
            {
                chunkId: String,
                text: String,
                embedding: [Number]
            }
        ],
    },
    {
        timestamps: true,
    }
);

// Indexes
eventSchema.index({ createdBy: 1 });
eventSchema.index({ dateTime: 1 });
eventSchema.index({ isEvent: 1 });
eventSchema.index({ isCommunity: 1 });
eventSchema.index({ isVerified: 1 });

// Post-save hook to verify data persistence
eventSchema.post('save', function (doc) {
    console.log('📝 Event POST-SAVE HOOK - Document saved to DB:');
    console.log('   - _id:', doc._id);
    console.log('   - name:', doc.name);
    console.log('   - isEvent:', doc.isEvent);
    console.log('   - isCommunity:', doc.isCommunity);
    console.log('   - isVerified:', doc.isVerified);
});

export const Event = mongoose.model<IEvent>("Event", eventSchema);
