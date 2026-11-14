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
    category: {
      type: String,
      default: "Work",
      trim: true,
      index: true,
    },
    recurrence: {
      type: {
        type: String,
        enum: ["None", "Daily", "Weekly", "Monthly", "Custom"],
        default: "None",
      },
      days: [
        {
          type: String, // e.g. "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
        },
      ],
      interval: {
        type: Number,
        default: 1,
      },
    },
    subtasks: [
      {
        id: { type: String },
        title: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],
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

// Calculate next recurrence occurrence date
todoTaskSchema.statics.getNextOccurrence = function (currentDateInput, recurrence) {
  if (!recurrence || recurrence.type === "None") return null;

  const current = new Date(currentDateInput);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (recurrence.type === "Daily") {
    const next = new Date(current);
    next.setDate(next.getDate() + (recurrence.interval || 1));
    return next;
  }

  if (recurrence.type === "Monthly") {
    const next = new Date(current);
    next.setMonth(next.getMonth() + (recurrence.interval || 1));
    return next;
  }

  if (recurrence.type === "Weekly" || recurrence.type === "Custom") {
    const targetDays =
      recurrence.days && recurrence.days.length > 0
        ? recurrence.days
        : [dayNames[current.getDay()]];

    const targetDayIndices = targetDays
      .map((d) => {
        if (!d || typeof d !== "string") return -1;
        const lower = d.trim().toLowerCase();
        return dayNames.findIndex(
          (dn) =>
            dn.toLowerCase() === lower ||
            lower.startsWith(dn.toLowerCase()) ||
            dn.toLowerCase().startsWith(lower)
        );
      })
      .filter((idx) => idx !== -1)
      .sort((a, b) => a - b);

    if (targetDayIndices.length === 0) {
      const next = new Date(current);
      next.setDate(next.getDate() + 7);
      return next;
    }

    const currentDay = current.getDay();
    // Find next day in the same week cycle
    const nextDayThisWeek = targetDayIndices.find((idx) => idx > currentDay);
    if (nextDayThisWeek !== undefined) {
      const next = new Date(current);
      next.setDate(next.getDate() + (nextDayThisWeek - currentDay));
      return next;
    }

    // Wrap to first day of next week cycle
    const firstDayNextWeek = targetDayIndices[0];
    const daysUntilNext = 7 - currentDay + firstDayNextWeek;
    const next = new Date(current);
    next.setDate(next.getDate() + daysUntilNext);
    return next;
  }

  return null;
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

