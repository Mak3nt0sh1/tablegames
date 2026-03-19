package uno

import (
	"errors"
	"time"
)

var (
	ErrNotYourTurn   = errors.New("not your turn")
	ErrInvalidCard   = errors.New("card cannot be played")
	ErrCardNotInHand = errors.New("card not in hand")
	ErrGameFinished  = errors.New("game already finished")
)

// Game — движок одной партии UNO (без диких карт)
type Game struct {
	State *GameState
}

// NewGame создаёт новую игру
func NewGame(roomUUID string, players []struct {
	UserID   uint64
	Username string
}) *Game {
	deck := shuffle(newDeck(), time.Now().UnixNano())

	state := &GameState{
		RoomUUID:    roomUUID,
		Phase:       PhasePlaying,
		Direction:   Clockwise,
		PlayerOrder: make([]uint64, len(players)),
		StartedAt:   time.Now(),
	}

	// Раздаём по 7 карт каждому
	state.Players = make([]PlayerState, len(players))
	for i, p := range players {
		hand := make([]Card, HandSize)
		copy(hand, deck[i*HandSize:(i+1)*HandSize])
		state.Players[i] = PlayerState{
			UserID:   p.UserID,
			Username: p.Username,
			Hand:     hand,
		}
		state.PlayerOrder[i] = p.UserID
	}

	// Остаток — колода для добора
	state.DrawPile = make([]Card, len(deck)-len(players)*HandSize)
	copy(state.DrawPile, deck[len(players)*HandSize:])

	// Открываем первую карту (не спецкарту чтобы не усложнять старт)
	var topIdx int
	for topIdx = len(state.DrawPile) - 1; topIdx >= 0; topIdx-- {
		if !state.DrawPile[topIdx].IsAction() {
			break
		}
	}
	state.TopCard = state.DrawPile[topIdx]
	state.DrawPile = append(state.DrawPile[:topIdx], state.DrawPile[topIdx+1:]...)
	state.DiscardPile = []Card{state.TopCard}
	state.CurrentColor = state.TopCard.Color

	return &Game{State: state}
}

// PlayCard — игрок разыгрывает карту
func (g *Game) PlayCard(userID uint64, cardID int) error {
	s := g.State
	if s.Phase != PhasePlaying {
		return ErrGameFinished
	}
	if s.CurrentPlayerID() != userID {
		return ErrNotYourTurn
	}

	player := s.playerByID(userID)
	if player == nil {
		return errors.New("player not found")
	}

	// Ищем карту в руке
	cardIdx := -1
	for i, c := range player.Hand {
		if c.ID == cardID {
			cardIdx = i
			break
		}
	}
	if cardIdx == -1 {
		return ErrCardNotInHand
	}

	card := player.Hand[cardIdx]

	// Если висит штраф DrawPending — можно сыграть только +2 поверх +2
	if s.DrawPending > 0 && card.Value != DrawTwo {
		return ErrInvalidCard
	}

	// Проверяем совместимость: совпадает цвет или значение
	if !g.canPlay(card) {
		return ErrInvalidCard
	}

	// Убираем карту из руки и сбрасываем флаг UNO
	player.Hand = append(player.Hand[:cardIdx], player.Hand[cardIdx+1:]...)
	player.SaidUno = false

	// Кладём в сброс
	s.DiscardPile = append(s.DiscardPile, card)
	s.TopCard = card
	s.CurrentColor = card.Color

	// Проверяем победу
	if len(player.Hand) == 0 {
		s.Phase = PhaseFinished
		s.Winner = &userID
		return nil
	}

	// Применяем эффект карты
	g.applyCardEffect(card)

	return nil
}

func (g *Game) canPlay(card Card) bool {
	s := g.State
	return card.Color == s.CurrentColor || card.Value == s.TopCard.Value
}

func (g *Game) applyCardEffect(card Card) {
	s := g.State
	switch card.Value {
	case Skip:
		// пропускаем следующего: переходим через одного
		s.AdvanceTurn()
		s.AdvanceTurn()
	case Reverse:
		s.ReverseDirection()
		if len(s.PlayerOrder) == 2 {
			// при 2 игроках Reverse = Skip
			s.AdvanceTurn()
			s.AdvanceTurn()
		} else {
			s.AdvanceTurn()
		}
	case DrawTwo:
		s.DrawPending += 2
		// Передаём ход следующему игроку — он обязан взять карты
		s.AdvanceTurn()
	default:
		s.AdvanceTurn()
	}
}

// DrawCard — игрок берёт карту(ы) из колоды
// Если висит DrawPending — берёт штрафные карты и ход всегда переходит
// Если DrawPending == 0 — берёт 1 карту:
//   - если она подходит для сброса — игрок может её сыграть (ход НЕ переходит)
//   - если не подходит — ход переходит
func (g *Game) DrawCard(userID uint64) ([]Card, error) {
	s := g.State
	if s.Phase != PhasePlaying {
		return nil, ErrGameFinished
	}
	if s.CurrentPlayerID() != userID {
		return nil, ErrNotYourTurn
	}

	player := s.playerByID(userID)

	if s.DrawPending > 0 {
		// Штрафные карты — берём все и переходим ход
		count := s.DrawPending
		s.DrawPending = 0
		drawn := g.dealCards(player, count)
		player.SaidUno = false
		s.AdvanceTurn()
		return drawn, nil
	}

	// Обычное взятие — 1 карта
	drawn := g.dealCards(player, 1)
	player.SaidUno = false

	// Если взятая карта подходит — оставляем ход у игрока
	if len(drawn) > 0 && g.canPlay(drawn[0]) {
		// Ход не переходит — игрок может сыграть карту
		return drawn, nil
	}

	// Карта не подходит — переходим ход
	s.AdvanceTurn()
	return drawn, nil
}

// SayUno — игрок нажал кнопку UNO (когда осталась 1 карта)
func (g *Game) SayUno(userID uint64) error {
	s := g.State
	if s.Phase != PhasePlaying {
		return ErrGameFinished
	}
	player := s.playerByID(userID)
	if player == nil {
		return errors.New("player not found")
	}
	if len(player.Hand) != 1 {
		return errors.New("can only say UNO with exactly 1 card")
	}
	player.SaidUno = true
	return nil
}

// ChallengeUno — другой игрок поймал что у кого-то 1 карта без объявления UNO
// Штраф: targetID берёт 2 карты
func (g *Game) ChallengeUno(challengerID, targetID uint64) ([]Card, error) {
	s := g.State
	if s.Phase != PhasePlaying {
		return nil, ErrGameFinished
	}
	target := s.playerByID(targetID)
	if target == nil {
		return nil, errors.New("player not found")
	}
	if len(target.Hand) != 1 {
		return nil, errors.New("target does not have exactly 1 card")
	}
	if target.SaidUno {
		return nil, errors.New("player already said UNO")
	}
	drawn := g.dealCards(target, 2)
	return drawn, nil
}

// dealCards — выдаёт n карт игроку из колоды
func (g *Game) dealCards(player *PlayerState, n int) []Card {
	s := g.State
	drawn := make([]Card, 0, n)
	for i := 0; i < n; i++ {
		if len(s.DrawPile) == 0 {
			g.reshuffleDiscard()
		}
		if len(s.DrawPile) == 0 {
			break
		}
		card := s.DrawPile[len(s.DrawPile)-1]
		s.DrawPile = s.DrawPile[:len(s.DrawPile)-1]
		player.Hand = append(player.Hand, card)
		drawn = append(drawn, card)
	}
	return drawn
}

// reshuffleDiscard — перемешиваем сброс обратно в колоду (кроме верхней карты)
func (g *Game) reshuffleDiscard() {
	s := g.State
	if len(s.DiscardPile) <= 1 {
		return
	}
	top := s.DiscardPile[len(s.DiscardPile)-1]
	toShuffle := make([]Card, len(s.DiscardPile)-1)
	copy(toShuffle, s.DiscardPile[:len(s.DiscardPile)-1])
	s.DrawPile = shuffle(toShuffle, time.Now().UnixNano())
	s.DiscardPile = []Card{top}
}

// Scores — очки оставшихся карт в руках (победитель набирает сумму чужих карт)
func (g *Game) Scores() map[uint64]int {
	scores := make(map[uint64]int)
	for _, p := range g.State.Players {
		total := 0
		for _, c := range p.Hand {
			total += c.Points()
		}
		scores[p.UserID] = total
	}
	return scores
}

// DealCardsToPlayer — публичный метод для выдачи карт игроку из manager
func (g *Game) DealCardsToPlayer(player *PlayerState, n int) []Card {
	return g.dealCards(player, n)
}

// PlayerByID — публичный доступ к игроку по ID
func (g *Game) PlayerByID(userID uint64) *PlayerState {
	return g.State.playerByID(userID)
}
