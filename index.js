require("dotenv").config();
const { Server } = require("socket.io");
const http = require("http");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { dynamo } = require("./aws-config");

const server = http.createServer();

const io = new Server(server, {
  cors: true,
});

const emailToSocketIdMap = new Map();
const socketidToEmailMap = new Map();

io.on("connection", (socket) => {
  console.log(`Socket Connected`, socket.id);

  socket.on("room:join", async (data) => {
    const { email, room } = data;
  
    emailToSocketIdMap.set(email, socket.id);
    socketidToEmailMap.set(socket.id, email);
    socket.join(room);
  
    // Save to DynamoDB
    try {
      const params = new PutCommand({
        TableName: "Users",
        Item: {
          email,
          room,
          socketId: socket.id,
          joinedAt: new Date().toISOString(),
        },
      });
  
      await dynamo.send(params);
      console.log("User saved to DynamoDB");
    } catch (err) {
      console.error("Error saving user to DynamoDB:", err);
    }
  
    // Find the other user in the room
    const clientsInRoom = Array.from(io.sockets.adapter.rooms.get(room) || []);
    const otherClientId = clientsInRoom.find((id) => id !== socket.id);
    const otherEmail = socketidToEmailMap.get(otherClientId);
    console.log("otherClientId", otherEmail);
  
    // Notify only the other user
    if (otherClientId) {
      io.to(otherClientId).emit("user:joined", { email, id: socket.id });
      io.to(socket.id).emit("user:joined", { email: otherEmail, id: otherClientId });
    }
  
    // Optional: confirm to the joining user
    io.to(socket.id).emit("room:join", data);
  });
  

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    console.log("peer:nego:needed", offer);
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    console.log("peer:nego:done", ans);
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Server listening on port 3000");
});
