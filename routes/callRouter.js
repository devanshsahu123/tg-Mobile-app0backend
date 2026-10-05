const router = require("express").Router();
const {
  matchCall,
  submitAnswer,
  cancelMatch,
  endCall,
  healthCheck,
} = require("../controllers/callController");

const voiceTalkAuthRouter = require("./voiceTalkAuthRouter");

router.get("/health", healthCheck);
router.post("/match", matchCall);
router.post("/answer", submitAnswer);
router.post("/cancel", cancelMatch);
router.post("/end", endCall);

// VoiceTalk Authentication routes (/call/auth/register, /call/auth/login, /call/auth/google)
router.use("/auth", voiceTalkAuthRouter);

module.exports = router;
