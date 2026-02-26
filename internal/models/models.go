package models

import "time"

type User struct {
	ID        uint64    `db:"id"         json:"id"`
	Username  string    `db:"username"   json:"username"`
	Email     string    `db:"email"      json:"email"`
	Password  string    `db:"password"   json:"-"`
	AvatarURL *string   `db:"avatar_url" json:"avatar_url,omitempty"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at,omitempty"`
}

type Room struct {
	ID         uint64    `db:"id"          json:"id"`
	UUID       string    `db:"uuid"        json:"uuid"`
	Name       string    `db:"name"        json:"name"`
	HostID     uint64    `db:"host_id"     json:"host_id"`
	InviteCode string    `db:"invite_code" json:"invite_code"`
	MaxPlayers int       `db:"max_players" json:"max_players"`
	Status     string    `db:"status"      json:"status"`
	CreatedAt  time.Time `db:"created_at"  json:"created_at"`
	ExpiresAt  time.Time `db:"expires_at"  json:"expires_at"`
}

type RoomMember struct {
	ID       uint64    `db:"id"        json:"id"`
	RoomID   uint64    `db:"room_id"   json:"room_id"`
	UserID   uint64    `db:"user_id"   json:"user_id"`
	Role     string    `db:"role"      json:"role"`
	JoinedAt time.Time `db:"joined_at" json:"joined_at"`
}

type RoomInvite struct {
	ID            uint64    `db:"id"              json:"id"`
	RoomID        uint64    `db:"room_id"         json:"room_id"`
	InvitedBy     uint64    `db:"invited_by"      json:"invited_by"`
	InvitedUserID *uint64   `db:"invited_user_id" json:"invited_user_id,omitempty"`
	Token         string    `db:"token"           json:"token"`
	Status        string    `db:"status"          json:"status"`
	CreatedAt     time.Time `db:"created_at"      json:"created_at"`
	ExpiresAt     time.Time `db:"expires_at"      json:"expires_at"`
}
