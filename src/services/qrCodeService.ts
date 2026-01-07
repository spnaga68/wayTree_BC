import QRCode from "qrcode";
import { uploadToS3, deleteFromS3 } from "./s3Service";

/**
 * QR Code Service for generating and managing QR codes for network codes
 * QR codes are generated as Base64 data URLs and stored in MongoDB
 */
export class QRCodeService {
  /**
   * Generate QR code as Base64 string
   */
  static async generateQRCode(
    codeId: string,
    networkCodeData: {
      name: string;
      description: string;
      keywords: string[];
      autoConnect: boolean;
    }
  ): Promise<string> {
    try {
      // Create QR code data
      const qrData = {
        type: "network_code",
        codeId: codeId,
        name: networkCodeData.name,
        description: networkCodeData.description,
        keywords: networkCodeData.keywords,
        autoConnect: networkCodeData.autoConnect,
        joinUrl: `${process.env.APP_BASE_URL || "https://app.goalnet.com"}/join/${codeId}`,
        timestamp: new Date().toISOString(),
      };

      // Generate QR code as base64 data URL
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: "M",
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        width: 512,
      });

      // Upload to S3
      console.log(`📡 [QR-SERVICE] Uploading QR code for ${codeId} to S3...`);
      const matches = qrCodeDataURL.match(/^data:image\/png;base64,(.+)$/);
      if (matches && matches[1]) {
        const buffer = Buffer.from(matches[1], 'base64');
        const fileName = `qrcode_${codeId}_${Date.now()}.png`;
        const s3Url = await uploadToS3(buffer, fileName, 'image/png', 'network-codes');
        console.log(`✅ [QR-SERVICE] QR code S3 URL: ${s3Url}`);
        return s3Url;
      }

      return qrCodeDataURL; // Fallback to Base64 if regex fails
    } catch (error: any) {
      console.error("Error generating QR code:", error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Delete QR code from S3
   */
  static async deleteQRCode(qrCodeUrl: string): Promise<void> {
    if (!qrCodeUrl || qrCodeUrl.startsWith('data:')) return; // Ignore base64

    try {
      await deleteFromS3(qrCodeUrl);
      console.log(`🗑️ [QR-SERVICE] Deleted QR code from S3: ${qrCodeUrl}`);
    } catch (error) {
      console.error("Error deleting QR code:", error);
    }
  }

  /**
   * Update QR code (Regenerate)
   */
  static async updateQRCode(
    _oldQrCodeUrl: string,
    codeId: string,
    networkCodeData: {
      name: string;
      description: string;
      keywords: string[];
      autoConnect: boolean;
    }
  ): Promise<string> {
    return await this.generateQRCode(codeId, networkCodeData);
  }

  /**
   * Generate QR code for simple text/URL (utility method)
   */
  static async generateSimpleQRCode(
    data: string,
    _publicId?: string
  ): Promise<string> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(data, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
      });

      // Upload to S3
      const matches = qrCodeDataURL.match(/^data:image\/png;base64,(.+)$/);
      if (matches && matches[1]) {
        const buffer = Buffer.from(matches[1], 'base64');
        const fileName = `qrcode_simple_${Date.now()}.png`;
        return await uploadToS3(buffer, fileName, 'image/png', 'network-codes');
      }

      return qrCodeDataURL;
    } catch (error) {
      console.error("Error generating simple QR code:", error);
      throw new Error("Failed to generate QR code");
    }
  }
}
