package auth

import (
	"context"
	"errors"
	"log"
	"os"
	"tablegames/internal/models"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrAlreadyExists      = errors.New("email or username already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Register(ctx context.Context, email, username, password string) (*models.User, error) {
	exists, _ := s.repo.ExistsByEmailOrUsername(ctx, email, username)
	if exists {
		return nil, ErrAlreadyExists
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, &models.User{
		Email:    email,
		Username: username,
		Password: string(hash),
	})
}

func (s *Service) Login(ctx context.Context, email, password string) (string, error) {
	user, err := s.repo.FindByEmail(ctx, email)
	if err != nil {
		log.Printf("FindByEmail error: %v", err)
		return "", ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		log.Printf("bcrypt error: %v", err)
		return "", ErrInvalidCredentials
	}
	return generateJWT(user)
}

func generateJWT(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":      user.ID,
		"username": user.Username,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(os.Getenv("JWT_SECRET")))
}


// GetUsernames — возвращает map userID -> username для списка ID
func (s *Service) GetUsernames(ctx context.Context, userIDs []uint64) (map[uint64]string, error) {
	return s.repo.GetUsernames(ctx, userIDs)
}