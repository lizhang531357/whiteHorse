import { EventBus } from './core';
import type { EventHandlerType } from './core';

const getEventBus = () => {
  let _instance = (window as any).eventBus;
  if (!_instance) {
    _instance = new EventBus();
    (window as any).eventBus = _instance;
  }
  return _instance as EventBus;
};

/** 事件订阅 */
const eventOn = <EData = any>(eventName: string, callBack: EventHandlerType<EData>) => {
  getEventBus().eventOn(eventName, callBack);
};

/** 取消订阅 */
const eventOff = <EData = any>(eventName: string, callBack: EventHandlerType<EData>) => {
  getEventBus().eventOff(eventName, callBack);
};

/** 触发事件 */
const eventEmit = <EData = any>(eventName: string, data?: EData) => {
  getEventBus().eventEmit(eventName, data);
};

export { eventOn, eventEmit, eventOff };
export type { EventHandlerType };
