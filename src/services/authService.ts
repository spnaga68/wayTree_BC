import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "../config";
import { OtpRequest } from "../models/OtpRequest";
import { User } from "../models/User";
import emailService from "./emailService";

/**
 * Generate a random numeric OTP of specified length
 */
export const generateOtp = (): string => {
  const length = config.otpCodeLength;
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const otp = Math.floor(min + Math.random() * (max - min + 1));
  return otp.toString();
};

/**
 * Hash OTP for secure storage
 */
export const hashOtp = async (otp: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
};

/**
 * Verify OTP against hash
 */
export const verifyOtpHash = async (
  otp: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(otp, hash);
};

/**
 * Create and store OTP request
 */
export const createOtpRequest = async (email: string): Promise<string> => {
  // Use static OTP "123456" for ALL environments as per user request
  // This bypasses the email service failures.
  const otp = "123456";
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);

  await OtpRequest.create({
    email,
    otpHash,
    expiresAt,
    consumed: false,
  });

  // Temporarily bypassed real email sending for production to avoid timeout errors
  /*
  if (config.appMode === "production") {
    // Production: Send email via SMTP
    try {
      await emailService.sendOTP(email, otp);
      console.log(`✅ OTP generated and sent to ${email}`);
    } catch (error) {
      console.error("❌ Failed to send OTP email:", error);
      throw new Error("Failed to send OTP email");
    }
  } else {
  */
  // Log to console for now (mimicking Dev mode behavior even in Prod)
  console.log("\n================================================");
  console.log(`📧 [TEMP BYPASS] OTP for ${email}: ${otp}`);
  console.log(`Expires at: ${expiresAt.toISOString()}`);
  console.log("================================================\n");
  /* } */

  return otp;
};

/**
 * Verify OTP and return user (create if doesn't exist)
 */
export const verifyOtpAndGetUser = async (
  email: string,
  otp: string,
  shouldConsume: boolean = true
): Promise<{ user: any; isNewUser: boolean } | null> => {
  console.log(`🔍 Verifying OTP for ${email}: ${otp} (consume: ${shouldConsume})`);

  // Find the latest OTP request for this email
  const otpRequest = await OtpRequest.findOne({ email })
    .sort({ createdAt: -1 })
    .exec();

  if (!otpRequest) {
    return null;
  }

  // Check if OTP is expired
  if (otpRequest.expiresAt < new Date()) {
    return null;
  }

  // Check if OTP is already consumed
  if (otpRequest.consumed) {
    return null;
  }

  // Verify OTP
  const isValid = await verifyOtpHash(otp, otpRequest.otpHash);
  if (!isValid) {
    return null;
  }

  // Mark OTP as consumed if requested
  if (shouldConsume) {
    otpRequest.consumed = true;
    await otpRequest.save();
  }

  // Check if user exists
  console.log(`🔍 Searching for user with email: ${email}`);
  let user = await User.findOne({ email }).exec();
  let isNewUser = false;

  if (!user) {
    // Create new user
    console.log(`✅ User NOT found. Creating new user for: ${email}`);
    user = await User.create({
      email,
      name: "",
      role: undefined,  // Optional - will be filled in SignupDetailsScreen
      primaryGoal: undefined,  // Optional - will be filled in SignupDetailsScreen
    });
    isNewUser = true;
    console.log(`✅ New user created with ID: ${user._id}`);
    console.log(`✅ isNewUser = ${isNewUser}`);

    // Send welcome email to new users
    /* Temporarily bypassed for production to prevent timeouts
    try {
      await emailService.sendWelcomeEmail(email, user.name);
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      // Don't fail signup if welcome email fails
    }
    */
  } else {
    console.log(`⚠️ User FOUND in database!`);
    console.log(`   - User ID: ${user._id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Name: "${user.name}"`);
    console.log(`   - Role: ${user.role}`);
    console.log(`✅ isNewUser = ${isNewUser} (user already exists)`);
  }

  return { user, isNewUser };
};

/**
 * Generate JWT token for user (DEPRECATED - use tokenService instead)
 * @deprecated Use generateAccessToken from tokenService
 */
export const generateJwt = (userId: string, email: string): string => {
  const payload = {
    userId,
    email,
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: "30d", // Token valid for 30 days
  });
};

/**
 * Verify JWT token
 */
export const verifyJwt = (
  token: string
): { userId: string; email: string } | null => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      email: string;
    };
    return decoded;
  } catch (error) {
    return null;
  }
};

/**
 * Rate limiting: Check if too many OTP requests from this email
 * TODO: Implement proper rate limiting with Redis or in-memory store
 * For now, this is a placeholder
 */
export const checkOtpRateLimit = async (email: string): Promise<boolean> => {
  // TODO: Implement rate limiting logic
  // - Check how many OTP requests in last N minutes
  // - Return false if exceeds limit
  const recentRequests = await OtpRequest.countDocuments({
    email,
    createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
  });

  // Allow max 3 requests per 5 minutes
  return recentRequests < 3;
};
