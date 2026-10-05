const router = require("express").Router();
const {
  matchCall,
  submitAnswer,
  cancelMatch,
  endCall,
  healthCheck,
} = require("../controllers/callController");

router.get("/health", healthCheck);
router.post("/match", matchCall);
router.post("/answer", submitAnswer);
router.post("/cancel", cancelMatch);
router.post("/end", endCall);

module.exports = router;
