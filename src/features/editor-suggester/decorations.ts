import { StateField, StateEffect, Range, Transaction } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { CLASSES } from '@/constants';

// Effects for adding/clearing trigger phrase decorations
export const addTriggerDecorationEffect = StateEffect.define<{ from: number, to: number }>();
export const clearTriggerDecorationsEffect = StateEffect.define<null>();

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
		}		// If no clear effect, process trigger decoration effects
		let newTriggerDecoInfo: {from: number, to: number} | null = null;

		for (const effect of tr.effects) {
			if (effect.is(addTriggerDecorationEffect)) {
				newTriggerDecoInfo = effect.value;
				break; // Only need one trigger decoration
			}
		}

		// If we have a new trigger decoration to apply
		if (newTriggerDecoInfo) {
			const triggerDeco = Decoration.mark({
				class: CLASSES.activeTrigger,
				attributes: { 'data-chrono-trigger': 'true', 'spellcheck': 'false' },
			}).range(newTriggerDecoInfo.from, newTriggerDecoInfo.to);
			
			return Decoration.set([triggerDeco], true);
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