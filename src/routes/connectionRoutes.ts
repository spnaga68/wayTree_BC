import { Router, Response } from "express";
import { AuthRequest } from "../types";
import { Connection } from "../models/Connection";
import { NetworkCode } from "../models/NetworkCode";
import { authMiddleware } from "../middleware/authMiddleware";
import mongoose from "mongoose";

const router = Router();

/**
 * POST /connections/connect
 * Connect to a network code
 */
router.post(
  "/connect",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { codeId, message } = req.body;
      const requestorId = req.user?.userId;

      if (!requestorId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      // Validate required fields
      if (!codeId) {
        res.status(400).json({
          error: "Validation Error",
          message: "codeId is required",
        });
        return;
      }

      // Find the network code
      const networkCode = await NetworkCode.findOne({ codeId });
      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message: "Network code not found",
        });
        return;
      }

      // Check if network code has expired
      if (
        networkCode.expirationTime &&
        networkCode.expirationTime < new Date()
      ) {
        res.status(410).json({
          error: "Expired",
          message: "This network code has expired",
        });
        return;
      }

      // Check if user is trying to connect to their own network code
      if (networkCode.userId.toString() === requestorId) {
        res.status(400).json({
          error: "Invalid Request",
          message: "You cannot connect to your own network code",
        });
        return;
      }

      // Check if connection already exists
      const existingConnection = await Connection.findOne({
        codeId,
        requestorId: new mongoose.Types.ObjectId(requestorId),
      });

      if (existingConnection) {
        res.status(409).json({
          error: "Connection Exists",
          message: `Connection already exists with status: ${existingConnection.status}`,
          data: existingConnection,
        });
        return;
      }

      // Determine initial status based on autoConnect
      const initialStatus = networkCode.autoConnect ? "accepted" : "pending";
      const autoConnected = networkCode.autoConnect;

      // Create new connection
      const connection = await Connection.create({
        networkCodeId: networkCode._id,
        codeId,
        userId: networkCode.userId,
        requestorId: new mongoose.Types.ObjectId(requestorId),
        status: initialStatus,
        autoConnected,
        message: message || "",
        connectionDate: new Date(),
      });

      // Populate the connection with user details
      const populatedConnection = await Connection.findById(connection._id)
        .populate("userId", "name email")
        .populate("requestorId", "name email")
        .populate("networkCodeId", "name description keywords");

      const responseMessage = autoConnected
        ? "Successfully connected to network code"
        : "Connection request sent successfully";

      res.status(201).json({
        message: responseMessage,
        data: populatedConnection,
      });
    } catch (error) {
      console.error("Error connecting to network code:", error);
      if ((error as any).code === 11000) {
        res.status(409).json({
          error: "Duplicate Connection",
          message: "You have already requested to connect to this network code",
        });
      } else {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to connect to network code",
        });
      }
    }
  }
);

/**
 * GET /connections/my-connections
 * Get all connections for the authenticated user (both sent and received)
 */
router.get(
  "/my-connections",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { type, status } = req.query;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      let query: any = {};

      // Filter by connection type
      if (type === "sent") {
        query.requestorId = new mongoose.Types.ObjectId(userId);
      } else if (type === "received") {
        query.userId = new mongoose.Types.ObjectId(userId);
      } else {
        // Both sent and received
        query.$or = [
          { requestorId: new mongoose.Types.ObjectId(userId) },
          { userId: new mongoose.Types.ObjectId(userId) },
        ];
      }

      // Filter by status
      if (status) {
        query.status = status;
      }

      const connections = await Connection.find(query)
        .populate("userId", "name email")
        .populate("requestorId", "name email")
        .populate("networkCodeId", "name description keywords codeId")
        .sort({ createdAt: -1 });

      res.json({
        message: "Connections retrieved successfully",
        count: connections.length,
        data: connections,
      });
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch connections",
      });
    }
  }
);

/**
 * PUT /connections/:connectionId/status
 * Update connection status (accept/reject) - only network code owner can do this
 */
router.put(
  "/:connectionId/status",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId } = req.params;
      const { status } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      // Validate status
      if (!status || !["accepted", "rejected"].includes(status)) {
        res.status(400).json({
          error: "Validation Error",
          message: "Status must be 'accepted' or 'rejected'",
        });
        return;
      }

      // Find connection and verify ownership
      const connection = await Connection.findOne({
        _id: connectionId,
        userId: new mongoose.Types.ObjectId(userId), // Only network code owner can update
      });

      if (!connection) {
        res.status(404).json({
          error: "Not Found",
          message:
            "Connection not found or you don't have permission to update it",
        });
        return;
      }

      // Update status
      connection.status = status;
      await connection.save();

      // Populate and return updated connection
      const updatedConnection = await Connection.findById(connectionId)
        .populate("userId", "name email")
        .populate("requestorId", "name email")
        .populate("networkCodeId", "name description keywords codeId");

      res.json({
        message: `Connection ${status} successfully`,
        data: updatedConnection,
      });
    } catch (error) {
      console.error("Error updating connection status:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update connection status",
      });
    }
  }
);

/**
 * GET /connections/network-code/:codeId
 * Get all connections for a specific network code (only owner can access)
 */
router.get(
  "/network-code/:codeId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { codeId } = req.params;
      const { status } = req.query;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      // Verify ownership of network code
      const networkCode = await NetworkCode.findOne({
        codeId,
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message:
            "Network code not found or you don't have permission to view its connections",
        });
        return;
      }

      // Build query
      const query: any = { codeId };
      if (status) {
        query.status = status;
      }

      const connections = await Connection.find(query)
        .populate("userId", "name email")
        .populate("requestorId", "name email")
        .populate("networkCodeId", "name description keywords")
        .sort({ createdAt: -1 });

      res.json({
        message: "Network code connections retrieved successfully",
        networkCode: {
          name: networkCode.name,
          codeId: networkCode.codeId,
          description: networkCode.description,
        },
        count: connections.length,
        data: connections,
      });
    } catch (error) {
      console.error("Error fetching network code connections:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch network code connections",
      });
    }
  }
);

/**
 * GET /connections/network-code/:codeId/members
 * Get accepted members of a network code (public endpoint)
 */
router.get(
  "/network-code/:codeId/members",
  async (req: AuthRequest, res: Response) => {
    try {
      const { codeId } = req.params;

      // Find the network code
      const networkCode = await NetworkCode.findOne({ codeId });
      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message: "Network code not found",
        });
        return;
      }

      // Check if network code has expired
      if (
        networkCode.expirationTime &&
        networkCode.expirationTime < new Date()
      ) {
        res.status(410).json({
          error: "Expired",
          message: "This network code has expired",
        });
        return;
      }

      // Get only accepted connections
      const connections = await Connection.find({
        codeId,
        status: "accepted",
      })
        .populate("requestorId", "name email role company location")
        .sort({ connectionDate: -1 });

      // Format response to show member details
      const members = connections.map((connection) => ({
        userId: connection.requestorId._id,
        name: (connection.requestorId as any).name,
        email: (connection.requestorId as any).email,
        role: (connection.requestorId as any).role,
        company: (connection.requestorId as any).company,
        location: (connection.requestorId as any).location,
        joinedDate: connection.connectionDate,
        autoConnected: connection.autoConnected,
      }));

      res.json({
        message: "Network code members retrieved successfully",
        networkCode: {
          name: networkCode.name,
          codeId: networkCode.codeId,
          description: networkCode.description,
          keywords: networkCode.keywords,
        },
        memberCount: members.length,
        members: members,
      });
    } catch (error) {
      console.error("Error fetching network code members:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch network code members",
      });
    }
  }
);

/**
 * GET /connections/network-code/:codeId/stats
 * Get connection statistics for a network code (public endpoint)
 */
router.get(
  "/network-code/:codeId/stats",
  async (req: AuthRequest, res: Response) => {
    try {
      const { codeId } = req.params;

      // Find the network code
      const networkCode = await NetworkCode.findOne({ codeId });
      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message: "Network code not found",
        });
        return;
      }

      // Get connection statistics
      const [
        totalConnections,
        acceptedConnections,
        pendingConnections,
        rejectedConnections,
      ] = await Promise.all([
        Connection.countDocuments({ codeId }),
        Connection.countDocuments({ codeId, status: "accepted" }),
        Connection.countDocuments({ codeId, status: "pending" }),
        Connection.countDocuments({ codeId, status: "rejected" }),
      ]);

      // Get recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentConnections = await Connection.countDocuments({
        codeId,
        createdAt: { $gte: sevenDaysAgo },
      });

      res.json({
        message: "Network code statistics retrieved successfully",
        networkCode: {
          name: networkCode.name,
          codeId: networkCode.codeId,
          description: networkCode.description,
        },
        stats: {
          totalConnections,
          acceptedConnections,
          pendingConnections,
          rejectedConnections,
          recentConnections,
          isActive:
            !networkCode.expirationTime ||
            networkCode.expirationTime > new Date(),
          createdAt: networkCode.createdAt,
        },
      });
    } catch (error) {
      console.error("Error fetching network code stats:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch network code statistics",
      });
    }
  }
);

/**
 * DELETE /connections/:connectionId
 * Delete a connection (either party can delete)
 */
router.delete(
  "/:connectionId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      // Find connection where user is either the owner or requestor
      const connection = await Connection.findOne({
        _id: connectionId,
        $or: [
          { userId: new mongoose.Types.ObjectId(userId) },
          { requestorId: new mongoose.Types.ObjectId(userId) },
        ],
      });

      if (!connection) {
        res.status(404).json({
          error: "Not Found",
          message:
            "Connection not found or you don't have permission to delete it",
        });
        return;
      }

      await Connection.findByIdAndDelete(connectionId);

      res.json({
        message: "Connection deleted successfully",
        data: connection,
      });
    } catch (error) {
      console.error("Error deleting connection:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete connection",
      });
    }
  }
);

export default router;
