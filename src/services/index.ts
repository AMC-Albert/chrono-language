// Services barrel export - centralized business logic and dependency management
export { ServiceContainer } from './ServiceContainer';
export { ConfigurationService } from './ConfigurationService';
export { EventBus } from './EventBus';
export { ResourceManager } from './ResourceManager';
export { ErrorHandler, ErrorType, ErrorSeverity } from './ErrorHandler';
export { LifecycleManager, LifecycleState, type LifecycleAware, type LifecycleEvent } from './LifecycleManager';
export type { 
	ServiceInterface,
	ConfigurationChangeEvent,
	PluginEvent,
	IResourceManager,
	IConfigurationService,
	StandardError,
	ErrorContext
} from './types';
