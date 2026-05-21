const ColdEmailLead = require("../models/coldEmailLead");
const nodemailer = require("nodemailer");

const fs = require("fs");
const path = require("path");

// Render the EJS cold email dashboard page
const renderColdEmailPage = async (req, res) => {
    try {
        let templates = [];
        const templatesPath = path.join(__dirname, "../cold-mail-formate.json");
        if (fs.existsSync(templatesPath)) {
            try {
                const data = fs.readFileSync(templatesPath, "utf8");
                templates = JSON.parse(data);
            } catch (err) {
                console.error("Error parsing cold-mail-formate.json:", err);
            }
        }
        res.render("cold-email", { templates });
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

        // Query the DB once for active records that already have these values
        const existing = await ColdEmailLead.find({
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

        const query = { status: 0 };

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

// Send cold emails to selected leads
const sendColdEmails = async (req, res) => {
    try {
        const { leadIds, subjectTemplate, bodyTemplate } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ success: false, message: "No leads selected." });
        }
        if (!subjectTemplate || !bodyTemplate) {
            return res.status(400).json({ success: false, message: "Subject and body templates are required." });
        }

        // Setup Nodemailer transporter
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const leads = await ColdEmailLead.find({ _id: { $in: leadIds }, status: 0 });
        let successCount = 0;
        let failCount = 0;
        const successfulLeadIds = [];

        for (const lead of leads) {
            if (!lead.email) {
                failCount++;
                continue; // Skip if no email
            }

            // Replace template variables
            let subject = subjectTemplate
                .replace(/{{businessName}}/g, lead.businessName || "")
                .replace(/{{clientName}}/g, lead.clientName || "")
                .replace(/{{City}}/g, lead.City || "");
            
            let htmlBody = bodyTemplate
                .replace(/{{businessName}}/g, lead.businessName || "")
                .replace(/{{clientName}}/g, lead.clientName || "")
                .replace(/{{City}}/g, lead.City || "");

            // Convert newlines to <br> for HTML email
            htmlBody = htmlBody.replace(/\n/g, '<br>');

            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM,
                    to: lead.email,
                    subject: subject,
                    html: htmlBody,
                });
                successCount++;
                successfulLeadIds.push(lead._id);
            } catch (err) {
                console.error(`Failed to send email to ${lead.email}:`, err);
                failCount++;
            }
        }

        // Increment emailSentCount for successful sends
        if (successfulLeadIds.length > 0) {
            await ColdEmailLead.updateMany(
                { _id: { $in: successfulLeadIds } },
                { $inc: { emailSentCount: 1 } }
            );
        }

        return res.status(200).json({
            success: true,
            message: `Emails sent successfully. Success: ${successCount}, Failed: ${failCount}`,
            successCount,
            failCount
        });

    } catch (error) {
        console.error("Error sending cold emails:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send emails due to server error.",
            error: error.message
        });
    }
};

module.exports = {
    renderColdEmailPage,
    importLeads,
    getLeads,
    clearLeads,
    sendColdEmails
};
