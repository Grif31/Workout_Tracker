type ToastCallback = (message: string) => void;
let _cb: ToastCallback | null = null;

export function registerToastCallback(cb: ToastCallback) {
  _cb = cb;
}

export function showToast(message: string) {
  _cb?.(message);
}
