package profile

import (
	"context"

	"github.com/jmoiron/sqlx"
)

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

type UserRow struct {
	ID        uint64  `db:"id"`
	Username  string  `db:"username"`
	Email     string  `db:"email"`
	AvatarURL *string `db:"avatar_url"`
}

type StatsRow struct {
	GamesPlayed int `db:"games_played"`
	Wins        int `db:"wins"`
}

func (r *Repository) FindUser(ctx context.Context, userID uint64) (*UserRow, error) {
	var u UserRow
	err := r.db.GetContext(ctx, &u,
		`SELECT id, username, email, avatar_url FROM users WHERE id = ?`, userID)
	return &u, err
}

func (r *Repository) UpdateUsername(ctx context.Context, userID uint64, username string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET username = ? WHERE id = ?`, username, userID)
	return err
}

func (r *Repository) UpdateAvatar(ctx context.Context, userID uint64, avatarURL string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET avatar_url = ? WHERE id = ?`, avatarURL, userID)
	return err
}

func (r *Repository) UsernameExists(ctx context.Context, username string, excludeUserID uint64) (bool, error) {
	var count int
	err := r.db.GetContext(ctx, &count,
		`SELECT COUNT(*) FROM users WHERE username = ? AND id != ?`, username, excludeUserID)
	return count > 0, err
}

func (r *Repository) GetStats(ctx context.Context, userID uint64) (*StatsRow, error) {
	var stats StatsRow
	err := r.db.GetContext(ctx, &stats, `
		SELECT
			COUNT(*) as games_played,
			SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
		FROM game_results
		WHERE user_id = ?`, userID)
	return &stats, err
}

type GameResultRow struct {
	GameType string `db:"game_type"`
	Result   string `db:"result"`
	Score    int    `db:"score"`
	PlayedAt string `db:"played_at"`
}

func (r *Repository) GetHistory(ctx context.Context, userID uint64, limit int) ([]GameResultRow, error) {
	var rows []GameResultRow
	err := r.db.SelectContext(ctx, &rows, `
		SELECT game_type, result, score, played_at
		FROM game_results
		WHERE user_id = ?
		ORDER BY played_at DESC
		LIMIT ?`, userID, limit)
	return rows, err
}
