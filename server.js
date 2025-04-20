// server.js for Infinity Tic Tac Toe with instant fading and win highlighting
const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 3000 });

const rooms = new Map();
const winningCombos = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

server.on("connection", (socket) => {
  let currentRoom = null;
  let playerId = null;

  socket.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "join") {
      const roomId = data.roomId;
      currentRoom = roomId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          players: [],
          board: Array(9).fill(null),
          faded: {},
          turn: "X",
          moves: [],
          shots: { X: 0, O: 0 },
          score: { X: 0, O: 0 },
        });
      }

      const room = rooms.get(roomId);
      if (room.players.length >= 2) {
        socket.send(JSON.stringify({ type: "error", message: "Room is full" }));
        socket.close();
        return;
      }

      playerId = room.players.length === 0 ? "X" : "O";
      room.players.push({ socket, id: playerId });
      socket.send(JSON.stringify({ type: "init", playerId }));
    }

    if (data.type === "move" && currentRoom) {
      const room = rooms.get(currentRoom);
      if (!room || room.board[data.index]) return;

      room.board[data.index] = data.player;
      room.shots[data.player]++;
      room.faded[data.index] = false;
      room.moves.push({ index: data.index, player: data.player });

      let faded = null;
      let removed = null;

      // Always fade if 6+ moves
      if (room.moves.length > 6) {
        const oldest = room.moves[0];
        if (!room.faded[oldest.index]) {
          faded = oldest;
          room.faded[oldest.index] = true;
        }
      }

      // Remove after 7
      if (room.moves.length > 7) {
        const toRemove = room.moves.shift();
        room.board[toRemove.index] = null;
        removed = toRemove;
        delete room.faded[toRemove.index];
      }

      const winCombo = getWinningCombo(room.board, room.faded);
      const winner = winCombo ? room.board[winCombo[0]] : null;

      room.players.forEach((p) =>
        p.socket.send(
          JSON.stringify({
            type: "move",
            index: data.index,
            player: data.player,
            faded,
            removed,
            win: winner === data.player,
            winCombo,
            shots: room.shots,
            score: room.score,
          })
        )
      );

      // This delay gives time for clients to display win highlights before resetting the board
      if (winner) {
        room.score[winner]++;
        setTimeout(() => {
          room.board = Array(9).fill(null);
          room.faded = {};
          room.moves = [];
          room.shots = { X: 0, O: 0 };
          room.turn = "X";

          room.players.forEach((p) =>
            p.socket.send(
              JSON.stringify({
                type: "reset",
                score: room.score,
              })
            )
          );
        }, 2000);
      }

      room.turn = data.player === "X" ? "O" : "X";
    }

    if (data.type === "reset" && currentRoom) {
      const room = rooms.get(currentRoom);
      room.board = Array(9).fill(null);
      room.faded = {};
      room.moves = [];
      room.shots = { X: 0, O: 0 };
      room.turn = "X";

      room.players.forEach((p) =>
        p.socket.send(
          JSON.stringify({
            type: "reset",
            score: room.score,
          })
        )
      );
    }

    if (data.type === "chat" && currentRoom) {
      const room = rooms.get(currentRoom);
      room.players.forEach((p) =>
        p.socket.send(
          JSON.stringify({
            type: "chat",
            message: data.message,
            player: data.player,
          })
        )
      );
    }
  });

  socket.on("close", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.players = room.players.filter((p) => p.socket !== socket);
    room.players.forEach((p) =>
      p.socket.send(
        JSON.stringify({ type: "info", message: "Opponent disconnected" })
      )
    );

    if (room.players.length === 0) rooms.delete(currentRoom);
  });
});

function getWinningCombo(board, faded) {
  return (
    winningCombos.find(
      ([a, b, c]) =>
        board[a] &&
        board[a] === board[b] &&
        board[b] === board[c] &&
        !faded[a] &&
        !faded[b] &&
        !faded[c]
    ) || null
  );
}

console.log("✅ Infinity Tic Tac Toe server running with fade + win highlight");
