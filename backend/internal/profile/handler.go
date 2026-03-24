package profile

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"tablegames/internal/middleware"

	"github.com/google/uuid"
)

// AuthService — интерфейс для генерации токенов
type AuthService interface {
	GenerateToken(userID uint64, username string) (string, error)
}

type Handler struct {
	svc     *Service
	authSvc AuthService
}

func NewHandler(svc *Service, authSvc AuthService) *Handler {
	return &Handler{svc: svc, authSvc: authSvc}
}

// GetProfile — GET /api/profile
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	profile, err := h.svc.GetProfile(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "profile not found")
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

// UpdateProfile — PATCH /api/profile
func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)
	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}
	if len(req.Username) < 3 || len(req.Username) > 50 {
		writeError(w, http.StatusBadRequest, "username must be 3-50 characters")
		return
	}
	profile, err := h.svc.UpdateUsername(r.Context(), userID, req.Username)
	if err != nil {
		if errors.Is(err, ErrUsernameTaken) {
			writeError(w, http.StatusConflict, "username already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	// Генерируем новый JWT с обновлённым username
	if newToken, err := h.authSvc.GenerateToken(userID, req.Username); err == nil {
		profile.NewToken = newToken
	}
	writeJSON(w, http.StatusOK, profile)
}

// UploadAvatar — POST /api/profile/avatar
// Принимает multipart/form-data с полем "avatar"
func (h *Handler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(uint64)

	// Лимит 2MB
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "file too large (max 2MB)")
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		writeError(w, http.StatusBadRequest, "avatar field required")
		return
	}
	defer file.Close()

	// Проверяем тип файла
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
	if !allowed[ext] {
		writeError(w, http.StatusBadRequest, "only jpg, png, webp allowed")
		return
	}

	// Сохраняем файл
	uploadsDir := "./uploads/avatars"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}

	filename := uuid.New().String() + ext
	dst, err := os.Create(filepath.Join(uploadsDir, filename))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}

	avatarURL := "/uploads/avatars/" + filename
	profile, err := h.svc.UpdateAvatar(r.Context(), userID, avatarURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
