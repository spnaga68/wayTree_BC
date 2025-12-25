import { Router, Request, Response } from "express";
import {
  createOtpRequest,
  verifyOtpAndGetUser,
  generateJwt,
  checkOtpRateLimit,
} from "../services/authService";
import {
  generateAccessToken,
  createRefreshToken,
  hasActiveSession,
  deleteAllUserRefreshTokens,
  deleteRefreshTokenByDevice,
  getUserSessions,
} from "../services/tokenService";
import { User } from "../models/User";

const router = Router();

/**
 * POST /auth/request-otp
 * Request OTP for email
 */
router.post(
  "/request-otp",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;

      // Validate email
      if (!email || typeof email !== "string") {
        res.status(400).json({
          error: "Bad Request",
          message: "Email is required",
        });
        return;
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          error: "Bad Request",
          message: "Invalid email format",
        });
        return;
      }

      // Check rate limit
      const canProceed = await checkOtpRateLimit(email.toLowerCase());
      if (!canProceed) {
        res.status(429).json({
          error: "Too Many Requests",
          message: "Too many OTP requests. Please try again later.",
        });
        return;
      }

      // Create OTP request
      await createOtpRequest(email.toLowerCase());

      res.status(200).json({
        success: true,
      });
    } catch (error) {
      console.error("Error in request-otp:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to process OTP request",
      });
    }
  }
);

/**
 * POST /auth/verify-otp
 * Verify OTP and return access token + refresh token + user info
 */
router.post(
  "/verify-otp",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, otp, deviceId, deviceInfo, logoutFromOtherDevices } = req.body;
      let shouldConsume = true; // Flag to control OTP consumption

      // Validate inputs
      if (!email || typeof email !== "string") {
        res.status(400).json({
          error: "Bad Request",
          message: "Email is required",
        });
        return;
      }

      if (!otp || typeof otp !== "string") {
        res.status(400).json({
          error: "Bad Request",
          message: "OTP is required",
        });
        return;
      }

      // First verify OTP without consuming it
      const peekResult = await verifyOtpAndGetUser(email.toLowerCase(), otp, false);

      if (!peekResult) {
        res.status(400).json({
          error: "Bad Request",
          message: "Invalid or expired code",
        });
        return;
      }

      const { user: peekUser, isNewUser: peekIsNewUser } = peekResult;  // ✅ Get isNewUser from first check

      // Check if user is blocked
      const userDoc = await User.findById(peekUser._id).select("isBlocked");
      if (userDoc && (userDoc as any).isBlocked) {
        // Delete all refresh tokens for blocked user
        await deleteAllUserRefreshTokens(peekUser._id.toString());
        res.status(403).json({
          error: "Forbidden",
          message: "You are blocked by admin. Please contact support.",
        });
        return;
      }

      const userId = peekUser._id.toString();
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;

      // Check current device session status
      const hasSessionOnSameDevice = deviceId
        ? await hasActiveSession(userId, deviceId)
        : false;

      const hasAnySession = await hasActiveSession(userId);

      // Scenario: Login from NEW device, but account has active sessions on OTHER devices
      if (hasAnySession && !hasSessionOnSameDevice && !logoutFromOtherDevices) {
        const sessions = await getUserSessions(userId);
        res.status(409).json({
          error: "Conflict",
          message: "You are already logged in on another device",
          sessions: sessions.map((s) => ({
            deviceId: s.deviceId,
            deviceInfo: s.deviceInfo,
            ipAddress: s.ipAddress,
            createdAt: s.createdAt,
          })),
          canLogoutFromOtherDevices: true,
        });
        return;
      }

      // Cleanup Logic
      if (deviceId) {
        // If explicitly requested to logout other devices
        if (logoutFromOtherDevices) {
          try {
            const allSessions = await getUserSessions(userId);
            for (const session of allSessions) {
              // Delete sessions for OTHER devices
              if (session.deviceId && session.deviceId !== deviceId) {
                await deleteRefreshTokenByDevice(userId, session.deviceId);
              }
            }
          } catch (error) {
            console.error("Error logging out from other devices:", error);
          }
        }

        // CRITICAL: Always clear any EXISTING session for THIS device before creating a new one
        // This ensures we refresh the token cleanly and don't stack up sessions for the same device ID
        if (hasSessionOnSameDevice) {
          try {
            await deleteRefreshTokenByDevice(userId, deviceId);
          } catch (error) {
            console.error("Error clearing old session for this device:", error);
          }
        }
      }

      // Now verify again and consume the OTP only if all validations pass
      const finalResult = await verifyOtpAndGetUser(email.toLowerCase(), otp, shouldConsume);

      if (!finalResult) {
        // Should not happen as we just verified it, unless race condition or db issue
        res.status(400).json({
          error: "Bad Request",
          message: "Invalid or expired code (consumption failed)",
        });
        return;
      }

      const { user } = finalResult;  // ✅ Don't use isNewUser from second call

      // Generate tokens
      const accessToken = generateAccessToken(userId, user.email);
      const refreshToken = await createRefreshToken(
        userId,
        deviceId,
        deviceInfo,
        ipAddress
      );

      // Return response with isNewUser from FIRST check
      res.status(200).json({
        accessToken,
        refreshToken,
        isNewUser: peekIsNewUser,  // ✅ Use isNewUser from first check, not second!
        user: {
          id: userId,
          email: user.email,
          name: user.name,
          role: user.role,
          primaryGoal: user.primaryGoal,
          company: user.company,
          website: user.website,
          location: user.location,
          oneLiner: user.oneLiner,
        },
      });
    } catch (error) {
      console.error("Error in verify-otp:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to verify OTP",
      });
    }
  }
);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  "/refresh",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken || typeof refreshToken !== "string") {
        res.status(400).json({
          error: "Bad Request",
          message: "Refresh token is required",
        });
        return;
      }

      const { verifyRefreshToken } = await import("../services/tokenService");
      const userData = await verifyRefreshToken(refreshToken);

      if (!userData) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired refresh token",
        });
        return;
      }

      // Check if user is blocked
      const user = await User.findById(userData.userId);
      if (!user || (user as any).isBlocked) {
        const { deleteAllUserRefreshTokens } = await import("../services/tokenService");
        await deleteAllUserRefreshTokens(userData.userId);
        res.status(403).json({
          error: "Forbidden",
          message: "You are blocked by admin. Please contact support.",
        });
        return;
      }

      // Generate new access token
      const accessToken = generateAccessToken(userData.userId, userData.email);

      res.status(200).json({
        accessToken,
      });
    } catch (error) {
      console.error("Error in refresh:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to refresh token",
      });
    }
  }
);

/**
 * POST /auth/logout
 * Logout and delete refresh token
 */
router.post(
  "/logout",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken || typeof refreshToken !== "string") {
        res.status(400).json({
          error: "Bad Request",
          message: "Refresh token is required",
        });
        return;
      }

      const { deleteRefreshToken } = await import("../services/tokenService");
      await deleteRefreshToken(refreshToken);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      console.error("Error in logout:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to logout",
      });
    }
  }
);

/**
 * POST /auth/logout-all
 * Logout from all devices
 */
router.post(
  "/logout-all",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken || typeof refreshToken !== "string") {
        res.status(400).json({
          error: "Bad Request",
          message: "Refresh token is required",
        });
        return;
      }

      const { verifyRefreshToken, deleteAllUserRefreshTokens } = await import("../services/tokenService");
      const userData = await verifyRefreshToken(refreshToken);

      if (!userData) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired refresh token",
        });
        return;
      }

      await deleteAllUserRefreshTokens(userData.userId);

      res.status(200).json({
        success: true,
        message: "Logged out from all devices successfully",
      });
    } catch (error) {
      console.error("Error in logout-all:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to logout from all devices",
      });
    }
  }
);

export default router;
