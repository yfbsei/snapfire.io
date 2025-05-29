# Open World FPS Game

A 3D open-world first-person shooter built with Three.js, designed for **PvP multiplayer** with Krunker-style graphics and modular architecture.

## 🎮 Features

- **Open World**: Large explorable 500x500 unit world
- **First-Person Controls**: WASD movement, mouse look, jumping, and running
- **Shooting Mechanics**: Raycast-based shooting with muzzle flash effects
- **PvP Ready**: Clean codebase prepared for multiplayer implementation
- **Stylized Graphics**: Clean, colorful Krunker-style low-poly aesthetics
- **Dynamic World**: Procedurally generated buildings and trees
- **Modern Tech Stack**: Node.js modules, Vite, Tailwind CSS 4.1, Three.js
- **Responsive UI**: Modern gaming interface with HUD and notifications

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Modern web browser with WebGL support

### Installation

1. Clone or download the project files
2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

## 🎯 Controls

| Key | Action |
|-----|--------|
| `WASD` | Move |
| `Mouse` | Look around |
| `Click` | Shoot |
| `Space` | Jump |
| `Shift` | Run |
| `R` | Reload (planned) |
| `ESC` | Release mouse lock |

## 📁 Project Structure

```
├── src/
│   ├── core/
│   │   ├── Game.js          # Main game class
│   │   ├── Player.js        # Player controller
│   │   ├── World.js         # World generation and management
│   │   ├── InputManager.js  # Input handling
│   │   └── GameConfig.js    # Game configuration
│   ├── entities/
│   │   ├── Building.js      # Building generation
│   │   └── Tree.js          # Tree generation
│   ├── ui/
│   │   └── UI.js           # User interface management
│   ├── styles/
│   │   └── main.css        # Custom styles
│   └── main.js             # Application entry point
├── index.html              # Main HTML file
├── vite.config.js         # Vite configuration
├── tailwind.config.js     # Tailwind CSS configuration
└── package.json           # Dependencies and scripts
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Configuration

Game settings can be modified in `src/core/GameConfig.js`:

```javascript
export const GameConfig = {
  WORLD: {
    SIZE: 500,           // World size
    BUILDING_COUNT: 50,  # Number of buildings
    TREE_COUNT: 30       # Number of trees (no enemies!)
  },
  PLAYER: {
    SPEED: {
      WALK: 0.3,         // Walking speed
      RUN: 0.5,          // Running speed
      JUMP: 12           // Jump force
    }
  }
  // ... more settings
};
```

## 🎨 Customization

### Adding New Entities

1. Create a new class in `src/entities/`
2. Implement required methods: `addToScene()`, `removeFromScene()`, `getMeshes()`, `dispose()`
3. Add to world generation in `src/core/World.js`

### Modifying Graphics

- Colors and materials: `GameConfig.MATERIALS`
- Lighting settings: `GameConfig.LIGHTING`
- Shader effects: Modify Three.js materials in entity classes

### UI Modifications

- Styles: `src/styles/main.css` and Tailwind classes
- Components: `src/ui/UI.js`
- Layout: `index.html`

## 🚧 Planned Features (PvP Focus)

- [ ] **Multiplayer Networking**: WebSocket/WebRTC-based real-time multiplayer
- [ ] **Player Synchronization**: Position, rotation, and animation sync
- [ ] **Server Authority**: Anti-cheat and lag compensation
- [ ] **Lobby System**: Room creation and matchmaking
- [ ] **Player Indicators**: Nametags, health bars, and team colors
- [ ] **Weapon System**: Multiple weapons with different properties
- [ ] **Kill Feed**: Real-time elimination notifications
- [ ] **Leaderboard**: Score tracking and statistics
- [ ] **Sound Effects**: 3D spatial audio for footsteps and gunshots
- [ ] **Mobile Support**: Touch controls for mobile PvP

## 🔧 Performance Optimization

The game includes several performance optimizations:

- **Frustum Culling**: Only render visible objects
- **Level of Detail (LOD)**: Reduced detail for distant objects
- **Shadow Optimization**: Configurable shadow quality
- **Memory Management**: Proper disposal of geometries and materials

For better performance on lower-end devices:
1. Reduce `BUILDING_COUNT` and `ENEMY_COUNT` in GameConfig
2. Disable shadows: Set `GRAPHICS.SHADOWS_ENABLED` to `false`
3. Lower pixel ratio: Reduce `PERFORMANCE.MAX_PIXEL_RATIO`

## 📱 Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - Feel free to use this project for learning or commercial purposes.

## 🎯 Credits

- **Three.js**: 3D graphics library
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Orbitron Font**: Futuristic gaming font

---

**Enjoy the game! 🎮**

For issues or questions, please check the console for debug information or create an issue in the repository.