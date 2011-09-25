# resmin
	
All-in-one minifier/merger/compiler/compressor middleware for connect/express.

## Installation

```bash
$ npm install resmin
```

## Dependencies

Resmin depends on the following libraries:

- [uglify-js](https://github.com/mishoo/UglifyJS)
- [uglifycss](https://github.com/fmarcia/UglifyCSS)
- [compress](https://github.com/waveto/node-compress)
- [mime](https://github.com/bentomas/node-mime)

## Supported

Resmin has integrated support for the the following libraries:

- [stylus](http://learnboost.github.com/stylus/)
- [less](https://github.com/cloudhead/less.js)

## Basic usage

Resmin is built to be dead simple to use and implement.

###Example configuration:

```javascript
var resminConfig = {
    gzip: true,
    merge: true,
    compress: true,
    js: {
        "all": [
            "//ajax.googleapis.com/ajax/libs/jquery/1.6.2/jquery.min.js",
            "//ajax.googleapis.com/ajax/libs/jqueryui/1.8.14/jquery-ui.min.js",
            "/js/foo.js",
            "/js/bar.js",
            "/js/baz.js"
        ]
    },
    css: {
        "all": [
            "//fonts.googleapis.com/css?family=Inconsolata:regular&v1",
            "/css/foo.css",
            "/css/bar.css",
            "/css/baz.css"
        ]
    }
};
```
    
Instantiate resmin and add the middleware and dynamic helper to connect/express.
    
    var resmin = require('resmin');
	app.use(resmin.middleware(express, __dirname+'/public/', resminConfig));
    app.dynamicHelpers(resmin.dynamicHelper);

The resmin variable is now accessible through your template engine of choice.

###Example when using jade/haml:

```yaml
- each url in resmin.css.all
  link(rel='stylesheet', href=url)
- each url in resmin.js.all
  script(src=url)
```

###Example when using ejs:

```html
<% for (url in resmin.css.all) { %>
    <link rel="stylesheet" href="<%= resmin.css.all[url] %>">
<% } %>
<% for (url in resmin.js.all) { %>
    <script src="<%= resmin.js.all[url] %>"></script>
<% } %>
```

###Example when using less:

Just add your .less files either to the css group. They will be  
automatically parsed, compiled, merged and compressed according to your settings.

```javascript
var resminConfig = {
    ...
    css: {
        "/css/foo.less",
        "/css/bar.less",
        "/css/baz.less"
    }
}
```

###Example when using stylus:

Just add your .less files either to the css group. They will be
automatically parsed, compiled, merged and compressed according to your settings.

```javascript
var resminConfig = {
    ...
    css: {
        "/css/foo.styl",
        "/css/bar.styl",
        "/css/baz.styl"
    },
	stylus: function(style) {
		// Add your own stylus settings
		return style;
	}
}
```

## License

Copyright (c) 2011 Marcus Ekwall, http://writeless.se/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
      
## Additional credits

Credits and thanks to [tomgallacher](https://github.com/tomgallacher) for 
[gzippo](https://github.com/tomgallacher/gzippo) and [bengourley](https://github.com/bengourley) 
for [minj](https://github.com/bengourley/minj) which resmin is loosely based upon.
