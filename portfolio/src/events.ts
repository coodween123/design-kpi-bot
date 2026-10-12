// Мини-шина событий между игрой (Phaser) и интерфейсом (DOM).
type Handler<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Handler<never>>>();
  on<K extends keyof Events>(k: K, h: Handler<Events[K]>): () => void {
    if (!this.map.has(k)) this.map.set(k, new Set());
    this.map.get(k)!.add(h as Handler<never>);
    return () => this.map.get(k)?.delete(h as Handler<never>);
  }
  emit<K extends keyof Events>(k: K, payload: Events[K]): void {
    this.map.get(k)?.forEach((h) => (h as Handler<Events[K]>)(payload));
  }
}
