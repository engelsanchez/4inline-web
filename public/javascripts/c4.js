function C4Board(args){
	args = args || {};
	this.ncols = args.cols || 7;
	this.nrows = args.rows || 6; 
	this.slots = [];
	this.el = args.board;
	var pieceImages = [ 
		args.image1 || "images/piece0.png", 
		args.image1 || "images/piece1.png",
		args.image2 || "images/piece2.png"
	];
	this.pieceImg = pieceImages;

	for (var i=0;i<this.ncols;++i){
		var col = [];
		for (var j=this.ncols-1;j>=0;--j)
			col[j] = 0;
		this.slots[i] = col;
	}
	this.drop = function(col, piece){
		for (var i=1;i<=this.nrows;++i)
			if (this.piece(col,i) == 0){
				this.setpiece(col,i,piece);
				this.updateCell(col, i);
				return i;
			}
		return 0;
	};
	this.piece = function(col, row){
		return this.slots[col-1][row-1];
	};
	this.setpiece = function(col, row, val){
		this.slots[col-1][row-1] = val;
	};
	this.updateCell = function(col, row) {
		$("#c4cellimg_"+col+"_"+row, this.el).attr("src", this.pieceImg[this.piece(col, row)]);			
	};
	this.render = function() {
		var board = $("<div/>").addClass("c4board");
		for(var r=this.nrows;r > 0;--r){
			var row = $("<div/>").addClass("c4row");
			for(var c=1;c<=this.ncols;++c)
				row.append(
					$("<div/>")
					.addClass("c4cell")
					.append(
						$("<img/>")
						.addClass("c4cellimg")
						.attr({
							id: "c4cellimg_"+c+"_"+r, 
							src: this.pieceImg[0]
						})
					)
				);
			board.append(row);
		}
		this.el.empty().append(board);	
	};
}

var C4 = {
	// Element or jQuery selection to display status message
	statusEl : null,
	boardEl : null,
	// Our web socket thingie
	sock : null,
	// ID given to us by the server to use when reconnecting.
	playerId : null,
	// Msg handler list.
	handlers : [],
	
	// Game variables. Later we may support multiple games, for now game vars here.
	gameId : null,
	gameVar : null,
	color : null,
	otherColor : null,
	otherConnected : null,
	turn : null,
	board : null,
	
	init : function(args)
	{
		args = args || {};
		this.statusEl = args.statusBar || $(".c4status");
		this.boardEl = args.board || $("#c4board");
	},
	padId : function(n)
	{
		return ("000000" + n).slice(-6);
	},
	connect : function(url) 
	{
		C4.status("Trying to connect to server "+url);
		if ("MozWebSocket" in window) {
			WebSocket = MozWebSocket;
		}
		if ("WebSocket" in window) {
			// browser supports websockets
			var ws = new WebSocket("ws://"+url);
			ws.onopen = function() {
				// websocket is connected
				C4.status("Connected to server");
				if (C4.playerId) 
					C4.send("CONNECT AS "+C4.playerId);
				else	
					C4.send("CONNECT");
				C4.add_handler(C4.cb_welcome);
			};
			ws.onmessage = function (evt) {
				var receivedMsg = evt.data;
				C4.onmessage(receivedMsg);
			};
			ws.onclose = function() {
				// websocket was closed, try to reconnect in a bit.
				C4.status("Connection was closed by server");
				C4.clear_seeks();
				setTimeout(function(){C4.connect(url);}, 5000);
			};
			this.sock = ws;
		} else {
			// browser does not support websockets
			this.status("sorry, your browser does not support websockets.");
		}
	},
	status : function(msg) 
	{
		//alert(msg);
		this.statusEl.text(msg);
	},
	send : function(msg, cb) 
	{
		this.sock.send(msg);
		if (cb)	this.onmessage = cb;
	},
	onmessage : function(msg) 
	{
		for(var i=0;i<C4.handlers.length;++i){
			if(C4.handlers[i](msg))
				return;
		}
		C4.status("Unexpected message : "+msg);
	},
	add_handler : function(fn)
	{
		C4.remove_handler(fn);
		C4.handlers.push(fn);
	},
	remove_handler : function(fn)
	{
		for(var i=0;i<C4.handlers.length;++i){
			if( fn === C4.handlers[i] )
				C4.handlers.splice(i,1);
		}
	},
	cb_welcome : function(msg) 
	{
		var welcome = msg.match(/^WELCOME (.+)$/);
		if (welcome) {
			C4.playerId = welcome[1];	
			//C4.status("We are player "+C4.playerId);
			C4.remove_handler(C4.cb_welcome);
			C4.add_handler(C4.cb_seek_notifications);
			return true;
		} else
			return false;
	},
	cb_seek_notifications: function(msg)
	{
		var m = msg.match(/^SEEK_ISSUED (\d+) C4 (STD|POP) (\d+)x(\d+)$/);
		if (m) {
			C4.status("Adding seek "+msg);
			C4.add_seek({variant:m[2],id:+m[1],board_width:+m[3],board_height:+m[4]});
			return true;
		} else {
			m = msg.match(/^SEEK_REMOVED (\d+)$/);
			if (m) {
				C4.status("Removing seek : "+msg);
				C4.remove_seek(+m[1]);
				return true;
			} else 
				return false;
		} 
	},
	seek : function(gType) 
	{
		var boardSize = $("input[type='radio'][name='board-size']:checked").val();
		var gVar = $("input[type='radio'][name='game-variation']:checked").val();
		var cmd = "SEEK "+gType+" C4 "+gVar+" "+boardSize;
		C4.status(cmd);
		C4.sock.send(cmd);
		C4.add_handler(C4.cb_seek_reply);
		C4.add_handler(C4.cb_new_game);
		$.mobile.changePage($("#main"));
		// TODO: Disable the seek button, re-enable on timeout
	},
	add_my_seek: function(seek)
	{
		var seekBtn = $("<button>")
			.attr("id", "seek_"+seek.id)
			.addClass("seek")
			.data("icon", "delete")
			.data("iconpos", "right")
			.data("seekid", seek.id)
			.text(seek.variant+" "+seek.board_width+"x"+seek.board_height)
			.click(function(){
				var el = $(this);
				var seekid = el.data("seekid");
				C4.send("CANCEL_SEEK "+C4.padId(seekid));
				C4.add_handler(C4.cb_cancel_seek);
			});
		$(".my-seeks").append(seekBtn).trigger("create");
	},
	add_seek: function(seek)
	{
		var seekBtn = $("<button>")
			.attr("id", "seek_"+seek.id)
			.addClass("seek")
			.data("icon", "arrow-r")
			.data("iconpos", "right")
			.data("seekid", seek.id)
			.text(seek.variant+" "+seek.board_width+"x"+seek.board_height)
			.click(function(){
				var el = $(this);
				var seekid = el.data("seekid");
				C4.send("ACCEPT_SEEK "+C4.padId(seekid));
				C4.add_handler(C4.cb_new_game);
			});
		$(".seek-list").append(seekBtn).trigger("create");
	},
	remove_seek: function(seekid){
		$(".seek-list > div").has("button[id=seek_"+seekid+"]").remove();
	},
	remove_my_seek: function(seekid){
		$(".my-seeks > div").has("button[id=seek_"+seekid+"]").remove();
	},
	clear_seeks: function() {
		$(".seek-list, .my-seeks").empty();
	},
	cb_seek_reply : function(msg) {
		var m = msg.match(/^SEEK_PENDING (\d+) C4 (STD|POP) (\d+)x(\d+)$/);
		var matched = false;
		if (m){
			var seek = {id:+m[1],variant:m[2],board_width:+m[3],board_height:+m[4]};
			C4.add_my_seek(seek);
			C4.status("Waiting for another player");
			matched = true;
		} else {
			m = msg.match(/^DUPLICATE_SEEK (\d+)$/);
			if (m) 
				matched = true;
		}
		if (matched) {
			C4.remove_handler(C4.cb_seek_reply);
			return true;
		} else
			return false;
	},
	cb_new_game: function(msg) {
		var newGame = msg.match(/^GAME (\d+) C4 (STD|POP) (\d+)x(\d+) (Y|O) (1|2) NEW$/);
		if (newGame) {
			var gameId = newGame[1];
			C4.gameId = C4.padId(gameId);
			C4.gameVar = newGame[2];
			var w = +newGame[2];
			var h = +newGame[4];
			C4.turn = newGame[5];
			C4.status(C4.turn == "Y" ? "New game : Your turn!" : "New game : Wait for opponent to play");
			C4.color = +newGame[6];
			C4.otherColor = 3-C4.color;
			C4.otherConnected = true;
			C4.remove_handler(C4.cb_seek_notifications);
			C4.remove_handler(C4.cb_new_game);
			
			C4.board = new C4Board({cols:w,rows:h,board:C4.boardEl});
			C4.board.render();
			
			var re_other_dropped = new RegExp("^OTHER_PLAYED "+C4.gameId+" DROP (\\d)$");
			var re_other_dropped_won = new RegExp("^OTHER_WON "+C4.gameId+" DROP (\\d)$");
			var re_other_no_moves = new RegExp("^OTHER_NO_MOVES "+C4.gameId+" DROP (\\d+)$");
			var re_other_quit = new RegExp("^OTHER_QUIT "+C4.gameId+"$");
			var re_other_disconnected = new RegExp("^OTHER_DISCONNECTED "+C4.gameId+"$");
			var re_other_returned = new RegExp("^OTHER_RETURNED "+C4.gameId+"$");
			var re_you_dropped = new RegExp("^PLAY_OK "+C4.gameId+" DROP (\\d+)$");
			var re_you_win = new RegExp("^YOU_WIN "+C4.gameId+" DROP (\\d+)$");
			var re_no_moves = new RegExp("^NO_MOVES "+C4.gameId+" DROP (\\d+)$");
			var re_invalid_move = new RegExp("^INVALID_MOVE "+C4.gameId+"$");
			
			var in_game_handler  = function(){}; // init in 2 steps to remove Eclipse warning. argh.
			in_game_handler = function(msg){
				var m;
				if (m = msg.match(re_you_dropped)) {
					var col = +m[1];
					C4.board.drop(col,C4.color);
					C4.turn = "O";
					return true;
				}
				if (m = msg.match(re_you_win)) {
					var col = +m[1];
					C4.board.drop(col,C4.color);
					C4.gameId = null;
					C4.status("You win!!");
					return true;
				}
				if (m = msg.match(re_no_moves)) {
					var col = +m[1];
					C4.board.drop(col,C4.color);
					C4.gameId = null;
					C4.status("No more moves, game over");
					return true;
				}
				if (m = msg.match(re_other_dropped)) {
					var col = +m[1];
					C4.board.drop(col, C4.otherColor);
					C4.status("Your turn");
					C4.turn = "Y";
					return true;
				}
				if (m = msg.match(re_other_dropped_won)) { 
					var col = +m[1];
					C4.board.drop(col, C4.otherColor);
					C4.status("Sorry, you have lost");
					C4.remove_handler(in_game_handler);
					C4.turn = "Y";
					return true;
				}
				if (m = msg.match(re_other_no_moves)) {
					var col = +m[1];
					C4.board.drop(col,C4.otherColor);
					C4.gameId = null;
					C4.status("No more moves, game over");
					return true;
				}
				if (m = msg.match(re_other_quit)) {
					C4.status("Your opponent quit the game");
					C4.remove_handler(in_game_handler);
					C4.gameId = null;
					C4.turn = null;
					return true;
				}
				if (m = msg.match(re_other_disconnected)) {
					C4.status("Other player disconnected, waiting for reconnection");
					C4.otherConnected = false;
					return true;
				}
				if (m = msg.match(re_other_returned)) {
					C4.status("Other player returned!");
					C4.otherConnected = true;
					return true;
				}
				if (m = msg.match(re_invalid_move)) {
					C4.status("Invalid move");
					return true;
				}
				return false;
			};
			C4.add_handler(in_game_handler);
			$.mobile.changePage($("#game"));
			return true;
		} else
			return false;
	},
	cb_cancel_seek: function(msg) {
		var m;
		var found = false;
		if(m = msg.match(/^SEEK_CANCELED (\d+)$/)){
			C4.status(msg);
			var seekId = +m[1];
			C4.remove_my_seek(seekId);
			found = true;
		} else if(msg.match(/^NO_SEEK_FOUND (\d+)$/)){
			C4.status(msg);
			found =  true;
		};
		// TODO: Resolve race condition with quick multiple seek cancelation, maybe multiple handlers
		// In the future protocol will match by unique command id.
		if (found)
			C4.remove_handler(C4.cb_cancel_seek);
		return found;
	},
	canPlay : function() {
		return C4.gameId && C4.otherConnected && C4.turn == "Y";
	},
	play : function(col) {
		if (C4.canPlay()){
			C4.sock.send("PLAY "+C4.gameId+" DROP "+col);
			C4.status("Sending move");
		}
	}
};
