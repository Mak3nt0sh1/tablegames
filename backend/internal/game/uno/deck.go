package uno

// Color — цвет карты
type Color string

const (
	Red    Color = "red"
	Green  Color = "green"
	Blue   Color = "blue"
	Yellow Color = "yellow"
)

// Value — значение карты
type Value string

const (
	V0      Value = "0"
	V1      Value = "1"
	V2      Value = "2"
	V3      Value = "3"
	V4      Value = "4"
	V5      Value = "5"
	V6      Value = "6"
	V7      Value = "7"
	V8      Value = "8"
	V9      Value = "9"
	Skip    Value = "skip"
	Reverse Value = "reverse"
	DrawTwo Value = "draw_two"
)

// Card — одна карта
type Card struct {
	ID    int   `json:"id"`
	Color Color `json:"color"`
	Value Value `json:"value"`
}

func (c Card) IsAction() bool {
	return c.Value == Skip || c.Value == Reverse || c.Value == DrawTwo
}

// Points — очки карты для подсчёта в конце раунда
func (c Card) Points() int {
	switch c.Value {
	case Skip, Reverse, DrawTwo:
		return 20
	case V0:
		return 0
	case V1:
		return 1
	case V2:
		return 2
	case V3:
		return 3
	case V4:
		return 4
	case V5:
		return 5
	case V6:
		return 6
	case V7:
		return 7
	case V8:
		return 8
	case V9:
		return 9
	}
	return 0
}

// newDeck создаёт колоду без диких карт (76 карт)
// 4 цвета × (0×1 + 1-9×2 + skip×2 + reverse×2 + draw_two×2) = 76
func newDeck() []Card {
	cards := make([]Card, 0, 76)
	id := 0

	colors := []Color{Red, Green, Blue, Yellow}

	// числа: 0 — одна копия, 1-9 — по две
	numbers := []Value{V0, V1, V1, V2, V2, V3, V3, V4, V4, V5, V5, V6, V6, V7, V7, V8, V8, V9, V9}
	// спецкарты: по две каждой
	actions := []Value{Skip, Skip, Reverse, Reverse, DrawTwo, DrawTwo}

	for _, color := range colors {
		for _, val := range numbers {
			cards = append(cards, Card{ID: id, Color: color, Value: val})
			id++
		}
		for _, val := range actions {
			cards = append(cards, Card{ID: id, Color: color, Value: val})
			id++
		}
	}

	return cards
}

// shuffle перемешивает колоду (Fisher-Yates)
func shuffle(cards []Card, seed int64) []Card {
	r := seed
	lcg := func() int64 {
		r = r*6364136223846793005 + 1442695040888963407
		return r
	}
	for i := len(cards) - 1; i > 0; i-- {
		j := int(lcg()>>33) % (i + 1)
		if j < 0 {
			j = -j
		}
		cards[i], cards[j] = cards[j], cards[i]
	}
	return cards
}