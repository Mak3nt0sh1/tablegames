package room

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

func (r *Repository) CreateRoom(ctx context.Context, room *models.Room) error {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO rooms (uuid, name, host_id, invite_code, password_hash, max_players, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		room.UUID, room.Name, room.HostID, room.InviteCode,
		room.PasswordHash, room.MaxPlayers, room.ExpiresAt,
	)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	room.ID = uint64(id)
	return nil
}

func (r *Repository) UpdateRoom(ctx context.Context, room *models.Room) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE rooms SET name = ?, max_players = ?, password_hash = ?, game_type = ? WHERE id = ?`,
		room.Name, room.MaxPlayers, room.PasswordHash, room.GameType, room.ID,
	)
	return err
}

func (r *Repository) DeleteRoom(ctx context.Context, roomID uint64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM rooms WHERE id = ?`, roomID)
	return err
}

func (r *Repository) FindByUUID(ctx context.Context, uuid string) (*models.Room, error) {
	var room models.Room
	err := r.db.GetContext(ctx, &room, `SELECT * FROM rooms WHERE uuid = ?`, uuid)
	return &room, err
}

func (r *Repository) FindByInviteCode(ctx context.Context, code string) (*models.Room, error) {
	var room models.Room
	err := r.db.GetContext(ctx, &room, `SELECT * FROM rooms WHERE invite_code = ?`, code)
	return &room, err
}

func (r *Repository) AddMember(ctx context.Context, roomID, userID uint64, role string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT IGNORE INTO room_members (room_id, user_id, role) VALUES (?, ?, ?)`,
		roomID, userID, role,
	)
	return err
}

func (r *Repository) RemoveMember(ctx context.Context, roomID, userID uint64) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM room_members WHERE room_id = ? AND user_id = ?`,
		roomID, userID,
	)
	return err
}

func (r *Repository) FindMember(ctx context.Context, roomID, userID uint64) (*models.RoomMember, error) {
	var m models.RoomMember
	err := r.db.GetContext(ctx, &m,
		`SELECT * FROM room_members WHERE room_id = ? AND user_id = ?`, roomID, userID,
	)
	return &m, err
}

func (r *Repository) GetMembers(ctx context.Context, roomID uint64) ([]models.RoomMember, error) {
	var members []models.RoomMember
	err := r.db.SelectContext(ctx, &members, `SELECT * FROM room_members WHERE room_id = ?`, roomID)
	return members, err
}

func (r *Repository) CountMembers(ctx context.Context, roomID uint64) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM room_members WHERE room_id = ?`, roomID)
	return count, err
}

func (r *Repository) CreateInvite(ctx context.Context, inv *models.RoomInvite) error {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO room_invites (room_id, invited_by, invited_user_id, token, expires_at)
		 VALUES (?, ?, ?, ?, ?)`,
		inv.RoomID, inv.InvitedBy, inv.InvitedUserID, inv.Token, inv.ExpiresAt,
	)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	inv.ID = uint64(id)
	return nil
}

func (r *Repository) FindInviteByToken(ctx context.Context, token string) (*models.RoomInvite, error) {
	var inv models.RoomInvite
	err := r.db.GetContext(ctx, &inv, `SELECT * FROM room_invites WHERE token = ?`, token)
	return &inv, err
}

func (r *Repository) UpdateInviteStatus(ctx context.Context, id uint64, status string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE room_invites SET status = ? WHERE id = ?`, status, id)
	return err
}

// SaveGameResult — сохраняет результат игры одного игрока
func (r *Repository) SaveGameResult(ctx context.Context, roomID, userID uint64, gameType, result string, score int) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO game_results (room_id, user_id, game_type, result, score) VALUES (?, ?, ?, ?, ?)`,
		roomID, userID, gameType, result, score,
	)
	return err
}

// IsMemberDirect — синхронная проверка членства без error
func (r *Repository) IsMemberDirect(ctx context.Context, roomID, userID uint64) bool {
	_, err := r.FindMember(ctx, roomID, userID)
	return err == nil
}

// FindRoomsByUserID — возвращает список room_id где состоит пользователь
func (r *Repository) FindRoomsByUserID(ctx context.Context, userID uint64) ([]uint64, error) {
	var ids []uint64
	err := r.db.SelectContext(ctx, &ids,
		`SELECT room_id FROM room_members WHERE user_id = ? ORDER BY joined_at DESC`, userID)
	return ids, err
}

// FindByID — находит комнату по ID
func (r *Repository) FindByID(ctx context.Context, roomID uint64) (*models.Room, error) {
	var room models.Room
	err := r.db.GetContext(ctx, &room, `SELECT * FROM rooms WHERE id = ?`, roomID)
	return &room, err
}

func (r *Repository) UpdateStatus(ctx context.Context, roomID uint64, status string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE rooms SET status = ? WHERE id = ?`, status, roomID)
	return err
}
