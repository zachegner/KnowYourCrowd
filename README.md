# Know Your Crowd

A classic gameshow-themed party game where players guess who said what! Inspired by Family Feud and The Price is Right. Perfect for game nights, parties, and getting to know your friends better.

## 🎮 How to Play

1. **Launch the Game**: Run the executable on your computer/TV
2. **Join the Room**: Players scan the QR code or enter the room code on their phones
3. **Answer Themes**: Each round, the host picks a theme and players submit their answers
4. **Match Answers**: The host tries to match each answer to the player who wrote it
5. **Score Points**: Correct matches earn points; perfect rounds earn bonus points!

## 🔧 Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Anthropic API key (for AI-generated themes)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd know-your-crowd

# Install dependencies
npm install

# Run in development mode
npm start
```

### Configuration

Edit `config/default-config.json` to add your Anthropic API key:

```json
{
  "apiKey": "YOUR_ANTHROPIC_API_KEY_HERE"
}
```

Get your API key at [console.anthropic.com](https://console.anthropic.com)

### Building Executables

```bash
# Build for all platforms
npm run package

# Build for specific platform
npm run package:mac
npm run package:win
npm run package:linux
```

## 🎯 Game Rules

### Scoring
- **Host**: +1 point for each correct match
- **Perfect Round**: +3 bonus points if all matches are correct
- **No Answer Penalty**: -3 points if you don't submit an answer

### Player Requirements
- Minimum: 4 players
- Maximum: 10 players
- All players need a smartphone with a web browser

### Game Flow
1. **Lobby**: Players join using room code
2. **Theme Selection**: Host picks from 3 AI-generated themes (15 sec)
3. **Answering**: Players submit their answers (60 sec)
4. **Matching**: Host matches answers to players (90 sec)
5. **Reveal**: Results are shown one by one
6. **Repeat**: Host rotates, play continues for 3 full rotations

## 🛠 Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express, Socket.io
- **Desktop**: Electron
- **Database**: SQLite
- **AI**: Anthropic Claude API (Haiku model)

## 📁 Project Structure

```
know-your-crowd/
├── electron/           # Electron main process
├── src/
│   ├── views/         # HTML pages
│   ├── styles/        # CSS stylesheets
│   ├── scripts/       # Client-side JavaScript
│   └── assets/        # Images, fonts, sounds
├── services/          # Game logic services
├── database/          # SQLite schema
├── config/            # Configuration files
└── package.json
```

## 🎨 Classic Gameshow Theme

The game features a classic TV gameshow aesthetic inspired by Family Feud and The Price is Right with:
- Bold gold, red, and blue color palette
- Eye-catching display typography
- Spotlight and stage lighting effects
- Dramatic reveal animations
- Retro 70s-80s TV studio feel

## 🔌 Network Requirements

- All devices must be on the same WiFi network
- The host computer will display its local IP address
- Firewall may prompt for access on first launch (allow it!)

## 🐛 Troubleshooting

### Players can't connect
- Make sure all devices are on the same WiFi network
- Check if firewall is blocking the connection
- Try entering the IP address manually instead of using QR code

### Themes not generating
- Check that your Anthropic API key is valid
- The game will use fallback themes if API is unavailable

### Game crashes
- Check the console for error messages
- Try restarting the application
- Ensure you have the minimum number of players

## 📝 License

MIT License

## 🤝 Contributing

Contributions welcome! Please read the contributing guidelines first.

## 🙏 Credits

Built with ❤️ for game night enthusiasts everywhere.
