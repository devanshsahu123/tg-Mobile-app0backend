const ColdEmailLead = require("../models/coldEmailLead");

// Render the EJS cold email dashboard page
const renderColdEmailPage = async (req, res) => {
    try {
        res.render("cold-email");
    } catch (error) {
        console.error("Error rendering cold email page:", error);
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

        // Clean and prepare leads
        const cleanedLeads = leads.map(lead => ({
            businessName: String(lead.businessName || "").trim(),
            clientName: String(lead.clientName || "").trim(),
            mobileNumber: String(lead.mobileNumber || "").trim(),
            email: String(lead.email || "").trim(),
            City: String(lead.City || "").trim()
        }));

        // ── Application-level duplicate check ────────────────────────────────
        // Collect all non-empty emails and mobile numbers from the incoming batch
        const incomingEmails  = cleanedLeads.map(l => l.email).filter(Boolean);
        const incomingMobiles = cleanedLeads.map(l => l.mobileNumber).filter(Boolean);

        // Query the DB once for any records that already have these values
        const existing = await ColdEmailLead.find({
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
        // ────────────────────────────────────────────────────────────────────

        let successCount  = 0;
        let duplicateCount = duplicates.length;

        if (newLeads.length > 0) {
            const result = await ColdEmailLead.insertMany(newLeads, { ordered: false });
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
        console.error("Error importing leads:", error);
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

        const query = {};

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

        const totalLeads = await ColdEmailLead.countDocuments(query);
        const leads = await ColdEmailLead.find(query)
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
        console.error("Error retrieving leads:", error);
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
        const result = await ColdEmailLead.deleteMany({});
        return res.status(200).json({
            success: true,
            message: `Successfully cleared all leads. Deleted ${result.deletedCount} items.`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error("Error clearing leads:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to clear leads database.",
            error: error.message
        });
    }
};

module.exports = {
    renderColdEmailPage,
    importLeads,
    getLeads,
    clearLeads
};
