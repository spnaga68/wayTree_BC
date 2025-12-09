import { Router, Response } from "express";
import { AuthRequest } from "../types";
import { NetworkCode } from "../models/NetworkCode";
import { Connection } from "../models/Connection";
import { authMiddleware } from "../middleware/authMiddleware";
import { QRCodeService } from "../services/qrCodeService";
import mongoose from "mongoose";

const router = Router();

/**
 * Helper function to check and update network code expiry status
 */
async function checkAndExpireNetworkCode(networkCode: any) {
  if (networkCode.expirationTime && new Date() > new Date(networkCode.expirationTime)) {
    if (networkCode.isActive) {
      networkCode.isActive = false;
      await networkCode.save();
    }
  }
  return networkCode;
}

/**
 * POST /network-codes
 * Create a new network code
 */
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, codeId, description, keywords, autoConnect, expirationTime } =
      req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    // Validate required fields
    if (!name || !codeId || !description) {
      res.status(400).json({
        error: "Validation Error",
        message: "Name, codeId, and description are required",
      });
      return;
    }

    // Check if codeId already exists
    const existingCode = await NetworkCode.findOne({ codeId });
    if (existingCode) {
      res.status(409).json({
        error: "Conflict",
        message: "Network code with this codeId already exists",
      });
      return;
    }

    // Validate expiration time must be in the future
    if (expirationTime && new Date(expirationTime) <= new Date()) {
      res.status(400).json({
        error: "Validation Error",
        message: "Expiration time must be in the future",
      });
      return;
    }

    // Generate QR code
    const qrCodeUrl = await QRCodeService.generateQRCode(codeId, {
      name,
      description,
      keywords: keywords || [],
      autoConnect: autoConnect || false,
    });

    // Create new network code
    const networkCode = await NetworkCode.create({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      codeId,
      description,
      keywords: keywords || [],
      autoConnect: autoConnect || false,
      expirationTime: expirationTime || null,
      qrCodeUrl,
    });

    res.status(201).json({
      message: "Network code created successfully",
      data: networkCode,
    });
  } catch (error) {
    console.error("Error creating network code:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create network code",
    });
  }
});

/**
 * GET /network-codes
 * Get all network codes with optional filtering
 */
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { keyword, autoConnect, active, userId: filterUserId } = req.query;
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    // Build query
    const query: any = {};

    // Filter by userId if provided, otherwise show current user's codes
    if (filterUserId) {
      query.userId = new mongoose.Types.ObjectId(filterUserId as string);
    } else {
      query.userId = new mongoose.Types.ObjectId(currentUserId);
    }

    if (keyword) {
      query.keywords = { $in: [keyword] };
    }

    if (autoConnect !== undefined) {
      query.autoConnect = autoConnect === "true";
    }

    // Filter by expiration if active filter is provided
    if (active === "true") {
      query.$or = [
        { expirationTime: null },
        { expirationTime: { $gt: new Date() } },
      ];
    } else if (active === "false") {
      query.expirationTime = { $lte: new Date() };
    }

    const networkCodes = await NetworkCode.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    // Check and auto-expire network codes
    for (const code of networkCodes) {
      await checkAndExpireNetworkCode(code);
    }

    // Add member counts to each network code
    const networkCodesWithMemberCount = await Promise.all(
      networkCodes.map(async (networkCode) => {
        const [totalConnections, acceptedMembers, pendingRequests] =
          await Promise.all([
            Connection.countDocuments({ codeId: networkCode.codeId }),
            Connection.countDocuments({
              codeId: networkCode.codeId,
              status: "accepted",
            }),
            Connection.countDocuments({
              codeId: networkCode.codeId,
              status: "pending",
            }),
          ]);

        return {
          ...networkCode.toObject(),
          memberStats: {
            totalConnections,
            acceptedMembers,
            pendingRequests,
            rejectedRequests:
              totalConnections - acceptedMembers - pendingRequests,
          },
        };
      })
    );

    res.json({
      message: "Network codes retrieved successfully",
      count: networkCodesWithMemberCount.length,
      data: networkCodesWithMemberCount,
    });
  } catch (error) {
    console.error("Error fetching network codes:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch network codes",
    });
  }
});

/**
 * GET /network-codes/:codeId
 * Get a specific network code by codeId
 */
router.get(
  "/:codeId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { codeId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const networkCode = await NetworkCode.findOne({ codeId }).populate(
        "userId",
        "name email"
      );

      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message: "Network code not found",
        });
        return;
      }

      // Check and auto-expire this network code
      await checkAndExpireNetworkCode(networkCode);

      // Add member statistics
      const [totalConnections, acceptedMembers, pendingRequests] =
        await Promise.all([
          Connection.countDocuments({ codeId: networkCode.codeId }),
          Connection.countDocuments({
            codeId: networkCode.codeId,
            status: "accepted",
          }),
          Connection.countDocuments({
            codeId: networkCode.codeId,
            status: "pending",
          }),
        ]);

      const networkCodeWithStats = {
        ...networkCode.toObject(),
        memberStats: {
          totalConnections,
          acceptedMembers,
          pendingRequests,
          rejectedRequests:
            totalConnections - acceptedMembers - pendingRequests,
        },
      };

      res.json({
        message: "Network code retrieved successfully",
        data: networkCodeWithStats,
      });
    } catch (error) {
      console.error("Error fetching network code:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch network code",
      });
    }
  }
);

/**
 * PUT /network-codes/:codeId
 * Update a network code (only owner can update)
 */
router.put(
  "/:codeId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { codeId } = req.params;
      const { name, description, keywords, autoConnect, expirationTime } =
        req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const networkCode = await NetworkCode.findOne({
        codeId,
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message:
            "Network code not found or you don't have permission to update it",
        });
        return;
      }

      // Check if QR code needs to be regenerated (if key fields changed)
      const needsQRUpdate =
        name !== undefined ||
        description !== undefined ||
        keywords !== undefined ||
        autoConnect !== undefined;

      // Update fields
      if (name !== undefined) networkCode.name = name;
      if (description !== undefined) networkCode.description = description;
      if (keywords !== undefined) networkCode.keywords = keywords;
      if (autoConnect !== undefined) networkCode.autoConnect = autoConnect;

      // Validate expiration time must be in the future
      if (expirationTime !== undefined) {
        if (expirationTime && new Date(expirationTime) <= new Date()) {
          res.status(400).json({
            error: "Validation Error",
            message: "Expiration time must be in the future",
          });
          return;
        }
        networkCode.expirationTime = expirationTime;
      }

      // Regenerate QR code if needed
      if (needsQRUpdate) {
        const newQrCodeUrl = await QRCodeService.updateQRCode(
          networkCode.qrCodeUrl,
          networkCode.codeId,
          {
            name: networkCode.name,
            description: networkCode.description,
            keywords: networkCode.keywords,
            autoConnect: networkCode.autoConnect,
          }
        );
        networkCode.qrCodeUrl = newQrCodeUrl;
      }

      await networkCode.save();
      res.json({
        message: "Network code updated successfully",
        data: networkCode,
      });
    } catch (error) {
      console.error("Error updating network code:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update network code",
      });
    }
  }
);

/**
 * DELETE /network-codes/:codeId
 * Delete a network code (only owner can delete)
 */
router.delete(
  "/:codeId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { codeId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const networkCode = await NetworkCode.findOneAndDelete({
        codeId,
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message:
            "Network code not found or you don't have permission to delete it",
        });
        return;
      }

      // Delete associated QR code file
      if (networkCode.qrCodeUrl) {
        QRCodeService.deleteQRCode(networkCode.qrCodeUrl);
      }

      res.json({
        message: "Network code deleted successfully",
        data: networkCode,
      });
    } catch (error) {
      console.error("Error deleting network code:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete network code",
      });
    }
  }
);

/**
 * POST /network-codes/search
 * Search network codes by keywords or name
 */
router.post(
  "/search",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { searchTerm, userId: filterUserId } = req.body;
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      if (!searchTerm) {
        res.status(400).json({
          error: "Validation Error",
          message: "searchTerm is required",
        });
        return;
      }

      // Build query with user filter
      const baseQuery = {
        $or: [
          { name: { $regex: searchTerm, $options: "i" } },
          { description: { $regex: searchTerm, $options: "i" } },
          { keywords: { $in: [new RegExp(searchTerm, "i")] } },
        ],
      };

      // Add user filter
      const query: any = {
        ...baseQuery,
        userId: filterUserId
          ? new mongoose.Types.ObjectId(filterUserId)
          : new mongoose.Types.ObjectId(currentUserId),
      };

      const networkCodes = await NetworkCode.find(query)
        .populate("userId", "name email")
        .sort({ createdAt: -1 });

      res.json({
        message: "Search results retrieved successfully",
        count: networkCodes.length,
        data: networkCodes,
      });
    } catch (error) {
      console.error("Error searching network codes:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to search network codes",
      });
    }
  }
);

/**
 * GET /network-codes/:codeId/qr
 * Get QR code for a specific network code (public endpoint)
 */
router.get("/:codeId/qr", async (req: AuthRequest, res: Response) => {
  try {
    const { codeId } = req.params;

    const networkCode = await NetworkCode.findOne({ codeId }).populate(
      "userId",
      "name email"
    );

    if (!networkCode) {
      res.status(404).json({
        error: "Not Found",
        message: "Network code not found",
      });
      return;
    }

    res.json({
      message: "QR code retrieved successfully",
      data: {
        codeId: networkCode.codeId,
        name: networkCode.name,
        qrCodeUrl: networkCode.qrCodeUrl,
        description: networkCode.description,
      },
    });
  } catch (error) {
    console.error("Error fetching QR code:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch QR code",
    });
  }
});

/**
 * GET /network-codes/user/:userId
 * Get all network codes for a specific user
 */
router.get(
  "/user/:userId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const networkCodes = await NetworkCode.find({
        userId: new mongoose.Types.ObjectId(userId),
      })
        .populate("userId", "name email")
        .sort({ createdAt: -1 });

      res.json({
        message: "User network codes retrieved successfully",
        count: networkCodes.length,
        data: networkCodes,
      });
    } catch (error) {
      console.error("Error fetching user network codes:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch user network codes",
      });
    }
  }
);

export default router;
