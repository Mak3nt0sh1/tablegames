package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"tablegames/internal/auth"
	"tablegames/internal/middleware"
	"tablegames/internal/room"
	"tablegames/internal/ws"
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

	// websocket hub
	hub := ws.NewHub()
	go hub.Run()

	// room
	roomRepo := room.NewRepository(database)
	roomSvc := room.NewService(roomRepo)
	roomHandler := room.NewHandler(roomSvc, hub)

	// websocket handler
	wsHandler := ws.NewHandler(hub, roomSvc)

	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)

	// публичные маршруты
	r.Post("/api/auth/register", authHandler.Register)
	r.Post("/api/auth/login", authHandler.Login)

	// защищённые маршруты
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth)

		// комнаты
		r.Post("/api/rooms", roomHandler.CreateRoom)
		r.Get("/api/rooms/{uuid}", roomHandler.GetRoom)
		r.Patch("/api/rooms/{uuid}", roomHandler.UpdateRoom)
		r.Delete("/api/rooms/{uuid}", roomHandler.DeleteRoom)

		// управление игроками
		r.Post("/api/rooms/{uuid}/kick", roomHandler.KickPlayer)
		r.Delete("/api/rooms/{uuid}/leave", roomHandler.LeaveRoom)

		// инвайты
		r.Post("/api/rooms/{uuid}/invite", roomHandler.CreateInviteLink)
		r.Post("/api/join/code/{code}", roomHandler.JoinByCode)
		r.Post("/api/join/token/{token}", roomHandler.JoinByToken)

		// websocket
		r.Get("/api/rooms/{uuid}/ws", wsHandler.ServeWS)
	})

	port := os.Getenv("SERVER_PORT")
	fmt.Printf("server running on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
