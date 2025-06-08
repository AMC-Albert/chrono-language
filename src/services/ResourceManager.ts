import { debug, info, warn } from '@/utils';
import type { IResourceManager, ServiceInterface } from './types';

/**
 * Centralized resource management for automatic cleanup and memory management
 * Ensures proper disposal of components and prevents memory leaks
 */
export class ResourceManager implements IResourceManager, ServiceInterface {
	public readonly name = 'ResourceManager';
	private resources: Set<{ dispose(): void | Promise<void> }> = new Set();
	private disposed = false;

	constructor() {
		debug(this, 'Resource manager initialized for plugin lifecycle management');
	}

	async initialize(): Promise<void> {
		debug(this, 'Resource manager initialization completed');
	}

	/**
	 * Register a resource for automatic cleanup
	 */
	register(resource: { dispose(): void | Promise<void> }): void {
		if (this.disposed) {
			warn(this, 'Cannot register resource after disposal');
			return;
		}
		
		this.resources.add(resource);
		debug(this, `Resource registered for cleanup management (total: ${this.resources.size})`);
	}

	/**
	 * Unregister a resource from automatic cleanup
	 */
	unregister(resource: { dispose(): void | Promise<void> }): void {
		this.resources.delete(resource);
		debug(this, `Resource unregistered from cleanup management (remaining: ${this.resources.size})`);
	}

	/**
	 * Get count of managed resources
	 */
	getResourceCount(): number {
		return this.resources.size;
	}

	/**
	 * Dispose of all registered resources
	 */
	async dispose(): Promise<void> {
		if (this.disposed) {
			warn(this, 'Resource manager already disposed');
			return;
		}

		info(this, `Disposing ${this.resources.size} managed resources`);
		this.disposed = true;

		const disposePromises: Promise<void>[] = [];

		for (const resource of this.resources) {
			try {
				const result = resource.dispose();
				if (result instanceof Promise) {
					disposePromises.push(result);
				}
			} catch (error) {
				warn(this, 'Error disposing resource:', error);
			}
		}

		if (disposePromises.length > 0) {
			try {
				await Promise.all(disposePromises);
				info(this, 'All async resource disposals completed');
			} catch (error) {
				warn(this, 'Error in async resource disposal:', error);
			}
		}

		this.resources.clear();
		info(this, 'Resource manager disposed successfully');
	}

	/**
	 * Check if resource manager has been disposed
	 */
	isDisposed(): boolean {
		return this.disposed;
	}
}
