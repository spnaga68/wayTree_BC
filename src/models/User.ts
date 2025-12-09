import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  role?: "founder" | "investor" | "mentor" | "cxo" | "service" | "other";
  primaryGoal?:
  | "fundraising"
  | "clients"
  | "cofounder"
  | "hiring"
  | "learn"
  | "other";
  company?: string;
  website?: string;
  location?: string;
  oneLiner?: string;
  photoUrl?: string;
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
      enum: ["founder", "investor", "mentor", "cxo", "service", "other"],
      required: false,
    },
    primaryGoal: {
      type: String,
      enum: ["fundraising", "clients", "cofounder", "hiring", "learn", "other"],
      required: false,
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
    connectionCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>("User", UserSchema);
