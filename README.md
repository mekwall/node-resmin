# resmin
	
All-in-one minifier/merger/compressor middleware for connect/express.

## Installation

	$ npm install resmin
    
## Dependencies

- [uglify-js](https://github.com/mishoo/UglifyJS)
- [uglifycss](https://github.com/fmarcia/UglifyCSS)
- [compress](https://github.com/waveto/node-compress)
- [mime](https://github.com/bentomas/node-mime)

## Basic usage

Example configuration:

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
    
Instantiate resmin and add the middleware and dynamic helper to connect/express.
    
    var resmin = require('resmin');
	app.use(resmin.middleware(__dirname+'/public/', resminConfig));
    app.dynamicHelpers(resmin.dynamicHelper);

The resmin variable is now accessible through your template engine of choice.

Example when using jade:

    - each url in resmin.css.all
      link(rel='stylesheet', href=url)
    - each url in resmin.js.all
      script(src=url)
      
## Additional credits

Credits and thanks to [tomgallacher](https://github.com/tomgallacher) for [gzippo](https://github.com/tomgallacher/gzippo) and 
[bengourley](https://github.com/bengourley) for [minj](https://github.com/bengourley/minj) which resmin is loosely based upon.