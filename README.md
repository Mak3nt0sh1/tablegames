# TableGames — Руководство по локальному развёртыванию

## Структура проекта

```
tablegames/
├── backend/      # Go API сервер
├── frontend/     # React приложение
├── .env          # Переменные окружения (создать вручную)
└── SETUP.md
```

---

## Linux (Ubuntu / Debian)

### 1. Установка зависимостей

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget mysql-server
```

### 2. Установка Go 1.23

```bash
wget https://go.dev/dl/go1.23.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.23.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

### 3. Установка Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4. Установка Goose (миграции БД)

```bash
go install github.com/pressly/goose/v3/cmd/goose@latest
export PATH=$PATH:$(go env GOPATH)/bin
echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.bashrc
```

### 5. Настройка MySQL

```bash
# Запускаем MySQL
sudo systemctl start mysql
sudo systemctl enable mysql

# Входим в MySQL
sudo mysql

# Внутри MySQL выполняем:
CREATE DATABASE tablegames CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'app'@'localhost' IDENTIFIED BY 'yourpassword';
GRANT ALL PRIVILEGES ON tablegames.* TO 'app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 6. Клонирование проекта

```bash
git clone https://github.com/Mak3nt0sh1/tablegames tablegames
cd tablegames
```

### 7. Создание .env файла

Создайте файл `.env` в **корне проекта** (рядом с папками `backend/` и `frontend/`):

```bash
cat > .env << 'EOF'
DB_DSN=app:yourpassword@tcp(127.0.0.1:3306)/tablegames?parseTime=true
JWT_SECRET=замените_на_случайную_строку_минимум_32_символа
SERVER_PORT=8080
EOF
```

> Сгенерировать JWT_SECRET: `openssl rand -hex 32`

### 8. Запуск миграций

```bash
cd tablegames
goose -dir backend/migrations mysql "app:yourpassword@tcp(127.0.0.1:3306)/tablegames?parseTime=true" up
```

### 9. Сборка и запуск бэкенда

```bash
cd backend
go mod tidy
go run ./cmd/server/main.go
```

Сервер запустится на `http://localhost:8080`

### 10. Запуск фронтенда

Откройте **новый терминал**:

```bash
cd tablegames/frontend
npm install
npm run dev
```

Фронтенд запустится на `http://localhost:5173`

### 11. Открыть приложение

Перейдите в браузере: **http://localhost:5173**

---

##  Windows

### 1. Установка Go 1.23

1. Скачайте установщик: https://go.dev/dl/go1.23.0.windows-amd64.msi
2. Запустите установщик, следуйте инструкциям
3. Откройте **PowerShell** и проверьте:
```powershell
go version  # go1.23.x
```

### 2. Установка Node.js 20

1. Скачайте установщик: https://nodejs.org/en/download (выберите LTS версию 20.x)
2. Запустите установщик
3. Проверьте:
```powershell
node -v   # v20.x.x
npm -v    # 10.x.x
```

### 3. Установка MySQL

1. Скачайте MySQL Installer: https://dev.mysql.com/downloads/installer/
2. Выберите **MySQL Community Server**
3. В процессе установки задайте пароль для пользователя `root`
4. После установки откройте **MySQL Command Line Client** и выполните:

```sql
CREATE DATABASE tablegames CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'app'@'localhost' IDENTIFIED BY 'yourpassword';
GRANT ALL PRIVILEGES ON tablegames.* TO 'app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Установка Goose

```powershell
go install github.com/pressly/goose/v3/cmd/goose@latest
```

Добавьте путь `%USERPROFILE%\go\bin` в переменную окружения `PATH`:
- Откройте "Изменить системные переменные среды"
- В разделе "Переменные пользователя" найдите `Path`
- Добавьте `%USERPROFILE%\go\bin`

### 5. Клонирование проекта

```powershell
git clone <URL_РЕПОЗИТОРИЯ> tablegames
cd tablegames
```

### 6. Создание .env файла

Создайте файл `.env` в **корне проекта** (рядом с `backend\` и `frontend\`):

```
DB_DSN=app:yourpassword@tcp(127.0.0.1:3306)/tablegames?parseTime=true
JWT_SECRET=замените_на_случайную_строку_минимум_32_символа
SERVER_PORT=8080
```

> Открыть папку в проводнике → правая кнопка → Создать текстовый документ → назвать `.env` (без расширения `.txt`)

### 7. Запуск миграций

```powershell
cd tablegames
goose -dir backend\migrations mysql "app:yourpassword@tcp(127.0.0.1:3306)/tablegames?parseTime=true" up
```

### 8. Запуск бэкенда

```powershell
cd backend
go mod tidy
go run .\cmd\server\main.go
```

Сервер запустится на `http://localhost:8080`

### 9. Запуск фронтенда

Откройте **новое окно PowerShell**:

```powershell
cd tablegames\frontend
npm install
npm run dev
```

Фронтенд запустится на `http://localhost:5173`

### 10. Открыть приложение

Перейдите в браузере: **http://localhost:5173**

---

## ⚙️ Быстрый запуск (после первой настройки)

### Linux
```bash
# Терминал 1 — бэкенд
cd tablegames/backend && go run ./cmd/server/main.go

# Терминал 2 — фронтенд
cd tablegames/frontend && npm run dev
```

### Windows
```powershell
# PowerShell 1 — бэкенд
cd tablegames\backend; go run .\cmd\server\main.go

# PowerShell 2 — фронтенд
cd tablegames\frontend; npm run dev
```

---

## Возможные проблемы

### "Access denied for user 'app'@'localhost'"
Пароль в `.env` не совпадает с паролем в MySQL. Пересоздайте пользователя:
```sql
DROP USER IF EXISTS 'app'@'localhost';
CREATE USER 'app'@'localhost' IDENTIFIED BY 'новый_пароль';
GRANT ALL PRIVILEGES ON tablegames.* TO 'app'@'localhost';
FLUSH PRIVILEGES;
```

### "go: command not found" (Linux)
```bash
source ~/.bashrc
# или перезапустите терминал
```

### "goose: command not found" (Linux)
```bash
export PATH=$PATH:$(go env GOPATH)/bin
```

### "port 8080 already in use"
```bash
# Linux
sudo lsof -i :8080
sudo kill -9 <PID>

# Windows
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

### MySQL не запускается (Linux)
```bash
sudo systemctl status mysql
sudo systemctl restart mysql
```

### MySQL не запускается (Windows)
Откройте "Службы" (services.msc) → найдите MySQL80 → запустите

---

## Требования к системе

| Компонент | Версия |
|-----------|--------|
| Go        | 1.23+  |
| Node.js   | 20+    |
| MySQL     | 8.0+   |
| npm       | 10+    |

---

## Адреса после запуска

| Сервис   | Адрес                   |
|----------|-------------------------|
| Фронтенд | http://localhost:5173   |
| Бэкенд   | http://localhost:8080   |
| API      | http://localhost:8080/api |
