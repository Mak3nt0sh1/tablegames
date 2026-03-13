package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

// Client — одно WebSocket-соединение
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	UserID   uint64
	Username string
	RoomUUID string
}

// readPump читает сообщения от клиента и перенаправляет в hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure,
			) {
				log.Printf("ws read error [user=%d]: %v", c.UserID, err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.sendError("invalid message format")
			continue
		}

		c.hub.incoming <- &incomingMessage{client: c, msg: msg}
	}
}

// writePump отправляет сообщения клиенту из канала send
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case data, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// sendError отправляет ошибку конкретному клиенту
func (c *Client) sendError(msg string) {
	data, err := encode(EventError, ErrorPayload{Message: msg})
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

// sendMsg отправляет произвольное сообщение клиенту
func (c *Client) sendMsg(msgType string, payload any) {
	data, err := encode(msgType, payload)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
		log.Printf("ws: send buffer full for user=%d, dropping message", c.UserID)
	}
}
