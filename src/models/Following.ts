import mongoose, { Document, Schema } from "mongoose";

export interface IFollowing extends Document {
    followerId: mongoose.Types.ObjectId;
    followingId: mongoose.Types.ObjectId;
    type: string;
    tags: string[];
    createdAt: Date;
}

const FollowingSchema = new Schema<IFollowing>(
    {
        followerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        followingId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            default: "profile",
        },
        tags: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

// Ensure a user can only follow another user once
FollowingSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

export const Following = mongoose.model<IFollowing>("Following", FollowingSchema);
