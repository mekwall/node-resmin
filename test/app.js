var tobi = require('tobi'),
    express = require('express'),
    resmin = require('../index'),
    app = express.createServer();

var resminConfig = {
    js: {
        "all": [
            "//ajax.googleapis.com/ajax/libs/jquery/1.6.2/jquery.min.js",
            "//ajax.googleapis.com/ajax/libs/jqueryui/1.8.13/jquery-ui.min.js",
            "/js/foo.js",
            "/js/bar.js",
            "/js/baz.js"
        ]
    },
    css: {
        "all": [
            "//fonts.googleapis.com/css?family=Indie+Flower:regular&v1",
            "//fonts.googleapis.com/css?family=Inconsolata:regular&v1",
            "/css/foo.css",
            "/css/bar.css",
            "/css/baz.less",
			"/css/qux.styl"
        ]
    }
};

app.configure(function(){
    app.use(express.logger());
    app.use(express.bodyParser());
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    resminConfig.merge = true;
    resminConfig.minify = true;
    resminConfig.gzip = true;
    app.use(resmin.middleware(express, __dirname + '/public', resminConfig));
});

app.dynamicHelpers(resmin.dynamicHelper);

app.get('/', function(req, res) {
    res.render('index');
});

var browser = tobi.createBrowser(app);
browser.get('/', function (res, $){
    res.should.have.status(200);
    res.should.not.have.status(500);
    res.should.have.header('Content-Type', 'text/html; charset=utf-8');
    
    var css = $("ul.css"),
        js = $("ul.js");
        
    css.should.have.many("li");
    js.should.have.many("li");
    
	console.log("");
    console.log("CSS files:");
    css.find("li").each(function(i,elm){
        console.log(elm.innerHTML);
    });
    
	console.log("");
    console.log("JavaScript files:");
    js.find("li").each(function(i,elm){
        console.log(elm.innerHTML);
    });
	
	console.log("");
	browser.get("/css/baz.less", function (res, $) {
		res.should.have.status(200);
		res.should.not.have.status(500);
		res.should.have.header('Content-Type', 'text/css');
		console.log("Real-time compilation of LESS: Passed!");
		
		console.log("");
		browser.get("/css/qux.styl", function (res, $) {
			res.should.have.status(200);
			res.should.not.have.status(500);
			res.should.have.header('Content-Type', 'text/css');
			console.log("Real-time compilation of Stylus: Passed!");
			
			console.log("");
			console.log("All tests passed!");
			app.close();
		});
	});
});

