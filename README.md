# Know Your Crowd

A local multiplayer party game where players submit anonymous answers to quirky prompts, then the host matches answers to players. Built with Electron + Express + Socket.io. Connect phones to your TV over WiFi for a hilarious gameshow experience with classic Family Feud/Price is Right styling.

## 📦 Download

**Ready to play?** Download the latest pre-built app for your platform from the [Releases page](https://github.com/zachegner/KnowYourCrowd/releases).

Available for:
- **macOS** (.dmg, .zip)
- **Windows** (.exe installer, portable)
- **Linux** (AppImage, .deb)

No installation or coding required - just download, run, and play!

## 🎮 How to Play

1. **Launch the Game**: Run the app on your computer/TV - it starts a local web server
2. **Join the Room**: Players connect their phones to the displayed URL or scan the QR code
3. **Answer Themes**: Each round, the rotating host picks from 3 AI-generated themes and players submit their answers
4. **Match Answers**: The host tries to match each anonymous answer to the player who wrote it
5. **Score Points**: Correct matches earn points; perfect rounds earn bonus points!

## 🔧 Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Anthropic API key (for AI-generated themes)

### Installation

```bash
# Clone the repository
git clone https://github.com/zachegner/KnowYourCrowd.git
cd KnowYourCrowd

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your Anthropic API key

# Run in development mode
npm start
```

### Configuration

Create a `.env` file in the root directory with your Anthropic API key:

```bash
CLAUDE_API_KEY=your_api_key_here
```

Get your API key at [console.anthropic.com](https://console.anthropic.com)

The API key is used to generate unique themes each round. If not provided, the game will use fallback themes.

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
- Minimum: 3 players (configurable in `config/default-config.json`)
- Maximum: 10 players
- All players need a smartphone with a web browser
- All devices must be on the same WiFi network

### Game Flow
1. **Lobby**: Players join using room code or QR code
2. **Theme Selection**: Host picks from 3 AI-generated themes (15 sec timer)
3. **Answering**: All players submit their answers (60 sec timer)
4. **Matching**: Host matches answers to players using drag-and-drop UI (90 sec timer)
5. **Reveal**: Results are shown one by one with color-coded matches
6. **Round End**: Scores displayed, next host selected
7. **Repeat**: Host role rotates each round for 1 full rotation (configurable)

## 🛠 Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Backend**: Node.js, Express, Socket.io
- **Desktop**: Electron (cross-platform)
- **AI**: Anthropic Claude API (claude-haiku-4-5 model)
- **Real-time Communication**: Socket.io for player connections and game state sync

## 📁 Project Structure

```
KnowYourCrowd/
├── electron/           # Electron main process & Express server
│   ├── main.js        # App lifecycle, window management
│   ├── server.js      # Express routes, Socket.io handlers
│   └── preload.js     # IPC bridge
├── src/
│   ├── views/         # HTML pages (display, host phone, player phone)
│   ├── styles/        # CSS (gameshow theme, phone styles, animations)
│   ├── scripts/       # Client-side JS (UI controllers, socket handlers)
│   └── assets/        # Images (SVGs), fonts, sounds
├── services/          # Game logic services
│   ├── game-logic.js      # Core game state machine & phase transitions
│   ├── claude-service.js  # AI theme generation
│   ├── theme-generator.js # Theme seeding & session management
│   ├── score-calculator.js # Scoring logic
│   └── room-manager.js     # Room code generation
├── database/          # SQLite schema (future feature)
├── config/            # Configuration files
│   └── default-config.json # Timers, scoring, player limits
├── test/              # Automated test scripts
└── .env.example       # Environment variable template
```

## 🎨 Classic Gameshow Theme

The game features a classic TV gameshow aesthetic inspired by Family Feud and The Price is Right with:
- Bold gold, red, and blue color palette with industrial rivets
- Eye-catching display typography (Bebas Neue, Impact)
- Spotlight and stage lighting effects
- Dramatic reveal animations with color-coded matches
- Retro 70s-80s TV studio feel
- Mobile-optimized touch interfaces for phone players

## 🔌 Network Setup

- The Electron app starts an Express server on a random available port
- Displays QR code and local network URL for easy phone connections
- All devices must be on the same WiFi network
- Server binds to `0.0.0.0` to accept connections from all local network interfaces
- Firewall may prompt for access on first launch (allow it!)

## 🧪 Testing

```bash
# Run automated game flow test (simulates full game with mock players)
npm run test:game

# Run sudden death scenario test
npm run test:sudden-death
```

The automated tests simulate Socket.io connections and verify game logic, phase transitions, scoring, and edge cases.

## 🐛 Troubleshooting

### Players can't connect
- Make sure all devices are on the same WiFi network (not guest network)
- Check if firewall is blocking the connection (allow Node.js/Electron)
- Try entering the IP address manually instead of using QR code
- Some corporate/school networks block device-to-device communication

### Themes not generating
- Check that your `CLAUDE_API_KEY` environment variable is set correctly in your `.env` file
- Verify API key is valid at [console.anthropic.com](https://console.anthropic.com)
- The game will automatically use fallback themes if API is unavailable
- Check console logs for API error messages

### Game crashes or freezes
- Check the terminal/console for error messages
- Try restarting the application
- Ensure you have the minimum number of players (3 by default)
- Clear browser cache on phones if UI doesn't update

### Socket connection issues
- If "Socket connection lost" appears, check network stability
- Restart the Electron app to get a fresh server instance
- Players can reconnect by refreshing their browser

## 🔧 Configuration Options

Edit `config/default-config.json` to customize:

```json
{
  "minPlayers": 3,
  "maxPlayers": 10,
  "rotations": 1,
  "timers": {
    "themeSelection": 15,
    "answering": 60,
    "matching": 90,
    "reveal": 5,
    "roundEnd": 10
  },
  "penalties": {
    "noSubmission": -3
  },
  "bonuses": {
    "perfectRound": 3
  }
}
```

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Feel free to open issues or submit pull requests.

## 🙏 Credits

Built for game night enthusiasts everywhere.

**Theme Generation**: Powered by Anthropic's Claude AI
**Inspiration**: Classic TV gameshows (Family Feud, The Price is Right)
