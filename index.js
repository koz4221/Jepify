const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname + '/public'));
app.use(express.static("public"));

// app.get('/', function(req, res){
//    res.sendFile(__dirname + '/index.html');
// });

app.get('/screens/home.html', function(req, res){
   res.sendFile(__dirname + '/screens/home.html');
});

app.get('/screens/player.html', function(req, res){
   res.sendFile(__dirname + '/screens/player.html');
});

app.get('/screens/proctor.html', function(req, res){
   res.sendFile(__dirname + '/screens/proctor.html');
});

app.get('/screens/trebek.html', function(req, res){
   res.sendFile(__dirname + '/screens/trebek.html');
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});

var createGameID = function() {
    var text = "";
    var possible = "0123456789";
    for(var i = 0; i < 4; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    var gameExists = games.filter(function(game,i) {
        return game.id == [text];
    });

    if (gameExists.length) return createGameID();
    return text;
}

// games will exist on server
var games = [];
var Game = function(id, socketID) {
   this.id = id;
   this.players = [];
   this.open = false;
   this.proctor = socketID;
   this.responseOrder = 1;

   this.addPlayer = function(player) {
      this.players.push(player.name.toLowerCase().trim())
   }
   this.toAll = function(event, data) {
      if (typeof data === 'object') data = JSON.stringify(data);
      // send to everyone in game including proctor
      io.in(this.id).emit(event, data);
   }

   this.toProctor = function(event,data) {
      if (typeof data === 'object') data = JSON.stringify(data);

      io.to(this.proctor).emit(event, data);
   }
}

var createGame = function(id, socketID) {
    var g = new Game(id, socketID);

    games.push({'id':id,'game':g});
}

var getGame = function(id) {
    var g = games.filter(function(game,i) {
        return game.id == id;
    });

    return g.length > 0 ? g[0].game : null;
}


var joinGame = function(data) {
   data = JSON.parse(data);
   var game = getGame(data.gameID);

   // game does not exist error
   if (!game) {
     return {err: 'Game ' + data.gameID + ' does not exist'};
   }

   // name taken error
   if (game.players.includes(data.name.toLowerCase().trim())) {
     return {err:'The name ' + data.name + ' is already taken. Choose another name'};
   }

   var player = new Player(data);
   game.addPlayer(player);

   console.log(player.name + ' joined game!');

   return player;
}

var Player = function(data) {
   this.id = data.id;
   this.name = data.name;
   this.gameID = data.gameID;
}

io.on('connection', function(socket){
  console.log('++++ a user connected');

  // Connection and set up
  socket.on('createGame', function(data) {
    var gameID = createGameID();
    createGame(gameID, socket.id);

    // pass game id back to creator
    socket.join(gameID);
    socket.emit('gameCreated', gameID);
  });

  socket.on('joinGame', function(data) {
      data = JSON.parse(data);
      response = joinGame(data);

       if (response.err) {
           socket.emit('joinError',response.err);
           return;
       }

       socket.join(response.gameID);

       if (getGame(response.gameID).open) {
          response.open = true;
       }

       socket.emit('gameJoined', JSON.stringify(response));

  });

  socket.on('disconnect', function() {
     console.log('---- a user disconnected')
  });


  // ---------------------------------------
  // Receive from Buzzer
  // ---------------------------------------
  socket.on('buzz',function(data) {
      var data = JSON.parse(data);

      console.log(data.name + ' buzzed in');
      var game = getGame(data.gameID);

      // emit response received to player
      socket.emit('responseReceived', game.responseOrder);

      // pass on response to proctor
      game.toProctor('responseReceived', JSON.stringify(data))

      // increment response order
      game.responseOrder++;
  });

  socket.on('countDownOver',function(player) {
      var player = JSON.parse(player);
      var game = getGame(player.gameID);

      io.to(game.proctor).emit('countDownOver', JSON.stringify(player))
  });

  // ---------------------------------------
  // Receive from Proctor
  // ---------------------------------------
  socket.on('gameOpen',function(id) {
      var game = getGame(id);
      game.open = true;
      console.log('game opened!')

      // emit to all players that the game is OPEN
      game.toAll('gameOpened', id)
  });

  socket.on('gameClear',function(id) {
      var game = getGame(id);
      game.open = false;
      game.responseOrder = 1;
      console.log('game cleared');

      // emit to all players that the game is CLEARED
      socket.broadcast.to(id).emit('gameCleared')
  })

  socket.on('countDownStart',function(playerID) {
      // start countdown for player
      io.to(playerID).emit('countDownStart', {})
  });

  socket.on('getGames',function(playerID) {
      // start countdown for player
      var strGames = ""
      games.forEach(function(game,i) {
          strGames += game.id;
          if (i !== games.length - 1) {
              strGames += ','
          }
      });

      io.to(playerID).emit('gotGames', strGames)
  });
});
