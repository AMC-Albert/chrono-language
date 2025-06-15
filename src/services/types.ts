export interface ServiceInterface {
	name: string;
	initialize(): Promise<void> | void;
	dispose(): Promise<void> | void;
}

export interface Disposable {
	dispose(): void | Promise<void>;
}

export interface IConfigurationService {
	get<T>(key: keyof QuickDatesSettings): T;
	set<K extends keyof QuickDatesSettings>(key: K, value: QuickDatesSettings[K]): Promise<void>;
	getAll(): QuickDatesSettings;
	subscribe(callback: (event: ConfigurationChangeEvent) => void): () => void;
}

export interface IResourceManager {
	register(resource: Disposable): void;
	unregister(resource: Disposable): void;
	dispose(): Promise<void>;
}

export interface ConfigurationChangeEvent<T = unknown> {
	key: keyof QuickDatesSettings;
	oldValue: T;
	newValue: T;
	source: string;
}

export interface PluginEvent {
	type: string;
	data?: unknown;
	source?: string;
	timestamp: number;
}

// Error handling types
export interface ErrorContext {
	component: string;
	operation: string;
	userAction?: string;
	data?: unknown;
	timestamp?: Date;
}

export interface StandardError {
	type: string;
	severity: string;
	message: string;
	originalError?: Error;
	context: ErrorContext;
	id: string;
}

// Re-export QuickDatesSettings from the settings module
import type { QuickDatesSettings } from '@/settings';
