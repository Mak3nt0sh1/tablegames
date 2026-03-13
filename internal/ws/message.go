package ws

import "encoding/json"

// Типы входящих событий (от клиента)
const (
	EventChatMessage = "chat_message"
	EventPing        = "ping"

	// WebRTC signaling
	EventVoiceOffer        = "voice_offer"
	EventVoiceAnswer       = "voice_answer"
	EventVoiceIceCandidate = "voice_ice_candidate"
	EventVoiceJoin         = "voice_join"
	EventVoiceLeave        = "voice_leave"
)

// Типы исходящих событий (от сервера)
const (
	EventPlayerJoined  = "player_joined"
	EventPlayerLeft    = "player_left"
	EventRoomState     = "room_state"
	EventChatBroadcast = "chat_broadcast"
	EventPong          = "pong"
	EventError         = "error"

	EventVoiceUserJoined = "voice_user_joined"
	EventVoiceUserLeft   = "voice_user_left"

	EventPlayerKicked = "player_kicked" // конкретному игроку
	EventRoomDeleted  = "room_deleted"  // всем в комнате
)

// Message — базовый конверт для всех WS-сообщений
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// PlayerInfo — краткая инфа об игроке для рассылки
type PlayerInfo struct {
	UserID   uint64 `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

// RoomStatePayload — полное состояние комнаты, отдаётся при подключении
type RoomStatePayload struct {
	RoomUUID   string       `json:"room_uuid"`
	RoomName   string       `json:"room_name"`
	HostID     uint64       `json:"host_id"`
	MaxPlayers int          `json:"max_players"`
	Status     string       `json:"status"`
	Players    []PlayerInfo `json:"players"`
}

// PlayerJoinedPayload — кто подключился
type PlayerJoinedPayload struct {
	Player PlayerInfo `json:"player"`
	Total  int        `json:"total"`
}

// PlayerLeftPayload — кто отключился
type PlayerLeftPayload struct {
	UserID   uint64 `json:"user_id"`
	Username string `json:"username"`
	Total    int    `json:"total"`
}

// ChatPayload — сообщение чата
type ChatPayload struct {
	UserID   uint64 `json:"user_id"`
	Username string `json:"username"`
	Text     string `json:"text"`
}

// ErrorPayload — ошибка
type ErrorPayload struct {
	Message string `json:"message"`
}

// VoiceOfferPayload — SDP offer от инициатора
type VoiceOfferPayload struct {
	TargetUserID uint64 `json:"target_user_id"`
	FromUserID   uint64 `json:"from_user_id"`
	SDP          string `json:"sdp"`
}

// VoiceAnswerPayload — SDP answer от получателя
type VoiceAnswerPayload struct {
	TargetUserID uint64 `json:"target_user_id"`
	FromUserID   uint64 `json:"from_user_id"`
	SDP          string `json:"sdp"`
}

// VoiceIceCandidatePayload — ICE candidate
type VoiceIceCandidatePayload struct {
	TargetUserID  uint64 `json:"target_user_id"`
	FromUserID    uint64 `json:"from_user_id"`
	Candidate     string `json:"candidate"`
	SDPMid        string `json:"sdp_mid"`
	SDPMLineIndex int    `json:"sdp_mline_index"`
}

// VoiceUserPayload — кто включил/выключил микрофон
type VoiceUserPayload struct {
	UserID   uint64 `json:"user_id"`
	Username string `json:"username"`
}

// encode превращает тип + payload в Message с JSON
func encode(msgType string, payload any) ([]byte, error) {
	p, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Message{Type: msgType, Payload: p})
}

// KickedPayload — игроку сообщают что его кикнули
type KickedPayload struct {
	RoomUUID string `json:"room_uuid"`
	ByUserID uint64 `json:"by_user_id"`
}

// RoomDeletedPayload — комната удалена
type RoomDeletedPayload struct {
	RoomUUID string `json:"room_uuid"`
}
