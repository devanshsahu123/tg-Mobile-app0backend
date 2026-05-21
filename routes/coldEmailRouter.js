const router = require("express").Router();
const { 
    renderColdEmailPage, 
    importLeads, 
    getLeads, 
    clearLeads 
} = require("../controllers/coldEmailController");

// Render dashboard view
router.get("/", renderColdEmailPage);

// Save bulk uploaded leads
router.post("/import", importLeads);

// API endpoint to fetch leads
router.get("/leads", getLeads);

// API endpoint to clear leads
router.delete("/leads/clear", clearLeads);

module.exports = router;
