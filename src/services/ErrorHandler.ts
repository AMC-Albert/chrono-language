import { Notice } from 'obsidian';
import { debug, info, warn, error } from '@/utils';
import type { ServiceInterface } from './types';
import { EventBus } from './EventBus';

/**
 * Error types for categorization and handling
 */
export enum ErrorType {
	VALIDATION = 'validation',
	NETWORK = 'network',
	PERSISTENCE = 'persistence',
	PARSING = 'parsing',
	UNKNOWN = 'unknown'
}

/**
 * Severity levels for error handling
 */
export enum ErrorSeverity {
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
	CRITICAL = 'critical'
}

/**
 * Standardized error context information
 */
export interface ErrorContext {
	component: string;
	operation: string;
	userAction?: string;
	data?: any;
	timestamp?: Date;
}

/**
 * Standardized error information
 */
export interface StandardError {
	type: ErrorType;
	severity: ErrorSeverity;
	message: string;
	originalError?: Error;
	context: ErrorContext;
	id: string;
}

/**
 * Centralized error handling service with categorization and user notification
 * Provides consistent error handling across all plugin components
 */
export class ErrorHandler implements ServiceInterface {
	public readonly name = 'ErrorHandler';
	private eventBus: EventBus;
	private errorCount = 0;

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
		debug(this, 'Error handler service initialized for centralized error management');
	}

	async initialize(): Promise<void> {
		debug(this, 'Error handler service initialization completed');
	}

	async dispose(): Promise<void> {
		debug(this, 'Error handler service disposed');
	}

	/**
	 * Handle an error with standardized processing
	 */
	handleError(
		originalError: Error | string,
		type: ErrorType = ErrorType.UNKNOWN,
		severity: ErrorSeverity = ErrorSeverity.MEDIUM,
		context: Partial<ErrorContext> = {}
	): StandardError {
		const errorId = `err_${Date.now()}_${++this.errorCount}`;
		
		const standardError: StandardError = {
			type,
			severity,
			message: typeof originalError === 'string' ? originalError : originalError.message,
			originalError: typeof originalError === 'string' ? undefined : originalError,
			context: {
				component: 'Unknown',
				operation: 'Unknown',
				timestamp: new Date(),
				...context
			},
			id: errorId
		};

		// Log the error with appropriate level
		this.logError(standardError);

		// Show user notification based on severity
		this.showUserNotification(standardError);

		// Emit error event for other components to handle
		this.eventBus.emit('error:occurred', standardError);
		this.eventBus.emit(`error:${type}`, standardError);

		return standardError;
	}

	/**
	 * Handle validation errors specifically
	 */
	handleValidationError(
		message: string,
		context: Partial<ErrorContext> = {},
		severity: ErrorSeverity = ErrorSeverity.LOW
	): StandardError {
		return this.handleError(message, ErrorType.VALIDATION, severity, context);
	}

	/**
	 * Handle parsing errors specifically
	 */
	handleParsingError(
		originalError: Error,
		context: Partial<ErrorContext> = {},
		severity: ErrorSeverity = ErrorSeverity.MEDIUM
	): StandardError {
		return this.handleError(originalError, ErrorType.PARSING, severity, context);
	}

	/**
	 * Handle persistence errors specifically
	 */
	handlePersistenceError(
		originalError: Error,
		context: Partial<ErrorContext> = {},
		severity: ErrorSeverity = ErrorSeverity.HIGH
	): StandardError {
		return this.handleError(originalError, ErrorType.PERSISTENCE, severity, context);
	}

	/**
	 * Log error with appropriate level based on severity
	 */
	private logError(standardError: StandardError): void {
		const logContext = {
			errorId: standardError.id,
			type: standardError.type,
			component: standardError.context.component,
			operation: standardError.context.operation,
			userAction: standardError.context.userAction,
			data: standardError.context.data
		};

		switch (standardError.severity) {
			case ErrorSeverity.LOW:
				warn(this, `Low severity error: ${standardError.message}`, logContext);
				break;
			case ErrorSeverity.MEDIUM:
				error(this, `Medium severity error: ${standardError.message}`, logContext);
				break;
			case ErrorSeverity.HIGH:
				error(this, `High severity error: ${standardError.message}`, logContext);
				break;
			case ErrorSeverity.CRITICAL:
				error(this, `CRITICAL ERROR: ${standardError.message}`, logContext);
				break;
		}

		if (standardError.originalError && standardError.originalError.stack) {
			debug(this, `Error stack trace:`, { stack: standardError.originalError.stack });
		}
	}

	/**
	 * Show user notification based on error severity
	 */
	private showUserNotification(standardError: StandardError): void {
		// Only show notifications for medium, high, and critical errors
		if (standardError.severity === ErrorSeverity.LOW) {
			return;
		}

		let noticeMessage = '';
		let duration = 4000; // Default duration

		switch (standardError.severity) {
			case ErrorSeverity.MEDIUM:
				noticeMessage = `Quick Dates: ${standardError.message}`;
				duration = 5000;
				break;
			case ErrorSeverity.HIGH:
				noticeMessage = `Quick Dates Error: ${standardError.message}`;
				duration = 8000;
				break;
			case ErrorSeverity.CRITICAL:
				noticeMessage = `Quick Dates Critical Error: ${standardError.message}`;
				duration = 0; // No auto-dismiss for critical errors
				break;
		}

		if (noticeMessage) {
			new Notice(noticeMessage, duration);
			info(this, `User notification shown for error`, {
				errorId: standardError.id,
				severity: standardError.severity,
				message: noticeMessage
			});
		}
	}

	/**
	 * Get error statistics
	 */
	getErrorStats(): { totalErrors: number } {
		return { totalErrors: this.errorCount };
	}
}
