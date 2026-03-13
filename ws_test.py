#!/usr/bin/env python3
"""Минимальный WS тест без внешних зависимостей"""
import sys, socket, ssl, base64, hashlib, os, json, time

def ws_connect(host, port, path):
    sock = socket.create_connection((host, port), timeout=5)
    key = base64.b64encode(os.urandom(16)).decode()
    handshake = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(handshake.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(1024)
    status = resp.split(b"\r\n")[0].decode()
    return sock, status

def ws_recv(sock, timeout=3):
    sock.settimeout(timeout)
    try:
        header = sock.recv(2)
        if len(header) < 2: return None
        length = header[1] & 0x7f
        if length == 126:
            length = int.from_bytes(sock.recv(2), 'big')
        data = b""
        while len(data) < length:
            data += sock.recv(length - len(data))
        return data.decode('utf-8', errors='replace')
    except socket.timeout:
        return None

def ws_send(sock, msg):
    data = msg.encode()
    frame = bytearray([0x81])
    length = len(data)
    mask = os.urandom(4)
    if length < 126:
        frame.append(0x80 | length)
    else:
        frame.append(0x80 | 126)
        frame += length.to_bytes(2, 'big')
    frame += mask
    frame += bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    sock.sendall(bytes(frame))

def collect(sock, seconds=2):
    msgs = []
    deadline = time.time() + seconds
    while time.time() < deadline:
        m = ws_recv(sock, timeout=max(0.1, deadline - time.time()))
        if m: msgs.append(m)
    return msgs

token   = sys.argv[1]
uuid    = sys.argv[2]
badtest = sys.argv[3] if len(sys.argv) > 3 else ""

results = {}

# Тест 1: room_state + pong
try:
    sock, status = ws_connect("localhost", 8080, f"/api/rooms/{uuid}/ws?token={token}")
    if "101" not in status:
        results["room_state"] = False
        results["pong"] = False
    else:
        msgs = collect(sock, 1.5)
        ws_send(sock, json.dumps({"type":"ping","payload":{}}))
        msgs += collect(sock, 1.5)
        types = [json.loads(m).get("type") for m in msgs if m]
        results["room_state"] = "room_state" in types
        results["pong"] = "pong" in types
        sock.close()
except Exception as e:
    results["room_state"] = False
    results["pong"] = False

# Тест 2: chat_broadcast
try:
    sock, status = ws_connect("localhost", 8080, f"/api/rooms/{uuid}/ws?token={token}")
    if "101" in status:
        collect(sock, 0.5)  # пропускаем room_state
        ws_send(sock, json.dumps({"type":"chat_message","payload":{"text":"test"}}))
        msgs = collect(sock, 2)
        types = [json.loads(m).get("type") for m in msgs if m]
        results["chat"] = "chat_broadcast" in types
        sock.close()
    else:
        results["chat"] = False
except Exception as e:
    results["chat"] = False

# Тест 3: плохой токен
try:
    sock, status = ws_connect("localhost", 8080, f"/api/rooms/{uuid}/ws?token=badtoken")
    results["bad_token"] = "101" not in status  # не должен апгрейднуться
    sock.close()
except Exception:
    results["bad_token"] = True  # соединение отклонено — тоже ок

for k, v in results.items():
    print(f"{'OK' if v else 'FAIL'}:{k}")