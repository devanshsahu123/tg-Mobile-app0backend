const crypto = require("crypto");
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
 * Register with Email and Password
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

    const existingUser = await VoiceTalkAuth.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists. Please log in.",
      });
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await VoiceTalkAuth.create({
      email: normalizedEmail,
      password: hashedPassword,
      name: (name || "").trim() || normalizedEmail.split("@")[0],
      authProvider: "email",
      lastLogin: new Date(),
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        avatar: newUser.avatar,
        authProvider: newUser.authProvider,
      },
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
 * Login with Email and Password
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
 * Google / Gmail Sign In
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
        lastLogin: new Date(),
      });
    } else {
      if (googleId && !user.googleId) user.googleId = googleId;
      if (avatar && !user.avatar) user.avatar = avatar;
      if (name && (!user.name || user.name === normalizedEmail.split("@")[0])) user.name = name;
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
