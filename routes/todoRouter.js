const express = require("express");
const router = express.Router();
const {
  sendOtp,
  verifyOtp,
  resendOtp,
  emailLogin,
  emailRegister,
  guestAuth,
  googleAuth,
  createTask,
  getTasks,
  getWeeklySummary,
  updateTask,
  toggleStatus,
  deleteTask,
  renameCategory,
  deleteCategory,
} = require("../controllers/todoController");

// Authentication
router.post("/auth/send-otp", sendOtp);
router.post("/auth/verify-otp", verifyOtp);
router.post("/auth/resend-otp", resendOtp);
router.post("/auth/register", emailRegister);
router.post("/auth/login", emailLogin);
router.post("/auth/guest", guestAuth);
router.post("/auth/google", googleAuth);

// Task Management
router.post("/tasks", createTask);
router.get("/tasks", getTasks);
router.get("/summary", getWeeklySummary);
router.put("/tasks/:id", updateTask);
router.patch("/tasks/:id/status", toggleStatus);
router.delete("/tasks/:id", deleteTask);

// Category Management
router.put("/categories/rename", renameCategory);
router.post("/categories/delete", deleteCategory);

module.exports = router;

