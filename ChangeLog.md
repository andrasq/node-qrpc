1.1.5
- remove dead code (http_build_query et al) and related tests

1.1.4
- fix utf8 (Buffer) input and output using StringDecoder
- clean up `client.call`, require string handlerName
- use `qinvoke.interceptCall` to `client.wrap` methods
- streamline message encoding
- streamline message decoding, optimize for m-at-endt messages, use scanInt to avoid a slice
- benchmark 1K json objects
- more unit tests

1.1.3
- upgrade to qinvoke 0.11.0 for _copyError and _extractError
  so now only Errors are delivered as Error objects, others are just objects

1.1.2
- unit test with qnit
- move `qinvoke` into its own package
- npm script targets `coverage` and `clean`
- upgrade to mongoid-1.1.0

1.1.1
- allow full utf8 strings in rpc method names
- fix client.wrap() for multiple methods
- benchmark wrapped method calls

1.1.0
- client.wrap() method
- server.wrap() method
- retain Error object non-enumerable property status

1.0.4
- fix the return of null errors
- fix the passing and returning of falsy values

1.0.3
- return non-object errors as-is

1.0.2
- missing copyright notices

1.0.1
- update docs to show Buffer usage
- document json_encode / json_decode options
- hold off on allowHalfOpen mode

1.0.0
- updated readme

0.10.5
- json_encode / json_decode options to server and client
- bring over changes from "blobs" branch
- make server handle calls coming in Buffers

0.10.3
- speed up Buffer passing

0.10.0
- send data Buffers in a binary-safe manner
- benchmark 1k buffers

0.9.5
- benchmark data retrieval

0.9.4
- use utf8 encoding if possible to avoid splitting multi-byte chars
- improved error detection, more unit tests

0.9.3
- make server and client remove their listeners on close

0.9.2
- next() in a handler returns (null, undefined) and invokes the client-side callback.
  next(undefined, undefined) is the same as end(), and just cleans up without the callback.
- return error to client if no handler defined for call

0.9.1
- normalize close() handling: closeFunc() does not take a callback, close() do
- client.setCloseFunc method

0.9.0
- addEndpoint renamed addHandlerNoResponse

0.8.0
- addEndpoint method
