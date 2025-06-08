import { StateField, StateEffect, Range, Transaction } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, DecorationSet } from '@codemirror/view';
import { CLASSES } from '@/constants';

// Effects for adding/clearing trigger phrase decorations
export const addTriggerDecorationEffect = StateEffect.define<{ from: number, to: number }>();
export const clearTriggerDecorationsEffect = StateEffect.define<null>();
export const addSpacerWidgetEffect = StateEffect.define<number>(); // Position for the spacer

// Spacer Widget
class SpacerWidget extends WidgetType {
	toDOM() {
		const span = document.createElement('span');
		// Empty spacer to allow cursor placement without inserting invisible characters
		return span;
	}

	eq(other: SpacerWidget) {
		return false; // Always re-render for simplicity, or implement proper check
	}

	// Allow all events (including backspace) to pass through to the editor
	ignoreEvent() {
		return true;
	}
}

// StateField to manage the decorations
export const triggerDecorationStateField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations: DecorationSet, tr: Transaction): DecorationSet {
		// Check for clear decorations effect first - if present, prioritize it
		for (const effect of tr.effects) {
			if (effect.is(clearTriggerDecorationsEffect)) {
				// Always clear decorations when the clear effect is dispatched
				return Decoration.none;
			}
		}

		// If no clear effect, process other effects
		let newTriggerDecoInfo: {from: number, to: number} | null = null;
		let newSpacerPos: number | null = null;
		let hasEffects = false;

		for (const effect of tr.effects) {
			if (effect.is(addTriggerDecorationEffect)) {
				newTriggerDecoInfo = effect.value;
				hasEffects = true;
			} else if (effect.is(addSpacerWidgetEffect)) {
				newSpacerPos = effect.value;
				hasEffects = true;
			}
		}

		// If we have new decoration effects to apply
		if (hasEffects) {
			const decoArray: Range<Decoration>[] = [];
			
			if (newTriggerDecoInfo) {
				const triggerDeco = Decoration.mark({
					class: CLASSES.activeTrigger,
					attributes: { 'data-chrono-trigger': 'true', 'spellcheck': 'false' },
				}).range(newTriggerDecoInfo.from, newTriggerDecoInfo.to);
				decoArray.push(triggerDeco);
			}

			if (newSpacerPos !== null && newTriggerDecoInfo) { 
				const spacerWidgetDeco = Decoration.widget({
					widget: new SpacerWidget(),
					side: 0 
				}).range(newSpacerPos);
				decoArray.push(spacerWidgetDeco);
			}
			
			if (decoArray.length === 0) {
				return Decoration.none;
			}
			return Decoration.set(decoArray, true);
		}

		// If document changed, map the decorations to new positions
		if (tr.docChanged) {
			return decorations.map(tr.changes);
		}
		
		return decorations;
	},
	provide: f => EditorView.decorations.from(f)
});

/**
 * Helper function to safely clear decorations from an editor view
 * @param view The EditorView instance to clear decorations from
 * @returns boolean indicating if the operation was successful
 */
export function safelyClearDecorations(view: EditorView | null): boolean {
	if (!view || !view.dom.isConnected) return false;
	
	try {
		view.dispatch({
			effects: clearTriggerDecorationsEffect.of(null)
		});
		return true;
	} catch (e) {
		console.warn("Chrono: Failed to clear decorations", e);
		return false;
	}
}