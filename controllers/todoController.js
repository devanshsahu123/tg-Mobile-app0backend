const TodoTask = require("../models/todoTask");
const VoiceTalkAuth = require("../models/voiceTalkAuth");
const crypto = require("crypto");

let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch (_) {}

let jwt = null;
try {
  jwt = require("jsonwebtoken");
} catch (_) {}

const JWT_SECRET = process.env.JWT_SECRET || "voicetalk_auth_secret_key_2025";

const hashPassword = async (password) => {
  if (bcrypt) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
};

const verifyPassword = async (password, storedHash) => {
  if (!storedHash) return false;
  if (storedHash.startsWith("scrypt:")) {
    const [, salt, hash] = storedHash.split(":");
    const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(testHash, "hex")
    );
  }
  if (bcrypt) {
    return await bcrypt.compare(password, storedHash);
  }
  return false;
};

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
      { expiresIn: "30d" }
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
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
};

// Helper to extract user identity from headers or query
const extractUserIdentity = (req) => {
  const authHeader = req.headers.authorization;
  let tokenUser = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (jwt) {
      try {
        tokenUser = jwt.verify(token, JWT_SECRET);
      } catch (_) {}
    }
    if (!tokenUser) {
      try {
        const [payload, sig] = token.split(".");
        const expectedSig = crypto
          .createHmac("sha256", JWT_SECRET)
          .update(payload)
          .digest("base64url");
        if (sig === expectedSig) {
          tokenUser = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8")
          );
        }
      } catch (_) {}
    }
  }

  const guestId =
    req.headers["x-guest-id"] ||
    req.query.guestId ||
    req.body.guestId ||
    null;

  return {
    userId: tokenUser ? tokenUser.userId || tokenUser.id : null,
    userEmail: tokenUser ? tokenUser.email : null,
    guestId: guestId,
    isGuest: !tokenUser && !!guestId,
  };
};

/**
 * Email Register for To-Do
 */
exports.emailRegister = async (req, res) => {
  try {
    const { email, password, name, guestId } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let existingUser = await VoiceTalkAuth.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists. Please log in.",
      });
    }

    const hashedPassword = await hashPassword(password);
    const displayName = (name || "").trim() || normalizedEmail.split("@")[0];

    const newUser = await VoiceTalkAuth.create({
      email: normalizedEmail,
      password: hashedPassword,
      name: displayName,
      authProvider: "email",
      isVerified: true,
      lastLogin: new Date(),
    });

    const token = generateToken(newUser);

    // If there were guest tasks, link them to the new account!
    if (guestId) {
      await TodoTask.updateMany(
        { guestId: guestId, userId: null },
        {
          $set: {
            userId: newUser._id.toString(),
            userEmail: newUser.email,
            isGuest: false,
          },
        }
      );
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        avatar: newUser.avatar,
        authProvider: newUser.authProvider,
        isGuest: false,
      },
    });
  } catch (error) {
    console.error("[Todo] emailRegister error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
      error: error.message,
    });
  }
};

/**
 * Email Login for To-Do
 */
exports.emailLogin = async (req, res) => {
  try {
    const { email, password, guestId } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required.",
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
        message: "This account was registered using Google. Please set a password or use Google.",
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

    // Link guest tasks to this user if guestId provided
    if (guestId) {
      await TodoTask.updateMany(
        { guestId: guestId, userId: null },
        {
          $set: {
            userId: user._id.toString(),
            userEmail: user.email,
            isGuest: false,
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Logged in successfully.",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.authProvider,
        isGuest: false,
      },
    });
  } catch (error) {
    console.error("[Todo] emailLogin error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
      error: error.message,
    });
  }
};

/**
 * Guest Login / Handshake
 */
exports.guestAuth = async (req, res) => {
  try {
    let { guestId, name } = req.body;
    if (!guestId) {
      guestId = "guest_" + crypto.randomUUID();
    }
    return res.status(200).json({
      success: true,
      isGuest: true,
      guestId,
      user: {
        id: guestId,
        name: name || "Guest User",
        email: null,
        isGuest: true,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to initialize guest session.",
      error: error.message,
    });
  }
};

/**
 * Google Sign In for To-Do
 */
exports.googleAuth = async (req, res) => {
  try {
    const { email, name, googleId, avatar } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
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
      if (name && (!user.name || user.name === normalizedEmail.split("@")[0])) {
        user.name = name;
      }
      user.isVerified = true;
      user.lastLogin = new Date();
      await user.save();
    }

    // Generate token
    let token = "";
    if (jwt) {
      token = jwt.sign(
        {
          userId: user._id,
          email: user.email,
          name: user.name,
          authProvider: user.authProvider,
        },
        JWT_SECRET,
        { expiresIn: "30d" }
      );
    } else {
      const payload = Buffer.from(
        JSON.stringify({
          userId: user._id,
          email: user.email,
          name: user.name,
          authProvider: user.authProvider,
          exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        })
      ).toString("base64url");
      const signature = crypto
        .createHmac("sha256", JWT_SECRET)
        .update(payload)
        .digest("base64url");
      token = `${payload}.${signature}`;
    }

    // If guestId was provided, migrate guest tasks to this user!
    const { guestId } = req.body;
    if (guestId) {
      await TodoTask.updateMany(
        { guestId: guestId, userId: null },
        {
          $set: {
            userId: user._id.toString(),
            userEmail: user.email,
            isGuest: false,
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Logged in successfully with Google.",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        authProvider: user.authProvider,
        isGuest: false,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Google login failed.",
      error: error.message,
    });
  }
};

/**
 * Create Task
 */
exports.createTask = async (req, res) => {
  try {
    const { userId, userEmail, guestId, isGuest } = extractUserIdentity(req);
    const { title, description, dueDate, priority } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title is mandatory.",
      });
    }

    if (!dueDate) {
      return res.status(400).json({
        success: false,
        message: "Date & Time is mandatory.",
      });
    }

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid Date & Time provided.",
      });
    }

    const { monday, sunday, weekNumber, year, weekKey } =
      TodoTask.getWeekBounds(parsedDate);

    const task = new TodoTask({
      userId: userId || null,
      userEmail: userEmail || null,
      guestId: guestId || null,
      isGuest: isGuest || (!userId && !!guestId),
      title: title.trim(),
      description: (description || "").trim(),
      dueDate: parsedDate,
      priority: priority || "Medium",
      status: "In Progress",
      weekStartDate: monday,
      weekEndDate: sunday,
      weekNumber,
      year,
      weekKey,
    });

    await task.save();

    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      task,
    });
  } catch (error) {
    console.error("[Todo] CreateTask error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create task.",
      error: error.message,
    });
  }
};

/**
 * Get All Tasks (with search, filter by week, filter by status)
 */
exports.getTasks = async (req, res) => {
  try {
    const { userId, guestId } = extractUserIdentity(req);

    // Build filter based on identity
    const filter = {};
    if (userId) {
      filter.$or = [{ userId: userId }, { guestId: guestId || "____never____" }];
    } else if (guestId) {
      filter.guestId = guestId;
    } else {
      // Default fallback if no identity provided
      return res.status(200).json({
        success: true,
        tasks: [],
      });
    }

    // Search query
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), "i");
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ title: searchRegex }, { description: searchRegex }],
      });
    }

    // Week filter
    if (req.query.weekKey) {
      filter.weekKey = req.query.weekKey;
    }

    // Status filter
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const tasks = await TodoTask.find(filter).sort({ dueDate: 1, createdAt: 1 });

    return res.status(200).json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error("[Todo] GetTasks error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tasks.",
      error: error.message,
    });
  }
};

/**
 * Get Weekly Summary
 * Groups tasks by week (starts Monday, ends Sunday)
 * Calculates Open Tasks & Completed Tasks count for each week
 */
exports.getWeeklySummary = async (req, res) => {
  try {
    const { userId, guestId } = extractUserIdentity(req);

    const filter = {};
    if (userId) {
      filter.$or = [{ userId: userId }, { guestId: guestId || "____never____" }];
    } else if (guestId) {
      filter.guestId = guestId;
    } else {
      return res.status(200).json({
        success: true,
        weeks: [],
      });
    }

    // Optional search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), "i");
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ title: searchRegex }, { description: searchRegex }],
      });
    }

    const tasks = await TodoTask.find(filter).sort({ dueDate: 1, createdAt: 1 });

    // Group tasks into weeks
    const weekMap = new Map();

    for (const task of tasks) {
      const key = task.weekKey;
      if (!weekMap.has(key)) {
        weekMap.set(key, {
          weekKey: key,
          weekNumber: task.weekNumber,
          year: task.year,
          weekStartDate: task.weekStartDate,
          weekEndDate: task.weekEndDate,
          totalTasks: 0,
          openTasks: 0,
          completedTasks: 0,
          tasks: [],
        });
      }

      const weekGroup = weekMap.get(key);
      weekGroup.totalTasks += 1;
      if (task.status === "Completed") {
        weekGroup.completedTasks += 1;
      } else {
        weekGroup.openTasks += 1;
      }
      weekGroup.tasks.push(task);
    }

    // Convert to sorted array (chronological by weekStartDate)
    const weeks = Array.from(weekMap.values()).sort(
      (a, b) => new Date(a.weekStartDate) - new Date(b.weekStartDate)
    );

    return res.status(200).json({
      success: true,
      weeks,
      totalCount: tasks.length,
    });
  } catch (error) {
    console.error("[Todo] GetWeeklySummary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate weekly summary.",
      error: error.message,
    });
  }
};

/**
 * Update Task
 */
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, dueDate, priority, status } = req.body;

    const task = await TodoTask.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Title cannot be empty.",
        });
      }
      task.title = title.trim();
    }

    if (description !== undefined) {
      task.description = description.trim();
    }

    if (priority !== undefined) {
      task.priority = priority;
    }

    if (status !== undefined) {
      task.status = status;
    }

    if (dueDate !== undefined) {
      const parsedDate = new Date(dueDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid Date & Time provided.",
        });
      }
      task.dueDate = parsedDate;
      const { monday, sunday, weekNumber, year, weekKey } =
        TodoTask.getWeekBounds(parsedDate);
      task.weekStartDate = monday;
      task.weekEndDate = sunday;
      task.weekNumber = weekNumber;
      task.year = year;
      task.weekKey = weekKey;
    }

    await task.save();

    return res.status(200).json({
      success: true,
      message: "Task updated successfully.",
      task,
    });
  } catch (error) {
    console.error("[Todo] UpdateTask error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update task.",
      error: error.message,
    });
  }
};

/**
 * Toggle Task Status (In Progress <-> Completed)
 */
exports.toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await TodoTask.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    task.status = task.status === "Completed" ? "In Progress" : "Completed";
    await task.save();

    return res.status(200).json({
      success: true,
      message: `Task marked as ${task.status}.`,
      task,
    });
  } catch (error) {
    console.error("[Todo] ToggleStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle task status.",
      error: error.message,
    });
  }
};

/**
 * Delete Task
 */
exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await TodoTask.findByIdAndDelete(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully.",
      deletedTaskId: id,
    });
  } catch (error) {
    console.error("[Todo] DeleteTask error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete task.",
      error: error.message,
    });
  }
};

