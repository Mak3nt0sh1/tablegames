package uno

import "time"

const HandSize = 7

type Direction int

const (
	Clockwise        Direction = 1
	CounterClockwise Direction = -1
)

type PlayerState struct {
	UserID    uint64 `json:"user_id"`
	Username  string `json:"username"`
	Hand      []Card `json:"hand"`
	SaidUno   bool   `json:"said_uno"`
}

// PublicPlayerState — то что видят другие (без руки)
type PublicPlayerState struct {
	UserID    uint64 `json:"user_id"`
	Username  string `json:"username"`
	CardCount int    `json:"card_count"`
	SaidUno   bool   `json:"said_uno"`
}

type Phase string

const (
	PhasePlaying  Phase = "playing"
	PhaseFinished Phase = "finished"
)

type GameState struct {
	RoomUUID     string        `json:"room_uuid"`
	Phase        Phase         `json:"phase"`
	Players      []PlayerState `json:"-"`
	PlayerOrder  []uint64      `json:"player_order"`
	CurrentIndex int           `json:"current_index"`
	Direction    Direction     `json:"direction"`
	DrawPile     []Card        `json:"-"`
	DiscardPile  []Card        `json:"-"`
	TopCard      Card          `json:"top_card"`
	CurrentColor Color         `json:"current_color"`
	DrawPending  int           `json:"draw_pending"` // накопленный штраф от +2
	Winner       *uint64       `json:"winner,omitempty"`
	StartedAt    time.Time     `json:"started_at"`
}

func (s *GameState) CurrentPlayerID() uint64 {
	return s.PlayerOrder[s.CurrentIndex]
}

func (s *GameState) NextIndex() int {
	n := len(s.PlayerOrder)
	return ((s.CurrentIndex + int(s.Direction)) % n + n) % n
}

func (s *GameState) AdvanceTurn() {
	s.CurrentIndex = s.NextIndex()
}

func (s *GameState) ReverseDirection() {
	s.Direction *= -1
}

func (s *GameState) playerByID(userID uint64) *PlayerState {
	for i := range s.Players {
		if s.Players[i].UserID == userID {
			return &s.Players[i]
		}
	}
	return nil
}

func (s *GameState) PublicPlayers() []PublicPlayerState {
	result := make([]PublicPlayerState, len(s.Players))
	for i, p := range s.Players {
		result[i] = PublicPlayerState{
			UserID:    p.UserID,
			Username:  p.Username,
			CardCount: len(p.Hand),
			SaidUno:   p.SaidUno,
		}
	}
	return result
}

func (s *GameState) DrawPileSize() int {
	return len(s.DrawPile)
}