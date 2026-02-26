-- +goose Up
CREATE TABLE room_invites (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id         BIGINT UNSIGNED NOT NULL,
    invited_by      BIGINT UNSIGNED NOT NULL,
    invited_user_id BIGINT UNSIGNED NULL,
    token           CHAR(64)        NOT NULL UNIQUE,
    status          ENUM('pending','accepted','declined','expired') DEFAULT 'pending',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP NOT NULL,
    FOREIGN KEY (room_id)         REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by)      REFERENCES users(id),
    FOREIGN KEY (invited_user_id) REFERENCES users(id)
);

-- +goose Down
DROP TABLE room_invites;