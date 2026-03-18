package game

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"tablegames/internal/game/uno"
	"tablegames/internal/models"
)

var (
	ErrGameAlreadyRunning = errors.New("game already running in this room")
	ErrNoGameRunning      = errors.New("no game running in this room")
	ErrNotEnoughPlayers   = errors.New("need at least 2 players to start")
	ErrUnsupportedGame    = errors.New("unsupported game type")
)

// Hub — то что нужно от ws.Hub
type Hub interface {
	BroadcastToRoom(roomUUID string, msgType string, payload any)
}

// RoomService — то что нужно от room.Service
type RoomService interface {
	GetRoom(ctx context.Context, uuid string) (*models.Room, error)
	GetMembers(ctx context.Context, roomID uint64) ([]models.RoomMember, error)
	SetRoomStatus(ctx context.Context, roomUUID string, status string) error
}

// UserService — получение информации о пользователях
type UserService interface {
	GetUsernames(ctx context.Context, userIDs []uint64) (map[uint64]string, error)
}

// Manager управляет всеми запущенными играми
type Manager struct {
	mu            sync.RWMutex
	games         map[string]*uno.Game // roomUUID -> активная игра
	finishedGames map[string]*uno.Game // roomUUID -> завершённая игра (для реконнекта)
	hub           Hub
	roomSvc       RoomService
	userSvc       UserService
}

func NewManager(hub Hub, roomSvc RoomService, userSvc UserService) *Manager {
	return &Manager{
		games:         make(map[string]*uno.Game),
		finishedGames: make(map[string]*uno.Game),
		hub:           hub,
		roomSvc:       roomSvc,
		userSvc:       userSvc,
	}
}

// StartGame — хост запускает игру
func (m *Manager) StartGame(ctx context.Context, roomUUID string, hostID uint64, gameType GameType) error {
	if !IsSupported(gameType) {
		return ErrUnsupportedGame
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.games[roomUUID]; exists {
		return ErrGameAlreadyRunning
	}

	// Получаем комнату и проверяем что запрашивает хост
	room, err := m.roomSvc.GetRoom(ctx, roomUUID)
	if err != nil {
		return err
	}
	if room.HostID != hostID {
		return errors.New("only host can start the game")
	}

	// Получаем список игроков
	members, err := m.roomSvc.GetMembers(ctx, room.ID)
	if err != nil {
		return err
	}
	if len(members) < 2 {
		return ErrNotEnoughPlayers
	}

	// Получаем имена
	ids := make([]uint64, len(members))
	for i, m := range members {
		ids[i] = m.UserID
	}
	usernames, err := m.userSvc.GetUsernames(ctx, ids)
	if err != nil {
		return err
	}

	players := make([]struct {
		UserID   uint64
		Username string
	}, len(members))
	for i, mb := range members {
		players[i].UserID = mb.UserID
		players[i].Username = usernames[mb.UserID]
	}

	// Запускаем игру
	game := uno.NewGame(roomUUID, players)
	m.games[roomUUID] = game

	// Обновляем статус комнаты
	_ = m.roomSvc.SetRoomStatus(ctx, roomUUID, "playing")

	// Рассылаем game_started всем
	m.hub.BroadcastToRoom(roomUUID, "game_started", map[string]any{
		"game_type":     gameType,
		"player_order":  game.State.PlayerOrder,
		"players":       game.State.PublicPlayers(),
		"top_card":      game.State.TopCard,
		"current_color": game.State.CurrentColor,
		"current_turn":  game.State.CurrentPlayerID(),
		"direction":     game.State.Direction,
	})

	// Каждому игроку отдельно рассылаем его руку
	for _, p := range game.State.Players {
		m.hub.BroadcastToRoom(roomUUID, "your_hand", map[string]any{
			"user_id": p.UserID,
			"hand":    p.Hand,
		})
	}

	return nil
}

// PlayCard — игрок разыгрывает карту
func (m *Manager) PlayCard(ctx context.Context, roomUUID string, userID uint64, cardID int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	game, err := m.getGame(roomUUID)
	if err != nil {
		return err
	}

	if err := game.PlayCard(userID, cardID); err != nil {
		return err
	}

	s := game.State

	// Если игра закончилась
	if s.Phase == uno.PhaseFinished {
		scores := game.Scores()
		m.hub.BroadcastToRoom(roomUUID, "game_over", map[string]any{
			"winner":  s.Winner,
			"scores":  scores,
			"players": s.PublicPlayers(),
		})
		m.finishedGames[roomUUID] = game
		delete(m.games, roomUUID)
		_ = m.roomSvc.SetRoomStatus(ctx, roomUUID, "finished")
		return nil
	}

	// Рассылаем обновление состояния
	m.broadcastGameState(roomUUID, game, "card_played", map[string]any{
		"user_id":       userID,
		"card":          s.TopCard,
		"current_color": s.CurrentColor,
	})

	return nil
}

// DrawCard — игрок берёт карту
func (m *Manager) DrawCard(ctx context.Context, roomUUID string, userID uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	game, err := m.getGame(roomUUID)
	if err != nil {
		return err
	}

	drawn, err := game.DrawCard(userID)
	if err != nil {
		return err
	}

	// Сообщаем всем что игрок взял карту(ы)
	m.broadcastGameState(roomUUID, game, "card_drawn", map[string]any{
		"user_id": userID,
		"count":   len(drawn),
	})

	// Игроку отдельно отправляем что именно он взял
	m.hub.BroadcastToRoom(roomUUID, "your_drawn_cards", map[string]any{
		"user_id": userID,
		"cards":   drawn,
	})

	return nil
}

// SayUno — игрок объявляет UNO
func (m *Manager) SayUno(ctx context.Context, roomUUID string, userID uint64) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	game, err := m.getGame(roomUUID)
	if err != nil {
		return err
	}

	if err := game.SayUno(userID); err != nil {
		return err
	}

	m.hub.BroadcastToRoom(roomUUID, "uno_called", map[string]any{
		"user_id": userID,
	})

	return nil
}

// ChallengeUno — игрок вызывает штраф за непроизнесённое UNO
func (m *Manager) ChallengeUno(ctx context.Context, roomUUID string, challengerID, targetID uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	game, err := m.getGame(roomUUID)
	if err != nil {
		return err
	}

	drawn, err := game.ChallengeUno(challengerID, targetID)
	if err != nil {
		return err
	}

	m.hub.BroadcastToRoom(roomUUID, "uno_challenge", map[string]any{
		"challenger_id": challengerID,
		"target_id":     targetID,
		"cards_drawn":   len(drawn),
		"players":       game.State.PublicPlayers(),
	})

	// Пойманному игроку отправляем его новые карты
	m.hub.BroadcastToRoom(roomUUID, "your_drawn_cards", map[string]any{
		"user_id": targetID,
		"cards":   drawn,
	})

	return nil
}

// GetGameState — получить публичное состояние игры (для реконнекта)
func (m *Manager) GetGameState(roomUUID string, userID uint64) (map[string]any, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	game, err := m.getGame(roomUUID)
	if err != nil {
		return nil, err
	}

	s := game.State
	player := s.Players[0]
	for _, p := range s.Players {
		if p.UserID == userID {
			player = p
			break
		}
	}

	return map[string]any{
		"phase":          s.Phase,
		"winner":         s.Winner,
		"top_card":       s.TopCard,
		"current_color":  s.CurrentColor,
		"current_turn":   s.CurrentPlayerID(),
		"direction":      s.Direction,
		"draw_pending":   s.DrawPending,
		"players":        s.PublicPlayers(),
		"player_order":   s.PlayerOrder,
		"draw_pile_size": s.DrawPileSize(),
		"your_hand":      player.Hand,
	}, nil
}

// broadcastGameState — рассылает обновление состояния игры всем в комнате
func (m *Manager) broadcastGameState(roomUUID string, game *uno.Game, event string, extra map[string]any) {
	s := game.State
	payload := map[string]any{
		"event":          event,
		"top_card":       s.TopCard,
		"current_color":  s.CurrentColor,
		"current_turn":   s.CurrentPlayerID(),
		"direction":      s.Direction,
		"draw_pending":   s.DrawPending,
		"players":        s.PublicPlayers(),
		"draw_pile_size": s.DrawPileSize(),
	}
	for k, v := range extra {
		payload[k] = v
	}
	data, _ := json.Marshal(payload)
	_ = data
	m.hub.BroadcastToRoom(roomUUID, "game_state_update", payload)
}

func (m *Manager) getGame(roomUUID string) (*uno.Game, error) {
	game, ok := m.games[roomUUID]
	if !ok {
		// Проверяем завершённые игры
		if finished, ok := m.finishedGames[roomUUID]; ok {
			return finished, nil
		}
		return nil, ErrNoGameRunning
	}
	return game, nil
}