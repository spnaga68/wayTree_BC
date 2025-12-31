import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  role: string;  // ✅ Changed from enum to string - accepts any custom role
  primaryGoal: string;  // ✅ Changed from enum to string - accepts any custom goal
  company?: string;
  website?: string;
  location?: string;
  oneLiner?: string;
  photoUrl?: string;
  phoneNumber?: string;
  interests?: string[];
  skills?: string[];
  profileEmbedding?: number[];
  isBlocked?: boolean;
  connectionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    role: {
      type: String,
      required: false,  // ✅ Optional - filled during signup
    },
    primaryGoal: {
      type: String,
      required: false,  // ✅ Optional - filled during signup
    },
    company: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    oneLiner: {
      type: String,
      trim: true,
    },
    photoUrl: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    interests: [
      {
        type: String,
        trim: true,
      },
    ],
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    profileEmbedding: [
      {
        type: Number,
      },
    ],
    connectionCount: {
      type: Number,
      default: 0,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
UserSchema.index({ name: 1 });
UserSchema.index({ name: "text", email: "text", company: "text" });

export const User = mongoose.model<IUser>("User", UserSchema, "users");
