import QRCode from "qrcode";

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

      return qrCodeDataURL;
    } catch (error: any) {
      console.error("Error generating QR code:", error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Delete QR code (No-op for Base64)
   */
  static async deleteQRCode(_qrCodeUrl: string): Promise<void> {
    // No-op since we are using Base64 strings stored in DB
    return;
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

      return qrCodeDataURL;
    } catch (error) {
      console.error("Error generating simple QR code:", error);
      throw new Error("Failed to generate QR code");
    }
  }
}
