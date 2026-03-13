#!/bin/bash

BASE="http://localhost:8080"
PASS=0
FAIL=0

# Чистим тестовых пользователей перед каждым запуском
mysql -u root tablegames 2>/dev/null << 'SQL'
DELETE rm FROM room_members rm JOIN users u ON rm.user_id = u.id WHERE u.email IN ('vasya@test.com','petya@test.com');
DELETE ri FROM room_invites ri JOIN users u ON ri.invited_by = u.id WHERE u.email IN ('vasya@test.com','petya@test.com');
DELETE r FROM rooms r JOIN users u ON r.host_id = u.id WHERE u.email IN ('vasya@test.com','petya@test.com');
DELETE FROM users WHERE email IN ('vasya@test.com','petya@test.com');
SQL

# ── helpers ──────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; echo -e "${RED}    → $2${NC}"; ((FAIL++)); }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

# Проверяет что JSON содержит нужное поле/значение
has() {
  local json="$1" key="$2" expected="$3"
  local val
  val=$(echo "$json" | grep -o "\"$key\":[^,}]*" | head -1 | cut -d':' -f2- | tr -d ' "')
  if [ -z "$expected" ]; then
    [ -n "$val" ] && return 0 || return 1
  else
    [ "$val" = "$expected" ] && return 0 || return 1
  fi
}

check_status() {
  local label="$1" body="$2" code="$3" expected_code="$4"
  if [ "$code" -eq "$expected_code" ]; then
    ok "$label (HTTP $code)"
  else
    fail "$label" "HTTP $code, body: $body"
  fi
}

# ── 1. AUTH ───────────────────────────────────────────────────────────────────

section "AUTH"

# Регистрация васи
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"vasya@test.com","username":"vasya","password":"password123"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Регистрация vasya" "$BODY" "$CODE" 201

# Регистрация пети
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"petya@test.com","username":"petya","password":"password123"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Регистрация petya" "$BODY" "$CODE" 201

# Дубликат — должен вернуть 409
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"vasya@test.com","username":"vasya","password":"password123"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Дубликат регистрации → 409" "$BODY" "$CODE" 409

# Логин васи
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"vasya@test.com","password":"password123"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Логин vasya" "$BODY" "$CODE" 200
TOKEN_VASYA=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN_VASYA" ]; then ok "Токен vasya получен"; else fail "Токен vasya" "не получен"; fi

# Логин пети
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"petya@test.com","password":"password123"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
TOKEN_PETYA=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN_PETYA" ]; then ok "Токен petya получен"; else fail "Токен petya" "не получен"; fi

# Неверный пароль → 401
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"vasya@test.com","password":"wrong"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Неверный пароль → 401" "$BODY" "$CODE" 401

# ── 2. ROOMS ──────────────────────────────────────────────────────────────────

section "ROOMS"

# Создание комнаты
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"Тестовая комната","max_players":4}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Создание комнаты" "$BODY" "$CODE" 201
ROOM_UUID=$(echo "$BODY" | grep -o '"uuid":"[^"]*"' | cut -d'"' -f4)
INVITE_CODE=$(echo "$BODY" | grep -o '"invite_code":"[^"]*"' | cut -d'"' -f4)
if [ -n "$ROOM_UUID" ]; then ok "UUID комнаты получен: $ROOM_UUID"; else fail "UUID комнаты" "не получен"; fi

# Создание комнаты без авторизации → 401
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","max_players":4}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Создание без токена → 401" "$BODY" "$CODE" 401

# Получить комнату
RES=$(curl -s -w "\n%{http_code}" "$BASE/api/rooms/$ROOM_UUID" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Получить комнату" "$BODY" "$CODE" 200

# Создание комнаты с паролем
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"Закрытая","max_players":4,"password":"secret"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Создание комнаты с паролем" "$BODY" "$CODE" 201
LOCKED_UUID=$(echo "$BODY" | grep -o '"uuid":"[^"]*"' | cut -d'"' -f4)
LOCKED_CODE=$(echo "$BODY" | grep -o '"invite_code":"[^"]*"' | cut -d'"' -f4)
HAS_PW=$(echo "$BODY" | grep -o '"has_password":[^,}]*' | cut -d':' -f2 | tr -d ' ')
[ "$HAS_PW" = "true" ] && ok "has_password=true" || fail "has_password" "ожидалось true, получено: $HAS_PW"

# Обновление комнаты хостом
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/rooms/$ROOM_UUID" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"Переименованная","max_players":6}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Обновление комнаты хостом" "$BODY" "$CODE" 200

# Обновление комнаты не хостом → 403
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/rooms/$ROOM_UUID" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"Взлом"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Обновление не хостом → 403" "$BODY" "$CODE" 403

# ── 3. JOIN ───────────────────────────────────────────────────────────────────

section "JOIN"

# Петя заходит по коду
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/join/code/$INVITE_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Вход по коду" "$BODY" "$CODE" 200

# Вход в закрытую комнату без пароля → 403
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/join/code/$LOCKED_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Вход без пароля → 403" "$BODY" "$CODE" 403

# Вход в закрытую комнату с неверным паролем → 403
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/join/code/$LOCKED_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Вход с неверным паролем → 403" "$BODY" "$CODE" 403

# Вход в закрытую комнату с верным паролем
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/join/code/$LOCKED_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{"password":"secret"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Вход с верным паролем" "$BODY" "$CODE" 200

# Инвайт-ссылка
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/invite" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Создать инвайт-ссылку" "$BODY" "$CODE" 200
INVITE_TOKEN=$(echo "$BODY" | grep -o '"invite_link":"[^"]*"' | cut -d'"' -f4 | sed 's|/api/join/token/||')
if [ -n "$INVITE_TOKEN" ]; then ok "Инвайт-токен получен"; else fail "Инвайт-токен" "не получен"; fi

# ── 4. KICK & LEAVE ───────────────────────────────────────────────────────────

section "KICK & LEAVE"

# Получаем ID пети
RES=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"petya@test.com","password":"password123"}')
PETYA_ID=$(echo "$RES" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
if [ -z "$PETYA_ID" ]; then
  # Пробуем из room members
  RES2=$(curl -s "$BASE/api/rooms/$ROOM_UUID" -H "Authorization: Bearer $TOKEN_VASYA")
  PETYA_ID=2 # fallback
fi

# Кик не хостом → 403
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/kick" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":1}")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Кик не хостом → 403" "$BODY" "$CODE" 403

# Выход из комнаты (петя уходит сам)
RES=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/api/rooms/$ROOM_UUID/leave" \
  -H "Authorization: Bearer $TOKEN_PETYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Добровольный выход" "$BODY" "$CODE" 200

# Хост не может выйти — только удалить
RES=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/api/rooms/$ROOM_UUID/leave" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Хост не может выйти → 400" "$BODY" "$CODE" 400

# ── 5. DELETE ROOM ────────────────────────────────────────────────────────────

section "DELETE ROOM"

# Удаление не хостом → 403
RES=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/api/rooms/$ROOM_UUID" \
  -H "Authorization: Bearer $TOKEN_PETYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Удаление не хостом → 403" "$BODY" "$CODE" 403

# Удаление хостом
RES=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/api/rooms/$ROOM_UUID" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Удаление хостом" "$BODY" "$CODE" 200

# Комната больше не существует → 404
RES=$(curl -s -w "\n%{http_code}" "$BASE/api/rooms/$ROOM_UUID" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Удалённая комната → 404" "$BODY" "$CODE" 404

# ── 6. WEBSOCKET ─────────────────────────────────────────────────────────────

section "WEBSOCKET"

# Создаём новую комнату для WS тестов
RES=$(curl -s -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"WS тест","max_players":4}')
WS_UUID=$(echo "$RES" | grep -o '"uuid":"[^"]*"' | cut -d'"' -f4)
WS_CODE=$(echo "$RES" | grep -o '"invite_code":"[^"]*"' | cut -d'"' -f4)

# Петя заходит в комнату
curl -s -X POST "$BASE/api/join/code/$WS_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{}' > /dev/null

if [ -z "$WS_UUID" ]; then
  fail "WS: создание комнаты для тестов" "uuid не получен"
else
  ok "WS: тестовая комната создана ($WS_UUID)"

  # Копируем python-скрипт рядом со скриптом
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PY_SCRIPT="$SCRIPT_DIR/ws_test.py"

  if [ ! -f "$PY_SCRIPT" ]; then
    fail "WS: ws_test.py не найден" "положи ws_test.py рядом с test_api.sh"
  elif ! command -v python3 &>/dev/null; then
    echo -e "  ${YELLOW}⚠ python3 не найден — WebSocket тесты пропущены${NC}"
  else
    WS_RESULTS=$(python3 "$PY_SCRIPT" "$TOKEN_VASYA" "$WS_UUID" 2>/dev/null)

    while IFS= read -r line; do
      status="${line%%:*}"
      name="${line#*:}"
      case "$name" in
        room_state) label="WS: получен room_state при подключении" ;;
        pong)       label="WS: ping → pong работает" ;;
        chat)       label="WS: chat_message → chat_broadcast" ;;
        bad_token)  label="WS: неверный токен отклонён" ;;
        *)          label="WS: $name" ;;
      esac
      if [ "$status" = "OK" ]; then
        ok "$label"
      else
        fail "$label" "тест не прошёл"
      fi
    done <<< "$WS_RESULTS"
  fi
fi


# ── ИТОГ ─────────────────────────────────────────────────────────────────────

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  Passed: $PASS${NC}"
if [ $FAIL -gt 0 ]; then
  echo -e "${RED}  Failed: $FAIL${NC}"
else
  echo -e "  Failed: $FAIL"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ $FAIL -eq 0 ] && exit 0 || exit 1