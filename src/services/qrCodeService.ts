import QRCode from "qrcode";
import fs from "fs";
import path from "path";

/**
 * QR Code Service for generating and managing QR codes for network codes
 */
export class QRCodeService {
  private static qrCodeDir = path.join(process.cwd(), "public", "qr-codes");

  /**
   * Initialize QR code directory
   */
  static init() {
    // Create directories if they don't exist
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    if (!fs.existsSync(this.qrCodeDir)) {
      fs.mkdirSync(this.qrCodeDir, { recursive: true });
    }
  }

  /**
   * Generate QR code for network code
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
      this.init();

      // Create QR code data - you can customize this format based on your app needs
      const qrData = {
        type: "network_code",
        codeId: codeId,
        name: networkCodeData.name,
        description: networkCodeData.description,
        keywords: networkCodeData.keywords,
        autoConnect: networkCodeData.autoConnect,
        joinUrl: `${
          process.env.APP_BASE_URL || "https://app.goalnet.com"
        }/join/${codeId}`,
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
        width: 256,
      });

      // Convert base64 to buffer and save as file
      const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // Generate filename
      const filename = `${codeId}-${Date.now()}.png`;
      const filePath = path.join(this.qrCodeDir, filename);

      // Save file
      fs.writeFileSync(filePath, buffer);

      // Return public URL
      const baseUrl = process.env.BASE_URL || "http://localhost:3000";
      return `${baseUrl}/qr-codes/${filename}`;
    } catch (error) {
      console.error("Error generating QR code:", error);
      throw new Error("Failed to generate QR code");
    }
  }

  /**
   * Delete QR code file
   */
  static deleteQRCode(qrCodeUrl: string): void {
    try {
      const filename = path.basename(qrCodeUrl);
      const filePath = path.join(this.qrCodeDir, filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error("Error deleting QR code file:", error);
    }
  }

  /**
   * Update QR code (delete old and create new)
   */
  static async updateQRCode(
    oldQrCodeUrl: string,
    codeId: string,
    networkCodeData: {
      name: string;
      description: string;
      keywords: string[];
      autoConnect: boolean;
    }
  ): Promise<string> {
    // Delete old QR code
    if (oldQrCodeUrl) {
      this.deleteQRCode(oldQrCodeUrl);
    }

    // Generate new QR code
    return await this.generateQRCode(codeId, networkCodeData);
  }
}
