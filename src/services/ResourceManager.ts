import { loggerDebug, loggerInfo, loggerWarn } from '@/utils';
import type { IResourceManager, ServiceInterface, Disposable } from './types';

/**
 * Centralized resource management for automatic cleanup and memory management
 * Ensures proper disposal of components and prevents memory leaks
 */
export class ResourceManager implements IResourceManager, ServiceInterface {
	public readonly name = 'ResourceManager';
	private resources: Set<Disposable> = new Set();
	private disposed = false;

	constructor() {
		loggerDebug(this, 'Resource manager initialized for plugin lifecycle management');
	}

	async initialize(): Promise<void> {
		loggerDebug(this, 'Resource manager initialization completed');
	}
    
	/**
	 * Register a resource for automatic cleanup
	 */
	register(resource: Disposable): void {
		if (this.disposed) {
			loggerWarn(this, 'Cannot register resource after disposal');
			return;
		}
		
		this.resources.add(resource);
		loggerDebug(this, `Resource registered for cleanup management (total: ${this.resources.size})`);
	}

	/**
	 * Unregister a resource from automatic cleanup
	 */
	unregister(resource: Disposable): void {
		this.resources.delete(resource);
		loggerDebug(this, `Resource unregistered from cleanup management (remaining: ${this.resources.size})`);
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
			loggerWarn(this, 'Resource manager already disposed');
			return;
		}

		loggerInfo(this, `Disposing ${this.resources.size} managed resources`);
		this.disposed = true;

		const disposePromises: Promise<void>[] = [];

		for (const resource of this.resources) {
			try {
				const result = resource.dispose();
				if (result instanceof Promise) {
					disposePromises.push(result);
				}
			} catch (error) {
				loggerWarn(this, 'Error disposing resource:', error);
			}
		}

		if (disposePromises.length > 0) {
			try {
				await Promise.all(disposePromises);
				loggerInfo(this, 'All async resource disposals completed');
			} catch (error) {
				loggerWarn(this, 'Error in async resource disposal:', error);
			}
		}

		this.resources.clear();
		loggerInfo(this, 'Resource manager disposed successfully');
	}

	/**
	 * Check if resource manager has been disposed
	 */
	isDisposed(): boolean {
		return this.disposed;
	}
}
