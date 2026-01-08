import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { UserDocument } from "../models/Document";
import mongoose from "mongoose";

const router = Router();

/**
 * GET /me/documents
 * List all user documents
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const documents = await UserDocument.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ createdAt: -1 })
      .select("-__v");

    return res.json({
      documents: documents.map((doc) => ({
        id: doc._id,
        title: doc.title,
        type: doc.type,
        url: doc.url,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        description: doc.description,
        uploadedAt: doc.uploadedAt,
        createdAt: doc.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return res.status(500).json({ error: "Failed to fetch documents" });
  }
});

/**
 * POST /me/documents
 * Upload document or add link
 * - For links: Send title, type="link", url
 * - For files: Send title, type, url (can be empty, placeholder, or actual file URL)
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { title, type, url, fileSize, mimeType, description } = req.body;

    // Validation - title and type are always required
    if (!title || !type) {
      console.warn(`⚠️ [DOC UPLOAD] Missing title or type. Body keys: ${Object.keys(req.body)}`);
      return res.status(400).json({
        error: "Missing required fields",
        message: "title and type are required",
      });
    }

    if (url) {
      console.log(`📄 [DOC UPLOAD] Type: ${type}, Title: ${title}, URL length: ${url.length} chars`);
      if (url.startsWith('data:')) {
        console.log(`   - Data URI detected. Type: ${url.split(';')[0]}`);
      } else {
        console.log(`   - standard URL: ${url}`);
      }
    } else {
      console.log(`📄 [DOC UPLOAD] Type: ${type}, Title: ${title}, No URL provided (placeholder will be used)`);
    }

    const validTypes = [
      "pdf",
      "doc",
      "docx",
      "ppt",
      "pptx",
      "image",
      "link",
      "other",
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: "Invalid document type",
        message: `Type must be one of: ${validTypes.join(", ")}`,
      });
    }

    // For link type, URL is required
    if (type === "link" && !url) {
      return res.status(400).json({
        error: "Missing required field",
        message: "url is required for link type documents",
      });
    }

    // For file uploads, use provided URL or generate placeholder
    const documentUrl =
      url ||
      `pending-upload://${userId}/${Date.now()}-${title.replace(/\s+/g, "-")}`;

    const document = await UserDocument.create({
      userId: new mongoose.Types.ObjectId(userId),
      title,
      type,
      url: documentUrl,
      fileSize,
      mimeType,
      description,
    });

    return res.status(201).json({
      id: document._id,
      title: document.title,
      type: document.type,
      url: document.url,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      description: document.description,
      uploadedAt: document.uploadedAt,
      createdAt: document.createdAt,
    });
  } catch (error) {
    console.error("Error creating document:", error);
    return res.status(500).json({ error: "Failed to create document" });
  }
});

/**
 * DELETE /me/documents/:id
 * Delete a document
 */
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const documentId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: "Invalid document ID" });
    }

    const document = await UserDocument.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(documentId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    return res.json({
      message: "Document deleted successfully",
      id: document._id,
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    return res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
