import nextTick = require('./nextTick');

interface ICallback<T> {
	deferred:Deferred<any>;
	callback:<U>(value?:T) => U;
}

interface IProgressCallback<T> {
	(data?:T):void;
}

enum State {
	PENDING,
	RESOLVED,
	REJECTED
}

class Deferred<T> {
	promise:Promise<T>;

	constructor() {
		this.promise = new Promise<T>((resolve:(value?:any) => void, reject:(error?:any) => void, progress:(data?:any) => void):void => {
			this.resolve = resolve;
			this.reject = reject;
			this.progress = progress;
		});
	}

	progress:(data?:any) => void;
	resolve:(value?:any) => void;
	reject:(error?:any) => void;
}

class Promise<T> {
	/* tslint:disable:variable-name */
	static Deferred = Deferred;
	/* tslint:enable:variable-name */

	constructor(executor:(resolve?:(value?:any) => void, reject?:(error?:any) => void, progress?:(data?:any) => void) => void) {
		var state:State = State.PENDING;
		var fulfilledValue:T;
		var resolveCallbacks:ICallback<T>[] = [];
		var rejectCallbacks:ICallback<Error>[] = [];
		var progressCallbacks:IProgressCallback<any>[] = [];

		// when callbacks are registered, they are not invoked until the next turn after the promise resolves;
		// a new promise which is resolved once the return value of the callback is resolved is returned
		this.then = function <U>(onResolved?:(value?:T) => any, onRejected?:(error?:Error) => any, onProgress?:(data?:any) => void):Promise<U> {
			var deferred:Deferred<U> = new Deferred();

			if (state === State.PENDING) {
				onResolved && resolveCallbacks.push({
					deferred: deferred,
					callback: onResolved
				});

				onRejected && rejectCallbacks.push({
					deferred: deferred,
					callback: onRejected
				});

				onProgress && progressCallbacks.push(onProgress);
			}
			else if (state === State.RESOLVED && onResolved) {
				execute(deferred, onResolved, fulfilledValue);
			}
			else if (state === State.REJECTED && onRejected) {
				execute(deferred, onRejected, fulfilledValue);
			}

			return deferred.promise;
		};

		function execute(deferred:Deferred<any>, callback:(value?:any) => any, fulfilledValue:T):void {
			nextTick(function ():void {
				try {
					var returnValue:any = callback(fulfilledValue);
					if (returnValue.then) {
						returnValue.then(deferred.resolve, deferred.reject, deferred.progress);
					}
					else {
						deferred.resolve(returnValue);
					}
				}
				catch (error) {
					deferred.reject(error);
				}
			});
		}

		function fulfill(newState:State, callbacks:ICallback<any>[], value:T):void {
			// TODO: Debugging assistance
			if (state !== State.PENDING) {
				return;
			}

			state = newState;
			fulfilledValue = value;

			for (var i = 0, callback:ICallback<any>; (callback = callbacks[i]); ++i) {
				execute(callback.deferred, callback.callback, fulfilledValue);
			}
		}

		try {
			executor(
				fulfill.bind(null, State.RESOLVED, resolveCallbacks),
				fulfill.bind(null, State.REJECTED, rejectCallbacks),
				function (data?:any):void {
					for (var i = 0, callback:IProgressCallback<any>; (callback = progressCallbacks[i]); ++i) {
						callback(data);
					}
				}
			);
		}
		catch (error) {
			fulfill(State.REJECTED, rejectCallbacks, error);
		}
	}

	then: {
		<U>(onResolved?:(value?:T) => U,          onRejected?:(error?:Error) => U,          onProgress?:(data?:any) => void):Promise<U>;
		<U>(onResolved?:(value?:T) => U,          onRejected?:(error?:Error) => Promise<U>, onProgress?:(data?:any) => void):Promise<U>;
		<U>(onResolved?:(value?:T) => Promise<U>, onRejected?:(error?:Error) => U,          onProgress?:(data?:any) => void):Promise<U>;
		<U>(onResolved?:(value?:T) => Promise<U>, onRejected?:(error?:Error) => Promise<U>, onProgress?:(data?:any) => void):Promise<U>;
	};

	catch<U>(onRejected:(error?:Error) => U):Promise<U>;
	catch<U>(onRejected:(error?:Error) => Promise<U>):Promise<U>;
	catch<U>(onRejected:(error?:Error) => any):Promise<U> {
		return this.then<U>(null, onRejected);
	}

	static all<U>(iterable:{ [key:string]:U; }):Promise<{ [key:string]:U; }>;
	static all<U>(iterable:U[]):Promise<U[]>;
	static all(iterable:any):Promise<any> {
		function fulfill(key:string, value:any):void {
			values[key] = value;
			finish();
		}

		function finish():void {
			if (populating || complete < total) {
				return;
			}

			deferred.resolve(values);
		}

		var values:{ [key:string]:any; } = {};
		var deferred:Deferred<typeof values> = new Deferred();
		var complete:number = 0;
		var total:number = 0;
		var populating:boolean = true;

		for (var key in iterable) {
			++total;
			var value:any = iterable[key];
			if (value.then) {
				value.then(fulfill.bind(null, key), fulfill.bind(null, key));
			}
			else {
				fulfill(key, value);
			}
		}

		populating = false;
		finish();

		return deferred.promise;
	}

	static reject<T>(reason:any):Promise<T> {
		var deferred = new Deferred();
		deferred.reject(reason);
		return deferred.promise;
	}

	static resolve<T>(value:Promise<T>):Promise<T>;
	static resolve<T>(value:T):Promise<T>;
	static resolve<T>(value:any):Promise<T> {
		if (value instanceof Promise) {
			return value;
		}

		var deferred = new Deferred();
		deferred.resolve(value);
		return deferred.promise;
	}
}

export = Promise;
