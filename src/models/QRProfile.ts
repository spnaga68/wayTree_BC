import mongoose, { Schema, Document } from 'mongoose';

export interface IQRProfile extends Document {
    userId: mongoose.Types.ObjectId;
    title: string;
    description: string;
    context: string;
    qrCodeId: string;
    customMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}

const qrProfileSchema = new Schema<IQRProfile>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        context: {
            type: String,
            required: true,
            trim: true,
        },
        qrCodeId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        customMessage: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

export const QRProfile = mongoose.model<IQRProfile>('QRProfile', qrProfileSchema);
