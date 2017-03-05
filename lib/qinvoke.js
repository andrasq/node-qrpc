/**
 * invoke the function with the list of arguments
 * Like func.apply() but much faster
 *
 * Copyright (C) 2015-2016 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

// apply the function to the argument list
// 100m/s, 13m/s apply
// Skylake node-v0.10.42: 122m/s, 34m/s apply
// Skylake node-v7.5.0: 133m/s, 65m/s apply
function invoke( fn, av ) {
    switch (av.length) {
    case 0: return fn()
    case 1: return fn(av[0])
    case 2: return fn(av[0], av[1])
    case 3: return fn(av[0], av[1], av[2])
    default: return fn.apply(null, av)
    }
}

// apply the named method to the argument list
// 60m/s, 16m/s apply
// Skylake node-v0.10.42: 122m/s, 34m/s apply
// Skylake node-v7.5.0: 80m/s, 52m/s apply
function invoke2( obj, name, av ) {
    switch (av.length) {
    case 0: return obj[name]()
    case 1: return obj[name](av[0])
    case 2: return obj[name](av[0], av[1])
    case 3: return obj[name](av[0], av[1], av[2])
    default: return obj[name].apply(obj, av)
    }
};

// apply the method function to the argument list
// 40m/s call, 16m/s apply
// Skylake node-v0.10.42: 96m/s, 34m/s apply
// Skylake node-v7.5.0: 120m/s, 64m/s apply
function invoke2f( obj, fn, av ) {
    switch (av.length) {
    case 0: return fn.call(obj)
    case 1: return fn.call(obj, av[0])
    case 2: return fn.call(obj, av[0], av[1])
    case 3: return fn.call(obj, av[0], av[1], av[2])
    default: return fn.apply(obj, av)
    }
}

module.exports = {
    invoke: invoke,
    invoke2: invoke2,
    invoke2f: invoke2f,

    // XXX direct call is 60% faster than indirecting through here
    // XXX 123ms vs 92ms 33% faster if correct number of arguments passed to function (123 when expects 3, got 2)
    // XXX 343ms vs 130ms *much* slower to invoke if testing !arguments[2] and is not provided
    invokeAny: function invokeAny( fn, obj, av ) {
        if (av) return (typeof fn === 'function') ? invoke2f(obj, fn, av) : invoke2(obj, fn, av);
        else return invoke(fn, obj);
        //if (arguments[2]) return (typeof arguments[0] === 'function') ? invoke2f(arguments[1], arguments[0], arguments[2]) : invoke2(arguments[1], arguments[0], arguments[2]);
        //else return invoke(arguments[0], arguments[1]);
    },

    invoke2Any: function invoke2Any( fn, obj, av ) {
        return typeof fn === 'function' ? invoke2f(obj, fn, av) : invoke2(obj, fn, av);
    },

    /*
     * Intercept calls to the function or method and redirect them to the handler.
     * To just return the arguments, use interceptCall(null, null, function(fn, obj, av){ return av })
     */
    interceptCall: function interceptCall( method, object, handler ) {
        if (!handler && typeof object === 'function' ) { handler = object ; object = null }
        if (!handler) throw new Error("handler function required");

        return function callIntercepter( ) {
            var args;

            switch (arguments.length) {
            case 0: args = []; break;
            case 1: args = [arguments[0]]; break;
            case 2: args = [arguments[0], arguments[1]]; break;
            case 3: args = [arguments[0], arguments[1], arguments[2]]; break;
            default:
                args = new Array();
                for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
                break;
            }

            // if not specified, use the `this` that the intercept is attached to
            var self = object ? object : this;
            // return the callback result so it can work synchronously too
            return handler(method, self, args);
        }
    },

    /*
     * thunkify the function or method or named method
     *
     * Thunkify splits a function into two:  one to just save the arguments (no callback),
     * and one to run apply the function to the pre-saved arguments and newly provided callback.
     * E.g., stream.write(string, encoding, callback) becomes
     *     var streamWrite = thunkify('write', stream);
     *     var thunk = streamWrite("test message", 'utf8');
     *     // ...
     *     thunk(function(err, ret) {
     *         // wrote "test message"
     *     });
     */
    thunkify: function thunkify( method, object ) {
        var invoke1, invoke2;
        if (object) {
            invoke2 = typeof method === 'function' ? module.exports.invoke2f : module.exports.invoke2;
        }
        else {
            invoke1 = module.exports.invoke;
            if (typeof method !== 'function') method = global[method];
            if (!method) throw new Error("unable to find method");
        }

        // return a function that saves its arguments and will return a function that
        // takes a callback that will invoke the saved arguments plus callback
        return interceptCall(method, object, saveArguments);

        function saveArguments( method, self, args ) {
            // reserve space for the callback, allow the thunk to be invoked multiple times
            args.push(null);

            return function invokeThunk(cb) {
                args[args.length - 1] = cb;
                // thunk caller must catch errors thrown by the method (or the callback)
                return self ? invoke2(self, method, args) : invoke1(method, args);
            }
        }
    },

    // thunkify the function
    thunkify2a:
    function thunkify( func ) {
        return module.exports.thunkify2b('fn', {fn: func});
    },

    // thunkify the named method of the object
    // Can thunkify methods either by name or by value.
    // Unlike `thunkify`, calling the callback more than once is an error.
    // XXX that prevents valid use cases where the callback is invoked multiple times
    // XXX hoisting errors into the callback is only valid for callbacks taking an err
    thunkify2b:
    function thunkify2b( object, method ) {
        var self = this;
        var invoke = self.invoke;
        var invoke2 = (typeof method === 'function') ? self.invoke2f : self.invoke2;

        return function doSaveArguments(/* VARARGS */) {
            var av = new Array(arguments.length);
            for (var i=0; i<av.length; i++) av[i] = arguments[i];

            if (!object) {
                // if no object, use the object that the thunk is attached to,
                if (this && this !== global) object = this;
                else throw new Error("no context");
            }

            return function doInvoke( callback ) {
                var returned = false;

                av.push(function(/* VARARGS */) {
                    if (returned) throw new Error("already returned");
                    returned = true;
                    switch (arguments.length) {
                    case 0: return callback();
                    case 1: return callback(arguments[0]);
                    case 2: return callback(arguments[0], arguments[1]);
                    case 3: return callback(arguments[0], arguments[1], arguments[2]);
                    default: return invoke(callback, arguments);
                    }
                })

                try {
                    invoke2(object, method, av)
                }
                catch (err) {
                    // hoist errors from the method into the callback, but
                    // re-throw uncaught errors originating within the callback
                    if (returned) throw err;
                    returned = true;
                    callback(err);
                }
            }
        }
    }
}

/**

`thunkify` splits a callbacked method into two functions, the first to build a
closure that will save the method arguments and return the second function, and a
second to take a callback to run the method on the saved arguments.  The thunkified method must take the
tallback as the very last argument.  The first function, saveMethodArgs, must be
called without the final callback, the second function that it returns, runMethod,
with just the final callback.  Note that there are four functions in play:  the
callbacked method, the synchronous saveMethodArgs, the asynchronous runMethod, and
thunkify itself.

**/

/** quicktest:

var timeit = require('qtimeit');
var x, thunkify = module.exports.thunkify;
var fn = function(m, cb) { x = m; cb() };
timeit(1000000, function(){ x = thunkify(fn) });
// 20m/s

var noop = function(){};
var fnt = thunkify(fn);
timeit(1000000, function(){ x = fn("m", noop) });
// 205m/s
timeit(1000000, function(){ x = fnt("m")(noop) });
// 2.35m/s

var write = module.exports.thunkify(function(m, cb) { console.log(m); cb() });
var run = write("testing 1,1,1...");
run(function(err, ret) {
    console.log("Test 1 done.", err);
})

var write = module.exports.thunkify2b(process.stdout, 'write');
var run = write("testing 1,2,3...\n");
run(function(err, ret) {
    console.log("test 2 done.", err);
})

/**/
