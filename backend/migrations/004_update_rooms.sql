-- +goose Up
ALTER TABLE rooms
    ADD COLUMN password_hash VARCHAR(255) NULL AFTER invite_code;

-- +goose Down
ALTER TABLE rooms
    DROP COLUMN password_hash;