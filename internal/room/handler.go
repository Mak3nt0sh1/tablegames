package room

import (
	"encoding/json"
	"errors"
	"net/http"
	"tablegames/internal/middleware"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	var req struct {
		Name       string `json:"name"`
		MaxPlayers int    `json:"max_players"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.MaxPlayers == 0 {
		req.MaxPlayers = 6
	}
	room, err := h.svc.CreateRoom(r.Context(), userID, req.Name, req.MaxPlayers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusCreated, room)
}

func (h *Handler) GetRoom(w http.ResponseWriter, r *http.Request) {
	uuid := chi.URLParam(r, "uuid")
	room, err := h.svc.GetRoom(r.Context(), uuid)
	if err != nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	writeJSON(w, http.StatusOK, room)
}

func (h *Handler) CreateInviteLink(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	uuid := chi.URLParam(r, "uuid")
	link, err := h.svc.CreateInviteLink(r.Context(), uuid, userID)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			writeError(w, http.StatusForbidden, "only host can invite")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"invite_link": link})
}

func (h *Handler) JoinByCode(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	code := chi.URLParam(r, "code")
	room, err := h.svc.JoinByCode(r.Context(), userID, code)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, room)
}

func (h *Handler) JoinByToken(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	token := chi.URLParam(r, "token")
	room, err := h.svc.JoinByToken(r.Context(), userID, token)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, room)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
