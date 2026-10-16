// The app's own id for a new workout, sent as client_id with every save of it,
// so the server can tell a repeat (a save that timed out but landed, then the
// offline queue sending it again) from a new workout. Unique per account is
// enough: time plus 20 random base-36 characters.
export function newClientId(): string {
  const random = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `${Date.now().toString(36)}-${random()}${random()}`;
}
