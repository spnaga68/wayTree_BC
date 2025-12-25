import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import { User } from "../models/User";
import { deleteAllUserRefreshTokens } from "../services/tokenService";
import { AuthRequest } from "../types";

/**
 * Middleware to authenticate access tokens
 * Expects Authorization header: Bearer <accessToken>
 */
export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Unauthorized",
        message: "No token provided",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT access token
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (error: any) {
      if (error.name === "TokenExpiredError") {
        res.status(401).json({
          error: "Unauthorized",
          message: "Token expired. Please refresh your token.",
          code: "TOKEN_EXPIRED",
        });
        return;
      }
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token",
      });
      return;
    }

    // Check if token is an access token
    if (decoded.type !== "access") {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token type. Access token required.",
      });
      return;
    }

    // Get user from database
    const user = await User.findById(decoded.userId).select("email isBlocked");

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not found",
      });
      return;
    }

    // Check if user is blocked
    if (user.isBlocked) {
      // Delete all refresh tokens for blocked user
      await deleteAllUserRefreshTokens(decoded.userId);
      res.status(403).json({
        error: "Forbidden",
        message: "You are blocked by admin. Please contact support.",
      });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication failed",
    });
  }
};
