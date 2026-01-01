import mongoose, { Document, Schema } from "mongoose";

export interface INetworkCode extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  codeId: string;
  description: string;
  keywords: string[];
  autoConnect: boolean;
  isActive: boolean;
  expirationTime: Date | null;
  qrCodeUrl: string;
  mediaUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}

const networkCodeSchema = new Schema<INetworkCode>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    codeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    keywords: [
      {
        type: String,
        trim: true,
      },
    ],
    autoConnect: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expirationTime: {
      type: Date,
      default: null,
    },
    qrCodeUrl: {
      type: String,
      required: true,
    },
    mediaUrls: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Index for faster querying
networkCodeSchema.index({ keywords: 1 });
networkCodeSchema.index({ userId: 1 });

export const NetworkCode = mongoose.model<INetworkCode>(
  "NetworkCode",
  networkCodeSchema
);
