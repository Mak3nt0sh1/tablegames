package db

import (
	"log"
	"os"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

func Connect() *sqlx.DB {
	dsn := os.Getenv("DB_DSN")
	db, err := sqlx.Connect("mysql", dsn)
	if err != nil {
		log.Fatalf("db connect error: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	return db
}
