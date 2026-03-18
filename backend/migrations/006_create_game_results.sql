-- +goose Up
CREATE TABLE game_results (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id    BIGINT UNSIGNED NOT NULL,
    user_id    BIGINT UNSIGNED NOT NULL,
    game_type  VARCHAR(50)     NOT NULL,
    result     ENUM('win','lose') NOT NULL,
    score      INT             DEFAULT 0,
    played_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- +goose Down
DROP TABLE game_results;