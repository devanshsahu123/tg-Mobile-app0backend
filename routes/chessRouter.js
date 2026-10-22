const router = require("express").Router();
const {
  matchChess,
  submitAnswer,
  cancelMatch,
  postMove,
  getMoves,
  endChess,
  healthCheck,
} = require("../controllers/chessController");

router.get("/health", healthCheck);
router.post("/match", matchChess);
router.post("/answer", submitAnswer);
router.post("/cancel", cancelMatch);
router.post("/move", postMove);
router.get("/moves/:sessionId", getMoves);
router.post("/end", endChess);

module.exports = router;
