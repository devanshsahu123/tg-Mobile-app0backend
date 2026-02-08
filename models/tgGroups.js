const mongoose = require("mongoose");

// Define the schema
const TgGroupSchema = new mongoose.Schema({
    userKey: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    status: {
        type: Number,
        default: 0,
        enum: [0, 1, 2] // 0: pending, 1: approved, 2: rejected
    },
    views: {
        type: Number,
        default: 0
    }
}, { timestamps: { createdAt: true, updatedAt: false } });

// Create the model
const tgGroupModel = mongoose.model('TgGroup', TgGroupSchema);

// Export the model
module.exports = tgGroupModel
