var fs = require('fs'),
    basename = require('path').basename,
    join = require('path').join,
    parse = require('url').parse,
    path = require('path'),
    mime = require('mime'),
    Flow = require('gowiththeflow'),
    gzip = require('gzip-js'),
    parser = require("uglify-js").parser,
    uglifyjs = require("uglify-js").uglify,
    csso = require('csso');

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
    try {
        var nib = require('nib');
    } catch (e) { }
} catch (e) { }

var gzipFileCache = {};

var gzipFile = function(filename, charset, callback) {
    var stat = fs.statSync(filename);
    fs.readFile(filename, function (err, data) {
        if (err) throw err;
        var gzippedData = gzip.zip(data, {
            name: filename,
            level: 9,
            timestamp: parseInt(Math.round(stat.mtime.getTime() / 1000))
        });
        callback(new Buffer(gzippedData));
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
        if (current === end)
            return self.writeFile();
        self.readInput(input[current], processor);
    }
    
    this.addInput = function (inp) {
        input.push(inp);
    }
    
    this.readInput = function (input, next) {
        if (input && input.match(/(.*)[\/\\]([^\/\\]+\.\w+)$/)) {
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
        var filename = output.replace(/.gz$/, "");
        fs.writeFile(filename, str, 'utf8', function (err) {
            if (err) {
                console.log(err);
            } else if (gzipit) {
                var stat = fs.statSync(filename);
                var gzippedData = gzip.zip(str, {
                    name: filename,
                    level: 9,
                    timestamp: parseInt(Math.round(stat.mtime.getTime() / 1000))
                });
                fs.writeFile(output, new Buffer(gzippedData), 'binary', function (err) {
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
    } catch (e) {
        console.log(e);
        concat(str);
    }
}

var minifyCSS = function (str, concat) {
    try {
        concat(csso.justDoIt(str)+"\n");
    } catch (e) {
        console.log(e);
        //concat(str);
        throw Error("BOO!");
    }
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
 
    gzipit = options.gzip ? true : false;
    merge = options.merge ? true : false;
    minify = options.minify ? true : false;
    
    if (stylus) {
        if (options.stylus)
            stylus.use(options.stylus);
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
        
        var name = '/'+subDir+'/'+group+'.min.'+(outputExt || ext)+(gzipit ? '.gz' : ''),
            merger = new Merger(dirPath+name);

        var flow = Flow();

        groups[type][group].forEach(function(file) {
            flow.seq(function(next) {
                // if no merge/minify or if file is an uri
                if ((!merge && !minify) || file.match(/^(http[s]?:\/\/|\/\/)/i)) {
                    out.push(file);
                    if (gzipit) {
                        output.gzip[type][group] = out;
                    }
                    output.plain[type][group] = out;
                    return;
                }

                try {
                    var stat = fs.statSync(dirPath+file);
                } catch (e) {
                    console.log("resmin: File "+dirPath+file+" does not exist");
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
                            next();
                        });
                    } else if (ext === 'styl' && stylus) {
                    
                        var data = fs.readFileSync(dirPath+file, 'utf8'),
                            renderer = stylus(data)
                                .set('filename', dirPath+file)
                                .set('compress', true);

                        /*
                        if (process.env.NODE_ENV != "production")
                            renderer.set('firebug', true);
                            */
                            
                        if (nib)
                            renderer.use(nib());
                            
                        renderer.render(function(err, css){
                            if (err) throw err;
                            if (!css)
                                console.log(file);
                            merger.addInput(css);
                            next();
                        });
                        
                    } else {
                        merger.addInput(dirPath+file);
                        next();
                    }
                } else {
                    next();
                }
            });
        });

        flow.seq(function(next){
            if (merge) {
                if (out.indexOf(name) === -1)
                    out.push(name);
                merger.process(processor);
            }
            if (gzipit) {
                output.gzip[type][group] = out;
            }
            output.plain[type][group] = out;
        });
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
                    return;

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
                    renderer,
                    callback = function (err, css) {
                        if (err) throw err;
                        res.header("Content-Type", "text/css");
                        res.send(ext === "less" ? css.toCSS() : css);
                    };
                if (ext === "less") {
                    renderer = new(less.Parser)({
                        paths: [dirPath+"/css"],
                        filename: file
                    }).parse(data, callback);
                } else if (ext === "styl") {
                    renderer = stylus(data)
                        .set("filename", file);
                    //if (process.env.NODE_ENV != "production")
                    //    renderer.set('firebug', true);
                    if (nib)
                        renderer.use(nib());
                    renderer.render(callback);
                }
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
            if (!gzipit || !contentTypeMatch.test(contentType) || !~acceptEncoding.indexOf('gzip'))
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
        return (!~acceptEncoding.indexOf('gzip') || !gzipit || !output.gzip) ? 
            output.plain : output.gzip;
    }
}

