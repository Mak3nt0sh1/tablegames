package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
)

type incomingMessage struct {
	client *Client
	msg    Message
}

type wsRoom struct {
	uuid         string
	name         string
	hostID       uint64
	maxPlayers   int
	status       string
	clients      map[uint64]*Client
	voiceClients map[uint64]bool
	chatHistory  []ChatPayload
}

type GameManager interface {
	OnPlayerDisconnected(roomUUID string, userID uint64)
	ForceRemovePlayer(roomUUID string, userID uint64)
	ResetGame(ctx context.Context, roomUUID string)
}

type Hub struct {
	mu         sync.RWMutex
	rooms      map[string]*wsRoom
	gameMgr    GameManager
	register   chan *registerRequest
	unregister chan *Client
	incoming   chan *incomingMessage
}

type registerRequest struct {
	client   *Client
	roomMeta RoomMeta
}

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
	// Проверяем, был ли игрок уже в мапе сокетов, чтобы не спамить уведомлениями при F5
	_, alreadyIn := r.clients[req.client.UserID]
	r.clients[req.client.UserID] = req.client
	h.mu.Unlock()

	log.Printf("ws: user=%d (%s) joined room=%s", req.client.UserID, req.client.Username, req.roomMeta.UUID)

	h.sendRoomState(req.client, r)

	h.mu.RLock()
	history := r.chatHistory
	h.mu.RUnlock()
	if history != nil {
		req.client.sendMsg("chat_history", history)
	}

	// Отправляем уведомление "Игрок присоединился" только если это новое подключение
	if !alreadyIn {
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
}

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	r, exists := h.rooms[client.RoomUUID]
	if !exists {
		h.mu.Unlock()
		return
	}

	wasInVoice := r.voiceClients[client.UserID]
	if wasInVoice {
		delete(r.voiceClients, client.UserID)
	}
	h.mu.Unlock()

	log.Printf("ws: user=%d (%s) connection dropped room=%s", client.UserID, client.Username, client.RoomUUID)

	if wasInVoice {
		h.broadcastToRoom(client.RoomUUID, EventVoiceUserLeft, VoiceUserPayload{
			UserID:   client.UserID,
			Username: client.Username,
		})
	}
}

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

		msgPayload := ChatPayload{
			UserID:   im.client.UserID,
			Username: im.client.Username,
			Text:     p.Text,
		}

		h.mu.Lock()
		if r, ok := h.rooms[im.client.RoomUUID]; ok {
			r.chatHistory = append(r.chatHistory, msgPayload)
			if len(r.chatHistory) > 50 {
				r.chatHistory = r.chatHistory[1:]
			}
		}
		h.mu.Unlock()

		h.broadcastToRoom(im.client.RoomUUID, EventChatBroadcast, msgPayload)

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
		h.mu.Lock()
		if r, ok := h.rooms[im.client.RoomUUID]; ok {
			r.voiceClients[im.client.UserID] = true
		}
		h.mu.Unlock()
		h.broadcastToRoom(im.client.RoomUUID, EventVoiceUserJoined, VoiceUserPayload{
			UserID:   im.client.UserID,
			Username: im.client.Username,
		})

	case EventVoiceLeave:
		h.mu.Lock()
		if r, ok := h.rooms[im.client.RoomUUID]; ok {
			delete(r.voiceClients, im.client.UserID)
		}
		h.mu.Unlock()
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

	voiceUsers := make([]PlayerInfo, 0)
	for uid := range r.voiceClients {
		if c, ok := r.clients[uid]; ok {
			voiceUsers = append(voiceUsers, PlayerInfo{
				UserID:   c.UserID,
				Username: c.Username,
			})
		}
	}
	h.mu.RUnlock()

	client.sendMsg(EventRoomState, RoomStatePayload{
		RoomUUID:   r.uuid,
		RoomName:   r.name,
		HostID:     r.hostID,
		MaxPlayers: r.maxPlayers,
		Status:     r.status,
		Players:    players,
		VoiceUsers: voiceUsers,
	})
}

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
		return
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

func (h *Hub) BroadcastToRoom(roomUUID string, msgType string, payload any) {
	h.broadcastToRoom(roomUUID, msgType, payload)
}

// Этот метод теперь явно вызывается из хендлеров LeaveRoom и KickPlayer
func (h *Hub) NotifyPlayerLeft(roomUUID string, userID uint64) {
	h.mu.Lock()
	r, exists := h.rooms[roomUUID]
	if !exists {
		h.mu.Unlock()
		return
	}

	client, ok := r.clients[userID]
	if ok {
		delete(r.clients, userID)
	}
	if r.voiceClients[userID] {
		delete(r.voiceClients, userID)
	}

	empty := len(r.clients) == 0
	if empty {
		delete(h.rooms, roomUUID)
	}
	h.mu.Unlock()

	if ok && client != nil {
		h.broadcastToRoom(roomUUID, EventPlayerLeft, PlayerLeftPayload{
			UserID:   client.UserID,
			Username: client.Username,
			Total:    len(r.clients),
		})
	}
}

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
		return
	}

	target.sendMsg(EventPlayerKicked, KickedPayload{
		RoomUUID: roomUUID,
		ByUserID: byUserID,
	})

	go func() {
		// Даём клиенту время получить сообщение, затем рубим коннект
		target.conn.Close()
	}()
}

func (h *Hub) NotifyRoomDeleted(roomUUID string) {
	h.mu.Lock()
	r, ok := h.rooms[roomUUID]
	if ok {
		delete(h.rooms, roomUUID)
	}
	h.mu.Unlock()

	if !ok {
		return
	}

	clients := make([]*Client, 0, len(r.clients))
	for _, c := range r.clients {
		clients = append(clients, c)
	}

	for _, c := range clients {
		c.sendMsg(EventRoomDeleted, RoomDeletedPayload{RoomUUID: roomUUID})
	}
	go func() {
		for _, c := range clients {
			if c.conn != nil {
				c.conn.Close()
			}
		}
	}()
}

func (h *Hub) NotifyGameSelected(roomUUID string, gameType string) {
	h.broadcastToRoom(roomUUID, "game_selected", map[string]any{
		"room_uuid": roomUUID,
		"game_type": gameType,
	})
}

func (h *Hub) SendToUser(roomUUID string, userID uint64, msgType string, payload any) {
	h.relayToUser(roomUUID, userID, msgType, payload)
}

func (h *Hub) SetGameManager(mgr GameManager) {
	h.mu.Lock()
	h.gameMgr = mgr
	h.mu.Unlock()
}

func (h *Hub) ForceRemovePlayer(roomUUID string, userID uint64) {
	h.mu.RLock()
	mgr := h.gameMgr
	h.mu.RUnlock()
	if mgr != nil {
		mgr.ForceRemovePlayer(roomUUID, userID)
	}
}

func (h *Hub) ResetGameNoCtx(roomUUID string) {
	h.mu.RLock()
	mgr := h.gameMgr
	h.mu.RUnlock()
	if mgr != nil {
		// ignore context in background call
		mgr.ResetGame(context.Background(), roomUUID)
	}
}

func (h *Hub) NotifyHostChanged(roomUUID string, newHostID uint64) {
	h.mu.Lock()
	r, ok := h.rooms[roomUUID]
	if ok {
		r.hostID = newHostID
	}
	h.mu.Unlock()

	if ok {
		h.mu.RLock()
		clients := make([]*Client, 0, len(r.clients))
		for _, c := range r.clients {
			clients = append(clients, c)
		}
		h.mu.RUnlock()

		for _, c := range clients {
			h.sendRoomState(c, r)
		}
	}
}
