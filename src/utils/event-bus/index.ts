import { EventBus } from './core';
import type { HookFn, EventHandlerType } from './core';

const getEventBus = () => {
  let _instance = (window as any).eventBus;
  if (!_instance) {
    _instance = new EventBus('white-horse');
    (window as any).eventBus = _instance;
  }
  return _instance as EventBus;
};
/**
 * 事件订阅
 */
const eventOn = <EData = any>(eventName: string, callBack: EventHandlerType<EData>) => {
  getEventBus().eventOn(eventName, callBack);
};
/**
 * 事件订阅，仅执行一次
 */
const eventOnOnce = <EData>(eventName: string, callBack: EventHandlerType<EData>) => {
  getEventBus().eventOnOnce(eventName, callBack);
};
/** 取消订阅 */
const eventOff = <EData>(eventName: string, callBack: EventHandlerType<EData>) => {
  getEventBus().eventOff(eventName, callBack);
};
/** 触发事件 */
const eventEmit = <EData = any>(eventName: string, data?: EData) => {
  getEventBus().eventEmit(eventName, data);
};

export { eventOn, eventOnOnce, eventEmit, eventOff };
export type { HookFn, EventHandlerType };
