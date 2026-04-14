package game

import (
	"context"
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

type Hub interface {
	BroadcastToRoom(roomUUID string, msgType string, payload any)
	SendToUser(roomUUID string, userID uint64, msgType string, payload any)
}

type RoomService interface {
	GetRoom(ctx context.Context, uuid string) (*models.Room, error)
	GetMembers(ctx context.Context, roomID uint64) ([]models.RoomMember, error)
	SetRoomStatus(ctx context.Context, roomUUID string, status string) error
	SaveGameResults(ctx context.Context, roomID uint64, gameType string, winnerID uint64, scores map[uint64]int) error
}

type UserService interface {
	GetUsernames(ctx context.Context, userIDs []uint64) (map[uint64]string, error)
}

type gameInfo struct {
	game     *uno.Game
	roomID   uint64
	gameType GameType
}

type Manager struct {
	mu            sync.RWMutex
	games         map[string]*gameInfo
	finishedGames map[string]*uno.Game
	hub           Hub
	roomSvc       RoomService
	userSvc       UserService
}

func NewManager(hub Hub, roomSvc RoomService, userSvc UserService) *Manager {
	return &Manager{
		games:         make(map[string]*gameInfo),
		finishedGames: make(map[string]*uno.Game),
		hub:           hub,
		roomSvc:       roomSvc,
		userSvc:       userSvc,
	}
}

func (m *Manager) StartGame(ctx context.Context, roomUUID string, hostID uint64, gameType GameType) error {
	if !IsSupported(gameType) {
		return ErrUnsupportedGame
	}

	m.mu.Lock()
	if _, exists := m.games[roomUUID]; exists {
		m.mu.Unlock()
		return ErrGameAlreadyRunning
	}
	delete(m.finishedGames, roomUUID)
	m.mu.Unlock()

	room, err := m.roomSvc.GetRoom(ctx, roomUUID)
	if err != nil {
		return err
	}
	if room.HostID != hostID {
		return errors.New("only host can start the game")
	}

	members, err := m.roomSvc.GetMembers(ctx, room.ID)
	if err != nil {
		return err
	}
	if len(members) < 2 {
		return ErrNotEnoughPlayers
	}

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

	g := uno.NewGame(roomUUID, players)

	m.mu.Lock()
	m.games[roomUUID] = &gameInfo{
		game:     g,
		roomID:   room.ID,
		gameType: gameType,
	}
	m.mu.Unlock()

	_ = m.roomSvc.SetRoomStatus(ctx, roomUUID, "playing")

	m.hub.BroadcastToRoom(roomUUID, "game_started", map[string]any{
		"game_type":     gameType,
		"player_order":  g.State.PlayerOrder,
		"players":       g.State.PublicPlayers(),
		"top_card":      g.State.TopCard,
		"current_color": g.State.CurrentColor,
		"current_turn":  g.State.CurrentPlayerID(),
		"direction":     g.State.Direction,
	})

	for _, p := range g.State.Players {
		m.hub.SendToUser(roomUUID, p.UserID, "your_hand", map[string]any{
			"user_id": p.UserID,
			"hand":    p.Hand,
		})
	}

	return nil
}

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

	if s.Phase == uno.PhaseFinished {
		scores := game.Scores()
		m.hub.BroadcastToRoom(roomUUID, "game_over", map[string]any{
			"winner":  s.Winner,
			"scores":  scores,
			"players": s.PublicPlayers(),
		})
		info := m.games[roomUUID]
		m.finishedGames[roomUUID] = game
		if s.Winner != nil && info != nil {
			_ = m.roomSvc.SaveGameResults(ctx, info.roomID, string(info.gameType), *s.Winner, scores)
		}
		delete(m.games, roomUUID)
		_ = m.roomSvc.SetRoomStatus(ctx, roomUUID, "finished")
		return nil
	}

	if s.DrawPending > 0 {
		nextID := s.CurrentPlayerID()
		nextPlayer := game.PlayerByID(nextID)
		hasDrawTwo := false
		if nextPlayer != nil {
			for _, c := range nextPlayer.Hand {
				if c.Value == uno.DrawTwo {
					hasDrawTwo = true
					break
				}
			}
		}
		if !hasDrawTwo && nextPlayer != nil {
			count := s.DrawPending
			s.DrawPending = 0
			drawn := game.DealCardsToPlayer(nextPlayer, count)
			s.AdvanceTurn()
			m.hub.SendToUser(roomUUID, nextID, "your_drawn_cards", map[string]any{
				"user_id": nextID,
				"cards":   drawn,
			})
			m.broadcastGameState(roomUUID, game, "card_played", map[string]any{
				"user_id":       userID,
				"card":          s.TopCard,
				"current_color": s.CurrentColor,
				"draw_applied":  map[string]any{"user_id": nextID, "count": count},
			})
			return nil
		}
	}

	m.broadcastGameState(roomUUID, game, "card_played", map[string]any{
		"user_id":       userID,
		"card":          s.TopCard,
		"current_color": s.CurrentColor,
	})
	return nil
}

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
	m.broadcastGameState(roomUUID, game, "card_drawn", map[string]any{
		"user_id": userID,
		"count":   len(drawn),
	})

	m.hub.SendToUser(roomUUID, userID, "your_drawn_cards", map[string]any{
		"user_id": userID,
		"cards":   drawn,
	})

	return nil
}

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

	m.hub.BroadcastToRoom(roomUUID, "your_drawn_cards", map[string]any{
		"user_id": targetID,
		"cards":   drawn,
	})

	return nil
}

func (m *Manager) GetGameState(roomUUID string, userID uint64) (map[string]any, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	game, err := m.getGame(roomUUID)
	if err != nil {
		return nil, err
	}

	s := game.State
	var player *uno.PlayerState
	for i := range s.Players {
		if s.Players[i].UserID == userID {
			player = &s.Players[i]
			break
		}
	}

	hand := []uno.Card{}
	if player != nil {
		hand = player.Hand
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
		"your_hand":      hand,
	}, nil
}

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
	m.hub.BroadcastToRoom(roomUUID, "game_state_update", payload)
}

func (m *Manager) getGame(roomUUID string) (*uno.Game, error) {
	if info, ok := m.games[roomUUID]; ok {
		return info.game, nil
	}
	if finished, ok := m.finishedGames[roomUUID]; ok {
		return finished, nil
	}
	return nil, ErrNoGameRunning
}

func (m *Manager) ResetGame(ctx context.Context, roomUUID string) {
	m.mu.Lock()
	delete(m.games, roomUUID)
	delete(m.finishedGames, roomUUID)
	m.mu.Unlock()

	_ = m.roomSvc.SetRoomStatus(ctx, roomUUID, "waiting")

	m.hub.BroadcastToRoom(roomUUID, "game_reset", map[string]any{
		"room_uuid": roomUUID,
		"status":    "waiting",
	})
}

func (m *Manager) IsGameRunning(roomUUID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.games[roomUUID]
	return ok
}

func (m *Manager) GetStatus(roomUUID string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if _, ok := m.games[roomUUID]; ok {
		return "playing"
	}
	if _, ok := m.finishedGames[roomUUID]; ok {
		return "finished"
	}
	return "none"
}

func (m *Manager) ForceEndGame(ctx context.Context, roomUUID string, hostID uint64) error {
	room, err := m.roomSvc.GetRoom(ctx, roomUUID)
	if err != nil {
		return err
	}
	if room.HostID != hostID {
		return errors.New("only host can start/end the game")
	}

	m.mu.Lock()
	m.hub.BroadcastToRoom(roomUUID, "game_force_ended", map[string]any{
		"room_uuid": roomUUID,
	})

	delete(m.games, roomUUID)
	delete(m.finishedGames, roomUUID)
	m.mu.Unlock()

	_ = m.roomSvc.SetRoomStatus(ctx, roomUUID, "waiting")
	return nil
}

func (m *Manager) GetActiveGame(userID uint64) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for roomUUID, info := range m.games {
		if info.game.State.Phase != uno.PhasePlaying {
			continue
		}
		for _, id := range info.game.State.PlayerOrder {
			if id == userID {
				return roomUUID, true
			}
		}
	}
	return "", false
}

func (m *Manager) OnPlayerDisconnected(roomUUID string, userID uint64) {
	m.mu.Lock()
	info, ok := m.games[roomUUID]
	if !ok {
		m.mu.Unlock()
		return
	}
	if info.game.State.CurrentPlayerID() != userID {
		m.mu.Unlock()
		return
	}
	_, _ = info.game.DrawCard(userID)
	m.mu.Unlock()

	m.broadcastGameState(roomUUID, info.game, "player_disconnected_draw", map[string]any{
		"user_id": userID,
	})
}

func (m *Manager) ForceRemovePlayer(roomUUID string, userID uint64) {
	m.mu.Lock()
	info, ok := m.games[roomUUID]
	if !ok {
		m.mu.Unlock()
		return
	}

	s := info.game.State
	newOrder := make([]uint64, 0)
	for _, id := range s.PlayerOrder {
		if id != userID {
			newOrder = append(newOrder, id)
		}
	}

	newPlayers := make([]uno.PlayerState, 0)
	for _, p := range s.Players {
		if p.UserID != userID {
			newPlayers = append(newPlayers, p)
		}
	}
	s.Players = newPlayers

	if len(newOrder) == 0 {
		delete(m.games, roomUUID)
		m.mu.Unlock()
		return
	}

	s.PlayerOrder = newOrder

	if len(newOrder) == 1 {
		winnerID := newOrder[0]
		s.Winner = &winnerID
		s.Phase = uno.PhaseFinished
		scores := info.game.Scores()
		m.finishedGames[roomUUID] = info.game
		delete(m.games, roomUUID)
		m.mu.Unlock()
		_ = m.roomSvc.SetRoomStatus(context.Background(), roomUUID, "finished")
		m.hub.BroadcastToRoom(roomUUID, "game_over", map[string]any{
			"winner":  winnerID,
			"scores":  scores,
			"players": s.PublicPlayers(),
		})
		return
	}

	if s.CurrentPlayerID() == userID {
		if len(newOrder) > 0 {
			s.CurrentIndex = s.CurrentIndex % len(newOrder)
		}
	}
	m.mu.Unlock()

	m.broadcastGameState(roomUUID, info.game, "player_left_game", map[string]any{
		"user_id": userID,
	})
}
