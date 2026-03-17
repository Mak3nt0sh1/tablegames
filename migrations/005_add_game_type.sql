-- +goose Up
ALTER TABLE rooms
    ADD COLUMN game_type VARCHAR(50) NOT NULL DEFAULT 'uno' AFTER password_hash;

-- +goose Down
ALTER TABLE rooms
    DROP COLUMN game_type;