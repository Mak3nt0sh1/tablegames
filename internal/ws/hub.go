package ws

import (
	"encoding/json"
	"log"
	"sync"
)

type incomingMessage struct {
	client *Client
	msg    Message
}

// wsRoom — состояние одной комнаты внутри Hub
type wsRoom struct {
	uuid         string
	name         string
	hostID       uint64
	maxPlayers   int
	status       string
	clients      map[uint64]*Client // userID -> Client
	voiceClients map[uint64]bool    // кто сейчас в голосовом чате
}

// Hub управляет всеми WS-подключениями
type Hub struct {
	mu         sync.RWMutex
	rooms      map[string]*wsRoom
	register   chan *registerRequest
	unregister chan *Client
	incoming   chan *incomingMessage
}

type registerRequest struct {
	client   *Client
	roomMeta RoomMeta
}

// RoomMeta — минимальная инфа о комнате при регистрации клиента
type RoomMeta struct {
	UUID       string
	Name       string
	HostID     uint64
	MaxPlayers int
	Status     string
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*wsRoom),
		register:   make(chan *registerRequest, 64),
		unregister: make(chan *Client, 64),
		incoming:   make(chan *incomingMessage, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case req := <-h.register:
			h.handleRegister(req)
		case client := <-h.unregister:
			h.handleUnregister(client)
		case im := <-h.incoming:
			h.handleIncoming(im)
		}
	}
}

// ── регистрация ──────────────────────────────────────────────────────────────

func (h *Hub) handleRegister(req *registerRequest) {
	h.mu.Lock()
	r, exists := h.rooms[req.roomMeta.UUID]
	if !exists {
		r = &wsRoom{
			uuid:         req.roomMeta.UUID,
			name:         req.roomMeta.Name,
			hostID:       req.roomMeta.HostID,
			maxPlayers:   req.roomMeta.MaxPlayers,
			status:       req.roomMeta.Status,
			clients:      make(map[uint64]*Client),
			voiceClients: make(map[uint64]bool),
		}
		h.rooms[req.roomMeta.UUID] = r
	}
	r.clients[req.client.UserID] = req.client
	h.mu.Unlock()

	log.Printf("ws: user=%d (%s) joined room=%s", req.client.UserID, req.client.Username, req.roomMeta.UUID)

	h.sendRoomState(req.client, r)

	role := "player"
	if req.client.UserID == r.hostID {
		role = "host"
	}
	h.broadcastExcept(r, req.client.UserID, EventPlayerJoined, PlayerJoinedPayload{
		Player: PlayerInfo{
			UserID:   req.client.UserID,
			Username: req.client.Username,
			Role:     role,
		},
		Total: len(r.clients),
	})
}

// ── отключение ───────────────────────────────────────────────────────────────

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	r, exists := h.rooms[client.RoomUUID]
	if !exists {
		h.mu.Unlock()
		return
	}
	if _, ok := r.clients[client.UserID]; !ok {
		h.mu.Unlock()
		return
	}
	delete(r.clients, client.UserID)
	delete(r.voiceClients, client.UserID) // убираем из войса если был
	empty := len(r.clients) == 0
	h.mu.Unlock()

	log.Printf("ws: user=%d (%s) left room=%s", client.UserID, client.Username, client.RoomUUID)

	if empty {
		h.mu.Lock()
		delete(h.rooms, client.RoomUUID)
		h.mu.Unlock()
		log.Printf("ws: room=%s closed (no players)", client.RoomUUID)
		return
	}

	h.broadcastToRoom(client.RoomUUID, EventPlayerLeft, PlayerLeftPayload{
		UserID:   client.UserID,
		Username: client.Username,
		Total:    len(r.clients),
	})
}

// ── входящие сообщения ───────────────────────────────────────────────────────

func (h *Hub) handleIncoming(im *incomingMessage) {
	switch im.msg.Type {

	case EventChatMessage:
		var p struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal(im.msg.Payload, &p); err != nil || p.Text == "" {
			im.client.sendError("invalid chat_message payload")
			return
		}
		if len(p.Text) > 500 {
			im.client.sendError("message too long (max 500 chars)")
			return
		}
		h.broadcastToRoom(im.client.RoomUUID, EventChatBroadcast, ChatPayload{
			UserID:   im.client.UserID,
			Username: im.client.Username,
			Text:     p.Text,
		})

	// ── WebRTC signaling ─────────────────────────────────────────────────────

	case EventVoiceOffer:
		var p VoiceOfferPayload
		if err := json.Unmarshal(im.msg.Payload, &p); err != nil || p.TargetUserID == 0 || p.SDP == "" {
			im.client.sendError("invalid voice_offer payload")
			return
		}
		p.FromUserID = im.client.UserID
		h.relayToUser(im.client.RoomUUID, p.TargetUserID, EventVoiceOffer, p)

	case EventVoiceAnswer:
		var p VoiceAnswerPayload
		if err := json.Unmarshal(im.msg.Payload, &p); err != nil || p.TargetUserID == 0 || p.SDP == "" {
			im.client.sendError("invalid voice_answer payload")
			return
		}
		p.FromUserID = im.client.UserID
		h.relayToUser(im.client.RoomUUID, p.TargetUserID, EventVoiceAnswer, p)

	case EventVoiceIceCandidate:
		var p VoiceIceCandidatePayload
		if err := json.Unmarshal(im.msg.Payload, &p); err != nil || p.TargetUserID == 0 {
			im.client.sendError("invalid voice_ice_candidate payload")
			return
		}
		p.FromUserID = im.client.UserID
		h.relayToUser(im.client.RoomUUID, p.TargetUserID, EventVoiceIceCandidate, p)

	case EventVoiceJoin:
		// Клиент включил микрофон — добавляем в voiceClients и бродкастим всем
		h.mu.Lock()
		if r, ok := h.rooms[im.client.RoomUUID]; ok {
			r.voiceClients[im.client.UserID] = true
		}
		h.mu.Unlock()

		log.Printf("ws: user=%d (%s) joined voice in room=%s", im.client.UserID, im.client.Username, im.client.RoomUUID)
		h.broadcastToRoom(im.client.RoomUUID, EventVoiceUserJoined, VoiceUserPayload{
			UserID:   im.client.UserID,
			Username: im.client.Username,
		})

	case EventVoiceLeave:
		// Клиент выключил микрофон
		h.mu.Lock()
		if r, ok := h.rooms[im.client.RoomUUID]; ok {
			delete(r.voiceClients, im.client.UserID)
		}
		h.mu.Unlock()

		log.Printf("ws: user=%d (%s) left voice in room=%s", im.client.UserID, im.client.Username, im.client.RoomUUID)
		h.broadcastToRoom(im.client.RoomUUID, EventVoiceUserLeft, VoiceUserPayload{
			UserID:   im.client.UserID,
			Username: im.client.Username,
		})

	case EventPing:
		im.client.sendMsg(EventPong, nil)

	default:
		im.client.sendError("unknown event type: " + im.msg.Type)
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func (h *Hub) sendRoomState(client *Client, r *wsRoom) {
	h.mu.RLock()
	players := make([]PlayerInfo, 0, len(r.clients))
	for _, c := range r.clients {
		role := "player"
		if c.UserID == r.hostID {
			role = "host"
		}
		players = append(players, PlayerInfo{
			UserID:   c.UserID,
			Username: c.Username,
			Role:     role,
		})
	}
	h.mu.RUnlock()

	client.sendMsg(EventRoomState, RoomStatePayload{
		RoomUUID:   r.uuid,
		RoomName:   r.name,
		HostID:     r.hostID,
		MaxPlayers: r.maxPlayers,
		Status:     r.status,
		Players:    players,
	})
}

// relayToUser — пересылает сообщение конкретному пользователю в комнате
func (h *Hub) relayToUser(roomUUID string, targetUserID uint64, msgType string, payload any) {
	h.mu.RLock()
	r, ok := h.rooms[roomUUID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	target, ok := r.clients[targetUserID]
	h.mu.RUnlock()

	if !ok {
		return // целевой пользователь не в комнате
	}
	target.sendMsg(msgType, payload)
}

func (h *Hub) broadcastToRoom(roomUUID string, msgType string, payload any) {
	h.mu.RLock()
	r, ok := h.rooms[roomUUID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	clients := make([]*Client, 0, len(r.clients))
	for _, c := range r.clients {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	data, err := encode(msgType, payload)
	if err != nil {
		return
	}
	for _, c := range clients {
		select {
		case c.send <- data:
		default:
			log.Printf("ws: send buffer full for user=%d, dropping broadcast", c.UserID)
		}
	}
}

func (h *Hub) broadcastExcept(r *wsRoom, excludeUserID uint64, msgType string, payload any) {
	data, err := encode(msgType, payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	clients := make([]*Client, 0, len(r.clients))
	for uid, c := range r.clients {
		if uid != excludeUserID {
			clients = append(clients, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.send <- data:
		default:
		}
	}
}

// BroadcastToRoom — публичный метод для game engine
func (h *Hub) BroadcastToRoom(roomUUID string, msgType string, payload any) {
	h.broadcastToRoom(roomUUID, msgType, payload)
}

// GetRoomPlayerCount — сколько игроков онлайн
func (h *Hub) GetRoomPlayerCount(roomUUID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if r, ok := h.rooms[roomUUID]; ok {
		return len(r.clients)
	}
	return 0
}

// GetVoiceUsers — кто сейчас в голосовом чате
func (h *Hub) GetVoiceUsers(roomUUID string) []uint64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r, ok := h.rooms[roomUUID]
	if !ok {
		return nil
	}
	users := make([]uint64, 0, len(r.voiceClients))
	for uid := range r.voiceClients {
		users = append(users, uid)
	}
	return users
}

// KickClient — принудительно отключает клиента и сообщает ему причину.
// Вызывается из room handler после удаления из БД.
func (h *Hub) KickClient(roomUUID string, targetUserID, byUserID uint64) {
	h.mu.RLock()
	r, ok := h.rooms[roomUUID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	target, ok := r.clients[targetUserID]
	h.mu.RUnlock()

	if !ok {
		return // пользователь не онлайн — ничего делать не нужно
	}

	// Сначала говорим ему что он кикнут
	target.sendMsg(EventPlayerKicked, KickedPayload{
		RoomUUID: roomUUID,
		ByUserID: byUserID,
	})

	// Потом закрываем его соединение — это вызовет unregister и player_left для остальных
	target.conn.Close()
}

// NotifyRoomDeleted — рассылает всем в комнате событие удаления и закрывает соединения.
// Вызывается из room handler после удаления комнаты из БД.
func (h *Hub) NotifyRoomDeleted(roomUUID string) {
	h.mu.RLock()
	r, ok := h.rooms[roomUUID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	clients := make([]*Client, 0, len(r.clients))
	for _, c := range r.clients {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	// Рассылаем событие всем
	for _, c := range clients {
		c.sendMsg(EventRoomDeleted, RoomDeletedPayload{RoomUUID: roomUUID})
		c.conn.Close() // закрываем соединение — unregister произойдёт в readPump
	}
}

// NotifyGameSelected — хост выбрал игру, рассылаем всем в комнате
func (h *Hub) NotifyGameSelected(roomUUID string, gameType string) {
	h.broadcastToRoom(roomUUID, "game_selected", map[string]any{
		"room_uuid":  roomUUID,
		"game_type":  gameType,
	})
}