import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

// Passing a title switches ToastBanner to its larger layout, for messages the
// user must not miss (e.g. a workout that was saved offline, not uploaded).
export type ToastOptions = {
  title?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  tone?: 'default' | 'warning';
  durationMs?: number;
};

type ToastCallback = (message: string, options?: ToastOptions) => void;
let _cb: ToastCallback | null = null;

export function registerToastCallback(cb: ToastCallback) {
  _cb = cb;
}

export function showToast(message: string, options?: ToastOptions) {
  _cb?.(message, options);
}
