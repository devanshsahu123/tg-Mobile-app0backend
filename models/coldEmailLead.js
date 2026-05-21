const mongoose = require("mongoose");

const ColdEmailLeadSchema = new mongoose.Schema({
    businessName: {
        type: String,
        default: ""
    },
    clientName: {
        type: String,
        default: ""
    },
    mobileNumber: {
        type: String,
        default: ""
    },
    email: {
        type: String,
        default: ""
    },
    City: {
        type: String,
        default: ""
    },
    emailSentCount: {
        type: Number,
        default: 0
    },
    status: {
        type: Number,
        default: 0 // 0: Active, 1: Deleted
    }
}, { 
    timestamps: true 
});

// Create unique indices on email and mobileNumber, ignoring empty strings to avoid duplicate conflicts
ColdEmailLeadSchema.index(
    { email: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { email: { $gt: "" } } 
    }
);
ColdEmailLeadSchema.index(
    { mobileNumber: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { mobileNumber: { $gt: "" } } 
    }
);
ColdEmailLeadSchema.index({ businessName: "text", clientName: "text", City: "text" });

const ColdEmailLead = mongoose.model("ColdEmailLead", ColdEmailLeadSchema);

// Force cleanup of stale indexes and apply unique indexes immediately
ColdEmailLead.cleanIndexes().then(() => {
    ColdEmailLead.createIndexes().catch(err => {
        console.error("Mongoose unique index creation failed:", err);
    });
}).catch(err => {
    console.error("Mongoose index cleanup failed:", err);
});

module.exports = ColdEmailLead;
