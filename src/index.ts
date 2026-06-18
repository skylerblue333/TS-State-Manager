/**
 * A lightweight, type-safe state management library
 */
type Listener<T> = (state: T) => void;

export class Store<T> {
  private state: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initialState: T) {
    this.state = initialState;
  }

  /**
   * Get current state
   */
  getState(): T {
    return this.state;
  }

  /**
   * Update state and notify listeners
   */
  setState(updater: Partial<T> | ((state: T) => Partial<T>)): void {
    const changes = typeof updater === 'function' ? updater(this.state) : updater;
    this.state = { ...this.state, ...changes };
    this.notify();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// Example usage
interface AppState {
  user: string | null;
  theme: 'light' | 'dark';
}

const appStore = new Store<AppState>({
  user: null,
  theme: 'light'
});

appStore.subscribe((state) => {
  console.log('State changed:', state);
});

appStore.setState({ user: 'Skyler' });
appStore.setState(state => ({ theme: state.theme === 'light' ? 'dark' : 'light' }));