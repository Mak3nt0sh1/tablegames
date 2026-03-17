package auth

import (
	"context"
	"tablegames/internal/models"

	"github.com/jmoiron/sqlx"
)

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, u *models.User) (*models.User, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
		u.Username, u.Email, u.Password,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	u.ID = uint64(id)
	return u, nil
}

func (r *Repository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.GetContext(ctx, &u, `SELECT * FROM users WHERE email = ?`, email)
	return &u, err
}

func (r *Repository) ExistsByEmailOrUsername(ctx context.Context, email, username string) (bool, error) {
	var count int
	err := r.db.GetContext(ctx, &count,
		`SELECT COUNT(*) FROM users WHERE email = ? OR username = ?`, email, username,
	)
	return count > 0, err
}


// GetUsernames — возвращает map userID -> username
func (r *Repository) GetUsernames(ctx context.Context, userIDs []uint64) (map[uint64]string, error) {
	if len(userIDs) == 0 {
		return map[uint64]string{}, nil
	}
	query, args, err := sqlx.In(`SELECT id, username FROM users WHERE id IN (?)`, userIDs)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)
	var rows []struct {
		ID       uint64 `db:"id"`
		Username string `db:"username"`
	}
	if err := r.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}
	result := make(map[uint64]string, len(rows))
	for _, row := range rows {
		result[row.ID] = row.Username
	}
	return result, nil
}