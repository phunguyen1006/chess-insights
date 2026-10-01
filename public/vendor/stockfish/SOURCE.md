# Bundled Stockfish

Unmodified Stockfish.js 18, npm package **stockfish 18.0.8**, lite single-threaded WASM build. Copyright 2026 Chess.com, LLC and Stockfish contributors. Licensed under GPLv3; see Copying.txt. The name Chess.com in this upstream notice identifies the engine author and does not imply endorsement of Chess Insights.

The exact corresponding source is included as source-18.0.8.zip (upstream commit 93c994592dcf3b4b21052ab925e9b534df9c0918). Upstream repository: https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918

For a rebuild, extract the archive, follow its README and build.js prerequisites, install the documented Emscripten toolchain, then run `node build.js --single-threaded --lite -f`. The upstream source includes the build scripts and references for required network weights/toolchain dependencies. This extension does not change the engine or its evaluation network. The original npm artifacts can also be obtained with `npm pack stockfish@18.0.8`.

No engine assets are downloaded at runtime. The extension-owned host loads only the two bundled .js/.wasm files. One worker, 16MB hash, 20,000 nodes per evaluated position.
