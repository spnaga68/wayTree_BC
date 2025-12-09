import { Router, Response } from "express";
import { AuthRequest } from "../types";
import { Connection } from "../models/Connection";
import { NetworkCode } from "../models/NetworkCode";
import { User } from "../models/User";
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
    console.log('\n🎯 BACKEND: /connect endpoint called');
    console.log('📦 BACKEND: Request body:', JSON.stringify(req.body, null, 2));
    console.log('👤 BACKEND: User from auth:', req.user?.userId);

    try {
      const { codeId, message } = req.body;
      const requestorId = req.user?.userId;

      console.log('🔍 BACKEND: Extracted data:');
      console.log('   - codeId:', codeId);
      console.log('   - requestorId:', requestorId);
      console.log('   - message:', message);

      if (!requestorId) {
        console.log('❌ BACKEND: No requestorId - user not authenticated');
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      // Validate required fields
      if (!codeId) {
        console.log('❌ BACKEND: No codeId provided');
        res.status(400).json({
          error: "Validation Error",
          message: "codeId is required",
        });
        return;
      }

      // Find the network code
      console.log('🔎 BACKEND: Searching for network code:', codeId);
      const networkCode = await NetworkCode.findOne({ codeId });

      if (!networkCode) {
        console.log('❌ BACKEND: Network code NOT FOUND:', codeId);
        res.status(404).json({
          error: "Not Found",
          message: "Network code not found",
        });
        return;
      }

      console.log('✅ BACKEND: Network code found!');
      console.log('📋 BACKEND: Network code details:', {
        id: networkCode._id,
        codeId: networkCode.codeId,
        name: networkCode.name,
        userId: networkCode.userId,
        autoConnect: networkCode.autoConnect,
        expirationTime: networkCode.expirationTime,
      });

      // Check if network code has expired
      console.log('⏰ BACKEND: Checking expiration...');
      if (
        networkCode.expirationTime &&
        networkCode.expirationTime < new Date()
      ) {
        console.log('❌ BACKEND: Network code has EXPIRED');
        res.status(410).json({
          error: "Expired",
          message: "This network code has expired",
        });
        return;
      }
      console.log('✅ BACKEND: Network code is not expired');

      // Check if user is trying to connect to their own network code
      console.log('🔍 BACKEND: Checking if user is connecting to own code...');
      console.log('   - Network code owner:', networkCode.userId.toString());
      console.log('   - Requestor:', requestorId);

      if (networkCode.userId.toString() === requestorId) {
        console.log('❌ BACKEND: User trying to connect to OWN network code');
        res.status(400).json({
          error: "Invalid Request",
          message: "You cannot connect to your own network code",
        });
        return;
      }
      console.log('✅ BACKEND: Different users - OK to proceed');

      // Check if connection already exists
      console.log('🔍 BACKEND: Checking for existing connection...');
      const existingConnection = await Connection.findOne({
        codeId,
        requestorId: new mongoose.Types.ObjectId(requestorId),
      });

      if (existingConnection) {
        console.log('⚠️ BACKEND: Connection already exists!');
        console.log('📋 BACKEND: Existing connection:', {
          id: existingConnection._id,
          status: existingConnection.status,
          autoConnected: existingConnection.autoConnected,
        });
        res.status(409).json({
          error: "Connection Exists",
          message: `Connection already exists with status: ${existingConnection.status}`,
          data: existingConnection,
        });
        return;
      }
      console.log('✅ BACKEND: No existing connection - creating new one');

      // Determine initial status based on autoConnect
      const initialStatus = networkCode.autoConnect ? "accepted" : "pending";
      const autoConnected = networkCode.autoConnect;

      console.log('🔧 BACKEND: Connection settings:');
      console.log('   - initialStatus:', initialStatus);
      console.log('   - autoConnected:', autoConnected);

      // Create new connection
      console.log('💾 BACKEND: Creating connection in database...');
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

      console.log('✅ BACKEND: Connection created successfully!');
      console.log('📋 BACKEND: Connection ID:', connection._id);

      // If autoConnected, increment connection count for both users
      if (autoConnected) {
        console.log('📈 BACKEND: Incrementing connection counts...');
        await Promise.all([
          User.findByIdAndUpdate(networkCode.userId, {
            $inc: { connectionCount: 1 },
          }),
          User.findByIdAndUpdate(requestorId, {
            $inc: { connectionCount: 1 },
          }),
        ]);
        console.log('✅ BACKEND: Connection counts incremented');
      } else {
        console.log('⏸️ BACKEND: Skipping count increment (pending status)');
      }

      // Populate the connection with user details
      console.log('🔄 BACKEND: Populating connection with user details...');
      const populatedConnection = await Connection.findById(connection._id)
        .populate("userId", "name email connectionCount")
        .populate("requestorId", "name email connectionCount")
        .populate("networkCodeId", "name description keywords");

      // Validate populated data
      if (!populatedConnection) {
        console.log('❌ BACKEND: Failed to populate connection');
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to retrieve connection details",
        });
        return;
      }
      console.log('✅ BACKEND: Connection populated successfully');

      // Check if user references are valid
      if (!populatedConnection.userId || !populatedConnection.requestorId) {
        console.log('❌ BACKEND: Invalid user references in connection');
        res.status(500).json({
          error: "Data Integrity Error",
          message: "Connection references invalid users",
        });
        return;
      }
      console.log('✅ BACKEND: User references are valid');

      const responseMessage = autoConnected
        ? "Successfully connected to network code"
        : "Connection request sent successfully";

      console.log('🎉 BACKEND: Connection process completed!');
      console.log('📤 BACKEND: Sending response:', responseMessage);
      console.log('📊 BACKEND: Response data:', {
        autoConnect: autoConnected,
        status: populatedConnection.status,
        connectionId: populatedConnection._id,
      });

      res.status(201).json({
        message: responseMessage,
        autoConnect: autoConnected,
        data: populatedConnection,
      });
    } catch (error) {
      console.log('\n🔥 BACKEND: CRITICAL ERROR in /connect endpoint!');
      console.log('❌ BACKEND: Error type:', error?.constructor?.name);
      console.log('❌ BACKEND: Error message:', (error as Error).message);
      console.log('❌ BACKEND: Error stack:', (error as Error).stack);
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

      // If rejecting, DELETE the connection instead of updating status
      if (status === "rejected") {
        await Connection.findByIdAndDelete(connectionId);

        res.json({
          message: "Connection rejected and removed",
          deleted: true,
        });
        return;
      }

      // If accepting, update status and increment connection counts
      connection.status = status;
      await connection.save();

      // Increment connection count for both users
      const User = (await import("../models/User")).User;
      await Promise.all([
        User.findByIdAndUpdate(connection.userId, {
          $inc: { connectionCount: 1 },
        }),
        User.findByIdAndUpdate(connection.requestorId, {
          $inc: { connectionCount: 1 },
        }),
      ]);

      // Populate and return updated connection
      const updatedConnection = await Connection.findById(connectionId)
        .populate("userId", "name email connectionCount")
        .populate("requestorId", "name email connectionCount")
        .populate("networkCodeId", "name description keywords codeId");

      // Validate populated data
      if (!updatedConnection) {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to retrieve updated connection",
        });
        return;
      }

      // Check if user references are valid
      if (!updatedConnection.userId || !updatedConnection.requestorId) {
        res.status(500).json({
          error: "Data Integrity Error",
          message: "Connection references invalid users",
        });
        return;
      }

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

/**
 * GET /connections/network-code/:networkCodeId/members
 * Get all members connected through a specific network code
 */
router.get(
  "/network-code/:networkCodeId/members",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { networkCodeId } = req.params;
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      // Validate networkCodeId
      if (!mongoose.Types.ObjectId.isValid(networkCodeId)) {
        res.status(400).json({
          error: "Validation Error",
          message: "Invalid network code ID",
        });
        return;
      }

      // Verify network code exists
      const networkCode = await NetworkCode.findById(networkCodeId);
      if (!networkCode) {
        res.status(404).json({
          error: "Not Found",
          message: "Network code not found",
        });
        return;
      }

      // Find all accepted connections for this network code
      const connections = await Connection.find({
        networkCodeId: networkCodeId,
        status: "accepted",
      })
        .populate("userId", "name email role company photoUrl connectionCount")
        .populate("requestorId", "name email role company photoUrl connectionCount")
        .populate("networkCodeId", "name codeId description");

      // Extract unique members (excluding current user)
      const membersMap = new Map();

      connections.forEach((conn: any) => {
        // Add userId if it's not the current user
        if (conn.userId && conn.userId._id.toString() !== currentUserId) {
          membersMap.set(conn.userId._id.toString(), {
            _id: conn.userId._id,
            name: conn.userId.name,
            email: conn.userId.email,
            role: conn.userId.role,
            company: conn.userId.company,
            photoUrl: conn.userId.photoUrl,
            connectionCount: conn.userId.connectionCount || 0,
          });
        }

        // Add requestorId if it's not the current user
        if (conn.requestorId && conn.requestorId._id.toString() !== currentUserId) {
          membersMap.set(conn.requestorId._id.toString(), {
            _id: conn.requestorId._id,
            name: conn.requestorId.name,
            email: conn.requestorId.email,
            role: conn.requestorId.role,
            company: conn.requestorId.company,
            photoUrl: conn.requestorId.photoUrl,
            connectionCount: conn.requestorId.connectionCount || 0,
          });
        }
      });

      const members = Array.from(membersMap.values());

      res.status(200).json({
        success: true,
        data: members,
        count: members.length,
        networkCode: {
          _id: networkCode._id,
          name: networkCode.name,
          codeId: networkCode.codeId,
        },
      });
    } catch (error: any) {
      console.error("Error fetching network code members:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error.message || "Failed to fetch network code members",
      });
    }
  }
);

export default router;
