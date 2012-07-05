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
		this.el.append(board);	
	};
}

var C4 = {
	statusEl : null,
	sock : null,
	board : null,
	gameId : null,
	playerId : null,
	handlers : [],
	init : function(args)
	{
		args = args || {};
		this.statusBar = args.statusBar || $(".c4status");
		this.board = new C4Board(args);
		this.board.render();
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
		this.statusBar.text(msg);
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
		var newGame = msg.match(/^GAME (\d+) C4 (STD|POP) ([0-9]+)x([0-9]+) (Y|O) (1|2) NEW$/);
		if (newGame) {
			//var gameVar = newGame[1];
			//var w = +newGame[2];
			//var h = +newGame[3];
			C4.gameId = C4.padId(newGame[4]);
			C4.playerId = C4.padId(newGame[5]);
			C4.remove_handler(C4.cb_seek_pending);
			C4.remove_handler(C4.cb_new_game);
			var turn = newGame[6];
			//var color = +newGame[7];
			if (turn == "Y") {
				this.status("New game : Your turn!");
				this.onmessage = this.cb_my_turn;
			} else {
				this.status("New game : Wait for opponent to play");
				this.onmessage = this.cb_other_turn;
			}
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
	play : function(col) {
		if (this.onmessage == this.cb_my_turn){
			if (this.board.drop(col,1)) {
				this.sock.send("PLAY "+C4.gameId+" "+col);
				this.onmessage = this.cb_play;
				this.status("Sending move");
			}
		}
	},
	cb_play : function(msg) {
		if (msg == "PLAY_OK" ){
			this.status("Waiting for other player");	
			this.onmessage = this.cb_other_turn;
		} else if(msg == "YOU_WIN" ){
			this.status("You win!!");
			this.onmessage = this.cb_idle;
		} else 
			this.unexpected(msg);
	},
	cb_other_turn: function(msg){
		// OTHER_PLAY N, OTHER_WON
		var won = msg.match(/^OTHER_WON ([1-9])$/);
		var played = msg.match(/^OTHER_PLAYED ([1-9])$/); 
		if (won){
			var col = +won[1];
			this.board.drop(col, 2);
			this.status("You lose!!");
			this.onmessage = this.cb_idle;
		} else if(played) { 
			var col = +played[1];
			this.board.drop(col, 2);
			this.status("Your turn");
			this.onmessage = this.cb_my_turn;
		} else
			this.unexpected(msg); 
	},
	cb_my_turn : function(msg){
		if (msg.match(/^OTHER_QUIT^/)){
			this.status("Other player quit");
			this.onmessage = this.cb_idle;
		} else
			this.unexpected(msg); 
	}
	
};
