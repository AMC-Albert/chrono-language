export interface ServiceInterface {
	name: string;
	initialize(): Promise<void> | void;
	dispose(): Promise<void> | void;
}

export interface IConfigurationService {
	get<T>(key: keyof QuickDatesSettings): T;
	set<T>(key: keyof QuickDatesSettings, value: T): Promise<void>;
	getAll(): QuickDatesSettings;
	subscribe(callback: (event: ConfigurationChangeEvent) => void): () => void;
}

export interface IResourceManager {
	register(resource: { dispose(): void | Promise<void> }): void;
	unregister(resource: { dispose(): void | Promise<void> }): void;
	dispose(): Promise<void>;
}

export interface ConfigurationChangeEvent {
	key: keyof QuickDatesSettings;
	oldValue: any;
	newValue: any;
	source: string;
}

export interface PluginEvent {
	type: string;
	data?: any;
	source?: string;
	timestamp: number;
}

// Error handling types
export interface ErrorContext {
	component: string;
	operation: string;
	userAction?: string;
	data?: any;
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
