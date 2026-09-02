// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createNoiseSuppressionSettingsPatch,
	getEffectiveBrowserNoiseSuppressionEnabled,
	isNoiseSuppressionEnabled,
	resolveNoiseSuppressionMethod,
} from '@app/features/voice/utils/VoiceNoiseSuppressionUtils';
import {resolveVoiceProcessing} from '@app/features/voice/utils/VoiceProcessingProfile';
import {describe, expect, it} from 'vitest';

describe('VoiceNoiseSuppressionUtils', () => {
	it('resolves RNNoise as a distinct suppression method', () => {
		const settings = createNoiseSuppressionSettingsPatch('rnnoise');
		expect(resolveNoiseSuppressionMethod(settings)).toBe('rnnoise');
		expect(isNoiseSuppressionEnabled(settings)).toBe(true);
		expect(getEffectiveBrowserNoiseSuppressionEnabled(settings)).toBe(false);
	});

	it('keeps all suppression methods mutually exclusive', () => {
		for (const method of ['enhanced', 'rnnoise', 'standard', 'none'] as const) {
			const settings = createNoiseSuppressionSettingsPatch(method);
			const enabledCount = [
				settings.deepFilterNoiseSuppression,
				settings.rnNoiseSuppression,
				settings.noiseSuppression,
			].filter(Boolean).length;
			expect(enabledCount).toBe(method === 'none' ? 0 : 1);
			expect(resolveNoiseSuppressionMethod(settings)).toBe(method);
		}
	});

	it('prioritizes enhanced over RNNoise and the browser filter', () => {
		expect(
			resolveNoiseSuppressionMethod({
				deepFilterNoiseSuppression: true,
				rnNoiseSuppression: true,
				noiseSuppression: true,
			}),
		).toBe('enhanced');
	});

	it('routes custom RNNoise through the processor and disables browser suppression', () => {
		const profile = resolveVoiceProcessing({
			voiceProcessingMode: 'custom',
			echoCancellation: true,
			noiseSuppression: false,
			autoGainControl: true,
			deepFilterNoiseSuppression: false,
			rnNoiseSuppression: true,
			deepFilterNoiseSuppressionLevel: 80,
		});
		expect(profile.rnnoise).toBe(true);
		expect(profile.deepFilter).toBe(false);
		expect(profile.browserNoiseSuppression).toBe(false);
	});
});
