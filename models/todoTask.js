const mongoose = require("mongoose");

const todoTaskSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: null,
      index: true,
    },
    userEmail: {
      type: String,
      default: null,
      index: true,
    },
    guestId: {
      type: String,
      default: null,
      index: true,
    },
    isGuest: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      required: [true, "Title is mandatory"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    dueDate: {
      type: Date,
      required: [true, "Date and Time is mandatory"],
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["In Progress", "Completed"],
      default: "In Progress",
      index: true,
    },
    // Calculated week metadata (Monday to Sunday)
    weekStartDate: {
      type: Date,
      index: true,
    },
    weekEndDate: {
      type: Date,
    },
    weekNumber: {
      type: Number,
      index: true,
    },
    year: {
      type: Number,
      index: true,
    },
    weekKey: {
      type: String, // e.g. "2026-W46"
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helper function to calculate Monday-Sunday week bounds
todoTaskSchema.statics.getWeekBounds = function (dateInput) {
  const date = new Date(dateInput);
  // Get day of week: 0 is Sun, 1 is Mon, ..., 6 is Sat
  const day = date.getDay();
  // In Monday-Sunday week: Monday is day 0, Sunday is day 6
  // If day is 0 (Sunday), diff to previous Monday is -6 days. Otherwise diff is 1 - day.
  const diffToMonday = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Compute ISO week number
  const target = new Date(monday.valueOf());
  target.setDate(target.getDate() + 3); // Thursday determines year
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
  const year = monday.getFullYear();
  const weekKey = `${year}-W${String(weekNumber).padStart(2, "0")}`;

  return { monday, sunday, weekNumber, year, weekKey };
};

// Pre-save hook to populate week metadata
todoTaskSchema.pre("save", function (next) {
  if (this.isModified("dueDate") || !this.weekStartDate) {
    const { monday, sunday, weekNumber, year, weekKey } =
      this.constructor.getWeekBounds(this.dueDate);
    this.weekStartDate = monday;
    this.weekEndDate = sunday;
    this.weekNumber = weekNumber;
    this.year = year;
    this.weekKey = weekKey;
  }
  next();
});

module.exports = mongoose.model("TodoTask", todoTaskSchema);

