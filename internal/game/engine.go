package game

// GameType — тип игры
type GameType string

const (
	GameTypeUNO GameType = "uno"
)

// SupportedGames — список поддерживаемых игр
var SupportedGames = []GameType{GameTypeUNO}

// IsSupported — проверяет что игра поддерживается
func IsSupported(gt GameType) bool {
	for _, g := range SupportedGames {
		if g == gt {
			return true
		}
	}
	return false
}