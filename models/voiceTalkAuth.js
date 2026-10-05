const mongoose = require("mongoose");

const voiceTalkAuthSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: function () {
        return this.authProvider === "email";
      },
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    authProvider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
    },
    googleId: {
      type: String,
      sparse: true,
      default: null,
    },
    avatar: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "voiceTalkAuth",
  }
);

// Explicit collection name "voiceTalkAuth" as requested
const VoiceTalkAuth = mongoose.model("VoiceTalkAuth", voiceTalkAuthSchema, "voiceTalkAuth");

module.exports = VoiceTalkAuth;
