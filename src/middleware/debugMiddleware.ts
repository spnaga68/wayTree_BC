import { Request, Response, NextFunction } from "express";
import config from "../config";

/**
 * Debug middleware for logging API requests and responses in development mode
 */
export const debugLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!config.debugMode) {
    return next();
  }

  // Skip health check endpoint to reduce noise
  if (req.path === "/health") {
    return next();
  }

  const startTime = Date.now();

  // Log request
  console.log("\n" + "=".repeat(80));
  console.log(`🔵 [DEBUG] ${req.method} ${req.path}`);
  console.log("=".repeat(80));
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`🌐 IP: ${req.ip}`);
  console.log(
    `📍 Full URL: ${req.protocol}://${req.get("host")}${req.originalUrl}`
  );

  // Log route params (always show, even if empty)
  console.log("\n🎯 Route Params:");
  if (Object.keys(req.params).length > 0) {
    console.log(JSON.stringify(req.params, null, 2));
  } else {
    console.log("  (none)");
  }

  // Log query params (always show, even if empty)
  console.log("\n🔍 Query Params:");
  if (Object.keys(req.query).length > 0) {
    console.log(JSON.stringify(req.query, null, 2));
  } else {
    console.log("  (none)");
  }

  // Log headers (excluding sensitive ones)
  console.log("\n📋 Headers:");
  const sensitiveHeaders = ["authorization", "cookie"];
  Object.keys(req.headers).forEach((key) => {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      console.log(`  ${key}: ${"*".repeat(20)} (hidden)`);
    } else {
      console.log(`  ${key}: ${req.headers[key]}`);
    }
  });

  // Log request body (excluding sensitive fields)
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("\n📦 Request Body:");
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.pdfFile) {
      sanitizedBody.pdfFile = "[Base64 PDF Data - REDACTED]";
    }
    if (sanitizedBody.eventEmbedding) {
      sanitizedBody.eventEmbedding = "[Vector Embedding Data - REDACTED]";
    }
    if (sanitizedBody.metadataEmbedding) {
      sanitizedBody.metadataEmbedding = "[Vector Embedding Data - REDACTED]";
    }
    const sensitiveFields = ["password", "otp", "token"];
    sensitiveFields.forEach((field) => {
      if (sanitizedBody[field]) {
        sanitizedBody[field] = "*".repeat(6);
      }
    });
    console.log(JSON.stringify(sanitizedBody, null, 2));
  }

  // Log authenticated user if available
  if ((req as any).user) {
    console.log("\n👤 Authenticated User:");
    console.log(JSON.stringify((req as any).user, null, 2));
  }

  // Capture original res.json to log response
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const duration = Date.now() - startTime;

    console.log("\n" + "-".repeat(80));
    console.log(`✅ Response Status: ${res.statusCode}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log("\n📤 Response Body:");

    // Sanitize response body for logging
    const sanitizedResponse = JSON.parse(JSON.stringify(body));
    if (sanitizedResponse.data && sanitizedResponse.data.pdfFile) {
      sanitizedResponse.data.pdfFile = "[Base64 PDF Data - REDACTED]";
    }
    // Also check root level just in case
    if (sanitizedResponse.pdfFile) {
      sanitizedResponse.pdfFile = "[Base64 PDF Data - REDACTED]";
    }

    // REDACT EMBEDDINGS
    const redactEmbeddings = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      const targets = ['eventEmbedding', 'metadataEmbedding', 'profileEmbedding'];
      targets.forEach(key => {
        if (obj[key]) obj[key] = "[Vector Embedding Data - REDACTED]";
      });

      // Recurse into data array if it exists
      if (Array.isArray(obj.data)) {
        obj.data.forEach((item: any) => redactEmbeddings(item));
      } else if (obj.data) {
        redactEmbeddings(obj.data);
      }
    };

    redactEmbeddings(sanitizedResponse);
    if (sanitizedResponse.token) {
      sanitizedResponse.token =
        sanitizedResponse.token.substring(0, 20) + "...";
    }
    console.log(JSON.stringify(sanitizedResponse, null, 2));
    console.log("=".repeat(80) + "\n");

    return originalJson(body);
  };

  // Capture errors
  const originalStatus = res.status.bind(res);
  res.status = function (code: number) {
    if (code >= 400) {
      const duration = Date.now() - startTime;
      console.log("\n" + "-".repeat(80));
      console.log(`❌ Error Status: ${code}`);
      console.log(`⏱️  Duration: ${duration}ms`);
    }
    return originalStatus(code);
  };

  next();
};

/**
 * Log application mode on startup
 */
export const logAppMode = () => {
  console.log("\n" + "=".repeat(80));
  console.log("🚀 GOALNET BACKEND STARTING");
  console.log("=".repeat(80));
  console.log(`📍 Mode: ${config.appMode.toUpperCase()}`);
  console.log(
    `🐛 Debug Logging: ${config.debugMode ? "ENABLED ✅" : "DISABLED ❌"}`
  );
  console.log(`🌍 Node Environment: ${config.nodeEnv}`);
  console.log(`🔌 Port: ${config.port}`);
  console.log(`🗄️  MongoDB: ${config.mongodbUri}`);
  console.log(
    `📧 Email Mode: ${config.appMode === "development" ? "STATIC OTP (123456)" : "SMTP"
    }`
  );
  console.log("=".repeat(80) + "\n");

  if (config.debugMode) {
    console.log(
      "⚠️  DEBUG MODE ACTIVE - All API requests/responses will be logged"
    );
    console.log("   To disable: Set DEBUG_MODE=false in .env\n");
  }

  if (config.appMode === "development") {
    console.log("💡 DEVELOPMENT MODE FEATURES:");
    console.log("   - Static OTP: 123456");
    console.log("   - Email logging to console");
    console.log("   - Detailed error messages");
    console.log("   - Hot reload enabled\n");
  }
};
