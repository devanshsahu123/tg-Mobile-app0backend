/**
 * Centralized Configuration for Voice Matchmaking and Backend Services
 */
module.exports = {
  // Domain and Base URL
  DOMAIN: process.env.DOMAIN || "https://sahusaathi.com",
  CALL_BASE_PATH: "/call",

  // Full Signaling Base Endpoint
  get CALL_BASE_URL() {
    return `${this.DOMAIN}${this.CALL_BASE_PATH}`;
  },

  // Matchmaking API Endpoints
  ENDPOINTS: {
    HEALTH: "/call/health",
    MATCH: "/call/match",
    ANSWER: "/call/answer",
    CANCEL: "/call/cancel",
    END: "/call/end",
    AUTH_REGISTER: "/call/auth/register",
    AUTH_LOGIN: "/call/auth/login",
    AUTH_GOOGLE: "/call/auth/google",
    AUTH_ME: "/call/auth/me",
  },

  // Hold timeout (in milliseconds): How long caller request is held before timing out
  MATCH_HOLD_TIMEOUT_MS: 30000,

  // Port
  PORT: process.env.PORT || 3003,
};
