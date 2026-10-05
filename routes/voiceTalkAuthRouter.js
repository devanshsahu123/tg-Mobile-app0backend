const express = require("express");
const router = express.Router();
const {
  register,
  login,
  googleLogin,
  verifyCode,
  resendCode,
  getMe,
} = require("../controllers/voiceTalkAuthController");

router.post("/register", register);
router.post("/verify-code", verifyCode);
router.post("/resend-code", resendCode);
router.post("/login", login);
router.post("/google", googleLogin);
router.get("/me", getMe);

module.exports = router;
