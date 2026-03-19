# TableGames

Платформа для настольных игр онлайн.

## Структура проекта

```
tablegames/
├── backend/    # Go API сервер
└── frontend/   # React приложение
```

## Запуск

### Backend
```bash
cd backend
make migrate-up
make run
# API: http://localhost:8080
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

## Технологии

**Backend:** Go, Chi, MySQL, WebSocket, JWT  
**Frontend:** React 19, TypeScript, Vite, Tailwind CSS

## Игры

- UNO