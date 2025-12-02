import mongoose, { Document, Schema } from "mongoose";

export interface IConnection extends Document {
  networkCodeId: mongoose.Types.ObjectId;
  codeId: string;
  userId: mongoose.Types.ObjectId; // Owner of the network code
  requestorId: mongoose.Types.ObjectId; // User requesting to connect
  status: "pending" | "accepted" | "rejected";
  autoConnected: boolean; // Whether it was auto-connected due to autoConnect flag
  connectionDate: Date;
  message?: string; // Optional message from requestor
  createdAt: Date;
  updatedAt: Date;
}

const connectionSchema = new Schema<IConnection>(
  {
    networkCodeId: {
      type: Schema.Types.ObjectId,
      ref: "NetworkCode",
      required: true,
    },
    codeId: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    autoConnected: {
      type: Boolean,
      default: false,
    },
    connectionDate: {
      type: Date,
      default: Date.now,
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster querying
connectionSchema.index({ codeId: 1 });
connectionSchema.index({ userId: 1 });
connectionSchema.index({ requestorId: 1 });
connectionSchema.index({ networkCodeId: 1 });
connectionSchema.index({ status: 1 });

// Compound index to prevent duplicate connections
connectionSchema.index({ codeId: 1, requestorId: 1 }, { unique: true });

export const Connection = mongoose.model<IConnection>(
  "Connection",
  connectionSchema
);
