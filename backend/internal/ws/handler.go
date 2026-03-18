package ws

import (
	"log"
	"net/http"
	"tablegames/internal/middleware"
	"tablegames/internal/room"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// В продакшене заменить на проверку конкретных Origins
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Handler struct {
	hub     *Hub
	roomSvc *room.Service
}

func NewHandler(hub *Hub, roomSvc *room.Service) *Handler {
	return &Handler{hub: hub, roomSvc: roomSvc}
}

// ServeWS — GET /api/rooms/{uuid}/ws
// Клиент должен передать JWT в query-параметре ?token= или в заголовке Authorization: Bearer ...
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	roomUUID := chi.URLParam(r, "uuid")
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	username := r.Context().Value(middleware.UsernameKey).(string)

	// Проверяем, что комната существует и пользователь в ней состоит
	rm, err := h.roomSvc.GetRoom(r.Context(), roomUUID)
	if err != nil {
		http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
		return
	}

	isMember, err := h.roomSvc.IsMember(r.Context(), rm.ID, userID)
	if err != nil || !isMember {
		http.Error(w, `{"error":"you are not a member of this room"}`, http.StatusForbidden)
		return
	}

	// Апгрейд до WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:      h.hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		UserID:   userID,
		Username: username,
		RoomUUID: roomUUID,
	}

	h.hub.register <- &registerRequest{
		client: client,
		roomMeta: RoomMeta{
			UUID:       rm.UUID,
			Name:       rm.Name,
			HostID:     rm.HostID,
			MaxPlayers: rm.MaxPlayers,
			Status:     rm.Status,
		},
	}

	go client.writePump()
	go client.readPump()
}
