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

var outputJS = {},
    outputCSS = {},
    gzipJS = {},
    gzipCSS = {},
    staticSend;
    
try {
	staticSend = require('connect').static.send
} catch (e) {
	staticSend = require('express').static.send
}

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
        files = [],
        current = 0,
        end = 0,
        self = this,
        processor;
        
    this.outputNames = false;
    
    var concat = function(append){
        if (append)
            if (self.outputNames)
                str += "/* "+files[current].split("/").pop()+" */" + append + "\n";
            else
                str += append;
        current++;
        if (current == end)
            return self.writeFile();
        self.readFile(files[current], processor);
    }
    
    this.addFile = function(file) {
        files.push(file);
    }
    
    this.readFile = function(file, next) {    
        var contentType = mime.lookup(file),
            charset = mime.charsets.lookup(contentType) || 'utf-8';
        fs.readFile(file, charset, function (err, str) {
            if (err) {
                console.log(err);
            } else {
                next(str, concat);
            }
        });
    }
    
    this.writeFile = function() {
        var gzip = new compress.Gzip();
        gzip.init();
        var gzippedData = gzip.deflate(str, 'utf8') + gzip.end();
        fs.writeFile(output, str, 'utf8', function (err) {
            if (err) {
                console.log(err);
            } else {
                fs.writeFile(output+'.gz', gzippedData, 'binary', function (err) {
                    if (err) console.log(err);
                });
            }
        });
    }
    
    this.process = function(pc) {
        processor = pc;
        end = files.length;
        if (pc && end)
            this.readFile(files[current], processor);
    }
};

var minifyJS = function(str, concat) {
    try {
        var ast = parser.parse(str);
        ast = uglifyjs.ast_mangle(ast, { except: ["$"] });
        ast = uglifyjs.ast_squeeze(ast);
        concat(uglifyjs.gen_code(ast)+";");
    } catch (ex) {
        concat(str);
    }
}

var minifyCSS = function(str, concat) {
    concat(uglifycss.processString(str)+"\n");
}

module.exports.middleware = function(dirPath, options) {
    options = options || {};
    var gzip = options.js || true,
        js = options.js || {},
        css = options.css || {},
        merge = options.merge || true,
        minify = options.minify || true,
        maxAge = options.maxAge || 86400000,
        outputNames = options.outputNames || false;

	contentTypeMatch = options.contentTypeMatch || /text|javascript|json/;
    if (!dirPath) throw new Error('Missing static directory path');
	if (!contentTypeMatch.test) throw new Error('contentTypeMatch: must be a regular expression.');
    
    for (var group in js) {
        outputJS[group] = [];
        gzipJS[group] = [];
        var name = dirPath+'/js/'+group+'.min.js',
            jsMerge = new Merger(name);
        js[group].forEach(function (file, i){
            // if no merge/minify or if file is an uri
            if ((!merge && !minify) || file.match(/^(http[s]?:\/\/|\/\/)/i)) {
                gzipJS[group].push(file);
                outputJS[group].push(file);
                return;
            }
            if (merge) {
                jsMerge.addFile(dirPath+file);
            }
        });
        if (merge) {
            gzipJS[group].push('/js/'+group+'.min.js.gz');
            outputJS[group].push('/js/'+group+'.min.js');
            jsMerge.process(
                minify ? 
                minifyJS : 
                function(str, concat) {
                    return concat(str); 
                }
            );
        }
    }
    
    for (var group in css) {
        outputCSS[group] = [];
        gzipCSS[group] = [];
        var name = dirPath+'/css/'+group+'.min.css',
            cssMerge = new Merger(name);
        css[group].forEach(function (file, i) {
            if ((!merge && !minify) || file.match(/^(http[s]?:\/\/|\/\/)/)) {
                gzipCSS[group].push(file);
                outputCSS[group].push(file);
                return;
            }
            if (merge) {
                cssMerge.addFile(dirPath+file);
            }
        });
        if (merge) {
            gzipCSS[group].push('/css/'+group+'.min.css.gz');
            outputCSS[group].push('/css/'+group+'.min.css');
            cssMerge.process(
                minify ?
                minifyCSS :
                function(str, concat) {
                    return concat(str+"\n");
                }
            );
        }
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
        
        if (filename.substring(filename.length-3) === '.gz') {
            contentType = mime.lookup(filename.substring(0, filename.length-3));
            charset = mime.charsets.lookup(contentType);
            fs.readFile(filename, function (err, data) {
                if (err) throw err;
                sendGzipped(data);
            });
        } else {
        
            if (!gzip)
                return pass(filename);

            if (!contentTypeMatch.test(contentType))
                return pass(filename);
            
            if (!~acceptEncoding.indexOf('gzip'))
                return pass(filename);
            
            function pass(name) {
                var o = Object.create(options);
                o.path = name;
                staticSend(req, res, next, o);
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
        }
    }
}

module.exports.dynamicHelper = {
    resmin: function(req, res) {
        var acceptEncoding = req.headers['accept-encoding'] || '';
        return !~acceptEncoding.indexOf('gzip') ?
            { 
                js: outputJS,
                css: outputCSS
            } :
            { 
                js: gzipJS,
                css: gzipCSS
            };
    }
}

