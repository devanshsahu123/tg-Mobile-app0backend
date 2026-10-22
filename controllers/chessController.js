// Chess Matchmaker & Online Game Service
// Pure HTTP REST with 30s Long-Hold (Zero Polling for matching)
// Supports credential exchange and move relay between matched players
const config = require("../config");

let waitingPlayer = null; // { id, name, credentials, res, timer, createdAt }
const activeSessions = new Map(); // sessionId -> { white: { id, name, credentials }, black: { id, name, credentials }, moves: [], timer, createdAt }

const HOLD_TIMEOUT_MS = config.MATCH_HOLD_TIMEOUT_MS || 30 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes session duration for chess game

function generateSessionId() {
  return "chess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
}

/**
 * POST /chess/match
 * Body: { userId: "...", playerName: "...", credentials: { ... } }
 */
const matchChess = async (req, res) => {
  try {
    const { userId, playerName, credentials } = req.body;
    const playerId = userId || ("player_" + Math.random().toString(36).substring(2, 9));
    const name = playerName || "Player " + playerId.slice(-4);

    // Case 1: Another player is already waiting in queue
    if (waitingPlayer && waitingPlayer.id !== playerId) {
      const partner = waitingPlayer;
      waitingPlayer = null;

      if (partner.timer) {
        clearTimeout(partner.timer);
      }

      const sessionId = generateSessionId();

      // Hold partner's HTTP connection until incoming player submits credentials via /chess/answer
      // or timeout after 15s
      const sessionTimer = setTimeout(() => {
        const s = activeSessions.get(sessionId);
        if (s && s.callerRes) {
          try {
            s.callerRes.json({
              success: false,
              status: "TIMEOUT",
              message: "Opponent failed to complete credential exchange",
            });
          } catch (_) {}
          s.callerRes = null;
        }
      }, 15000);
      if (sessionTimer.unref) sessionTimer.unref();

      activeSessions.set(sessionId, {
        sessionId,
        white: {
          id: partner.id,
          name: partner.name,
          credentials: partner.credentials || {},
        },
        black: {
          id: playerId,
          name: name,
          credentials: credentials || {},
        },
        callerRes: partner.res,
        moves: [],
        status: "MATCHED",
        timer: sessionTimer,
        createdAt: Date.now(),
        lastMoveAt: Date.now(),
      });

      console.log(`[Chess] Matched player ${partner.id} (WHITE) with ${playerId} (BLACK) in session ${sessionId}`);

      // Respond immediately to Player 2 with Player 1's details and credentials
      return res.status(200).json({
        success: true,
        status: "MATCHED",
        role: "CALLEE",
        color: "BLACK",
        sessionId,
        partner: {
          id: partner.id,
          name: partner.name,
          credentials: partner.credentials || {},
          color: "WHITE",
        },
      });
    }

    // Case 2: Nobody waiting. If the same player re-requests, clean previous slot.
    if (waitingPlayer && waitingPlayer.id === playerId) {
      if (waitingPlayer.timer) clearTimeout(waitingPlayer.timer);
      try {
        waitingPlayer.res.json({ success: false, status: "REPLACED" });
      } catch (_) {}
      waitingPlayer = null;
    }

    // Hold this HTTP request open for 30 seconds
    const timer = setTimeout(() => {
      if (waitingPlayer && waitingPlayer.id === playerId) {
        waitingPlayer = null;
        try {
          res.status(200).json({
            success: true,
            status: "TIMEOUT",
            message: "No opponent found within 30 seconds. Tap to search again.",
          });
        } catch (_) {}
      }
    }, HOLD_TIMEOUT_MS);
    if (timer.unref) timer.unref();

    waitingPlayer = {
      id: playerId,
      name: name,
      credentials: credentials || {},
      res,
      timer,
      createdAt: Date.now(),
    };

    console.log(`[Chess] Player ${playerId} (${name}) waiting in matchmaking queue (30s hold)...`);

    // Clean up automatically if client disconnects, cancels or closes
    res.on("close", () => {
      if (!res.writableEnded && waitingPlayer && waitingPlayer.id === playerId) {
        console.log(`[Chess] Player ${playerId} disconnected from matchmaking queue`);
        clearTimeout(waitingPlayer.timer);
        waitingPlayer = null;
      }
    });

  } catch (error) {
    console.error("[Chess] Error in matchChess:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Matchmaking error",
    });
  }
};

/**
 * POST /chess/answer
 * Body: { sessionId: "...", userId: "...", playerName: "...", credentials: { ... } }
 * Delivers Player 2's credentials to Player 1's held HTTP request.
 */
const submitAnswer = async (req, res) => {
  try {
    const { sessionId, userId, playerName, credentials } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "sessionId is required",
      });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Match session not found or expired",
      });
    }

    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }

    if (credentials) {
      session.black.credentials = credentials;
    }
    if (playerName) {
      session.black.name = playerName;
    }
    session.status = "CONNECTED";

    // Deliver Player 2's credentials to Player 1's held HTTP response
    if (session.callerRes) {
      try {
        session.callerRes.status(200).json({
          success: true,
          status: "CONNECTED",
          role: "CALLER",
          color: "WHITE",
          sessionId,
          partner: {
            id: session.black.id,
            name: session.black.name,
            credentials: session.black.credentials,
            color: "BLACK",
          },
        });
      } catch (e) {
        console.error("[Chess] Error delivering credentials to waiting caller:", e);
      }
      session.callerRes = null;
    }

    // Schedule cleanup of session after TTL
    setTimeout(() => {
      activeSessions.delete(sessionId);
    }, SESSION_TTL_MS).unref();

    console.log(`[Chess] Credentials shared for session ${sessionId}. Match CONNECTED!`);

    return res.status(200).json({
      success: true,
      message: "Credentials delivered successfully, chess game started",
      sessionId,
      partner: {
        id: session.white.id,
        name: session.white.name,
        credentials: session.white.credentials,
        color: "WHITE",
      },
    });
  } catch (error) {
    console.error("[Chess] Error in submitAnswer:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit answer",
    });
  }
};

/**
 * POST /chess/cancel
 * Body: { userId: "..." }
 */
const cancelMatch = async (req, res) => {
  try {
    const { userId } = req.body;

    if (waitingPlayer && (!userId || waitingPlayer.id === userId)) {
      clearTimeout(waitingPlayer.timer);
      try {
        waitingPlayer.res.status(200).json({
          success: true,
          status: "CANCELLED",
          message: "Matchmaking search cancelled by player",
        });
      } catch (_) {}
      waitingPlayer = null;
      console.log(`[Chess] Cancelled matchmaking queue for user ${userId}`);
    }

    return res.status(200).json({
      success: true,
      message: "Search cancelled successfully",
    });
  } catch (error) {
    console.error("[Chess] Error in cancelMatch:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel search",
    });
  }
};

/**
 * POST /chess/move
 * Relay chess moves between players
 * Body: { sessionId: "...", playerId: "...", from: "e2", to: "e4", promotion: "Q", moveIndex: 1 }
 */
const postMove = async (req, res) => {
  try {
    const { sessionId, playerId, from, to, promotion, moveIndex } = req.body;

    if (!sessionId || !from || !to) {
      return res.status(400).json({
        success: false,
        message: "sessionId, from, and to are required",
      });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found or expired",
      });
    }

    const moveData = {
      index: session.moves.length,
      playerId,
      from,
      to,
      promotion: promotion || null,
      timestamp: Date.now(),
    };

    session.moves.push(moveData);
    session.lastMoveAt = Date.now();

    console.log(`[Chess] Session ${sessionId} move #${moveData.index}: ${from}->${to}`);

    return res.status(200).json({
      success: true,
      move: moveData,
      totalMoves: session.moves.length,
    });
  } catch (error) {
    console.error("[Chess] Error in postMove:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to post move",
    });
  }
};

/**
 * GET /chess/moves/:sessionId?since=0
 * Fetch moves since last move index (allows move sync)
 */
const getMoves = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const since = parseInt(req.query.since || "-1", 10);

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const newMoves = session.moves.filter((m) => m.index > since);

    return res.status(200).json({
      success: true,
      sessionId,
      totalMoves: session.moves.length,
      moves: newMoves,
      status: session.status,
    });
  } catch (error) {
    console.error("[Chess] Error in getMoves:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get moves",
    });
  }
};

/**
 * POST /chess/end
 * Body: { sessionId: "...", reason: "..." }
 */
const endChess = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      activeSessions.delete(sessionId);
    }
    return res.status(200).json({
      success: true,
      message: "Chess game ended and session cleared",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to end game",
    });
  }
};

/**
 * GET /chess/health
 */
const healthCheck = async (req, res) => {
  return res.status(200).json({
    success: true,
    service: "Chess Online 1-Click Matchmaker & Credential Exchange",
    isPlayerWaiting: waitingPlayer !== null,
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  matchChess,
  submitAnswer,
  cancelMatch,
  postMove,
  getMoves,
  endChess,
  healthCheck,
};
