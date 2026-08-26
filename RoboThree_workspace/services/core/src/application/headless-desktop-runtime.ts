import type { SubmitTurnCommand } from "@robothree/contracts";

import type {
  DesktopApplicationFacade,
  DesktopDurableEventPage,
} from "./desktop-application-facade.js";

export class HeadlessDesktopRuntime {
  readonly #facade: DesktopApplicationFacade;

  constructor(input: { facade: DesktopApplicationFacade }) {
    this.#facade = input.facade;
  }

  submitTurn(
    command: SubmitTurnCommand,
  ) {
    return this.#facade.submitTurn(command);
  }

  querySubmitTurn(
    query: Parameters<DesktopApplicationFacade["querySubmitTurn"]>[0],
  ) {
    return this.#facade.querySubmitTurn(query);
  }

  listDeliveries(
    durableCursor = "delivery:0",
    limit = 100,
  ): Promise<DesktopDurableEventPage> {
    return this.#facade.listDurableEvents(durableCursor, limit);
  }
}
