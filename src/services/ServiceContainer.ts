import { debug, info, warn, error } from '@/utils';
import type { ServiceInterface } from './types';
import type { QuickDatesSettings } from '@/settings';
import { EventBus } from './EventBus';
import { ResourceManager } from './ResourceManager';
import { ConfigurationService } from './ConfigurationService';
import { Plugin } from 'obsidian';

/**
 * Dependency injection container for plugin services
 * Manages service lifecycle and provides centralized access
 */
export class ServiceContainer {
	private services: Map<string, ServiceInterface> = new Map();
	private initialized = false;
	private disposed = false;

	// Core services
	public readonly eventBus: EventBus;
	public readonly resourceManager: ResourceManager;
	public readonly configuration: ConfigurationService;

	constructor(plugin: Plugin, initialSettings: QuickDatesSettings) {
		debug(this, 'Initializing service container for dependency injection');

		// Initialize core services
		this.eventBus = new EventBus();
		this.resourceManager = new ResourceManager();
		this.configuration = new ConfigurationService(initialSettings, plugin, this.eventBus);

		// Register core services for lifecycle management
		this.register('eventBus', this.eventBus);
		this.register('resourceManager', this.resourceManager);
		this.register('configuration', this.configuration);

		info(this, 'Service container initialized with core services', {
			coreServices: ['eventBus', 'resourceManager', 'configuration'],
			totalServices: this.services.size
		});
	}

	/**
	 * Register a service with the container
	 */
	register<T extends ServiceInterface>(name: string, service: T): void {
		if (this.disposed) {
			warn(this, `Cannot register service '${name}' after disposal`);
			return;
		}

		if (this.services.has(name)) {
			warn(this, `Service '${name}' is already registered, replacing`);
		}

		this.services.set(name, service);
		debug(this, `Service registered: ${name} (total: ${this.services.size})`);
		// Auto-register with resource manager if service has dispose method
		if ('dispose' in service && typeof service.dispose === 'function') {
			this.resourceManager.register(service);
		}
	}
	/**
	 * Get a service from the container
	 */
	get<T extends ServiceInterface>(name: string): T | undefined {
		const service = this.services.get(name);
		if (!service) {
			debug(this, `Service '${name}' not found in container`);
			return undefined;
		}
		// Type guard: services should always extend ServiceInterface
		return service as T;
	}

	/**
	 * Check if a service is registered
	 */
	has(name: string): boolean {
		return this.services.has(name);
	}

	/**
	 * Remove a service from the container
	 */
	unregister(name: string): boolean {
		const service = this.services.get(name);
		if (service) {
			this.services.delete(name);
			debug(this, `Service unregistered: ${name} (remaining: ${this.services.size})`);
            // Remove from resource manager if it was auto-registered
			if ('dispose' in service && typeof service.dispose === 'function') {
				this.resourceManager.unregister(service);
			}
			return true;
		}
		return false;
	}

	/**
	 * Initialize all registered services
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			warn(this, 'Service container already initialized');
			return;
		}

		info(this, `Initializing ${this.services.size} services`);
		const initPromises: Promise<void>[] = [];

		for (const [name, service] of this.services) {
			try {
				const result = service.initialize();
				if (result instanceof Promise) {
					initPromises.push(
						result.catch(error => {
							warn(this, `Failed to initialize service '${name}':`, error);
							throw error;
						})
					);
				}
				debug(this, `Service initialized: ${name}`);
			} catch (initError) {
				error(this, `Error initializing service '${name}':`, initError);
				throw initError;
			}
		}

		if (initPromises.length > 0) {
			try {
				await Promise.all(initPromises);
				info(this, 'All async service initializations completed');
			} catch (initError) {
				error(this, 'Failed to initialize some services:', initError);
				throw initError;
			}
		}

		this.initialized = true;
		this.eventBus.emit('services:initialized', { serviceCount: this.services.size });
		info(this, 'Service container initialization completed');
	}

	/**
	 * Dispose of all services
	 */
	async dispose(): Promise<void> {
		if (this.disposed) {
			warn(this, 'Service container already disposed');
			return;
		}

		info(this, 'Disposing service container and all services');
		this.disposed = true;

		try {
			// Use resource manager to dispose all services
			await this.resourceManager.dispose();
			this.eventBus.emit('services:disposed');
			
			// Clear service registry
			this.services.clear();
			info(this, 'Service container disposed successfully');
		} catch (disposeError) {
			error(this, 'Error during service container disposal:', disposeError);
			throw disposeError;
		}
	}

	/**
	 * Get list of registered service names
	 */
	getServiceNames(): string[] {
		return Array.from(this.services.keys());
	}

	/**
	 * Get service count
	 */
	getServiceCount(): number {
		return this.services.size;
	}

	/**
	 * Check if container is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Check if container is disposed
	 */
	isDisposed(): boolean {
		return this.disposed;
	}

	/**
	 * Get container status for debugging
	 */
	getStatus(): { initialized: boolean; disposed: boolean; serviceCount: number; services: string[] } {
		return {
			initialized: this.initialized,
			disposed: this.disposed,
			serviceCount: this.services.size,
			services: this.getServiceNames()
		};
	}
}
