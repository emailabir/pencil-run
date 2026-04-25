Drop your final background music file here.

Expected public asset file:

`public/assets/audio/bg-music.mp3`

Runtime asset path used by the game:

`assets/audio/bg-music.mp3`

If this file is missing, the game now falls back to a built-in fast arcade-style synth loop
so music still plays during gameplay.

If you use a different filename or location, update `GAME_CONFIG.audio.music.assetPath`
in `src/game/core/gameConfig.ts`.