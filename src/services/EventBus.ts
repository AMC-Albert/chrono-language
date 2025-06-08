import { debug, info, warn } from '@/utils';
import type { PluginEvent, ServiceInterface } from './types';

/**
 * Event bus for decoupled communication between plugin components
 * Implements observer pattern for event-driven architecture
 */
export class EventBus implements ServiceInterface {
	public readonly name = 'EventBus';
	private listeners: Map<string, Set<Function>> = new Map();
	private onceListeners: Map<string, Set<Function>> = new Map();

	constructor() {
		debug(this, 'Event bus initialized for plugin-wide event management');
	}

	async initialize(): Promise<void> {
		debug(this, 'Event bus initialization completed');
	}

	/**
	 * Subscribe to an event type
	 */
	on(eventType: string, listener: Function): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set());
		}
		this.listeners.get(eventType)!.add(listener);

		debug(this, `Event listener registered for: ${eventType}`);

		// Return unsubscribe function
		return () => this.off(eventType, listener);
	}
	/**
	 * Subscribe to an event type for one-time execution
	 */
	once(eventType: string, listener: Function): () => void {
		if (!this.onceListeners.has(eventType)) {
			this.onceListeners.set(eventType, new Set());
		}
		this.onceListeners.get(eventType)!.add(listener);

		debug(this, `One-time event listener registered for: ${eventType}`);

		// Return unsubscribe function
		return () => {
			const onceListeners = this.onceListeners.get(eventType);
			if (onceListeners) {
				onceListeners.delete(listener);
			}
		};
	}

	/**
	 * Unsubscribe from an event type
	 */
	off(eventType: string, listener: Function): void {
		const listeners = this.listeners.get(eventType);
		if (listeners) {
			listeners.delete(listener);
			if (listeners.size === 0) {
				this.listeners.delete(eventType);
			}
		}
		const onceListeners = this.onceListeners.get(eventType);
		if (onceListeners) {
			onceListeners.delete(listener);
			if (onceListeners.size === 0) {
				this.onceListeners.delete(eventType);
			}
		}

		debug(this, `Event listener removed for: ${eventType}`);
	}

	/**
	 * Emit an event to all subscribers
	 */
	emit(eventType: string, data?: any): void {
		const event: PluginEvent = {
			type: eventType,
			data,
			timestamp: Date.now()
		};

		debug(this, `Emitting event: ${eventType}`, { hasData: !!data });

		// Notify regular listeners
		const listeners = this.listeners.get(eventType);
		if (listeners) {
			listeners.forEach(listener => {
				try {
					listener(event);
				} catch (error) {
					warn(this, `Error in event listener for ${eventType}:`, error);
				}
			});
		}
		// Notify and remove one-time listeners
		const onceListeners = this.onceListeners.get(eventType);
		if (onceListeners) {
			onceListeners.forEach((listener: Function) => {
				try {
					listener(event);
				} catch (error) {
					warn(this, `Error in one-time event listener for ${eventType}:`, error);
				}
			});
			this.onceListeners.delete(eventType);
		}

		info(this, `Event ${eventType} processed by ${(listeners?.size || 0) + (onceListeners?.size || 0)} listeners`);
	}

	/**
	 * Remove all listeners for an event type
	 */	removeAllListeners(eventType?: string): void {
		if (eventType) {
			this.listeners.delete(eventType);
			this.onceListeners.delete(eventType);
			debug(this, `All listeners removed for: ${eventType}`);
		} else {
			this.listeners.clear();
			this.onceListeners.clear();
			debug(this, 'All event listeners cleared');
		}
	}

	/**
	 * Get count of listeners for debugging
	 */	getListenerCount(eventType: string): number {
		const regular = this.listeners.get(eventType)?.size || 0;
		const once = this.onceListeners.get(eventType)?.size || 0;
		return regular + once;
	}

	/**
	 * Dispose of all listeners
	 */
	dispose(): void {
		info(this, 'Disposing event bus and cleaning up all listeners');
		this.removeAllListeners();
	}
}
