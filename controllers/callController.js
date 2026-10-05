// 1-Click Random English Speaking Practice Matchmaker
// Pure HTTP REST with 30s Long-Hold (Zero Polling, Zero WebSockets)
const config = require("../config");

let waitingPeer = null; // { id, offer, iceCandidates, res, timer, createdAt }
const activeSessions = new Map(); // sessionId -> { callerRes, timer, createdAt }

const HOLD_TIMEOUT_MS = config.MATCH_HOLD_TIMEOUT_MS || 30 * 1000;
const SESSION_TTL_MS = 3 * 60 * 1000; // 3 minutes after matching to cleanup

function generateSessionId() {
  return "vt_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
}

/**
 * POST /call/match
 * Body: { userId: "...", offer: { type: "offer", sdp: "..." }, iceCandidates: [...] }
 */
const matchCall = async (req, res) => {
  try {
    const { userId, offer, iceCandidates } = req.body;

    if (!offer || !offer.sdp) {
      return res.status(400).json({
        success: false,
        message: "offer object with sdp is required",
      });
    }

    const peerId = userId || ("user_" + Math.random().toString(36).substring(2, 9));

    // Case 1: A user is already waiting in queue (and it is not the same user)
    if (waitingPeer && waitingPeer.id !== peerId) {
      const partner = waitingPeer;
      waitingPeer = null;

      if (partner.timer) {
        clearTimeout(partner.timer);
      }

      const sessionId = generateSessionId();

      // Create matched session. The partner (User 1)'s held HTTP response is stored
      // until this newcomer (User 2) generates and submits their WebRTC Answer.
      const sessionTimer = setTimeout(() => {
        const s = activeSessions.get(sessionId);
        if (s) {
          try {
            s.callerRes.json({ success: false, status: "TIMEOUT", message: "Partner failed to respond" });
          } catch (_) {}
          activeSessions.delete(sessionId);
        }
      }, 15000); // 15 seconds to generate answer
      if (sessionTimer.unref) sessionTimer.unref();

      activeSessions.set(sessionId, {
        callerRes: partner.res,
        callerId: partner.id,
        calleeId: peerId,
        timer: sessionTimer,
        createdAt: Date.now(),
      });

      console.log(`Matched peer ${partner.id} with peer ${peerId} (Session: ${sessionId})`);

      // Respond immediately to User 2 with User 1's Offer
      return res.status(200).json({
        success: true,
        status: "MATCHED",
        role: "CALLEE",
        sessionId,
        partnerOffer: partner.offer,
        partnerIceCandidates: partner.iceCandidates,
      });
    }

    // Case 2: Nobody is waiting. Hold this HTTP request open for up to 30 seconds.
    // If the same user re-requests, clean up the previous waiting slot.
    if (waitingPeer && waitingPeer.id === peerId) {
      if (waitingPeer.timer) clearTimeout(waitingPeer.timer);
      try {
        waitingPeer.res.json({ success: false, status: "REPLACED" });
      } catch (_) {}
      waitingPeer = null;
    }

    const timer = setTimeout(() => {
      if (waitingPeer && waitingPeer.id === peerId) {
        waitingPeer = null;
        try {
          res.status(200).json({
            success: true,
            status: "TIMEOUT",
            message: "Still searching for an English practice partner...",
          });
        } catch (_) {}
      }
    }, HOLD_TIMEOUT_MS);
    if (timer.unref) timer.unref();

    waitingPeer = {
      id: peerId,
      offer,
      iceCandidates: Array.isArray(iceCandidates) ? iceCandidates : [],
      res,
      timer,
      createdAt: Date.now(),
    };

    console.log(`User ${peerId} waiting in matchmaking queue (30s hold)...`);

    // Clean up automatically if client drops connection, cancels, or closes app
    res.on("close", () => {
      if (!res.writableEnded && waitingPeer && waitingPeer.id === peerId) {
        console.log(`User ${peerId} disconnected from matchmaking queue`);
        clearTimeout(waitingPeer.timer);
        waitingPeer = null;
      }
    });

  } catch (error) {
    console.error("Error in matchCall:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Matchmaking error",
    });
  }
};

/**
 * POST /call/answer
 * Body: { sessionId: "...", answer: { type: "answer", sdp: "..." }, iceCandidates: [...] }
 */
const submitAnswer = async (req, res) => {
  try {
    const { sessionId, answer, iceCandidates } = req.body;

    if (!sessionId || !answer || !answer.sdp) {
      return res.status(400).json({
        success: false,
        message: "sessionId and answer object with sdp are required",
      });
    }

    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Match session not found or partner disconnected",
      });
    }

    if (session.timer) {
      clearTimeout(session.timer);
    }

    // Deliver User 2's Answer directly to User 1's held HTTP connection!
    try {
      session.callerRes.status(200).json({
        success: true,
        status: "CONNECTED",
        role: "CALLER",
        sessionId,
        partnerAnswer: answer,
        partnerIceCandidates: Array.isArray(iceCandidates) ? iceCandidates : [],
      });
    } catch (e) {
      console.error("Error delivering answer to waiting caller:", e);
    }

    // Schedule cleanup of active session record after connection
    setTimeout(() => {
      activeSessions.delete(sessionId);
    }, SESSION_TTL_MS).unref();

    console.log(`Delivered Answer for session ${sessionId}. Call is now CONNECTED P2P!`);

    return res.status(200).json({
      success: true,
      message: "Answer delivered successfully, direct voice call started",
    });
  } catch (error) {
    console.error("Error in submitAnswer:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit answer",
    });
  }
};

/**
 * POST /call/cancel
 * Body: { userId: "..." }
 */
const cancelMatch = async (req, res) => {
  try {
    const { userId } = req.body;

    if (waitingPeer && (!userId || waitingPeer.id === userId)) {
      clearTimeout(waitingPeer.timer);
      try {
        waitingPeer.res.status(200).json({
          success: true,
          status: "CANCELLED",
          message: "Matchmaking search cancelled by user",
        });
      } catch (_) {}
      waitingPeer = null;
      console.log(`Cancelled matchmaking queue for user ${userId}`);
    }

    return res.status(200).json({
      success: true,
      message: "Cancelled successfully",
    });
  } catch (error) {
    console.error("Error in cancelMatch:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel match",
    });
  }
};

/**
 * POST /call/end
 * Body: { sessionId: "..." }
 */
const endCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      activeSessions.delete(sessionId);
    }
    return res.status(200).json({
      success: true,
      message: "Call ended and cleared",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to end call",
    });
  }
};

/**
 * GET /call/health
 */
const healthCheck = async (req, res) => {
  return res.status(200).json({
    success: true,
    service: "VoiceTalk 1-Click Matchmaker",
    isUserWaiting: waitingPeer !== null,
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  matchCall,
  submitAnswer,
  cancelMatch,
  endCall,
  healthCheck,
};
