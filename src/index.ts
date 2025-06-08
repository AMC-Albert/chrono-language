// Main barrel exports for the quick-dates plugin
export { default as QuickDates } from './main';
export * from '@/settings';
export * from '@/features';
export * from '@/utils';
export * from '@/constants';

// Re-export types explicitly to avoid conflicts
export type {
	InsertMode,
	ContentFormat,
	KeyMapEntry
} from '@/types';
