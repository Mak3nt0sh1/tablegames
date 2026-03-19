#!/bin/bash

BASE="http://localhost:8080"
PASS=0
FAIL=0

sudo mysql tablegames << 'SQL'
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

# ── 5. GAME SELECTION ─────────────────────────────────────────────────────────

section "GAME SELECTION"

# Создаём новую комнату для тестов выбора игры
RES=$(curl -s -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"Game Select Test","max_players":4}')
GS_UUID=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uuid',''))" 2>/dev/null)
GS_CODE=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('invite_code',''))" 2>/dev/null)

# Петя заходит
curl -s -X POST "$BASE/api/join/code/$GS_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" -d '{}' > /dev/null

# Хост выбирает UNO
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/rooms/$GS_UUID" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"game_type":"uno"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Хост выбирает UNO" "$BODY" "$CODE" 200

# Проверяем что game_type сохранился
GAME_TYPE=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('game_type',''))" 2>/dev/null)
[ "$GAME_TYPE" = "uno" ] && ok "game_type=uno в ответе" || fail "game_type в ответе" "получено: $GAME_TYPE"

# Не-хост не может выбрать игру → 403
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/rooms/$GS_UUID" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{"game_type":"uno"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Не-хост не может выбрать игру → 403" "$BODY" "$CODE" 403

# Неподдерживаемая игра → 400
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/rooms/$GS_UUID" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"game_type":"chess"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Неподдерживаемая игра → 400" "$BODY" "$CODE" 400

# Хост запускает игру — game_type уже выбран
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$GS_UUID/game/start" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Старт игры после выбора" "$BODY" "$CODE" 200

# Получить состояние игры
RES=$(curl -s -w "\n%{http_code}" "$BASE/api/rooms/$GS_UUID/game/state" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Получить состояние игры" "$BODY" "$CODE" 200
PHASE=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase',''))" 2>/dev/null)
[ "$PHASE" = "playing" ] && ok "Фаза: playing" || fail "Фаза игры" "получено: $PHASE"

# Не-хост не может запустить игру → 400
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$GS_UUID/game/start" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" \
  -d '{}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Повторный старт → 400" "$BODY" "$CODE" 400


# Тест перезапуска игры
# Доигрываем быстро до конца или делаем reset вручную
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$GS_UUID/game/reset" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Reset игры" "$BODY" "$CODE" 200

# После reset можно запустить новую игру
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$GS_UUID/game/start" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"game_type":"uno"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Перезапуск игры после reset" "$BODY" "$CODE" 200

# Reset снова перед удалением комнаты
curl -s -X POST "$BASE/api/rooms/$GS_UUID/game/reset" \
  -H "Authorization: Bearer $TOKEN_VASYA" > /dev/null

# Удаляем тестовую комнату
curl -s -X DELETE "$BASE/api/rooms/$GS_UUID" \
  -H "Authorization: Bearer $TOKEN_VASYA" > /dev/null

# ── 6. DELETE ROOM ─────────────────────────────────────────────────────────────
# ── 7. DELETE ROOM ────────────────────────────────────────────────────────────

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


# ── 8. PROFILE ────────────────────────────────────────────────────────────────

section "PROFILE"

# Получить профиль
RES=$(curl -s -w "\n%{http_code}" "$BASE/api/profile" \
  -H "Authorization: Bearer $TOKEN_VASYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Получить профиль" "$BODY" "$CODE" 200

USERNAME=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('username',''))" 2>/dev/null)
[ -n "$USERNAME" ] && ok "Профиль содержит username: $USERNAME" || fail "Профиль username" "не получен"

GAMES=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('games_played',''))" 2>/dev/null)
[ "$GAMES" = "0" ] || [ -n "$GAMES" ] && ok "Статистика games_played: $GAMES" || fail "Статистика" "не получена"

# Без токена → 401
RES=$(curl -s -w "\n%{http_code}" "$BASE/api/profile")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Профиль без токена → 401" "$BODY" "$CODE" 401

# Обновить username
NEW_USERNAME="vasya_updated"
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/profile" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$NEW_USERNAME\"}")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Обновить username" "$BODY" "$CODE" 200
UPDATED=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('username',''))" 2>/dev/null)
[ "$UPDATED" = "$NEW_USERNAME" ] && ok "Username обновлён: $UPDATED" || fail "Username не обновился" "получено: $UPDATED"

# Занятый username → 409
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/profile" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"username": "uno_petya"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Занятый username → 409" "$BODY" "$CODE" 409

# Слишком короткий username → 400
RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/api/profile" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"username": "ab"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Короткий username → 400" "$BODY" "$CODE" 400

# Вернём оригинальный username
curl -s -X PATCH "$BASE/api/profile" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"username": "vasya"}' > /dev/null

# Профиль пети
RES=$(curl -s -w "\n%{http_code}" "$BASE/api/profile" \
  -H "Authorization: Bearer $TOKEN_PETYA")
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
check_status "Профиль petya" "$BODY" "$CODE" 200

# Статистика — проводим быструю игру и проверяем что счётчики обновились
# Создаём комнату для тест-игры
STAT_ROOM=$(curl -s -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"Stats Test","max_players":2}')
STAT_UUID=$(echo "$STAT_ROOM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uuid',''))" 2>/dev/null)
STAT_CODE=$(echo "$STAT_ROOM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('invite_code',''))" 2>/dev/null)

# Петя заходит
curl -s -X POST "$BASE/api/join/code/$STAT_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" \
  -H "Content-Type: application/json" -d '{}' > /dev/null

# Стартуем игру
curl -s -X POST "$BASE/api/rooms/$STAT_UUID/game/start" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"game_type":"uno"}' > /dev/null

# Логин для получения ID
# Берём ID из JWT токенов
VASYA_ID=$(echo "$TOKEN_VASYA" | cut -d'.' -f2 | python3 -c "
import sys, base64, json
raw = sys.stdin.read().strip()
pad = raw + '=' * (4 - len(raw) % 4)
print(json.loads(base64.b64decode(pad)).get('sub',''))
" 2>/dev/null)
PETYA_ID=$(echo "$TOKEN_PETYA" | cut -d'.' -f2 | python3 -c "
import sys, base64, json
raw = sys.stdin.read().strip()
pad = raw + '=' * (4 - len(raw) % 4)
print(json.loads(base64.b64decode(pad)).get('sub',''))
" 2>/dev/null)

# Доигрываем до победителя (до 200 ходов)
WINNER_ID=""
for i in $(seq 1 200); do
  STATE=$(curl -s "$BASE/api/rooms/$STAT_UUID/game/state" -H "Authorization: Bearer $TOKEN_VASYA")
  PHASE=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase',''))" 2>/dev/null)
  WINNER_ID=$(echo "$STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
w=d.get('winner')
print(w if w is not None else '')
" 2>/dev/null)
  [ "$PHASE" = "finished" ] && break

  CURRENT=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('current_turn',''))" 2>/dev/null)
  if [ "$CURRENT" = "$VASYA_ID" ]; then
    ACT_TOKEN=$TOKEN_VASYA; ACT_STATE=$(curl -s "$BASE/api/rooms/$STAT_UUID/game/state" -H "Authorization: Bearer $TOKEN_VASYA")
  else
    ACT_TOKEN=$TOKEN_PETYA; ACT_STATE=$(curl -s "$BASE/api/rooms/$STAT_UUID/game/state" -H "Authorization: Bearer $TOKEN_PETYA")
  fi

  CARD_ID=$(echo "$ACT_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
top_color=d.get('current_color',''); top_value=d.get('top_card',{}).get('value','')
for c in d.get('your_hand',[]):
    if c['color']==top_color or c['value']==top_value:
        print(c['id']); break
" 2>/dev/null)

  if [ -n "$CARD_ID" ]; then
    PLAY_RES=$(curl -s -X POST "$BASE/api/rooms/$STAT_UUID/game/play" \
      -H "Authorization: Bearer $ACT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"card_id\": $CARD_ID}")
    if echo "$PLAY_RES" | python3 -c "import sys,json; exit(0 if 'error' not in json.load(sys.stdin) else 1)" 2>/dev/null; then
      # Проверяем победу сразу после хода
      CHECK=$(curl -s "$BASE/api/rooms/$STAT_UUID/game/state" -H "Authorization: Bearer $ACT_TOKEN")
      CHECK_PHASE=$(echo "$CHECK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase',''))" 2>/dev/null)
      CHECK_WIN=$(echo "$CHECK" | python3 -c "
import sys,json; d=json.load(sys.stdin)
w=d.get('winner')
print(w if w is not None else 'none')
" 2>/dev/null)
      if [ "$CHECK_PHASE" = "finished" ] || [ -n "$CHECK_WIN" -a "$CHECK_WIN" != "none" ]; then
        WINNER_ID=$CHECK_WIN
        break
      fi
      # Резервная проверка по card_count=0
      ZERO=$(echo "$CHECK" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for p in d.get('players',[]):
    if p.get('card_count',99)==0: print(p['user_id'])
" 2>/dev/null)
      if [ -n "$ZERO" ]; then
        WINNER_ID=$ZERO
        break
      fi
    else
      curl -s -X POST "$BASE/api/rooms/$STAT_UUID/game/draw" -H "Authorization: Bearer $ACT_TOKEN" > /dev/null
    fi
  else
    curl -s -X POST "$BASE/api/rooms/$STAT_UUID/game/draw" -H "Authorization: Bearer $ACT_TOKEN" > /dev/null
  fi
  sleep 0.05
done

if [ -n "$WINNER_ID" ]; then
  ok "Тестовая игра завершена (победитель ID=$WINNER_ID)"

  # Проверяем статистику победителя
  if [ "$WINNER_ID" = "$VASYA_ID" ]; then
    WIN_TOKEN=$TOKEN_VASYA; LOSE_TOKEN=$TOKEN_PETYA
  else
    WIN_TOKEN=$TOKEN_PETYA; LOSE_TOKEN=$TOKEN_VASYA
  fi

  sleep 0.5 # даём серверу время записать результаты

  WIN_PROFILE=$(curl -s "$BASE/api/profile" -H "Authorization: Bearer $WIN_TOKEN")
  WIN_GAMES=$(echo "$WIN_PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('games_played',0))" 2>/dev/null)
  WIN_WINS=$(echo "$WIN_PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('wins',0))" 2>/dev/null)
  [ "$WIN_GAMES" -ge 1 ] && ok "Победитель: games_played=$WIN_GAMES" || fail "games_played победителя" "ожидалось >= 1, получено $WIN_GAMES"
  [ "$WIN_WINS" -ge 1 ] && ok "Победитель: wins=$WIN_WINS" || fail "wins победителя" "ожидалось >= 1, получено $WIN_WINS"

  LOSE_PROFILE=$(curl -s "$BASE/api/profile" -H "Authorization: Bearer $LOSE_TOKEN")
  LOSE_GAMES=$(echo "$LOSE_PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('games_played',0))" 2>/dev/null)
  LOSE_WINS=$(echo "$LOSE_PROFILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('wins',0))" 2>/dev/null)
  [ "$LOSE_GAMES" -ge 1 ] && ok "Проигравший: games_played=$LOSE_GAMES" || fail "games_played проигравшего" "ожидалось >= 1, получено $LOSE_GAMES"
  [ "$LOSE_WINS" -eq 0 ] && ok "Проигравший: wins=0" || fail "wins проигравшего" "ожидалось 0, получено $LOSE_WINS"

  # История игр
  WIN_HISTORY=$(echo "$WIN_PROFILE" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('history',[])))" 2>/dev/null)
  [ "$WIN_HISTORY" -ge 1 ] && ok "История игр записана ($WIN_HISTORY записей)" || fail "История игр" "пустая"

  # Удаляем тестовую комнату
  curl -s -X DELETE "$BASE/api/rooms/$STAT_UUID" -H "Authorization: Bearer $TOKEN_VASYA" > /dev/null
else
  fail "Статистика" "тестовая игра не завершилась за 200 ходов"
fi

# ── 9. WEBSOCKET ─────────────────────────────────────────────────────────────

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