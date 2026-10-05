const crypto = require("crypto");
const nodemailer = require("nodemailer");
const VoiceTalkAuth = require("../models/voiceTalkAuth");

let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch (_) {}

let jwt = null;
try {
  jwt = require("jsonwebtoken");
} catch (_) {}

const JWT_SECRET = process.env.JWT_SECRET || "voicetalk_auth_secret_key_2025";
const TOKEN_EXPIRY = "30d";

/**
 * Universal secure password hashing (works with bcryptjs or built-in Node.js crypto)
 */
const hashPassword = async (password) => {
  if (bcrypt) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
};

/**
 * Universal password verification
 */
const verifyPassword = async (password, storedHash) => {
  if (!storedHash) return false;
  if (storedHash.startsWith("scrypt:")) {
    const [, salt, hash] = storedHash.split(":");
    const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(testHash, "hex"));
  }
  if (bcrypt) {
    return await bcrypt.compare(password, storedHash);
  }
  return false;
};

/**
 * Universal token generation (works with jsonwebtoken or built-in HMAC-SHA256)
 */
const generateToken = (user) => {
  if (jwt) {
    return jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
  }
  const payload = Buffer.from(
    JSON.stringify({
      userId: user._id,
      email: user.email,
      name: user.name,
      authProvider: user.authProvider,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

/**
 * Verify token
 */
const verifyToken = (token) => {
  if (jwt) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (_) {}
  }
  try {
    const [payload, signature] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("base64url");
    if (signature !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch (_) {
    return null;
  }
};

/**
 * Nodemailer Transporter Setup
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send 6-digit confirmation code via Gmail
 */
const sendConfirmationEmail = async (email, code, name = "") => {
  const transporter = createTransporter();
  const mailOptions = {
    from: `"VoiceTalk App" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} is your VoiceTalk confirmation code`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 26px;">VoiceTalk</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">English Speaking Practice</p>
        </div>
        <p style="color: #1e293b; font-size: 15px; margin-bottom: 12px;">Hello <b>${name || "Learner"}</b>,</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          Thank you for signing up! Enter the 6-digit confirmation code below in the VoiceTalk app to verify your account:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="display: inline-block; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2563eb; background-color: #eff6ff; padding: 14px 28px; border-radius: 12px; border: 2px dashed #93c5fd;">
            ${code}
          </span>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 24px;">
          This code will expire in <b>10 minutes</b>. Once confirmed, you can log in with your password.
        </p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
          If you didn't request this email, you can safely ignore it.
        </p>
      </div>
    `,
    text: `Your VoiceTalk confirmation code is: ${code}. This code is valid for 10 minutes.`,
  };

  return await transporter.sendMail(mailOptions);
};

/**
 * Register with Email and Password
 * Generates 6-digit confirmation code and sends to user's Gmail
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    // Check if user already exists
    const existingUser = await VoiceTalkAuth.findOne({ email: normalizedEmail });
    if (existingUser && existingUser.isVerified) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists. Please log in.",
      });
    }

    const hashedPassword = await hashPassword(password);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user = existingUser;
    if (!user) {
      user = await VoiceTalkAuth.create({
        email: normalizedEmail,
        password: hashedPassword,
        name: (name || "").trim() || normalizedEmail.split("@")[0],
        authProvider: "email",
        isVerified: false,
        verificationCode: code,
        verificationCodeExpires: expires,
        lastLogin: new Date(),
      });
    } else {
      // User was not verified yet, update password and new code
      user.password = hashedPassword;
      if (name) user.name = name.trim();
      user.verificationCode = code;
      user.verificationCodeExpires = expires;
      user.isVerified = false;
      await user.save();
    }

    // Send confirmation email
    try {
      await sendConfirmationEmail(normalizedEmail, code, user.name);
      console.log(`[VoiceTalkAuth] Confirmation code ${code} sent to ${normalizedEmail}`);
    } catch (mailError) {
      console.error("[VoiceTalkAuth] Mail sending error:", mailError);
      return res.status(500).json({
        success: false,
        message: `Failed to send email to ${normalizedEmail}. Please check the email address.`,
        error: mailError.message,
      });
    }

    return res.status(200).json({
      success: true,
      requiresVerification: true,
      message: `Confirmation code sent to ${normalizedEmail}. Please check your inbox.`,
      email: normalizedEmail,
    });
  } catch (error) {
    console.error("[VoiceTalkAuth] Register error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Verify Confirmation Code
 * When verified, marks isVerified: true and directs user to log in
 */
exports.verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: "Email and confirmation code are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await VoiceTalkAuth.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found. Please register first.",
      });
    }

    if (user.isVerified) {
      return res.status(200).json({
        success: true,
        message: "Account is already confirmed. Please log in.",
        email: user.email,
      });
    }

    if (!user.verificationCode || user.verificationCode !== code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid confirmation code. Please check your email.",
      });
    }

    if (user.verificationCodeExpires && new Date() > user.verificationCodeExpires) {
      return res.status(400).json({
        success: false,
        message: "Confirmation code has expired. Please request a new one.",
      });
    }

    // Code is valid! Mark verified and clear code
    user.isVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email confirmed successfully! You can now log in.",
      email: user.email,
    });
  } catch (error) {
    console.error("[VoiceTalkAuth] VerifyCode error:", error);
    return res.status(500).json({
      success: false,
      message: "Verification failed. Please try again.",
      error: error.message,
    });
  }
};

/**
 * Resend Confirmation Code
 */
exports.resendCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await VoiceTalkAuth.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found. Please register first.",
      });
    }

    if (user.isVerified) {
      return res.status(200).json({
        success: true,
        message: "Account is already confirmed. Please log in.",
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationCode = code;
    user.verificationCodeExpires = expires;
    await user.save();

    await sendConfirmationEmail(normalizedEmail, code, user.name);

    return res.status(200).json({
      success: true,
      message: `A new confirmation code has been sent to ${normalizedEmail}.`,
      email: normalizedEmail,
    });
  } catch (error) {
    console.error("[VoiceTalkAuth] ResendCode error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend confirmation code.",
      error: error.message,
    });
  }
};

/**
 * Login with Email and Password
 * Enforces email verification before granting access
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await VoiceTalkAuth.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "This account was registered with Google. Please use Google Login.",
      });
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Check email verification status
    if (user.isVerified === false && user.authProvider === "email") {
      // Auto-send a fresh code so user can verify immediately
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      user.verificationCode = code;
      user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      try {
        await sendConfirmationEmail(user.email, code, user.name);
      } catch (_) {}

      return res.status(403).json({
        success: false,
        requiresVerification: true,
        message: `Please verify your email before logging in. A confirmation code has been sent to ${user.email}.`,
        email: user.email,
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("[VoiceTalkAuth] Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again later.",
      error: error.message,
    });
  }
};

/**
 * Google / Gmail Sign In (Google accounts are pre-verified)
 */
exports.googleLogin = async (req, res) => {
  try {
    const { email, name, googleId, avatar } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Google email is required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    let user = await VoiceTalkAuth.findOne({ email: normalizedEmail });

    if (!user) {
      user = await VoiceTalkAuth.create({
        email: normalizedEmail,
        name: (name || "").trim() || normalizedEmail.split("@")[0],
        googleId: googleId || null,
        avatar: avatar || "",
        authProvider: "google",
        isVerified: true,
        lastLogin: new Date(),
      });
    } else {
      if (googleId && !user.googleId) user.googleId = googleId;
      if (avatar && !user.avatar) user.avatar = avatar;
      if (name && (!user.name || user.name === normalizedEmail.split("@")[0])) user.name = name;
      user.isVerified = true;
      user.lastLogin = new Date();
      await user.save();
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Google login successful.",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("[VoiceTalkAuth] Google login error:", error);
    return res.status(500).json({
      success: false,
      message: "Google authentication failed.",
      error: error.message,
    });
  }
};

/**
 * Get Authenticated User Profile
 */
exports.getMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required.",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token.",
      });
    }

    const user = await VoiceTalkAuth.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.authProvider,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};
