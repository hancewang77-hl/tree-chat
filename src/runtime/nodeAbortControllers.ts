export class NodeAbortControllerStore {
  private readonly controllers = new Map<string, AbortController>();

  create(nodeId: string): AbortController {
    if (this.controllers.has(nodeId)) {
      throw new Error(`Active chat already exists for node: ${nodeId}`);
    }
    const controller = new AbortController();
    this.controllers.set(nodeId, controller);
    return controller;
  }

  finish(nodeId: string, controller: AbortController): void {
    if (this.controllers.get(nodeId) === controller) {
      this.controllers.delete(nodeId);
    }
  }

  abort(nodeId: string): boolean {
    const controller = this.controllers.get(nodeId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  has(nodeId: string): boolean {
    return this.controllers.has(nodeId);
  }
}
