import express, { Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import config from "./config";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import aiProfileRoutes from "./routes/aiProfileRoutes";
import documentRoutes from "./routes/documentRoutes";
import goalRoutes from "./routes/goalRoutes";
import networkCodeRoutes from "./routes/networkCodeRoutes";
import connectionRoutes from "./routes/connectionRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import followingRoutes from "./routes/followingRoutes";
import qrProfileRoutes from "./routes/qrProfileRoutes";
import eventRoutes from "./routes/eventRoutes";
import { debugLogger, logAppMode } from "./middleware/debugMiddleware";

const app = express();

// ========================================
// MIDDLEWARE
// ========================================

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '50mb' })); // Increased limit for Base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files for QR codes
app.use("/qr-codes", express.static("public/qr-codes"));

// Debug logging middleware (only in debug mode)
app.use(debugLogger);

// Request logging (simple fallback)
if (!config.debugMode) {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ========================================
// ROUTES
// ========================================

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Auth routes
app.use("/auth", authRoutes);

// AI Profile routes (protected)
app.use("/me/ai-profile", aiProfileRoutes);

// Documents routes (protected)
app.use("/me/documents", documentRoutes);

// Goals routes (protected)
app.use("/me/goals", goalRoutes);

// Network codes routes (protected)
app.use("/network-codes", networkCodeRoutes);

// Connection routes (protected)
app.use("/connections", connectionRoutes);

// Upload routes (protected)
app.use("/upload", uploadRoutes);

// Following routes (protected)
app.use("/followings", followingRoutes);

// QR Profile routes (protected)
app.use("/qr-profiles", qrProfileRoutes);

// User routes (protected)
app.use("/users", userRoutes);

// Event routes (protected)
app.use("/events", eventRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: "Route not found",
  });
});

// ========================================
// DATABASE CONNECTION
// ========================================

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// ========================================
// SERVER START
// ========================================

const startServer = async (): Promise<void> => {
  try {
    // Log app mode and configuration
    logAppMode();

    // Connect to database
    await connectDB();

    // Start listening
    app.listen(config.port, () => {
      console.log("================================================");
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📝 Environment: ${config.nodeEnv}`);
      console.log(`🔗 Health check: http://localhost:${config.port}/health`);
      console.log("================================================");

      if (config.debugMode) {
        console.log(
          "\n💡 Debug mode is ON - Check console for detailed API logs\n"
        );
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  await mongoose.connection.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT signal received: closing HTTP server");
  await mongoose.connection.close();
  process.exit(0);
});

// Start the server
startServer();

export default app;
