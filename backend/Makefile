.PHONY: run migrate-up migrate-down tidy

run:
	air

migrate-up:
	goose -dir migrations mysql "app:secret@tcp(127.0.0.1:3306)/tablegames?parseTime=true" up

migrate-down:
	goose -dir migrations mysql "app:secret@tcp(127.0.0.1:3306)/tablegames?parseTime=true" down

tidy:
	go mod tidy