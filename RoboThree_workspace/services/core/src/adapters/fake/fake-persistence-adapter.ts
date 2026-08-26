import type { Clock } from "../../ports/clock.js";
import type { PersistenceAdapter } from "../../ports/persistence.js";
import { FakeRuntimeComponent } from "./fake-runtime-component.js";

export class FakePersistenceAdapter
  extends FakeRuntimeComponent
  implements PersistenceAdapter
{
  readonly adapterKind = "persistence" as const;

  constructor(clock: Clock) {
    super({ componentId: "persistence.fake", clock });
  }
}
