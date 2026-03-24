package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"tablegames/internal/auth"
	game "tablegames/internal/game"
	"tablegames/internal/middleware"
	"tablegames/internal/profile"
	"tablegames/internal/room"
	"tablegames/internal/ws"
	"tablegames/pkg/db"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
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

	// profile
	profileRepo := profile.NewRepository(database)
	profileSvc := profile.NewService(profileRepo)
	profileHandler := profile.NewHandler(profileSvc, authSvc)

	// game
	gameMgr := game.NewManager(hub, roomSvc, authSvc)
	hub.SetGameManager(gameMgr)
	gameHandler := game.NewHandler(gameMgr)

	// websocket handler
	wsHandler := ws.NewHandler(hub, roomSvc)

	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)

	// CORS — разрешаем запросы с фронтенда
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Статик сервер для аватаров
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	// публичные маршруты
	r.Post("/api/auth/register", authHandler.Register)
	r.Post("/api/auth/login", authHandler.Login)

	// защищённые маршруты
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth)

		// комнаты
		r.Post("/api/rooms", roomHandler.CreateRoom)
		r.Get("/api/rooms/my", roomHandler.GetMyRoom)
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

		// игра
		r.Post("/api/rooms/{uuid}/game/start", gameHandler.StartGame)
		r.Get("/api/rooms/{uuid}/game/state", gameHandler.GetGameState)
		r.Post("/api/rooms/{uuid}/game/play", gameHandler.PlayCard)
		r.Post("/api/rooms/{uuid}/game/draw", gameHandler.DrawCard)
		r.Post("/api/rooms/{uuid}/game/uno", gameHandler.SayUno)
		r.Post("/api/rooms/{uuid}/game/challenge", gameHandler.ChallengeUno)
		r.Post("/api/rooms/{uuid}/game/reset", gameHandler.ResetGame)
		r.Get("/api/rooms/{uuid}/game/status", gameHandler.GameStatus)
		r.Post("/api/rooms/{uuid}/game/end", gameHandler.ForceEndGame)
		r.Get("/api/game/active", gameHandler.ActiveGame)

		// профиль
		r.Get("/api/profile", profileHandler.GetProfile)
		r.Patch("/api/profile", profileHandler.UpdateProfile)
		r.Post("/api/profile/avatar", profileHandler.UploadAvatar)

		// websocket
		r.Get("/api/rooms/{uuid}/ws", wsHandler.ServeWS)
	})

	port := os.Getenv("SERVER_PORT")
	fmt.Printf("server running on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
