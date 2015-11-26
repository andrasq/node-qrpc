/**
 * invoke the function with the list of arguments
 * Like func.apply() but much faster
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

module.exports = {

    // apply the function to the argument list
    // 100m/s, 13m/s apply
    invoke:
    function invoke( fn, av ) {
        switch (av.length) {
        case 0: return fn()
        case 1: return fn(av[0])
        case 2: return fn(av[0], av[1])
        case 3: return fn(av[0], av[1], av[2])
        default: return fn.apply(null, av)
        }
    },

    // apply the named method to the argument list
    // 60m/s, 16m/s apply
    invoke2:
    function invoke2( obj, name, av ) {
        switch (av.length) {
        case 0: return obj[name]()
        case 1: return obj[name](av[0])
        case 2: return obj[name](av[0], av[1])
        case 3: return obj[name](av[0], av[1], av[2])
        default: return obj[name].apply(obj, av)
        }
    },

    // apply the method function to the argument list
    // 40m/s call, 16m/s apply
    invoke2f:
    function invoke2f( obj, fn, av ) {
        switch (av.length) {
        case 0: return fn.call(obj)
        case 1: return fn.call(obj, av[0])
        case 2: return fn.call(obj, av[0], av[1])
        case 3: return fn.call(obj, av[0], av[1], av[2])
        default: return fn.apply(obj, av)
        }
    },

    // thunkify the function
    thunkify:
    function thunkify( func ) {
        return this.thunkify2({fn: func}, 'fn');
    },

    // thunkify the named method of the object
    // Can thunkify methods either by name or by value.
    // Unlike `thunkify`, calling the callback more than once is an error.
    thunkify2:
    function thunkify2( object, method ) {
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
                    invoke(callback, arguments);
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
second to take a callback to run the method.  The thunkified method must take the
tallback as the very last argument.  The first function, saveMethodArgs, must be
called without the final callback, the second function that it returns, runMethod,
with just the final callback.  Note that there are four functions in play:  the
callbacked method, the synchronous saveMethodArgs, the asynchronous runMethod, and
thunkify itself.

**/

/** // quicktest:

var write = module.exports.thunkify(function(m, cb) { console.log(m); cb() });
var run = write("testing 1,1,1...");
run(function(err, ret) {
    console.log("Test 1 done.", err);
})

var write = module.exports.thunkify2(process.stdout, 'write');
var run = write("testing 1,2,3...\n");
run(function(err, ret) {
    console.log("test 2 done.", err);
})

/**/
