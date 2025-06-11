import { loggerDebug, loggerInfo, loggerWarn, registerLoggerClass } from '@/utils';
import type { QuickDatesSettings } from '@/settings';
import { DEFAULT_SETTINGS } from '@/settings';
import type { IConfigurationService, ConfigurationChangeEvent, ServiceInterface } from './types';
import { EventBus } from './EventBus';
import { Plugin } from 'obsidian';

/**
 * Centralized configuration management with event-driven updates
 * Provides type-safe access to plugin settings with change notifications
 */
export class ConfigurationService implements IConfigurationService, ServiceInterface {
	public readonly name = 'ConfigurationService';
	private settings: QuickDatesSettings;
	private eventBus: EventBus;	private plugin: Plugin; // Reference to main plugin for persistence
	constructor(initialSettings: QuickDatesSettings, plugin: Plugin, eventBus: EventBus) {
		this.settings = { ...initialSettings };
		this.plugin = plugin;
		this.eventBus = eventBus;
		
		registerLoggerClass(this, 'ConfigurationService');
		loggerDebug(this, 'Configuration service initialized with settings management');
		loggerInfo(this, 'Configuration service ready', {
			triggerPhrase: this.settings.triggerPhrase,
			plainTextByDefault: this.settings.plainTextByDefault,
			eventBusConnected: !!eventBus
		});
	}

	async initialize(): Promise<void> {
		loggerDebug(this, 'Configuration service initialization completed');
	}

	async dispose(): Promise<void> {
		loggerDebug(this, 'Configuration service disposed');
	}
	/**
	 * Set all configuration values at once (usually for initial load)
	 */
	setSettings(newSettings: QuickDatesSettings): void {
		loggerDebug(this, 'Setting configuration from loaded settings');
		this.settings = { ...newSettings };
		loggerInfo(this, 'Configuration settings updated', {
			triggerPhrase: this.settings.triggerPhrase,
			plainTextByDefault: this.settings.plainTextByDefault
		});
	}

	/**
	 * Get a configuration value by key
	 */
	get<T>(key: keyof QuickDatesSettings): T {
		const value = this.settings[key] as T;
		loggerDebug(this, `Configuration value retrieved: ${String(key)} = ${JSON.stringify(value)}`);
		return value;
	}
	/**
	 * Set a configuration value and persist it
	 */
	async set<K extends keyof QuickDatesSettings>(key: K, value: QuickDatesSettings[K]): Promise<void> {
		const oldValue = this.settings[key];
		
		if (oldValue === value) {
			loggerDebug(this, `Configuration value unchanged for ${String(key)}, skipping update`);
			return;
		}

		loggerDebug(this, `Configuration change: ${String(key)}`, {
			oldValue: JSON.stringify(oldValue),
			newValue: JSON.stringify(value)
		});
		// Type-safe assignment using computed property
		(this.settings as Record<keyof QuickDatesSettings, unknown>)[key] = value;

		try {
			// Persist the settings through the plugin
			await this.plugin.saveData(this.settings);
			
			// Emit configuration change event
			const changeEvent: ConfigurationChangeEvent = {
				key,
				oldValue,
				newValue: value,
				source: 'ConfigurationService'
			};

			this.eventBus.emit('configuration:changed', changeEvent);
			this.eventBus.emit(`configuration:${String(key)}:changed`, changeEvent);

			loggerInfo(this, `Configuration updated and persisted: ${String(key)}`);
		} catch (error) {
			// Revert the change if persistence failed - type-safe assignment
			(this.settings as Record<keyof QuickDatesSettings, unknown>)[key] = oldValue;
			loggerWarn(this, `Failed to persist configuration change for ${String(key)}:`, error);
			throw error;
		}
	}

	/**
	 * Get all configuration values
	 */
	getAll(): QuickDatesSettings {
		loggerDebug(this, 'Full configuration retrieved');
		return { ...this.settings };
	}

	/**
	 * Update multiple configuration values atomically
	 */
	async updateBatch(updates: Partial<QuickDatesSettings>): Promise<void> {
		const changes: ConfigurationChangeEvent[] = [];
		const oldSettings = { ...this.settings };
		// Apply all changes to memory first
		for (const [key, value] of Object.entries(updates)) {
			const typedKey = key as keyof QuickDatesSettings;
			const oldValue = this.settings[typedKey];
			
			if (oldValue !== value) {
				// Type-safe assignment using computed property access
				(this.settings as Record<keyof QuickDatesSettings, unknown>)[typedKey] = value;
				changes.push({
					key: typedKey,
					oldValue,
					newValue: value,
					source: 'ConfigurationService.updateBatch'
				});
			}
		}

		if (changes.length === 0) {
			loggerDebug(this, 'Batch update contained no actual changes');
			return;
		}

		try {
			// Persist all changes
			await this.plugin.saveData(this.settings);
			
			// Emit events for all changes
			for (const change of changes) {
				this.eventBus.emit('configuration:changed', change);
				this.eventBus.emit(`configuration:${String(change.key)}:changed`, change);
			}

			loggerInfo(this, `Batch configuration update completed`, {
				changedKeys: changes.map(c => String(c.key)),
				changeCount: changes.length
			});
		} catch (error) {
			// Revert all changes if persistence failed
			this.settings = oldSettings;
			loggerWarn(this, 'Failed to persist batch configuration update, changes reverted:', error);
			throw error;
		}
	}

	/**
	 * Subscribe to configuration changes
	 */
	subscribe(callback: (event: ConfigurationChangeEvent) => void): () => void {
		loggerDebug(this, 'Configuration change subscriber registered');
		return this.eventBus.on('configuration:changed', callback);
	}

	/**
	 * Subscribe to specific configuration key changes
	 */
	subscribeToKey(key: keyof QuickDatesSettings, callback: (event: ConfigurationChangeEvent) => void): () => void {
		loggerDebug(this, `Configuration change subscriber registered for key: ${String(key)}`);
		return this.eventBus.on(`configuration:${String(key)}:changed`, callback);
	}

	/**
	 * Reset configuration to defaults
	 */
	async resetToDefaults(): Promise<void> {
		loggerInfo(this, 'Resetting configuration to default values');
		await this.updateBatch(DEFAULT_SETTINGS);
	}

	/**
	 * Validate current configuration
	 */
	validate(): boolean {
		try {
			// Basic validation - ensure required fields exist
			const required: (keyof QuickDatesSettings)[] = ['triggerPhrase', 'primaryFormat', 'alternateFormat'];
			
			for (const key of required) {
				if (this.settings[key] === undefined || this.settings[key] === null) {
					loggerWarn(this, `Configuration validation failed: missing required field ${String(key)}`);
					return false;
				}
			}

			loggerDebug(this, 'Configuration validation passed');
			return true;
		} catch (error) {
			loggerWarn(this, 'Configuration validation error:', error);
			return false;
		}
	}

	/**
	 * Get configuration as JSON for debugging
	 */
	toJSON(): string {
		return JSON.stringify(this.settings, null, 2);
	}
}
