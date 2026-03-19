package game

import (
	"encoding/json"
	"net/http"
	"tablegames/internal/middleware"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	mgr *Manager
}

func NewHandler(mgr *Manager) *Handler {
	return &Handler{mgr: mgr}
}

// StartGame — POST /api/rooms/{uuid}/game/start
// {"game_type": "uno"}  — game_type опционален, дефолт uno
func (h *Handler) StartGame(w http.ResponseWriter, r *http.Request) {
	hostID := r.Context().Value(middleware.UserIDKey).(uint64)
	roomUUID := chi.URLParam(r, "uuid")

	var req struct {
		GameType GameType `json:"game_type"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.GameType == "" {
		req.GameType = GameTypeUNO
	}

	if err := h.mgr.StartGame(r.Context(), roomUUID, hostID, req.GameType); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

// GetGameState — GET /api/rooms/{uuid}/game/state
// Возвращает текущее состояние + руку запрашивающего игрока (для реконнекта)
func (h *Handler) GetGameState(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	roomUUID := chi.URLParam(r, "uuid")

	state, err := h.mgr.GetGameState(roomUUID, userID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// PlayCard — POST /api/rooms/{uuid}/game/play
// {"card_id": 42}
func (h *Handler) PlayCard(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	roomUUID := chi.URLParam(r, "uuid")

	var req struct {
		CardID int `json:"card_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if err := h.mgr.PlayCard(r.Context(), roomUUID, userID, req.CardID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DrawCard — POST /api/rooms/{uuid}/game/draw
// Тело не нужно
func (h *Handler) DrawCard(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	roomUUID := chi.URLParam(r, "uuid")

	if err := h.mgr.DrawCard(r.Context(), roomUUID, userID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// SayUno — POST /api/rooms/{uuid}/game/uno
// Нажатие кнопки UNO — должен нажать когда осталась 1 карта
func (h *Handler) SayUno(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	roomUUID := chi.URLParam(r, "uuid")

	if err := h.mgr.SayUno(r.Context(), roomUUID, userID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ChallengeUno — POST /api/rooms/{uuid}/game/challenge
// Поймать игрока который не нажал UNO имея 1 карту — штраф +2 ему
// {"target_user_id": 2}
func (h *Handler) ChallengeUno(w http.ResponseWriter, r *http.Request) {
	challengerID := r.Context().Value(middleware.UserIDKey).(uint64)
	roomUUID := chi.URLParam(r, "uuid")

	var req struct {
		TargetUserID uint64 `json:"target_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetUserID == 0 {
		writeError(w, http.StatusBadRequest, "target_user_id required")
		return
	}

	if err := h.mgr.ChallengeUno(r.Context(), roomUUID, challengerID, req.TargetUserID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ResetGame — POST /api/rooms/{uuid}/game/reset
// Сбрасывает состояние игры — вызывается когда все вышли из игры обратно в комнату
func (h *Handler) ResetGame(w http.ResponseWriter, r *http.Request) {
	uuid := chi.URLParam(r, "uuid")
	h.mgr.ResetGame(uuid)
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}
