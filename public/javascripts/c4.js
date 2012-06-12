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
	}
	this.piece = function(col, row){
		return this.slots[col-1][row-1];
	}
	this.setpiece = function(col, row, val){
		this.slots[col-1][row-1] = val;
	}
	this.updateCell = function(col, row) {
		$("#c4cellimg_"+col+"_"+row, this.el).attr("src", this.pieceImg[this.piece(col, row)]);			
	}
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
	}
}

var C4 = {
	statusEl : null,
	sock : null,
	board : null,
	init : function(args){
		args = args || {};
		this.statusBar = args.statusBar || $(".c4status");
		this.board = new C4Board(args);
		this.board.render();
		this.onmessage = this.cb_idle;
	},
	connect : function(url) {
		if ("MozWebSocket" in window) {
			WebSocket = MozWebSocket;
		}
		if ("WebSocket" in window) {
			// browser supports websockets
			var ws = new WebSocket("ws://"+url);
			ws.onopen = function() {
				// websocket is connected
				C4.status("Connected to server");
			};
			ws.onmessage = function (evt) {
				var receivedMsg = evt.data;
				C4.onmessage(receivedMsg);
			};
			ws.onclose = function() {
				// websocket was closed
				C4.status("Connection was closed by server");
			}
			this.sock = ws;
		} else {
			// browser does not support websockets
			this.status("sorry, your browser does not support websockets.");
		}
	},
	status : function(msg) {
		this.statusBar.text(msg);
	},
	send : function(msg, cb) {
		this.sock.send(msg);
		this.onmessage = cb;
	},
	onmessage : function(msg) {
		alert("Unexpected message from server : "+msg);
	},
	unexpected : function(msg) {
		this.status("Unexpected message from server : "+msg);
	},
	join : function() {
		if (this.onmessage == this.cb_idle) {
			this.sock.send("JOIN");
			this.onmessage = this.cb_join;
		}
	},
	cb_join : function(msg) {
		if ( msg == "JOIN_PENDING" ){
			this.status("Waiting for another player");
			this.onmessage = this.cb_join_wait;
		} else
			this.cb_join_wait(msg);
	},
	cb_join_wait : function(msg) {
		if (msg == "NEW_GAME_PLAY"){
			this.status("New game : Your turn!");
			this.onmessage = this.cb_my_turn;
		} else if(msg == "NEW_GAME_WAIT"){
			this.status("New game : Wait for opponent to play");
			this.onmessage = this.cb_other_turn;
		} else
			this.unexpected(msg);
	},
	cancel_join : function() {
		this.sock.send("CANCEL_JOIN");
		this.onmessage = this.cb_cancel_join;
	},
	cb_cancel_join : function(msg) {
	},
	play : function(col) {
		if (this.onmessage == this.cb_my_turn){
			if (this.board.drop(col,1)) {
				this.sock.send("PLAY "+col);
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
	
}
