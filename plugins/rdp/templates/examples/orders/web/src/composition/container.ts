// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Composition root — the front's wiring (Pure DI, no DI library): the only `new` of gateways and adapters.
// It holds factories for ViewModels, never instances: each screen creates its own and disposes it.
import { BffHttpClient } from '../infrastructure/data/http/BffHttpClient.ts';
import { HttpOrdersGateway } from '../infrastructure/data/orders/HttpOrdersGateway.ts';
import { SystemClock } from '../infrastructure/clock/SystemClock.ts';
import { DictionaryTranslator } from '../infrastructure/i18n/DictionaryTranslator.ts';
import { CryptoIdGenerator } from '../infrastructure/ids/CryptoIdGenerator.ts';
import { ptBR } from '../infrastructure/i18n/ptBR.ts';
import { ConsoleMonitoring } from '../infrastructure/monitoring/ConsoleMonitoring.ts';
import { BrowserSession } from '../infrastructure/session/BrowserSession.ts';
import type { OrdersGateway } from '../application/ports/OrdersGateway.ts';
import type { Translator } from '../application/ports/Translator.ts';
import { OrdersViewModel } from '../interface-adapters/screens/orders/OrdersViewModel.ts';
import { ToastStore } from '../interface-adapters/stores/ToastStore.ts';

// What only the browser has, passed in by the root layout.
export type BrowserApis = {
  readonly fetch: typeof fetch;
  readonly navigate: (url: string) => void;
};

export function buildContainer(browser: BrowserApis) {
  const monitoring = new ConsoleMonitoring();
  const http = new BffHttpClient(
    browser.fetch,
    new BrowserSession(browser.navigate),
    monitoring,
    new SystemClock()
  );
  const ordersGateway: OrdersGateway = new HttpOrdersGateway(http);
  const toasts = new ToastStore();
  const translator: Translator = new DictionaryTranslator(ptBR);
  const ids = new CryptoIdGenerator();

  return {
    translator,
    toasts,
    ordersViewModel: () => new OrdersViewModel(ordersGateway, toasts, monitoring, ids)
  };
}

export type Container = ReturnType<typeof buildContainer>;
