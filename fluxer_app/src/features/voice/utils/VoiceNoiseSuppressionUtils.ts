// SPDX-License-Identifier: AGPL-3.0-or-later

export interface NoiseSuppressionSettingsLike {
	noiseSuppression: boolean;
	deepFilterNoiseSuppression: boolean;
	rnNoiseSuppression: boolean;
}

export type NoiseSuppressionMethod = 'enhanced' | 'rnnoise' | 'standard' | 'none';

export function resolveNoiseSuppressionMethod(settings: NoiseSuppressionSettingsLike): NoiseSuppressionMethod {
	if (settings.deepFilterNoiseSuppression) return 'enhanced';
	if (settings.rnNoiseSuppression) return 'rnnoise';
	if (settings.noiseSuppression) return 'standard';
	return 'none';
}

export function createNoiseSuppressionSettingsPatch(method: NoiseSuppressionMethod): NoiseSuppressionSettingsLike {
	return {
		deepFilterNoiseSuppression: method === 'enhanced',
		rnNoiseSuppression: method === 'rnnoise',
		noiseSuppression: method === 'standard',
	};
}

export function isNoiseSuppressionEnabled(settings: NoiseSuppressionSettingsLike): boolean {
	return settings.noiseSuppression || settings.deepFilterNoiseSuppression || settings.rnNoiseSuppression;
}

export function isBrowserNoiseSuppressionLocked(
	settings: Pick<NoiseSuppressionSettingsLike, 'deepFilterNoiseSuppression' | 'rnNoiseSuppression'>,
): boolean {
	return settings.deepFilterNoiseSuppression || settings.rnNoiseSuppression;
}

export function getEffectiveBrowserNoiseSuppressionEnabled(settings: NoiseSuppressionSettingsLike): boolean {
	return settings.noiseSuppression && !settings.deepFilterNoiseSuppression && !settings.rnNoiseSuppression;
}
