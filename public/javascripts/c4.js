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
		$("#c4cellimg_"+col+"_"+row, this.el)
		.addClass("piece"+this.piece(col, row));			
	};
	this.render = function() {
		this.el.empty();
		var dropBtns = $("<div/>")
		.attr("id", "c4drops");
		var clickHandler = function(n){
			return function(){C4.play(n);};
		};
		for(var i=1;i<=this.ncols;++i){
			dropBtns.append(
					$("<div>")
					.addClass("c4drop")
					.append(
							$("<button>")
							.addClass("c4drop")
							.html("&darr;")
							.click(clickHandler(i))
							)
					);
		}
		dropBtns.append($("<div/>").addClass("lastdrop"));
		// now the board itself
		var board = $("<div/>").addClass("c4board");
		for(var r=this.nrows;r > 0;--r){
			var row = $("<div/>").addClass("c4row");
			for(var c=1;c<=this.ncols;++c){
				row.append(
					$("<div/>")
					.addClass("c4cell")
					.append(
						$("<div/>")
						.addClass("c4cellimg")
						.attr("id", "c4cellimg_"+c+"_"+r) 
					)
				);
			}
			row.append($("<div/>").addClass("lastdrop"));
			board.append(row);
		}
		var area = $("<div/>").addClass("c4area").addClass("board"+this.ncols+"x"+this.nrows).append(dropBtns).append(board);
		this.el.append(area).trigger("create");	
	};
}

var C4 = {
	// Element or jQuery selection to display status message
	statusEl : null,
	gameStatusEl : null,
	boardEl : null,
	// Our web socket thingie
	sock : null,
	// ID given to us by the server to use when reconnecting.
	playerId : null,
	privGameId : null,
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
		this.gameStatusEl = args.gameStatus || $("#gameStatus");
		this.boardEl = args.board || $("#c4board");
		
		$("#game-home-btn").click(function(){
			if (C4.gameId)
				C4.quit_game();
		});
		
		// On initial load, get private game id
		// TODO: look into replacing with hash, then remove it without
		// interfering with jQuery mobile's use of hashes.
		var m = window.location.href.match(/\?g=(\d+)/);
		if (m) {
			this.privGameId = this.padId(+m[1]);
		}
	},
	padId : function(n)
	{
		return ("000000" + n).slice(-6);
	},
	connect : function(url) 
	{
		C4.debug("Trying to connect to server "+url);
		if ("MozWebSocket" in window) {
			WebSocket = MozWebSocket;
		}
		if ("WebSocket" in window) {
			// browser supports websockets
			var ws = new WebSocket("ws://"+url);
			ws.onopen = function() {
				// websocket is connected
				C4.debug("Connected to server");
				if (C4.playerId) 
					C4.send("CONNECT AS "+C4.playerId);
				else	
					C4.send("CONNECT");
				C4.handlers.splice(0, C4.handlers.length);
				C4.add_handler(C4.cb_welcome);
				// for testing disconnections, uncomment
				//setTimeout(function(){C4.sock.close();}, 20000);
			};
			ws.onmessage = function (evt) {
				var receivedMsg = evt.data;
				C4.onmessage(receivedMsg);
			};
			ws.onclose = function() {
				// websocket was closed, try to reconnect in a bit.
				$("#disconnected-warning").text("(Disconnected)");
				C4.clear_seeks();
				C4.status("Disconnected");
				C4.gameStatus("Disconnected");
				C4.gameId = null;
				setTimeout(function(){C4.connect(url);}, 1000);
			};
			ws.onerror = function(evt){
				C4.status("Connection error : "+evt.data);
				$("#disconnected-warning").text("(Disconnected)");
			};
			this.sock = ws;
		} else {
			// browser does not support websockets
			C4.status("Sorry, your internet browser can not play this game :(");
			$("#disconnected-warning").text("(Disconnected)");
		}
	},
	status : function(msg) 
	{
		//alert(msg);
		this.statusEl.text(msg);
		this.debug(msg);
	},
	gameStatus : function(msg)
	{
		this.gameStatusEl.text(msg);
	},
	debug : function(msg)
	{
		if(console && console.log)
			console.log(msg);
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
		C4.debug("Unexpected message : "+msg);
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
			var newPlayerId = !C4.playerId || (welcome[1] != C4.playerId);
			C4.playerId = welcome[1];
			C4.debug("We are player "+C4.playerId);
			$("#disconnected-warning").text("");
			C4.remove_handler(C4.cb_welcome);
			C4.add_handler(C4.cb_seek_notifications);
			C4.add_handler(C4.cb_new_game);
			if (C4.privGameId)
				C4.send("ACCEPT_SEEK "+C4.privGameId);
			if (newPlayerId)
				$.mobile.changePage($("#main"));
			return true;
		} else
			return false;
	},
	cb_seek_notifications: function(msg)
	{
		if (C4.gameId)
			return false;
		
		var m;
		if (m = msg.match(/^SEEK_ISSUED (\d+) C4 (STD|POP) (\d+)x(\d+)$/)) {
			C4.debug("Adding seek "+msg);
			C4.add_seek({variant:m[2],id:+m[1],board_width:+m[3],board_height:+m[4]});
			return true;
		} 
		if(m = msg.match(/^SEEK_REMOVED (\d+)$/)) {
			C4.debug("Removing seek : "+msg);
			C4.remove_seek(+m[1]);
			return true;
		} 
		if (m = msg.match(/^SEEK_PENDING ANON (\d+) C4 (STD|POP) (\d+)x(\d+)$/)){
			var seek = {id:+m[1],variant:m[2],board_width:+m[3],board_height:+m[4]};
			C4.add_my_seek(seek);
			C4.debug("Waiting for another player");
			return true;
		}
		
		if (m = msg.match(/^SEEK_PENDING PRIV (\d+) C4 (STD|POP) (\d+)x(\d+)$/)){
			var seek = {id:+m[1],variant:m[2],board_width:+m[3],board_height:+m[4]};
			$("#email-btn").attr("href", "mailto:?subject=Join a game of 4-in-line" +
					"&body=Click to join the game %0A%0A" +
					"http://"+window.location.hostname+"/?g="+seek.id);
			$("#priv-game-id").text(seek.id);
			C4.debug("Waiting for another player");
			$.mobile.changePage($("#friend-wait"));
			return true;
		}
		
		if (m = msg.match(/^DUPLICATE_SEEK (\d+)$/)) {
			return true;
		}
		
		if(m = msg.match(/^SEEK_CANCELED (\d+)$/)){
			C4.debug(msg);
			var seekId = +m[1];
			C4.remove_my_seek(seekId);
			return true;
		}
		
		if(msg.match(/^NO_SEEK_FOUND (\d+)$/)){
			C4.debug(msg);
			return  true;
		}
		if (msg.match(/^NO_GAMES$/)){
			$.mobile.changePage($("#main"));
			return true;
		}
		return false;
	},
	quit_game : function() {
		if(C4.gameId){
			C4.sock.send("QUIT_GAME "+C4.gameId);
		}
	},
	seek : function(gType) 
	{
		var boardSize = $("input[type='radio'][name='board-size']:checked").val();
		var gVar = $("input[type='radio'][name='game-variation']:checked").val();
		var cmd = "SEEK "+gType+" C4 "+gVar+" "+boardSize;
		C4.debug(cmd);
		C4.sock.send(cmd);
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
			});
		$(".my-seeks").append(seekBtn).trigger("create");
		$("#my-seeks-title").text("Your seeks");
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
			});
		$(".seek-list").append(seekBtn).trigger("create");
		$("#seeks-title").text("Seeks from others");
	},
	remove_seek: function(seekid){
		$(".seek-list > div").has("button[id=seek_"+seekid+"]").remove();
		if ($(".seek-list > div").length == 0)
			$("#seeks-title").text("No seeks from others");
	},
	remove_my_seek: function(seekid){
		$(".my-seeks > div").has("button[id=seek_"+seekid+"]").remove();
		if ($(".my-seeks > div").length == 0)
			$("#my-seeks-title").text("No seeks from you");
	},
	clear_seeks: function() {
		$(".seek-list, .my-seeks").empty();
		$("#seeks-title").text("No seeks from others");
		$("#my-seeks-title").text("No seeks from you");
	},
	cb_new_game: function(msg) {
		var newGame = msg.match(/^GAME (\d+) C4 (STD|POP) (\d+)x(\d+) (Y|O) (1|2) (NEW|BOARD (.+))$/);
		if (newGame) {
			var gameId = newGame[1];
			C4.gameId = C4.padId(gameId);
			C4.gameVar = newGame[2];
			var w = +newGame[3];
			var h = +newGame[4];
			C4.turn = newGame[5];
			C4.gameStatus(C4.turn == "Y" ? "Your move" : "Waiting for move");
			C4.color = +newGame[6];
			C4.otherColor = 3-C4.color;
			C4.otherConnected = true;
			$(".you-are img").attr({src: "images/piece"+C4.color+"_small.png"});
			
			C4.board = new C4Board({cols:w,rows:h,board:C4.boardEl});
			C4.board.render();
			C4.clear_seeks();
			
			var boardSpec = newGame[8];
			if (boardSpec){
				var rows = boardSpec.replace(/^{{|}}$/g,"").split(/},{/);
				for(var r=1;r<=rows.length;++r){
					var cols = rows[r-1].split(/,/);
					for(var c=1;c<=cols.length;++c){
						var piece = cols[c-1];
						C4.board.setpiece(c, r, piece);
						C4.board.updateCell(c,r);
					}
				}
			}
			
			var re_other_dropped = new RegExp("^OTHER_PLAYED "+gameId+" DROP (\\d+)$");
			var re_other_dropped_won = new RegExp("^OTHER_WON "+gameId+" DROP (\\d+)$");
			var re_other_draw = new RegExp("^OTHER_DRAW "+gameId+" DROP (\\d+)$");
			var re_other_quit = new RegExp("^OTHER_QUIT "+gameId+"$");
			var re_other_disconnected = new RegExp("^OTHER_DISCONNECTED "+gameId+"$");
			var re_other_returned = new RegExp("^OTHER_RETURNED "+gameId+"$");
			var re_you_dropped = new RegExp("^PLAY_OK "+gameId+" DROP (\\d+)$");
			var re_you_win = new RegExp("^YOU_WIN "+gameId+" DROP (\\d+)$");
			var re_draw = new RegExp("^DRAW "+gameId+" DROP (\\d+)$");
			var re_invalid_move = new RegExp("^INVALID_MOVE "+gameId+"$");
			var re_leaving_game = new RegExp("^LEAVING_GAME "+gameId+"$");
			
			var in_game_handler  = function(){}; // init in 2 steps to remove Eclipse warning. argh.
			in_game_handler = function(msg){
				var m;
				if (msg.match(re_leaving_game)){
					C4.gameId = null;
					C4.remove_handler(in_game_handler);
					return true;
				}
				if (m = msg.match(re_you_dropped)) {
					var col = +m[1];
					C4.board.drop(col,C4.color);
					C4.gameStatus("Waiting for move");
					C4.turn = "O";
					return true;
				}
				if (m = msg.match(re_you_win)) {
					var col = +m[1];
					C4.board.drop(col,C4.color);
					C4.gameId = null;
					C4.gameStatus("You won!!");
					return true;
				}
				if (m = msg.match(re_draw)) {
					var col = +m[1];
					C4.board.drop(col,C4.color);
					C4.gameId = null;
					C4.gameStatus("It is a draw");
					return true;
				}
				if (m = msg.match(re_other_draw)) {
					var col = +m[1];
					C4.board.drop(col,C4.otherColor);
					C4.gameId = null;
					C4.gameStatus("It is a draw");
					return true;
				}
				if (m = msg.match(re_other_dropped)) {
					var col = +m[1];
					C4.board.drop(col, C4.otherColor);
					C4.gameStatus("Your move");
					C4.turn = "Y";
					return true;
				}
				if (m = msg.match(re_other_dropped_won)) { 
					var col = +m[1];
					C4.board.drop(col, C4.otherColor);
					C4.gameStatus("You have lost");
					C4.remove_handler(in_game_handler);
					C4.turn = "Y";
					C4.gameId = null;
					return true;
				}
				if (m = msg.match(re_other_no_moves)) {
					var col = +m[1];
					C4.board.drop(col,C4.otherColor);
					C4.gameId = null;
					C4.gameStatus("No more moves");
					return true;
				}
				if (m = msg.match(re_other_quit)) {
					C4.gameStatus("Other player quit");
					C4.remove_handler(in_game_handler);
					C4.gameId = null;
					C4.turn = null;
					return true;
				}
				if (m = msg.match(re_other_disconnected)) {
					C4.gameStatus("Other disconnected");
					C4.otherConnected = false;
					return true;
				}
				if (m = msg.match(re_other_returned)) {
					C4.gameStatus(C4.turn == "Y" ? "Your move" : "Waiting for move");
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
			$.mobile.changePage($("#game"), {changeHash:false});
			return true;
		} else
			return false;
	},
	canPlay : function() {
		return C4.gameId && C4.otherConnected && C4.turn == "Y";
	},
	play : function(col) {
		if (C4.canPlay()){
			C4.sock.send("PLAY "+C4.gameId+" DROP "+col);
			C4.debug("Sending move");
		}
	}
};
