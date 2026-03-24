package room

import (
	"encoding/json"
	"errors"
	"net/http"
	"tablegames/internal/middleware"
	"tablegames/internal/models"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc *Service
	hub Hub
}

// Hub — минимальный интерфейс от ws.Hub нужный room handler'у
type Hub interface {
	KickClient(roomUUID string, targetUserID, byUserID uint64)
	NotifyRoomDeleted(roomUUID string)
	NotifyGameSelected(roomUUID string, gameType string)
	ForceRemovePlayer(roomUUID string, userID uint64)
	ResetGameNoCtx(roomUUID string)
}

func NewHandler(svc *Service, hub Hub) *Handler {
	return &Handler{svc: svc, hub: hub}
}

// CreateRoom — POST /api/rooms
func (h *Handler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	var req struct {
		Name       string `json:"name"`
		MaxPlayers int    `json:"max_players"`
		Password   string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.MaxPlayers == 0 {
		req.MaxPlayers = 6
	}
	room, err := h.svc.CreateRoom(r.Context(), userID, req.Name, req.MaxPlayers, req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusCreated, toRoomJSON(room))
}

// GetRoom — GET /api/rooms/{uuid}
func (h *Handler) GetRoom(w http.ResponseWriter, r *http.Request) {
	uuid := chi.URLParam(r, "uuid")
	room, err := h.svc.GetRoom(r.Context(), uuid)
	if err != nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	writeJSON(w, http.StatusOK, toRoomJSON(room))
}

// UpdateRoom — PATCH /api/rooms/{uuid}
func (h *Handler) UpdateRoom(w http.ResponseWriter, r *http.Request) {
	hostID := r.Context().Value(middleware.UserIDKey).(uint64)
	uuid := chi.URLParam(r, "uuid")
	var req struct {
		Name       string  `json:"name"`
		MaxPlayers int     `json:"max_players"`
		Password   *string `json:"password"`  // nil = не менять, "" = убрать, "xxx" = установить
		GameType   string  `json:"game_type"` // "" = не менять
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	room, err := h.svc.UpdateRoom(r.Context(), uuid, hostID, req.Name, req.MaxPlayers, req.Password, req.GameType)
	if err != nil {
		switch {
		case errors.Is(err, ErrForbidden):
			writeError(w, http.StatusForbidden, "only host can update room")
		case errors.Is(err, ErrRoomNotAvail):
			writeError(w, http.StatusConflict, "cannot update room while game is in progress")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	// Если хост выбрал игру — уведомляем всех через WS
	if req.GameType != "" {
		h.hub.NotifyGameSelected(uuid, room.GameType)
	}
	writeJSON(w, http.StatusOK, toRoomJSON(room))
}

// DeleteRoom — DELETE /api/rooms/{uuid}
func (h *Handler) DeleteRoom(w http.ResponseWriter, r *http.Request) {
	hostID := r.Context().Value(middleware.UserIDKey).(uint64)
	uuid := chi.URLParam(r, "uuid")
	if err := h.svc.DeleteRoom(r.Context(), uuid, hostID); err != nil {
		if errors.Is(err, ErrForbidden) {
			writeError(w, http.StatusForbidden, "only host can delete room")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Сбрасываем активную игру если идёт
	h.hub.ResetGameNoCtx(uuid)
	h.hub.NotifyRoomDeleted(uuid)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// CreateInviteLink — POST /api/rooms/{uuid}/invite
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

// JoinByCode — POST /api/join/code/{code}
func (h *Handler) JoinByCode(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	code := chi.URLParam(r, "code")
	var req struct {
		Password string `json:"password"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	room, err := h.svc.JoinByCode(r.Context(), userID, code, req.Password)
	if err != nil {
		if errors.Is(err, ErrWrongPassword) {
			writeError(w, http.StatusForbidden, "wrong password")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, toRoomJSON(room))
}

// JoinByToken — POST /api/join/token/{token}
func (h *Handler) JoinByToken(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	token := chi.URLParam(r, "token")
	room, err := h.svc.JoinByToken(r.Context(), userID, token)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, toRoomJSON(room))
}

// LeaveRoom — DELETE /api/rooms/{uuid}/leave
func (h *Handler) LeaveRoom(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	uuid := chi.URLParam(r, "uuid")
	if err := h.svc.LeaveRoom(r.Context(), uuid, userID); err != nil {
		if errors.Is(err, ErrForbidden) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Убираем из активной игры если идёт
	h.hub.ForceRemovePlayer(uuid, userID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "left"})
}

// KickPlayer — POST /api/rooms/{uuid}/kick
func (h *Handler) KickPlayer(w http.ResponseWriter, r *http.Request) {
	hostID := r.Context().Value(middleware.UserIDKey).(uint64)
	uuid := chi.URLParam(r, "uuid")
	var req struct {
		UserID uint64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == 0 {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}
	if err := h.svc.KickPlayer(r.Context(), uuid, hostID, req.UserID); err != nil {
		if errors.Is(err, ErrForbidden) {
			writeError(w, http.StatusForbidden, "only host can kick")
			return
		}
		if errors.Is(err, ErrNotMember) {
			writeError(w, http.StatusNotFound, "user not in room")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.hub.KickClient(uuid, req.UserID, hostID)
	h.hub.ForceRemovePlayer(uuid, req.UserID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "kicked"})
}

// toRoomJSON — скрывает password_hash, возвращает has_password
func toRoomJSON(room *models.Room) map[string]any {
	return map[string]any{
		"id":           room.ID,
		"uuid":         room.UUID,
		"name":         room.Name,
		"host_id":      room.HostID,
		"invite_code":  room.InviteCode,
		"max_players":  room.MaxPlayers,
		"status":       room.Status,
		"game_type":    room.GameType,
		"has_password": room.HasPassword(),
		"created_at":   room.CreatedAt,
		"expires_at":   room.ExpiresAt,
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// GetMyRoom — GET /api/rooms/my
// Возвращает текущую комнату пользователя если он в ней состоит
func (h *Handler) GetMyRoom(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	room, err := h.svc.GetUserRoom(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"room": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"room": toRoomJSON(room)})
}