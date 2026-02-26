package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"tablegames/internal/auth"
	"tablegames/internal/middleware"
	"tablegames/internal/room"
	"tablegames/pkg/db"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Fatal("error loading .env file")
	}

	database := db.Connect()
	defer database.Close()

	// auth
	authRepo := auth.NewRepository(database)
	authSvc := auth.NewService(authRepo)
	authHandler := auth.NewHandler(authSvc)

	// room
	roomRepo := room.NewRepository(database)
	roomSvc := room.NewService(roomRepo)
	roomHandler := room.NewHandler(roomSvc)

	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)

	// публичные маршруты
	r.Post("/api/auth/register", authHandler.Register)
	r.Post("/api/auth/login", authHandler.Login)

	// защищённые маршруты
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth)

		r.Post("/api/rooms", roomHandler.CreateRoom)
		r.Get("/api/rooms/{uuid}", roomHandler.GetRoom)
		r.Post("/api/rooms/{uuid}/invite", roomHandler.CreateInviteLink)

		r.Post("/api/join/code/{code}", roomHandler.JoinByCode)
		r.Post("/api/join/token/{token}", roomHandler.JoinByToken)
	})

	port := os.Getenv("SERVER_PORT")
	fmt.Printf("server running on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
