const router = require("express").Router();
const { 
    renderContactNumberPage, 
    importLeads, 
    getLeads, 
    clearLeads,
    markLeadsAsSent
} = require("../controllers/contactNumberController");

// Render dashboard view
router.get("/", renderContactNumberPage);

// Save bulk uploaded leads
router.post("/import", importLeads);

// API endpoint to fetch leads
router.get("/leads", getLeads);

// API endpoint to clear leads
router.delete("/leads/clear", clearLeads);

// API endpoint to mark leads as messaged (increment count)
router.post("/leads/sent", markLeadsAsSent);

module.exports = router;
