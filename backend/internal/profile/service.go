package profile

import (
	"context"
	"errors"
)

var ErrUsernameTaken = errors.New("username already taken")

type ProfileResponse struct {
	ID          uint64        `json:"id"`
	Username    string        `json:"username"`
	Email       string        `json:"email"`
	AvatarURL   *string       `json:"avatar_url"`
	GamesPlayed int           `json:"games_played"`
	Wins        int           `json:"wins"`
	WinRate     float64       `json:"win_rate"`
	History     []GameHistory `json:"history"`
}

type GameHistory struct {
	GameType string `json:"game_type"`
	Result   string `json:"result"`
	Score    int    `json:"score"`
	PlayedAt string `json:"played_at"`
}

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetProfile(ctx context.Context, userID uint64) (*ProfileResponse, error) {
	user, err := s.repo.FindUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	stats, err := s.repo.GetStats(ctx, userID)
	if err != nil {
		stats = &StatsRow{}
	}

	history, err := s.repo.GetHistory(ctx, userID, 10)
	if err != nil {
		history = []GameResultRow{}
	}

	winRate := 0.0
	if stats.GamesPlayed > 0 {
		winRate = float64(stats.Wins) / float64(stats.GamesPlayed) * 100
	}

	historyResp := make([]GameHistory, len(history))
	for i, h := range history {
		historyResp[i] = GameHistory{
			GameType: h.GameType,
			Result:   h.Result,
			Score:    h.Score,
			PlayedAt: h.PlayedAt,
		}
	}

	return &ProfileResponse{
		ID:          user.ID,
		Username:    user.Username,
		Email:       user.Email,
		AvatarURL:   user.AvatarURL,
		GamesPlayed: stats.GamesPlayed,
		Wins:        stats.Wins,
		WinRate:     winRate,
		History:     historyResp,
	}, nil
}

func (s *Service) UpdateUsername(ctx context.Context, userID uint64, username string) (*ProfileResponse, error) {
	exists, err := s.repo.UsernameExists(ctx, username, userID)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrUsernameTaken
	}
	if err := s.repo.UpdateUsername(ctx, userID, username); err != nil {
		return nil, err
	}
	return s.GetProfile(ctx, userID)
}

func (s *Service) UpdateAvatar(ctx context.Context, userID uint64, avatarURL string) (*ProfileResponse, error) {
	if err := s.repo.UpdateAvatar(ctx, userID, avatarURL); err != nil {
		return nil, err
	}
	return s.GetProfile(ctx, userID)
}
