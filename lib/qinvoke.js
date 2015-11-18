/**
 * invoke the function with the list of arguments
 * Like func.apply() but much faster
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

module.exports = {

    // apply the function to the argument list
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

    // apply the method to the argument list
    invoke2:
    function invoke2( obj, fn, av ) {
        switch (av.length) {
        case 0: return obj[fn]()
        case 1: return obj[fn](av[0])
        case 2: return obj[fn](av[0], av[1])
        case 3: return obj[fn](av[0], av[1], av[2])
        default: return fn.apply(obj, av)
        }
    }
}
