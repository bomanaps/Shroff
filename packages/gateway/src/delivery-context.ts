import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

interface DeliveryStore {
  url?: string;
}

const storage = new AsyncLocalStorage<DeliveryStore>();

export function deliveryContextMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  storage.run({}, next);
}

export function setDeliveryUrl(url: string): void {
  const store = storage.getStore();
  if (store === undefined) {
    throw new Error(
      "No delivery context: mount deliveryContextMiddleware before the payment middleware",
    );
  }
  store.url = url;
}

export function getDeliveryUrl(): string {
  const url = storage.getStore()?.url;
  if (url === undefined) {
    throw new Error("No delivery URL recorded for this request");
  }
  return url;
}
