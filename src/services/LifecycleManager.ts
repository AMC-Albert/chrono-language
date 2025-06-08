import { debug, info, warn, error } from '@/utils';
import type { ServiceInterface } from './types';
import { EventBus } from './EventBus';
import { ResourceManager } from './ResourceManager';

/**
 * Component lifecycle states
 */
export enum LifecycleState {
	CREATED = 'created',
	INITIALIZING = 'initializing',
	READY = 'ready',
	DISPOSING = 'disposing',
	DISPOSED = 'disposed',
	ERROR = 'error'
}

/**
 * Interface for components that support lifecycle management
 */
export interface LifecycleAware {
	readonly name: string;
	getLifecycleState(): LifecycleState;
	initialize?(): Promise<void> | void;
	dispose?(): Promise<void> | void;
	onLifecycleStateChange?(oldState: LifecycleState, newState: LifecycleState): void;
}

/**
 * Lifecycle event information
 */
export interface LifecycleEvent {
	componentName: string;
	oldState: LifecycleState;
	newState: LifecycleState;
	timestamp: Date;
	error?: Error;
}

/**
 * Centralized component lifecycle management
 * Provides standardized initialization, readiness tracking, and cleanup
 */
export class LifecycleManager implements ServiceInterface {
	public readonly name = 'LifecycleManager';
	private eventBus: EventBus;
	private resourceManager: ResourceManager;
	private components = new Map<string, { 
		component: LifecycleAware, 
		state: LifecycleState,
		initPromise?: Promise<void>
	}>();

	constructor(eventBus: EventBus, resourceManager: ResourceManager) {
		this.eventBus = eventBus;
		this.resourceManager = resourceManager;
		debug(this, 'Lifecycle manager initialized for component state management');
	}

	async initialize(): Promise<void> {
		debug(this, 'Lifecycle manager initialization completed');
	}

	async dispose(): Promise<void> {
		debug(this, 'Disposing all managed components');
		
		const disposePromises: Promise<void>[] = [];
		
		for (const [name, entry] of this.components.entries()) {
			if (entry.state !== LifecycleState.DISPOSED && entry.state !== LifecycleState.DISPOSING) {
				disposePromises.push(this.disposeComponent(name));
			}
		}
		
		await Promise.all(disposePromises);
		this.components.clear();
		info(this, 'Lifecycle manager disposed successfully');
	}

	/**
	 * Register a component for lifecycle management
	 */
	registerComponent(component: LifecycleAware): void {
		if (this.components.has(component.name)) {
			warn(this, `Component ${component.name} is already registered`);
			return;
		}

		this.components.set(component.name, {
			component,
			state: LifecycleState.CREATED
		});

		debug(this, `Component registered for lifecycle management: ${component.name}`);
		this.emitLifecycleEvent(component.name, LifecycleState.CREATED, LifecycleState.CREATED);
	}

	/**
	 * Initialize a registered component
	 */
	async initializeComponent(name: string): Promise<void> {
		const entry = this.components.get(name);
		if (!entry) {
			throw new Error(`Component ${name} is not registered`);
		}

		if (entry.state !== LifecycleState.CREATED) {
			debug(this, `Component ${name} already initialized or in process`);
			return entry.initPromise || Promise.resolve();
		}

		this.updateComponentState(name, LifecycleState.INITIALIZING);

		const initPromise = this.performInitialization(entry);
		entry.initPromise = initPromise;

		try {
			await initPromise;
			this.updateComponentState(name, LifecycleState.READY);
			info(this, `Component ${name} successfully initialized and ready`);
		} catch (error) {
			this.updateComponentState(name, LifecycleState.ERROR);
			throw error;
		}
	}

	/**
	 * Dispose a registered component
	 */
	async disposeComponent(name: string): Promise<void> {
		const entry = this.components.get(name);
		if (!entry || entry.state === LifecycleState.DISPOSED || entry.state === LifecycleState.DISPOSING) {
			return;
		}

		this.updateComponentState(name, LifecycleState.DISPOSING);

		try {
			if (typeof entry.component.dispose === 'function') {
				await entry.component.dispose();
			}
			this.updateComponentState(name, LifecycleState.DISPOSED);
			info(this, `Component ${name} successfully disposed`);
		} catch (error) {
			warn(this, `Error disposing component ${name}:`, error);
			this.updateComponentState(name, LifecycleState.ERROR);
		}
	}

	/**
	 * Get component state
	 */
	getComponentState(name: string): LifecycleState | undefined {
		return this.components.get(name)?.state;
	}

	/**
	 * Check if component is ready
	 */
	isComponentReady(name: string): boolean {
		return this.getComponentState(name) === LifecycleState.READY;
	}

	/**
	 * Get all component states
	 */
	getAllComponentStates(): Record<string, LifecycleState> {
		const states: Record<string, LifecycleState> = {};
		for (const [name, entry] of this.components.entries()) {
			states[name] = entry.state;
		}
		return states;
	}

	/**
	 * Wait for component to be ready
	 */
	async waitForComponent(name: string, timeout = 5000): Promise<void> {
		const entry = this.components.get(name);
		if (!entry) {
			throw new Error(`Component ${name} is not registered`);
		}

		if (entry.state === LifecycleState.READY) {
			return;
		}

		if (entry.state === LifecycleState.ERROR) {
			throw new Error(`Component ${name} is in error state`);
		}

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`Timeout waiting for component ${name} to be ready`));
			}, timeout);

			const checkState = () => {
				const currentState = this.getComponentState(name);
				if (currentState === LifecycleState.READY) {
					clearTimeout(timeoutId);
					resolve();
				} else if (currentState === LifecycleState.ERROR) {
					clearTimeout(timeoutId);
					reject(new Error(`Component ${name} entered error state`));
				} else {
					setTimeout(checkState, 100);
				}
			};

			checkState();
		});
	}

	/**
	 * Perform component initialization
	 */
	private async performInitialization(entry: { component: LifecycleAware, state: LifecycleState }): Promise<void> {
		if (typeof entry.component.initialize === 'function') {
			await entry.component.initialize();
		}

		// Register with resource manager if component supports disposal
		if (typeof entry.component.dispose === 'function') {
			this.resourceManager.register(entry.component as any);
		}
	}

	/**
	 * Update component state and emit events
	 */
	private updateComponentState(name: string, newState: LifecycleState): void {
		const entry = this.components.get(name);
		if (!entry) return;

		const oldState = entry.state;
		entry.state = newState;

		this.emitLifecycleEvent(name, oldState, newState);

		// Notify component of state change
		if (typeof entry.component.onLifecycleStateChange === 'function') {
			try {
				entry.component.onLifecycleStateChange(oldState, newState);
			} catch (error) {
				warn(this, `Error in component lifecycle state change handler for ${name}:`, error);
			}
		}
	}

	/**
	 * Emit lifecycle events
	 */
	private emitLifecycleEvent(componentName: string, oldState: LifecycleState, newState: LifecycleState): void {
		const event: LifecycleEvent = {
			componentName,
			oldState,
			newState,
			timestamp: new Date()
		};

		this.eventBus.emit('lifecycle:stateChanged', event);
		this.eventBus.emit(`lifecycle:${componentName}:stateChanged`, event);
		this.eventBus.emit(`lifecycle:state:${newState}`, event);

		debug(this, `Component lifecycle state changed: ${componentName}`, {
			oldState,
			newState,
			timestamp: event.timestamp
		});
	}
}
