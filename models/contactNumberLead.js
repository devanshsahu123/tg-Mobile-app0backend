const mongoose = require("mongoose");

const ContactNumberLeadSchema = new mongoose.Schema({
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
    messageSentCount: {
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
ContactNumberLeadSchema.index(
    { email: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { email: { $gt: "" } } 
    }
);
ContactNumberLeadSchema.index(
    { mobileNumber: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { mobileNumber: { $gt: "" } } 
    }
);
ContactNumberLeadSchema.index({ businessName: "text", clientName: "text", City: "text" });

const ContactNumberLead = mongoose.model("ContactNumberLead", ContactNumberLeadSchema);

// Force cleanup of stale indexes and apply unique indexes immediately
ContactNumberLead.cleanIndexes().then(() => {
    ContactNumberLead.createIndexes().catch(err => {
        console.error("Mongoose unique index creation failed for ContactNumberLead:", err);
    });
}).catch(err => {
    console.error("Mongoose index cleanup failed for ContactNumberLead:", err);
});

module.exports = ContactNumberLead;
