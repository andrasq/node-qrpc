qinvoke = require('../lib/qinvoke');

module.exports = {

    'interceptCall': {
        'should return arguments': function(t) {
            var fn = qinvoke.interceptCall(null, null, function(func, obj, args) {
                return args;
            });
            t.deepEqual(fn(), []);
            t.deepEqual(fn(1), [1]);
            t.deepEqual(fn(1,2), [1, 2]);
            t.deepEqual(fn(1,2,3), [1, 2, 3]);
            t.deepEqual(fn(1,fn,2), [1, fn, 2]);
            t.deepEqual(fn(1,2,3,4,5,6,7,8), [1,2,3,4,5,6,7,8]);
            t.done();
        },
    },

    'invoke': {

        setUp: function(done) {
            this.testArgs = [
                [],
                [1], ["a"],
                [1, 2], ["a", {b: 2}],
                [1, 2, 3], ["a", {b: 2}, 3.5],
                [1, 2, 3, 4],
                [1, 2, 3, 4, 5],
                [1, function(){}, 3, 4, {f: {ff: 5}}, 6, 7, 8, 9, 10],
            ];
            done();
        },

        'should pass arguments to function': function(t) {
            var fn = qinvoke.interceptCall(null, null, function(fn, obj, args) {
                return args;
            });
            for (var i=0; i<this.testArgs.length; i++) {
                t.deepEqual(qinvoke.invoke(fn, this.testArgs[i]), this.testArgs[i]);
            }
            t.done();
        },

        'should pass arguments to named method': function(t) {
            var obj = {
                'someMethod': qinvoke.interceptCall(null, null, function(fn, obj, args) {
                    return args;
                }),
            };
            for (var i=0; i<this.testArgs.length; i++) {
                t.deepEqual(qinvoke.invoke2(obj, 'someMethod', this.testArgs[i]), this.testArgs[i]);
            }
            t.done();
        },

        'should pass arguments to method body': function(t) {
            var obj = {
                'someMethod': qinvoke.interceptCall(null, null, function(fn, obj, args) {
                    return args;
                }),
            };
            for (var i=0; i<this.testArgs.length; i++) {
                t.deepEqual(qinvoke.invoke2f(obj, obj.someMethod, this.testArgs[i]), this.testArgs[i]);
            }
            t.done();
        },

        'should be fast': function(t) {
            var fn = function(a, b) { return a + b };
            var obj = { fn: fn };
            var argv = [1, 2, 3, 4];
            var t1 = Date.now();
            //for (var i=0; i<10000000; i++) qinvoke.invoke(fn, argv);
            //for (var i=0; i<10000000; i++) qinvoke.invoke2(obj, 'fn', argv);
            //for (var i=0; i<10000000; i++) qinvoke.invoke2f(obj, obj.fn, argv);
            //for (var i=0; i<10000000; i++) qinvoke.invokeAny(fn, argv, null);
            //for (var i=0; i<10000000; i++) qinvoke.invoke2Any(obj.fn, obj, argv);
            for (var i=0; i<10000000; i++) qinvoke.invoke2Any('fn', obj, argv);
            var t2 = Date.now();
            console.log("AR: 100k invokes() in %d ms", t2 - t1);
            // SKL 4.5g node-v6.7.0:
            //     invoke 2 args: 10m calls in 81 ms (123m/s direct), 4 args: 10m in 176ms (57m/s .apply)
            //     invoke2 2 args: 10m in 112 ms (89m/s direct named), 4 args: 10m in 181 ms (55m/s .apply)
            //     invoke2f 2 args: 10m in 84 ms (119m/s .call), 4 args: 10m in 157 ms (64m/s .apply)
            //     invokeAny 2 args: 10m in 123ms if *missing third arg*, 92ms if have third arg (!!) (node-v0.10 same, 125 vs 93)
            //     invoke2Any direct 2 args: 10m in 94ms (106m/s .call), 4 args: 10m in 164 ms (61m/s .apply)
            //     invoke2Any named 2 args: 10m in 122ms (82m/s direct named), 4 args: 10m in 188ms (53m/s .apply)
            // SKL 4.5g node-v7.5.0:
            //     invoke 2 args: 10m in 75 ms (133m/s .call), 4 args: 10m in 155 ms (65m/s)
            //     invoke2 2 args: 10m in 125 ms (80m/s), 4 args: 10m in 191ms (52m/s)
            //     invoke2f 2 args: 10m in 83 ms (120m/s), 4 args: 10m in 157ms (64m/s)
            //     XXX 123ms vs 87ms to pass the expected number of arguments
            // SKL 4.5g node-v0.10.42:
            //     invoke 2 args: 10m in 82 ms (122m/s direct), 4 args: 10m in 298ms (34m/s .apply)
            //     invoke2 2 args: 10m in 82 ms (122m/s direct named), 4 args: 10m in 298ms (34m/s .apply)
            //     invoke2f 2 args: 10m in 104 ms (96m/s .call), 4 args: 10m in 292ms (34m/s .apply)
            // Phenom 3.6g node-v0.10.42:
            //     invoke direct: 100m/s, .apply: 13m/s
            //     invoke2 direct: 60m/s, .apply: 16m/s
            //     invoke2f direct: 40m/s, .apply: 16m/s
            t.done();
        },
    },
}
