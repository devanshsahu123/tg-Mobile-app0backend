const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const VoiceTalkAuth = require("../models/voiceTalkAuth");

const JWT_SECRET = process.env.JWT_SECRET || "voicetalk_auth_secret_key_2025";
const TOKEN_EXPIRY = "30d";

const generateToken = (user) => {
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

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

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

    const isMatch = await bcrypt.compare(password, user.password);
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
    const decoded = jwt.verify(token, JWT_SECRET);

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
