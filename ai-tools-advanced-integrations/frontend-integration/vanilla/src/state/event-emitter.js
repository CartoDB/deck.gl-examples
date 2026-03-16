/**
 * Lightweight EventEmitter and StateSubject
 *
 * Replaces RxJS BehaviorSubject/Subject for vanilla JS.
 */

/**
 * Simple event emitter with on/off/emit pattern
 */
export class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        callback(data);
      }
    }
  }

  removeAllListeners(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

/**
 * StateSubject - holds a current value and emits on change
 * Mimics RxJS BehaviorSubject API: getValue(), next(), subscribe()
 */
export class StateSubject {
  constructor(initialValue) {
    this._value = initialValue;
    this._listeners = new Set();
  }

  getValue() {
    return this._value;
  }

  next(newValue) {
    this._value = newValue;
    for (const callback of this._listeners) {
      callback(newValue);
    }
  }

  subscribe(callback) {
    this._listeners.add(callback);
    // Immediately emit current value (like BehaviorSubject)
    callback(this._value);
    // Return unsubscribe function
    return () => this._listeners.delete(callback);
  }

  on(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }
}
