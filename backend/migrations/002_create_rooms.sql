-- +goose Up
CREATE TABLE rooms (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid        CHAR(36)        NOT NULL UNIQUE,
    name        VARCHAR(100)    NOT NULL,
    host_id     BIGINT UNSIGNED NOT NULL,
    invite_code CHAR(8)         NOT NULL UNIQUE,
    max_players TINYINT         DEFAULT 6,
    status      ENUM('waiting','playing','finished') DEFAULT 'waiting',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at  TIMESTAMP NULL,
    FOREIGN KEY (host_id) REFERENCES users(id)
);

CREATE TABLE room_members (
    id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id   BIGINT UNSIGNED NOT NULL,
    user_id   BIGINT UNSIGNED NOT NULL,
    role      ENUM('host','player') DEFAULT 'player',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_room_user (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- +goose Down
DROP TABLE room_members;
DROP TABLE rooms;