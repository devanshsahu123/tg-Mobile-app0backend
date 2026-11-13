const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/todoController");

// Authentication
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

module.exports = router;

