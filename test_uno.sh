#!/bin/bash

BASE="http://localhost:8080"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()      { echo -e "${GREEN}  OK $1${NC}"; ((PASS++)); true; }
fail()    { echo -e "${RED}  FAIL $1${NC}"; echo -e "${RED}    -> $2${NC}"; ((FAIL++)); }
section() { echo -e "\n${BOLD}${YELLOW}--------------------------------------${NC}"; echo -e "${BOLD}${YELLOW}> $1${NC}"; echo -e "${BOLD}${YELLOW}--------------------------------------${NC}"; }
info()    { echo -e "${CYAN}  i $1${NC}"; }
debug()   { echo -e "    $1"; }

# JSON parsing via python3
jq() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }
jqs() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null; }

# -- CLEANUP ------------------------------------------------------------------

section "SETUP"

sudo mysql tablegames 2>/dev/null << 'SQL'
DELETE rm FROM room_members rm JOIN users u ON rm.user_id = u.id WHERE u.email IN ('uno_vasya@test.com','uno_petya@test.com');
DELETE ri FROM room_invites ri JOIN users u ON ri.invited_by = u.id WHERE u.email IN ('uno_vasya@test.com','uno_petya@test.com');
DELETE r FROM rooms r JOIN users u ON r.host_id = u.id WHERE u.email IN ('uno_vasya@test.com','uno_petya@test.com');
DELETE FROM users WHERE email IN ('uno_vasya@test.com','uno_petya@test.com');
SQL
info "DB cleaned"

# -- AUTH ------------------------------------------------------

curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d '{"email":"uno_vasya@test.com","username":"uno_vasya","password":"password123"}' > /dev/null
curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d '{"email":"uno_petya@test.com","username":"uno_petya","password":"password123"}' > /dev/null

TOKEN_VASYA=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"uno_vasya@test.com","password":"password123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

TOKEN_PETYA=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"uno_petya@test.com","password":"password123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

[ -n "$TOKEN_VASYA" ] && ok "Token vasya OK" || { fail "Login vasya" "no token"; exit 1; }
[ -n "$TOKEN_PETYA" ] && ok "Token petya OK" || { fail "Login petya" "no token"; exit 1; }

# ID from DB
VASYA_ID=$(sudo mysql tablegames -sN -e "SELECT id FROM users WHERE email='uno_vasya@test.com';" 2>/dev/null)
PETYA_ID=$(sudo mysql tablegames -sN -e "SELECT id FROM users WHERE email='uno_petya@test.com';" 2>/dev/null)
info "Vasya ID=$VASYA_ID  |  Petya ID=$PETYA_ID"

# -- CREATE ROOM ----------------------------------------------------------

section "CREATE ROOM"

ROOM=$(curl -s -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"name":"UNO Test","max_players":4}')

ROOM_UUID=$(echo "$ROOM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uuid',''))")
INVITE_CODE=$(echo "$ROOM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('invite_code',''))")

[ -n "$ROOM_UUID" ] && ok "Room created" || { fail "Create room" "$ROOM"; exit 1; }
info "UUID: $ROOM_UUID  |  Code: $INVITE_CODE"

RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/join/code/$INVITE_CODE" \
  -H "Authorization: Bearer $TOKEN_PETYA" -H "Content-Type: application/json" -d '{}')
CODE=$(echo "$RES" | tail -n1)
[ "$CODE" = "200" ] && ok "Petya joined room" || { fail "Petya join" "$RES"; exit 1; }

# -- START GAME ----------------------------------------------------------------

section "START GAME"

RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/start" \
  -H "Authorization: Bearer $TOKEN_VASYA" \
  -H "Content-Type: application/json" \
  -d '{"game_type":"uno"}')
BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
[ "$CODE" = "200" ] && ok "Game started" || { fail "Start game" "HTTP $CODE: $BODY"; exit 1; }

RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/start" \
  -H "Authorization: Bearer $TOKEN_PETYA" -H "Content-Type: application/json" -d '{}')
CODE=$(echo "$RES" | tail -n1)
[ "$CODE" = "400" ] && ok "Duplicate start rejected -> 400" || fail "Duplicate start" "expected 400, got $CODE"

# -- INITIAL STATE ------------------------------------------------------

section "INITIAL STATE"

get_state() {
  curl -s "$BASE/api/rooms/$ROOM_UUID/game/state" -H "Authorization: Bearer $1"
}

print_state() {
  local STATE="$1" LABEL="$2"
  echo -e "\n  ${BOLD}-- $LABEL --${NC}"
  echo "$STATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
top = d.get('top_card', {})
print(f\"  Top card : [{top.get('color','')} {top.get('value','')}]  color: {d.get('current_color','')}\")
print(f\"  Current player ID: {d.get('current_turn','')}  |  penalty: +{d.get('draw_pending',0)}  |  deck: {d.get('draw_pile_size',0)} cards\")
print()
print('  Hand:')
for c in d.get('your_hand', []):
    print(f\"    id={c['id']:3d}  {c['color']:6s}  {c['value']}\")
print()
print('  Players:')
for p in d.get('players', []):
    uno = '  UNO!' if p.get('said_uno') else ''
    print(f\"    {p['username']:12s}  cards: {p['card_count']}{uno}\")
" 2>/dev/null
}

STATE_VASYA=$(get_state "$TOKEN_VASYA")
STATE_PETYA=$(get_state "$TOKEN_PETYA")

print_state "$STATE_VASYA" "Vasya"
print_state "$STATE_PETYA" "Petya"

CURRENT_TURN=$(echo "$STATE_VASYA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('current_turn',''))")
info "First turn: ID=$CURRENT_TURN"

if [ "$CURRENT_TURN" = "$VASYA_ID" ]; then
  FIRST_TOKEN=$TOKEN_VASYA; FIRST_NAME="Vasya"; FIRST_ID=$VASYA_ID
  SECOND_TOKEN=$TOKEN_PETYA; SECOND_NAME="Petya"; SECOND_ID=$PETYA_ID
  FIRST_STATE=$STATE_VASYA; SECOND_STATE=$STATE_PETYA
else
  FIRST_TOKEN=$TOKEN_PETYA; FIRST_NAME="Petya"; FIRST_ID=$PETYA_ID
  SECOND_TOKEN=$TOKEN_VASYA; SECOND_NAME="Vasya"; SECOND_ID=$VASYA_ID
  FIRST_STATE=$STATE_PETYA; SECOND_STATE=$STATE_VASYA
fi
ok "Order set, first: $FIRST_NAME"

# -- HELPER: find playable card ------------------------------------------

find_playable() {
  echo "$1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
top_color = d.get('current_color','')
top_value = d.get('top_card',{}).get('value','')
for c in d.get('your_hand', []):
    if c['color'] == top_color or c['value'] == top_value:
        print(c['id'])
        break
" 2>/dev/null
}

find_unplayable() {
  echo "$1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
top_color = d.get('current_color','')
top_value = d.get('top_card',{}).get('value','')
for c in d.get('your_hand', []):
    if c['color'] != top_color and c['value'] != top_value:
        print(c['id'])
        break
" 2>/dev/null
}

# -- MOVE 1 --------------------------------------------------------------------

section "MOVE 1 - $FIRST_NAME"

TOP=$(echo "$FIRST_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
t=d.get('top_card',{})
print(f\"[{t.get('color','')} {t.get('value','')}]  color: {d.get('current_color','')}\")
" 2>/dev/null)
info "Top card: $TOP"

CARD_ID=$(find_playable "$FIRST_STATE")
if [ -n "$CARD_ID" ]; then
  CARD_INFO=$(echo "$FIRST_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for c in d.get('your_hand',[]):
    if c['id']==$CARD_ID: print(f\"[{c['color']} {c['value']}]\")
" 2>/dev/null)
  info "$FIRST_NAME plays card $CARD_INFO (id=$CARD_ID)"
  RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/play" \
    -H "Authorization: Bearer $FIRST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"card_id\": $CARD_ID}")
  BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
  [ "$CODE" = "200" ] && ok "$FIRST_NAME played card $CARD_INFO" || fail "$FIRST_NAME PlayCard" "HTTP $CODE: $BODY"
else
  info "$FIRST_NAME draws from deck (no match)"
  RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/draw" \
    -H "Authorization: Bearer $FIRST_TOKEN")
  BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
  [ "$CODE" = "200" ] && ok "$FIRST_NAME drew from deck" || fail "$FIRST_NAME DrawCard" "HTTP $CODE: $BODY"
fi

# -- MOVE 2 --------------------------------------------------------------------

section "MOVE 2 - $SECOND_NAME"

# Перечитываем состояние — после Skip/Reverse ход мог остаться у первого игрока
SECOND_STATE=$(get_state "$SECOND_TOKEN")
ACTUAL_TURN=$(echo "$SECOND_STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('current_turn',''))" 2>/dev/null)
if [ "$ACTUAL_TURN" != "$SECOND_ID" ]; then
  info "Skip/Reverse effect: turn stayed with $FIRST_NAME — skipping move 2 test"
  ok "Move 2 skipped (Skip/Reverse in effect)"
else
  SECOND_STATE=$(get_state "$SECOND_TOKEN")
  TOP=$(echo "$SECOND_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
t=d.get('top_card',{})
print(f\"[{t.get('color','')} {t.get('value','')}]  color: {d.get('current_color','')}\")
" 2>/dev/null)
  info "Top card: $TOP"

  CARD_ID=$(find_playable "$SECOND_STATE")
  if [ -n "$CARD_ID" ]; then
    CARD_INFO=$(echo "$SECOND_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for c in d.get('your_hand',[]):
    if c['id']==$CARD_ID: print(f\"[{c['color']} {c['value']}]\")
" 2>/dev/null)
    info "$SECOND_NAME plays card $CARD_INFO (id=$CARD_ID)"
    RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/play" \
      -H "Authorization: Bearer $SECOND_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"card_id\": $CARD_ID}")
    BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
    [ "$CODE" = "200" ] && ok "$SECOND_NAME played card $CARD_INFO" || fail "$SECOND_NAME PlayCard" "HTTP $CODE: $BODY"
  else
    info "$SECOND_NAME draws from deck"
    RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/draw" \
      -H "Authorization: Bearer $SECOND_TOKEN")
    BODY=$(echo "$RES" | head -n1); CODE=$(echo "$RES" | tail -n1)
    [ "$CODE" = "200" ] && ok "$SECOND_NAME drew from deck" || fail "$SECOND_NAME DrawCard" "HTTP $CODE: $BODY"
  fi
fi

# -- TURN PROTECTION --------------------------------------------------------

section "TURN PROTECTION"

CUR_STATE=$(get_state "$TOKEN_VASYA")
CURRENT_TURN=$(echo "$CUR_STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('current_turn',''))")

if [ "$CURRENT_TURN" = "$VASYA_ID" ]; then
  WRONG_TOKEN=$TOKEN_PETYA; WRONG_NAME="Petya"
else
  WRONG_TOKEN=$TOKEN_VASYA; WRONG_NAME="Vasya"
fi

info "Current ID=$CURRENT_TURN  trying to play as $WRONG_NAME (not their turn)"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/play" \
  -H "Authorization: Bearer $WRONG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"card_id": 0}')
CODE=$(echo "$RES" | tail -n1)
[ "$CODE" = "400" ] && ok "Wrong turn -> 400" || fail "Turn protection" "expected 400, got $CODE"

# -- CARD VALIDATION ----------------------------------------------------------

section "CARD VALIDATION"

if [ "$CURRENT_TURN" = "$VASYA_ID" ]; then
  CUR_TOKEN=$TOKEN_VASYA; CUR_NAME="Vasya"
else
  CUR_TOKEN=$TOKEN_PETYA; CUR_NAME="Petya"
fi

CUR_STATE=$(get_state "$CUR_TOKEN")
BAD_CARD_ID=$(find_unplayable "$CUR_STATE")
TOP=$(echo "$CUR_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
t=d.get('top_card',{})
print(f\"[{t.get('color','')} {t.get('value','')}]  color: {d.get('current_color','')}\")
" 2>/dev/null)

if [ -n "$BAD_CARD_ID" ]; then
  info "Top card: $TOP    cards id=$BAD_CARD_ID"
  RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/play" \
    -H "Authorization: Bearer $CUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"card_id\": $BAD_CARD_ID}")
  CODE=$(echo "$RES" | tail -n1)
  [ "$CODE" = "400" ] && ok " cards  -> 400" || fail " cards" "expected 400, got $CODE"
else
  info " cards     "
fi

# -- UNO BUTTON --------------------------------------------------------------

section "UNO BUTTON"

RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/uno" \
  -H "Authorization: Bearer $CUR_TOKEN")
CODE=$(echo "$RES" | tail -n1)
[ "$CODE" = "400" ] && ok "UNO  >1 cards  -> 400" || fail "UNO validation" "expected 400, got $CODE"

RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/rooms/$ROOM_UUID/game/challenge" \
  -H "Authorization: Bearer $CUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"target_user_id\": $SECOND_ID}")
CODE=$(echo "$RES" | tail -n1)
[ "$CODE" = "400" ] && ok "Challenge  >1 cards  -> 400" || fail "Challenge validation" "expected 400, got $CODE"

# -- FINISH   ------------------------------------------------

section "FINISH GAME"

WINNER=""
MOVE=1
for i in $(seq 1 200); do
  STATE=$(get_state "$TOKEN_VASYA")
  PHASE=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase',''))" 2>/dev/null)

  if [ "$PHASE" = "finished" ]; then
    WINNER=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('winner',''))" 2>/dev/null)
    break
  fi

  CURRENT=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('current_turn',''))" 2>/dev/null)

  if [ "$CURRENT" = "$VASYA_ID" ]; then
    ACT_TOKEN=$TOKEN_VASYA; ACT_NAME="Vasya"; ACT_STATE=$(get_state "$TOKEN_VASYA")
  else
    ACT_TOKEN=$TOKEN_PETYA; ACT_NAME="Petya"; ACT_STATE=$(get_state "$TOKEN_PETYA")
  fi

  CARD_ID=$(find_playable "$ACT_STATE")
  TOP=$(echo "$ACT_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
t=d.get('top_card',{})
print(f\"{t.get('color','')} {t.get('value','')}\")
" 2>/dev/null)
  CARDS=$(echo "$ACT_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for p in d.get('players',[]):
    if p['user_id']==$( [ "$ACT_NAME" = "Vasya" ] && echo $VASYA_ID || echo $PETYA_ID ):
        print(p['card_count'])
" 2>/dev/null)

  if [ -n "$CARD_ID" ]; then
    CARD_INFO=$(echo "$ACT_STATE" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for c in d.get('your_hand',[]):
    if c['id']==$CARD_ID: print(f\"{c['color']} {c['value']}\")
" 2>/dev/null)
    debug "  Move $MOVE: $ACT_NAME (${CARDS} cards)  [$CARD_INFO] over [$TOP]"
    PLAY_RES=$(curl -s -X POST "$BASE/api/rooms/$ROOM_UUID/game/play" \
      -H "Authorization: Bearer $ACT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"card_id\": $CARD_ID}")
    if echo "$PLAY_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'error' not in d else 1)" 2>/dev/null; then
      # Проверяем победу сразу после хода
      CHECK=$(get_state "$ACT_TOKEN")
      CHECK_PHASE=$(echo "$CHECK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase',''))" 2>/dev/null)
      CHECK_WIN=$(echo "$CHECK" | python3 -c "
import sys,json; d=json.load(sys.stdin)
w=d.get('winner')
print(w if w is not None else 'none')
" 2>/dev/null)
      CHECK_ERR=$(echo "$CHECK" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
      debug "    [phase=$CHECK_PHASE winner=$CHECK_WIN err=$CHECK_ERR]"
      if [ "$CHECK_PHASE" = "finished" ] || [ -n "$CHECK_WIN" -a "$CHECK_WIN" != "none" ]; then
        WINNER=$CHECK_WIN
        [ "$WINNER" = "none" ] && WINNER=$ACT_ID
        ((MOVE++))
        break
      fi
    else
      ERR=$(echo "$PLAY_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','?'))" 2>/dev/null)
      debug "    [!] server rejected: $ERR — drawing instead"
      curl -s -X POST "$BASE/api/rooms/$ROOM_UUID/game/draw" \
        -H "Authorization: Bearer $ACT_TOKEN" > /dev/null
    fi
  else
    debug "  Move $MOVE: $ACT_NAME (${CARDS} cards) draws card (no compatible  [$TOP])"
    curl -s -X POST "$BASE/api/rooms/$ROOM_UUID/game/draw" \
      -H "Authorization: Bearer $ACT_TOKEN" > /dev/null
  fi

  ((MOVE++))
  sleep 0.05
done

if [ -n "$WINNER" ]; then
  if [ "$WINNER" = "$VASYA_ID" ]; then WIN_NAME="Vasya"; else WIN_NAME="Petya"; fi
  ok "Game finished in $((MOVE-1)) moves! Winner: $WIN_NAME"
  info "Result:"
  get_state "$TOKEN_VASYA" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for p in d.get('players',[]):
    print(f\"    {p['username']:12s}  cards: {p['card_count']}\")
" 2>/dev/null
else
  fail "Game did not finish in 200 moves" "check server logs"
fi

# -- RESULT --------------------------------------------------------------------

echo -e "\n${BOLD}${YELLOW}--------------------------------------${NC}"
echo -e "${GREEN}${BOLD}  Passed: $PASS${NC}"
[ $FAIL -gt 0 ] && echo -e "${RED}${BOLD}  Failed: $FAIL${NC}" || echo -e "  Failed: $FAIL"
echo -e "${BOLD}${YELLOW}--------------------------------------${NC}"
[ $FAIL -eq 0 ] && exit 0 || exit 1