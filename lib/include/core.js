class IOCore {
  constructor (ioFunc) {
    this.then = cb => ioFunc((...args) => cb(...args))
  }

  map (transform) {
    const saveThen = this.then
    this.then = cb => {
      saveThen((...args) => {
        const result = transform(...args)
        if (result !== undefined) {
          if (Array.isArray(result)) {
            cb(...result)
          } else {
            cb(result)
          }
        }
      })
    }
    return this
  }

  bind (ioFunc) {
    const saveThen = this.then
    this.then = cb => {
      saveThen((...args) => {
        if (args !== undefined) {
          const _args = ioFunc.length < args.length ? args.slice(0, ioFunc.length) : args
          const cbReturn = ioFunc(..._args)
          if (cbReturn !== undefined) {
            const cbReturnLen = cbReturn.length
            const io = cbReturn[cbReturnLen - 1]
            const argsForCb = cbReturn.slice(0, cbReturnLen - 1)
            io.then((...ioargs) => cb(...argsForCb, ...ioargs))
          }
        }
      })
    }
    return this
  }

  static timer (s) {
    var intervalId
    var timer = new IOCore(cb => {
      intervalId = setInterval(cb, Math.floor(s * 1000))
    })
    timer.clear = () => clearInterval(intervalId)
    return timer
  }

  static createIO (ioFunc) {
    return new IOCore(ioFunc)
  }
}
