const ContactNumberLead = require("../models/contactNumberLead");
const fs = require("fs");
const path = require("path");

// Render the EJS contact number dashboard page
const renderContactNumberPage = async (req, res) => {
    try {
        let templates = [];
        const templatesPath = path.join(__dirname, "../contact-number-format.json");
        if (fs.existsSync(templatesPath)) {
            try {
                const data = fs.readFileSync(templatesPath, "utf8");
                templates = JSON.parse(data);
            } catch (err) {
                console.error("Error parsing contact-number-format.json:", err);
            }
        }
        res.render("contact-number", { templates });
    } catch (error) {
        console.error("Error rendering contact number page:", error);
        res.status(500).send("Internal Server Error");
    }
};

// Import leads in bulk
const importLeads = async (req, res) => {
    try {
        const { leads } = req.body;
        if (!leads || !Array.isArray(leads) || leads.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid leads data. Expected an array of leads."
            });
        }

        // Clean and prepare leads (already cleaned client-side, but standardizing as a safety measure)
        const cleanedLeads = leads.map(lead => ({
            businessName: String(lead.businessName || "").trim(),
            clientName: String(lead.clientName || "").trim(),
            mobileNumber: String(lead.mobileNumber || "").trim(),
            email: String(lead.email || "").trim(),
            City: String(lead.City || "").trim()
        }));

        // Collect all non-empty emails and mobile numbers from the incoming batch
        const incomingEmails  = cleanedLeads.map(l => l.email).filter(Boolean);
        const incomingMobiles = cleanedLeads.map(l => l.mobileNumber).filter(Boolean);

        // Query the DB once for active records that already have these values
        const existing = await ContactNumberLead.find({
            status: 0,
            $or: [
                ...(incomingEmails.length  ? [{ email:        { $in: incomingEmails  } }] : []),
                ...(incomingMobiles.length ? [{ mobileNumber: { $in: incomingMobiles } }] : [])
            ]
        }).select("email mobileNumber").lean();

        // Build fast lookup Sets
        const existingEmails  = new Set(existing.map(r => r.email).filter(Boolean));
        const existingMobiles = new Set(existing.map(r => r.mobileNumber).filter(Boolean));

        // Split batch into new vs duplicates
        const newLeads    = [];
        const duplicates  = [];

        cleanedLeads.forEach(lead => {
            const emailDup  = lead.email        && existingEmails.has(lead.email);
            const mobileDup = lead.mobileNumber && existingMobiles.has(lead.mobileNumber);

            if (emailDup || mobileDup) {
                duplicates.push(lead);
            } else {
                // Add to existing sets so intra-batch duplicates are also caught
                if (lead.email)        existingEmails.add(lead.email);
                if (lead.mobileNumber) existingMobiles.add(lead.mobileNumber);
                newLeads.push(lead);
            }
        });

        let successCount  = 0;
        let duplicateCount = duplicates.length;

        if (newLeads.length > 0) {
            const result = await ContactNumberLead.insertMany(newLeads, { ordered: false });
            successCount = result.length;
        }

        if (duplicateCount > 0) {
            return res.status(200).json({
                success: true,
                message: `Imported ${successCount} new leads. Skipped ${duplicateCount} duplicate records (email or mobile already exists).`,
                count: successCount,
                duplicates: duplicateCount
            });
        }

        return res.status(200).json({
            success: true,
            message: `Successfully imported ${successCount} leads.`,
            count: successCount
        });

    } catch (error) {
        console.error("Error importing contact leads:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to import leads due to a server error.",
            error: error.message
        });
    }
};

// Retrieve leads with pagination, search filter, and sorting
const getLeads = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search ? String(req.query.search).trim() : "";
        const sentFilter = req.query.sentFilter ? String(req.query.sentFilter).trim() : "all";

        const query = { status: 0 };

        if (sentFilter === "never") {
            query.messageSentCount = 0;
        } else if (sentFilter === "sent") {
            query.messageSentCount = { $gt: 0 };
        }

        if (search) {
            const searchRegex = new RegExp(search, "i");
            query.$or = [
                { businessName: searchRegex },
                { clientName: searchRegex },
                { mobileNumber: searchRegex },
                { email: searchRegex },
                { City: searchRegex }
            ];
        }

        const skip = (page - 1) * limit;

        const totalLeads = await ContactNumberLead.countDocuments(query);
        const leads = await ContactNumberLead.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return res.status(200).json({
            success: true,
            data: leads,
            pagination: {
                totalItems: totalLeads,
                totalPages: Math.ceil(totalLeads / limit),
                currentPage: page,
                limit: limit
            }
        });
    } catch (error) {
        console.error("Error retrieving contact leads:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch leads.",
            error: error.message
        });
    }
};

// Delete all leads
const clearLeads = async (req, res) => {
    try {
        const result = await ContactNumberLead.deleteMany({});
        return res.status(200).json({
            success: true,
            message: `Successfully cleared all leads. Deleted ${result.deletedCount} items.`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error("Error clearing contact leads:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to clear leads database.",
            error: error.message
        });
    }
};

// Increment messageSentCount for leads after client-side WhatsApp send
const markLeadsAsSent = async (req, res) => {
    try {
        const { leadIds } = req.body;
        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ success: false, message: "No leads provided." });
        }

        const result = await ContactNumberLead.updateMany(
            { _id: { $in: leadIds }, status: 0 },
            { $inc: { messageSentCount: 1 } }
        );

        return res.status(200).json({
            success: true,
            message: `Successfully updated sent count for ${result.modifiedCount} leads.`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("Error marking contact leads as sent:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update sent count.",
            error: error.message
        });
    }
};

module.exports = {
    renderContactNumberPage,
    importLeads,
    getLeads,
    clearLeads,
    markLeadsAsSent
};
