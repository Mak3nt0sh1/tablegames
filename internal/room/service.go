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
)

var (
	ErrRoomNotFound  = errors.New("room not found")
	ErrRoomFull      = errors.New("room is full")
	ErrRoomNotAvail  = errors.New("room is not available")
	ErrInvalidInvite = errors.New("invalid or expired invite")
	ErrForbidden     = errors.New("forbidden")
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) CreateRoom(ctx context.Context, hostID uint64, name string, maxPlayers int) (*models.Room, error) {
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

func (s *Service) JoinByCode(ctx context.Context, userID uint64, code string) (*models.Room, error) {
	room, err := s.repo.FindByInviteCode(ctx, code)
	if err != nil {
		return nil, ErrRoomNotFound
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
	room, err := s.repo.FindByUUID(ctx, fmt.Sprintf("%d", invite.RoomID))
	if err != nil {
		return nil, ErrRoomNotFound
	}
	_ = s.repo.UpdateInviteStatus(ctx, invite.ID, "accepted")
	return s.joinRoom(ctx, userID, room)
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
	if room.Status != "waiting" {
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
