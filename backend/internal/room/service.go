package room

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"tablegames/internal/models"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrRoomNotFound    = errors.New("room not found")
	ErrRoomFull        = errors.New("room is full")
	ErrRoomNotAvail    = errors.New("room is not available")
	ErrInvalidInvite   = errors.New("invalid or expired invite")
	ErrForbidden       = errors.New("forbidden")
	ErrWrongPassword   = errors.New("wrong password")
	ErrNotMember       = errors.New("not a member of this room")
	ErrUnsupportedGame = errors.New("unsupported game type")
)

// SupportedGames — список поддерживаемых игр (дублируем чтобы не импортировать game пакет)
var supportedGames = map[string]bool{"uno": true}

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) CreateRoom(ctx context.Context, hostID uint64, name string, maxPlayers int, password string) (*models.Room, error) {
	code, err := generateInviteCode()
	if err != nil {
		return nil, err
	}
	room := &models.Room{
		UUID:       uuid.New().String(),
		Name:       name,
		HostID:     hostID,
		InviteCode: code,
		MaxPlayers: maxPlayers,
		Status:     "waiting",
		ExpiresAt:  time.Now().Add(24 * time.Hour),
	}
	if password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		h := string(hash)
		room.PasswordHash = &h
	}
	if err := s.repo.CreateRoom(ctx, room); err != nil {
		return nil, err
	}
	_ = s.repo.AddMember(ctx, room.ID, hostID, "host")
	return room, nil
}

func (s *Service) GetRoom(ctx context.Context, uuid string) (*models.Room, error) {
	return s.repo.FindByUUID(ctx, uuid)
}

func (s *Service) GetMembers(ctx context.Context, roomID uint64) ([]models.RoomMember, error) {
	return s.repo.GetMembers(ctx, roomID)
}

func (s *Service) IsMember(ctx context.Context, roomID, userID uint64) (bool, error) {
	_, err := s.repo.FindMember(ctx, roomID, userID)
	return err == nil, nil
}

// UpdateRoom — хост меняет настройки комнаты
func (s *Service) UpdateRoom(ctx context.Context, roomUUID string, hostID uint64, name string, maxPlayers int, password *string, gameType string) (*models.Room, error) {
	room, err := s.repo.FindByUUID(ctx, roomUUID)
	if err != nil {
		return nil, ErrRoomNotFound
	}
	if room.HostID != hostID {
		return nil, ErrForbidden
	}
	if room.Status == "playing" {
		return nil, ErrRoomNotAvail
	}
	if maxPlayers > 0 {
		count, _ := s.repo.CountMembers(ctx, room.ID)
		if maxPlayers < count {
			return nil, errors.New("max_players cannot be less than current player count")
		}
		room.MaxPlayers = maxPlayers
	}
	if name != "" {
		room.Name = name
	}
	// password: nil = не менять, "" = убрать пароль, "xxx" = установить новый
	if password != nil {
		if *password == "" {
			room.PasswordHash = nil
		} else {
			hash, err := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
			if err != nil {
				return nil, err
			}
			h := string(hash)
			room.PasswordHash = &h
		}
	}
	if gameType != "" {
		if !supportedGames[gameType] {
			return nil, ErrUnsupportedGame
		}
		room.GameType = gameType
	}
	if err := s.repo.UpdateRoom(ctx, room); err != nil {
		return nil, err
	}
	return room, nil
}

// LeaveRoom — игрок добровольно выходит из комнаты
func (s *Service) LeaveRoom(ctx context.Context, roomUUID string, userID uint64) error {
	room, err := s.repo.FindByUUID(ctx, roomUUID)
	if err != nil {
		return ErrRoomNotFound
	}
	if room.HostID == userID {
		return errors.New("host cannot leave, use delete room instead")
	}
	return s.repo.RemoveMember(ctx, room.ID, userID)
}

// KickPlayer — хост кикает игрока
func (s *Service) KickPlayer(ctx context.Context, roomUUID string, hostID, targetUserID uint64) error {
	room, err := s.repo.FindByUUID(ctx, roomUUID)
	if err != nil {
		return ErrRoomNotFound
	}
	if room.HostID != hostID {
		return ErrForbidden
	}
	if targetUserID == hostID {
		return errors.New("cannot kick yourself")
	}
	_, err = s.repo.FindMember(ctx, room.ID, targetUserID)
	if err != nil {
		return ErrNotMember
	}
	return s.repo.RemoveMember(ctx, room.ID, targetUserID)
}

// DeleteRoom — хост удаляет комнату
func (s *Service) DeleteRoom(ctx context.Context, roomUUID string, hostID uint64) error {
	room, err := s.repo.FindByUUID(ctx, roomUUID)
	if err != nil {
		return ErrRoomNotFound
	}
	if room.HostID != hostID {
		return ErrForbidden
	}
	return s.repo.DeleteRoom(ctx, room.ID)
}

func (s *Service) JoinByCode(ctx context.Context, userID uint64, code string, password string) (*models.Room, error) {
	room, err := s.repo.FindByInviteCode(ctx, code)
	if err != nil {
		return nil, ErrRoomNotFound
	}
	if room.HasPassword() {
		if password == "" {
			return nil, ErrWrongPassword
		}
		if err := bcrypt.CompareHashAndPassword([]byte(*room.PasswordHash), []byte(password)); err != nil {
			return nil, ErrWrongPassword
		}
	}
	return s.joinRoom(ctx, userID, room)
}

func (s *Service) JoinByToken(ctx context.Context, userID uint64, token string) (*models.Room, error) {
	invite, err := s.repo.FindInviteByToken(ctx, token)
	if err != nil || invite.Status != "pending" || time.Now().After(invite.ExpiresAt) {
		return nil, ErrInvalidInvite
	}
	if invite.InvitedUserID != nil && *invite.InvitedUserID != userID {
		return nil, ErrInvalidInvite
	}
	var room models.Room
	err = s.repo.db.GetContext(ctx, &room, `SELECT * FROM rooms WHERE id = ?`, invite.RoomID)
	if err != nil {
		return nil, ErrRoomNotFound
	}
	_ = s.repo.UpdateInviteStatus(ctx, invite.ID, "accepted")
	return s.joinRoom(ctx, userID, &room)
}

func (s *Service) CreateInviteLink(ctx context.Context, roomUUID string, hostID uint64) (string, error) {
	room, err := s.repo.FindByUUID(ctx, roomUUID)
	if err != nil {
		return "", ErrRoomNotFound
	}
	member, err := s.repo.FindMember(ctx, room.ID, hostID)
	if err != nil || member.Role != "host" {
		return "", ErrForbidden
	}
	token, err := generateToken()
	if err != nil {
		return "", err
	}
	inv := &models.RoomInvite{
		RoomID:    room.ID,
		InvitedBy: hostID,
		Token:     token,
		ExpiresAt: time.Now().Add(48 * time.Hour),
	}
	if err := s.repo.CreateInvite(ctx, inv); err != nil {
		return "", err
	}
	return fmt.Sprintf("/api/join/token/%s", token), nil
}

func (s *Service) joinRoom(ctx context.Context, userID uint64, room *models.Room) (*models.Room, error) {
	if room.Status == "playing" {
		return nil, ErrRoomNotAvail
	}
	count, _ := s.repo.CountMembers(ctx, room.ID)
	if count >= room.MaxPlayers {
		return nil, ErrRoomFull
	}
	_ = s.repo.AddMember(ctx, room.ID, userID, "player")
	return room, nil
}

func generateInviteCode() (string, error) {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	code := make([]byte, 8)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", err
		}
		code[i] = chars[n.Int64()]
	}
	return string(code), nil
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}

// SaveGameResults — сохраняет результаты игры для всех участников
func (s *Service) SaveGameResults(ctx context.Context, roomID uint64, gameType string, winnerID uint64, scores map[uint64]int) error {
	for userID, score := range scores {
		result := "lose"
		if userID == winnerID {
			result = "win"
		}
		_ = s.repo.SaveGameResult(ctx, roomID, userID, gameType, result, score)
	}
	return nil
}

func (s *Service) SetRoomStatus(ctx context.Context, roomUUID string, status string) error {
	room, err := s.repo.FindByUUID(ctx, roomUUID)
	if err != nil {
		return ErrRoomNotFound
	}
	return s.repo.UpdateStatus(ctx, room.ID, status)
}
