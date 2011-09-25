var fs = require('fs'),
    basename = require('path').basename,
    join = require('path').join,
    parse = require('url').parse,
    path = require('path'),
    mime = require('mime'),
    compress = require('compress'),
    parser = require("uglify-js").parser,
    uglifyjs = require("uglify-js").uglify,
    uglifycss = require("uglifycss");

var output = {
        plain: {
            js: {},
            css: {}
        },
        gzip: {
            js: {},
            css: {}
        }
    },
    gzip,
    merge,
    minify;

try {
    var less = require('less');
} catch (e) { }

try {
    var stylus = require('stylus');
} catch (e) { }

var gzipFileCache = {};

var gzipFile = function(filename, charset, callback) {
	var gzip = new compress.Gzip();
	gzip.init();
	fs.readFile(filename, function (err, data) {
		if (err) throw err;
		var gzippedData = gzip.deflate(data, charset) + gzip.end();
		callback(gzippedData);
	});
};

var Merger = function (output) {
    var str = "",
        input = [],
        current = 0,
        end = 0,
        self = this,
        processor;
        
    this.outputNames = false;
    
    var concat = function (append){
        if (append)
            if (self.outputNames)
                str += "/* "+input[current].split("/").pop()+" */" + append + "\n";
            else
                str += append;
        current++;
        if (current == end)
            return self.writeFile();
        self.readInput(input[current], processor);
    }
    
    this.addInput = function (inp) {
        input.push(inp);
    }
    
    this.readInput = function (input, next) {    
        if (input.match(/(.*)[\/\\]([^\/\\]+\.\w+)$/)) {
            var contentType = mime.lookup(input),
                charset = mime.charsets.lookup(contentType) || 'utf-8';
            fs.readFile(input, charset, function (err, str) {
                if (err) {
                    console.log(err);
                } else {
                    next(str, concat);
                }
            });
        } else {
            next(input, concat);
        }
    }
    
    this.writeFile = function () {
        str = str.trim();
        fs.writeFile(output.replace(/.gz$/, ""), str, 'utf8', function (err) {
            if (err) {
                console.log(err);
            } else if (gzip) {
                var cmp = new compress.Gzip();
                cmp.init();
                var gzippedData = cmp.deflate(str, 'utf8') + cmp.end();
                fs.writeFile(output, gzippedData, 'binary', function (err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }
        });
    }
    
    this.process = function (pc) {
        processor = pc;
        end = input.length;
        if (pc && end) {
            this.readInput(input[current], processor);
        }
    }
};

var minifyJS = function (str, concat) {
    try {
        var ast = parser.parse(str);
        ast = uglifyjs.ast_mangle(ast, { except: ["$"] });
        ast = uglifyjs.ast_squeeze(ast);
        concat(uglifyjs.gen_code(ast)+";");
    } catch (ex) {
        console.log(ex);
        concat(str);
    }
}

var minifyCSS = function (str, concat) {
    concat(uglifycss.processString(str)+"\n");
}

module.exports.middleware = function (backend, dirPath, options) {
    options = options || {};
    var groups = {},
        maxAge = options.maxAge || 86400000,
        outputNames = options.outputNames || false,
		compileLess = backend.compiler({ src: dirPath, enable: ['less']}),
		staticSend = backend.static(dirPath);
		
    groups.js = options.js || {};
    groups.css = options.css || {};
 
    gzip = options.gzip ? true : false;
    merge = options.merge ? true : false;
    minify = options.minify ? true : false;
	
	if (stylus) {
		if (options.stylus) {
			stylus.use(options.stylus);
		}
	}
	
	contentTypeMatch = options.contentTypeMatch || /text|javascript|json/;
    if (!dirPath) throw new Error('Missing static directory path');
	if (!contentTypeMatch.test) throw new Error('contentTypeMatch: must be a regular expression.');
    
    function processGroup(group, type, processor) {
        var out = [], ext, subDir;
        switch (type) {
            case 'js':
                ext = 'js';
                subDir = 'js';
            break;
            
            case 'css':
                ext = type;
                var outputExt = 'css';
                subDir = 'css';
            break;
        }
        
        var name = '/'+subDir+'/'+group+'.min.'+(outputExt || ext)+(gzip && '.gz'),
            merger = new Merger(dirPath+name);

        groups[type][group].forEach(function (file, i){
            // if no merge/minify or if file is an uri
            if ((!merge && !minify) || file.match(/^(http[s]?:\/\/|\/\/)/i)) {
                out.push(file);
                return;
            }
        
            var ext = file.split(".").pop();
			if (merge) {
				if (ext === 'less' && less) {
					var data = fs.readFileSync(dirPath+file, 'utf8'),
						lessParser = new(less.Parser)({
							paths: [dirPath+'/css'],
							filename: file
						});
					lessParser.parse(data, function (err, tree) {
						if (err) throw err;
						merger.addInput(tree.toCSS());
					});
				} else if (ext === 'styl' && stylus) {
					var data = fs.readFileSync(dirPath+file, 'utf8');
					stylus.render(data, { filename: dirPath+file }, function(err, css){
						if (err) throw err;
						merger.addInput(css);
					});
				} else {
					merger.addInput(dirPath+file);
				}
			}
        });
        
        if (merge) {
            out.push(name);
            merger.process(processor);
        }
        
        if (gzip) {
            output.gzip[type][group] = out;
        }
        output.plain[type][group] = out;
    }
    
    for (var group in groups.js) {
        processGroup(
            group,
            'js',
            minify ? minifyJS : 
                function(str, concat) {
                    return concat(str); 
                }
        );
    }
    
    for (var group in groups.css) {
        processGroup(
            group,
            'css',
            minify ? minifyCSS : 
                function(str, concat) {
                    return concat(str+"\n");
                }
        );
    }

    return function middleware(req, res, next) {
        if (req.method !== 'GET')
            return next();

        var url, filename, contentType, acceptEncoding, charset;
        url = parse(req.url);
		filename = path.join(dirPath, url.pathname);
		contentType = mime.lookup(filename);
		charset = mime.charsets.lookup(contentType);
		acceptEncoding = req.headers['accept-encoding'] || '';
		
		function etag(req, res, file, callback) {
			fs.stat(file, function(err, stat) {
				if (err || !stat.isFile() || stat.isDirectory())
					throw err;

				// create etag and compare
				var etag = '"' + stat.ino + '-' + stat.size + '-' + Date.parse(stat.mtime) + '"',
					ifMatch = req.headers['if-match'] || req.headers['if-none-match'];
					
				if (ifMatch == etag) {
					res.send(304);
					return;
				}
				
				// check modified since
				var ifModifiedSince = req.headers['if-modified-since'];
				if (ifModifiedSince) {
					var req_date = new Date(ifModifiedSince);
					if (stat.mtime <= req_date && req_date <= Date.now()) {
						res.send(304);
						return;
					}
				}
				
				// no etag/modified since or file have been modified
				res.setHeader('ETag', etag);
				res.setHeader('Last-Modified', stat.mtime);
				return callback(stat);
			});
		}
		
		function renderCSS(req, res, file, ext) {
			etag(req, res, file, function(){
				var data = fs.readFileSync(file, "utf8"),
					parser,
					fn,
					args = [data];
				
				if (ext === "less") {
					parser = new(less.Parser)({
						paths: [dirPath+"/css"],
						filename: file
					});
					fn = "parse";
				} else if (ext === "styl") {
					parser = stylus;
					args.push({
						filename: file
					});
					fn = "render";
				}
				args.push(function (err, css) {
					if (err) throw err;
					res.header("Content-Type", "text/css");
					res.send(ext === "less" ? css.toCSS() : css);
				});
				parser[fn].apply(parser, args);
			});
		}
		
		function pass(file) {
			var ext = file.split(".").pop();
			switch (ext) {
				case "styl":
				case "less":
					renderCSS(req, res, file, ext);
				break;

				default:
					var o = Object.create(options);
					o.path = filename;
					staticSend(req, res, next, o);
			}
		}
		
		function sendGzipped(data) {
			contentType = contentType + (charset ? '; charset=' + charset : '');
			res.setHeader('Content-Type', contentType);
			res.setHeader('Content-Encoding', 'gzip');
			res.setHeader('Vary', 'Accept-Encoding');	
			res.setHeader('Content-Length', data.length);
			res.end(data, 'binary');
		}
		
		function gzipAndSend(filename, gzipName, mtime) {
			gzipFile(filename, charset, function(gzippedData) {
				gzipFileCache[gzipName] = {
					'ctime': Date.now(),
					'mtime': mtime,
					'content': gzippedData
				};
				sendGzipped(gzippedData);
			});	
		}
		        
        if (filename.substring(filename.length-3) === '.gz') {
            contentType = mime.lookup(filename.substring(0, filename.length-3));
            charset = mime.charsets.lookup(contentType);
			etag(req, res, filename, function(stat){
				fs.readFile(filename, function (err, data) {
					if (err) throw err;
					sendGzipped(data);
				});
			});
        } else {
			// Pass file directly
            if (!gzip || !contentTypeMatch.test(contentType) || !~acceptEncoding.indexOf('gzip'))
                return pass(filename);
			
			/*
            fs.stat(filename, function(err, stat) {
                if (err || stat.isDirectory()) {
                    return pass(filename);	
                }
                var base = path.basename(filename),
                    dir = path.dirname(filename),
                    gzipName = path.join(dir, base + '.gz');
                
                if (typeof gzipFileCache[gzipName] === 'undefined') {
                    gzipAndSend(filename, gzipName, stat.mtime);
                } else {
                
                if ((gzipFileCache[gzipName].mtime < stat.mtime) || 
                    ((gzipFileCache[gzipName].ctime + maxAge) < Date.now())) {
                        gzipAndSend(filename, gzipName, stat.mtime);
                    } else {
                        sendGzipped(gzipFileCache[gzipName].content);
                    }
                }
            });
			*/
			next();
        }
    }
}

module.exports.dynamicHelper = {
    resmin: function(req, res) {
        var acceptEncoding = req.headers['accept-encoding'] || '';
        return (!~acceptEncoding.indexOf('gzip') || !gzip || !output.gzip) ? 
            output.plain : output.gzip;
    }
}

